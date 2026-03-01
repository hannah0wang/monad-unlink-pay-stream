/**
 * Payroll cycle — employee's executor agent requests wages via x402,
 * then routes privately to all 5 buckets.
 *
 * x402 is used in BOTH major flows:
 *
 *   Wages:  employee executor → employer payroll agent (x402 authorization)
 *           "I'm the employee's agent; here's $0.01 proof this request is legitimate"
 *           → employer agent sends wages privately via Unlink
 *
 *   Bills:  executor → biller (x402 payment)
 *           → biller sends goods/service, executor reimburses from Utilities bucket
 *
 * Both are machine-to-machine, scheduler-triggered, no human interaction.
 */
import type { Context } from 'hono'
import { waitForConfirmation } from '@unlink-xyz/node'
import { walletClient, executorAccount } from '../lib/wallet'
import { withEmployeeLock, BUCKET } from '../lib/wallet-manager'
import { getEmployee, updateEmployeeRuntime, insertPayslip } from '../lib/db'
import { USDC_ADDRESS } from '../lib/constants'

// Wage release endpoint — employer's payroll agent.
// In production: employer runs this on their own server.
// In demo: same process, different route (/payroll/release-wages).
const PAYROLL_AGENT_URL = process.env.PAYROLL_AGENT_URL ?? 'http://localhost:3001'

export interface PayslipResult {
  employeeId:   number
  gross:        bigint
  buckets: { taxes: bigint; retirement: bigint; health: bigint; utilities: bigint; net: bigint }
  wageRelayId:  string
  routeRelayId: string
  paidAt:       number
}

export async function runCycleForEmployee(employeeId: number): Promise<PayslipResult> {
  const emp = getEmployee(employeeId)
  if (!emp) throw new Error(`Employee ${employeeId} not registered`)
  if (!walletClient || !executorAccount) throw new Error('Executor wallet not configured')

  // ── 1. Request wages from employer's payroll agent via x402 ────────────────
  //
  // Employee's executor pays a $0.01 x402 fee to the employer's payroll endpoint.
  // This is the authorization proof — proves the request is from the employee's
  // legitimate agent, not a spoofed request.
  //
  // The employer's agent (POST /payroll/release-wages) verifies the x402 payment
  // then executes: employer_unlink.send(ratePerPeriod → employee_master)
  //
  // In production, PAYROLL_AGENT_URL points to employer's own server.
  // In demo, it loops back to this same process (different route prefix).

  // Call employer's payroll agent to authorize and send wages.
  // In production: employer runs their own server and this is a real x402 payment.
  // In demo: both are the same process — use INTERNAL_KEY instead to avoid the
  // circular payment problem (executor paying itself via x402 can't be settled
  // by the facilitator since payer == payee).
  // x402 is demonstrated on executor→biller (external, different parties).

  console.log(`[cycle:${employeeId}] requesting wages from employer payroll agent`)

  const wageRes = await fetch(`${PAYROLL_AGENT_URL}/payroll/release-wages`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Key': process.env.INTERNAL_KEY ?? '',
    },
    body: JSON.stringify({ employeeId }),
  })

  if (!wageRes.ok) {
    const err = await wageRes.json().catch(() => ({ error: `HTTP ${wageRes.status}` })) as any
    throw new Error(`Wage release failed: ${err.error ?? JSON.stringify(err)}`)
  }

  const wageData = await wageRes.json() as { relayId: string; amount: string }
  const gross      = BigInt(wageData.amount)
  const wageRelayId = wageData.relayId

  console.log(`[cycle:${employeeId}] wages received — ${gross} — relay ${wageRelayId}`)

  // ── 2. Route employee Master → 5 buckets (private sends) ──────────────────
  const taxes      = (gross * BigInt(emp.taxes_bps))      / 10000n
  const retirement = (gross * BigInt(emp.retirement_bps)) / 10000n
  const health     = (gross * BigInt(emp.health_bps))     / 10000n
  const utilities  = (gross * BigInt(emp.utilities_bps))  / 10000n
  const net        = gross - taxes - retirement - health - utilities

  const transfers = [
    { token: USDC_ADDRESS, recipient: emp.taxes_unlink_addr,      amount: taxes },
    { token: USDC_ADDRESS, recipient: emp.retirement_unlink_addr,  amount: retirement },
    { token: USDC_ADDRESS, recipient: emp.health_unlink_addr,      amount: health },
    { token: USDC_ADDRESS, recipient: emp.utilities_unlink_addr,   amount: utilities },
    { token: USDC_ADDRESS, recipient: emp.net_unlink_addr,         amount: net },
  ].filter(t => t.amount > 0n)

  console.log(`[cycle:${employeeId}] routing ${transfers.length} private sends from Master`)

  const routeRelayId = await withEmployeeLock(employeeId, async (unlink) => {
    // Sync with retry — wages just landed on-chain but the Unlink indexer may need
    // a few seconds to process the new note. Poll until balance >= gross or timeout.
    await unlink.accounts.setActive(BUCKET.MASTER)
    // Force full resync first to clear any stuck/pending note states from
    // previous failed attempts. Then poll until balance reflects the incoming wages.
    await unlink.sync({ forceFullResync: true })
    for (let attempt = 1; attempt <= 10; attempt++) {
      const bal = await unlink.getBalance(USDC_ADDRESS)
      if (bal >= gross) {
        console.log(`[cycle:${employeeId}] Master balance ready: ${bal}`)
        break
      }
      if (attempt === 10) throw new Error(`Employee Master never received wages (have ${bal}, need ${gross})`)
      console.log(`[cycle:${employeeId}] Waiting for wages to index... attempt ${attempt}/10 (have ${bal})`)
      await new Promise(r => setTimeout(r, 4000))
      await unlink.sync()
    }
    const result = await unlink.send({ transfers })
    await waitForConfirmation(unlink, result.relayId)
    return result.relayId
  })

  // ── 3. Record ──────────────────────────────────────────────────────────────
  const paidAt = Math.floor(Date.now() / 1000)

  insertPayslip({
    employee_id: employeeId,
    gross:       gross.toString(),
    taxes:       taxes.toString(),
    retirement:  retirement.toString(),
    health:      health.toString(),
    utilities:   utilities.toString(),
    net:         net.toString(),
    relay_id:    routeRelayId,
  })
  updateEmployeeRuntime(employeeId, paidAt)

  console.log(`[cycle:${employeeId}] complete`)

  return {
    employeeId, gross,
    buckets: { taxes, retirement, health, utilities, net },
    wageRelayId,
    routeRelayId,
    paidAt,
  }
}

// ─── Internal HTTP route (X-INTERNAL-KEY, for manual testing) ─────────────────

export async function runCycleHandler(c: Context) {
  const key = c.req.header('x-internal-key')
  if (!key || key !== process.env.INTERNAL_KEY) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const body = await c.req.json().catch(() => ({})) as { employeeId?: number }
  if (typeof body.employeeId !== 'number') {
    return c.json({ error: 'employeeId required' }, 400)
  }
  try {
    const p = await runCycleForEmployee(body.employeeId)
    return c.json({
      ok: true,
      payslip: {
        ...p,
        gross:  p.gross.toString(),
        buckets: Object.fromEntries(Object.entries(p.buckets).map(([k, v]) => [k, v.toString()])),
      },
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
}
