/**
 * Private HCM — Automated Payroll Executor
 *
 * Fully automated: no browser triggers needed.
 * Scheduler fires every 30s, runs due payroll cycles and bill payments.
 *
 * x402 is used for two things:
 *   1. Employee activation — POST /register requires a one-time x402 fee
 *   2. Executor → biller payments — machine-to-machine (inside payBillForEmployee)
 *
 * Endpoints:
 *   POST /register                  x402 gated — employee onboarding
 *   GET  /status/:employeeId        public — current schedule + recent payslips
 *   GET  /bills/:employeeId         public — configured recurring bills
 *   POST /internal/runCycle         internal only (X-INTERNAL-KEY) — manual test trigger
 *
 * Billers (separate processes):
 *   bun run biller:electric   → port 3002
 *   bun run biller:insurance  → port 3003
 */
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { EXECUTOR_ADDRESS } from './lib/wallet'
import { startScheduler } from './lib/scheduler'
import { registerHandler } from './routes/register'
import { runCycleHandler } from './routes/run-cycle'
import { BILLER_REGISTRY } from './routes/pay-bill'
import { getEmployee, getRecentPayslips, getBillsForEmployee } from './lib/db'
import { getEmployeeBucketBalances } from './lib/wallet-manager'
import { USDC_ADDRESS } from './lib/constants'

const app = new Hono()

// ─── Global middleware ─────────────────────────────────────────────────────────
app.use(logger())
app.use(
  cors({
    origin: ['http://localhost:3000', 'https://*.vercel.app'],
    allowHeaders: ['Content-Type', 'X-Payment', 'X-Internal-Key'],
    exposeHeaders: ['X-Payment-Response'],
  }),
)

// ─── Info ──────────────────────────────────────────────────────────────────────
app.get('/', (c) =>
  c.json({
    name:     'Private HCM Executor',
    version:  '3.0.0',
    executor: EXECUTOR_ADDRESS,
    chain:    'Monad Testnet (10143)',
    mode:     'fully-automated',
    x402: {
      'POST /register':         'one-time activation fee (employee onboarding)',
      'executor→biller':        'machine-to-machine bill payment (internal)',
    },
    billers: Object.fromEntries(
      Object.entries(BILLER_REGISTRY).map(([id, b]) => [
        id, { name: b.name, url: b.url },
      ]),
    ),
  }),
)

app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }))

// ─── Employee status (public) ──────────────────────────────────────────────────
// Includes per-bucket USDCm balances queried from the executor's Unlink Node SDK.
// This avoids the React SDK limitation where `balances` only reflects the active account.
app.get('/status/:employeeId', async (c) => {
  const employeeId = parseInt(c.req.param('employeeId'))
  if (isNaN(employeeId)) return c.json({ error: 'Invalid employeeId' }, 400)

  const emp = getEmployee(employeeId)
  if (!emp) return c.json({ error: 'Employee not found' }, 404)

  const payslips  = getRecentPayslips(employeeId, 5)
  const bills     = getBillsForEmployee(employeeId)
  const now       = Math.floor(Date.now() / 1000)
  const nextRunIn = Math.max(0, emp.next_run_at - now)

  // Query per-bucket balances from Unlink Node SDK (if wallet is registered)
  let bucketBalances: Record<string, string> | null = null
  try {
    bucketBalances = await getEmployeeBucketBalances(employeeId, USDC_ADDRESS)
  } catch {
    // Wallet not yet loaded (first load after restart) — balances omitted
  }

  return c.json({
    employeeId,
    schedule: {
      cadenceSeconds: emp.cadence_seconds,
      lastRunAt:      emp.last_run_at,
      nextRunAt:      emp.next_run_at,
      nextRunIn,
    },
    bucketBalances,   // { MASTER: "...", TAXES: "...", ... } or null
    recentPayslips: payslips,
    bills: bills.map(b => ({
      ...b,
      nextDueAt: b.last_paid_at + b.frequency_seconds,
      overdue:   b.last_paid_at + b.frequency_seconds <= now,
    })),
  })
})

// ─── Employee bills (public) ───────────────────────────────────────────────────
app.get('/bills/:employeeId', (c) => {
  const employeeId = parseInt(c.req.param('employeeId'))
  if (isNaN(employeeId)) return c.json({ error: 'Invalid employeeId' }, 400)
  return c.json({ bills: getBillsForEmployee(employeeId) })
})

// ─── Employee registration (free) ─────────────────────────────────────────────
// No x402 here — x402 is used where it makes economic sense:
//   • executor → biller (machine-to-machine bill payment, inside payBillForEmployee)
// Onboarding is free; the service cost is covered by the ops fee withheld each cycle.
app.post('/register', registerHandler)

// ─── Internal cycle trigger (for testing) ─────────────────────────────────────
// Requires X-INTERNAL-KEY header. Not exposed to the public — scheduler calls
// runCycleForEmployee() directly without going through HTTP.
app.post('/internal/runCycle', runCycleHandler)

// ─── Start scheduler ───────────────────────────────────────────────────────────
startScheduler()

const port = parseInt(process.env.PORT ?? '3001')

console.log(`\n  Private HCM Executor`)
console.log(`  http://localhost:${port}`)
console.log(`  Executor:   ${EXECUTOR_ADDRESS}`)
console.log(`  PayrollMgr: ${process.env.PAYROLL_MANAGER_ADDRESS ?? '(not set)'}`)
console.log(`  Mode:       fully automated (scheduler running)\n`)

export default { port, fetch: app.fetch }
