/**
 * Payroll Ninja — Fully Private Payroll Executor
 *
 * Both employer and employee transactions are ZK-private inside the Unlink pool.
 * The only public on-chain events are:
 *   - Employer's initial lump-sum USDCm deposit into Unlink pool
 *   - Employee's initial lump-sum USDCm deposit into Unlink pool (if they pre-fund)
 *   - Bill payments: executor → biller via x402 (executor address + amount visible)
 *   - Bill reimbursement: Unlink withdraw → executor EOA (amount visible, source private)
 *
 * Per-cycle payroll is fully invisible: employer Unlink → employee Master → buckets.
 *
 * x402 is used for one thing: executor → biller, machine-to-machine bill settlement.
 *
 * Endpoints:
 *   POST /register               employee onboarding (mnemonic + bucket config)
 *   POST /employer/register      employer onboarding (mnemonic + employee rate config)
 *   GET  /status/:employeeId     schedule + recent payslips + bucket balances
 *   POST /internal/runCycle      manual trigger (X-INTERNAL-KEY, testing only)
 *
 * Billers:
 *   bun run biller:electric      port 3002
 *   bun run biller:insurance     port 3003
 */
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { EXECUTOR_ADDRESS, getExecutorTokenBalance } from './lib/wallet'
import { x402Gate } from './lib/x402'
import { startScheduler } from './lib/scheduler'
import { registerHandler } from './routes/register'
import { registerEmployerHandler } from './routes/register-employer'
import { runCycleHandler } from './routes/run-cycle'
import { releaseWagesHandler } from './routes/release-wages'
import { BILLER_REGISTRY } from './routes/pay-bill'
import { getEmployee, getRecentPayslips, getBillsForEmployee } from './lib/db'
import { getEmployeeBucketBalances } from './lib/wallet-manager'
import { USDC_ADDRESS } from './lib/constants'

const app = new Hono()

// ─── Global middleware ─────────────────────────────────────────────────────────
app.use(logger())
app.use(cors({
  origin: ['http://localhost:3000', 'https://*.vercel.app'],
  allowHeaders: ['Content-Type', 'X-Payment', 'X-Internal-Key'],
  exposeHeaders: ['X-Payment-Response'],
}))

// ─── Info ──────────────────────────────────────────────────────────────────────
app.get('/', (c) => c.json({
  name:    'Payroll Ninja Executor',
  version: '4.0.0',
  mode:    'fully-private — both employer and employee transactions are ZK-hidden',
  privacy: {
    employer: 'Unlink wallet → private sends wages, only lump deposit is public',
    employee: 'Receives wages privately, routes to 6 private buckets',
    bills:    'Paid by executor via x402, reimbursed from private Utilities bucket',
  },
  billers: Object.fromEntries(
    Object.entries(BILLER_REGISTRY).map(([id, b]) => [id, b.name])
  ),
}))

app.get('/health', async (c) => {
  let executorFloat: string | null = null
  try {
    const bal = await getExecutorTokenBalance(USDC_ADDRESS)
    // USDCm has 18 decimals — use BigInt division to avoid precision loss
    executorFloat = (bal / 1_000_000_000_000_000_000n).toString()
  } catch {}
  return c.json({
    ok:            true,
    ts:            Date.now(),
    executorFloat: executorFloat ? `$${executorFloat} USDCm` : 'unknown',
    floatWarning:  executorFloat !== null && BigInt(executorFloat) < 100n
      ? 'Low float — send USDCm to executor EOA for bill payments'
      : null,
  })
})

// ─── Employee status ───────────────────────────────────────────────────────────
app.get('/status/:employeeId', async (c) => {
  const employeeId = parseInt(c.req.param('employeeId'))
  if (isNaN(employeeId)) return c.json({ error: 'Invalid employeeId' }, 400)

  const emp = getEmployee(employeeId)
  if (!emp) return c.json({ error: 'Employee not found' }, 404)

  const now       = Math.floor(Date.now() / 1000)
  const nextRunIn = Math.max(0, emp.next_run_at - now)
  const payslips  = getRecentPayslips(employeeId, 5)
  const bills     = getBillsForEmployee(employeeId)

  let bucketBalances: Record<string, string> | null = null
  try {
    bucketBalances = await getEmployeeBucketBalances(employeeId, USDC_ADDRESS)
  } catch { /* wallet not yet loaded */ }

  return c.json({
    employeeId,
    schedule: {
      cadenceSeconds: emp.cadence_seconds,
      lastRunAt:      emp.last_run_at,
      nextRunAt:      emp.next_run_at,
      nextRunIn,
    },
    bucketBalances,
    recentPayslips: payslips,
    bills: bills.map(b => ({
      ...b,
      nextDueAt: b.last_paid_at + b.frequency_seconds,
      overdue:   b.last_paid_at + b.frequency_seconds <= now,
    })),
  })
})

// ─── Employee registration ─────────────────────────────────────────────────────
app.post('/register', registerHandler)

// ─── Employer registration ─────────────────────────────────────────────────────
app.post('/employer/register', registerEmployerHandler)

// ─── Employer payroll agent — INTERNAL_KEY protected ──────────────────────────
// In production: employer runs their own server, this would be x402-gated.
// In demo: same process, so we use INTERNAL_KEY instead of x402
// (x402 self-payment is circular — executor can't pay itself via the facilitator).
// x402 is demonstrated on executor→biller flows (external, different parties).
app.post('/payroll/release-wages', async (c, next) => {
  const key = c.req.header('x-internal-key')
  if (!key || key !== process.env.INTERNAL_KEY) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  return next()
}, releaseWagesHandler)

// ─── Internal cycle trigger (testing) ─────────────────────────────────────────
app.post('/internal/runCycle', runCycleHandler)

// ─── Start server + scheduler ─────────────────────────────────────────────────
import { serve } from '@hono/node-server'

startScheduler()

const port = parseInt(process.env.PORT ?? '3001')
console.log(`\n  Payroll Ninja Executor  http://localhost:${port}`)
console.log(`  Executor EOA: ${EXECUTOR_ADDRESS}`)
console.log(`  Mode: fully private (employer + employee Unlink wallets)\n`)

serve({ fetch: app.fetch, port })
