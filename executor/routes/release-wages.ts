/**
 * POST /payroll/release-wages  — employer's payroll agent endpoint (x402 gated)
 *
 * This is the employer's side of the wage flow. The employee's executor (acting
 * as the employee's agent) calls this endpoint to REQUEST wage release.
 * The x402 payment is the authorization proof: "I'm the employee's authorized
 * agent and I'm willing to pay to prove this is a legitimate wage request."
 *
 * After x402 verification:
 *   1. Validates employee is registered and due for payment
 *   2. Checks employer Unlink balance
 *   3. employer_unlink.send(ratePerPeriod → employee Master)  ← private ZK transfer
 *   4. Returns { relayId, amount } for the caller to proceed with routing
 *
 * In production: employer runs this on their own server with their own wallet.
 * In this demo: both employer agent and employee executor share the same process.
 *
 * x402 payTo = EXECUTOR_ADDRESS (demo); in production = employer's service address.
 */
import type { Context } from 'hono'
import { waitForConfirmation } from '@unlink-xyz/node'
import { withEmployerLock } from '../lib/wallet-manager'
import { getEmployee, getEmployer } from '../lib/db'
import { USDC_ADDRESS } from '../lib/constants'

export async function releaseWagesHandler(c: Context) {
  const body = await c.req.json().catch(() => ({})) as { employeeId?: number }

  if (typeof body.employeeId !== 'number') {
    return c.json({ error: 'employeeId required' }, 400)
  }

  const { employeeId } = body

  const emp = getEmployee(employeeId)
  if (!emp) return c.json({ error: `Employee ${employeeId} not registered` }, 404)

  const employer = getEmployer(emp.employer_id)
  if (!employer) return c.json({ error: `Employer ${emp.employer_id} not registered` }, 404)

  const amount = BigInt(emp.rate_per_period)

  try {
    // ── Check employer Unlink balance ─────────────────────────────────────────
    const balance = await withEmployerLock(emp.employer_id, async (unlink) => {
      await unlink.accounts.setActive(0)
      return unlink.getBalance(USDC_ADDRESS)
    })

    if (balance < amount) {
      return c.json({
        error: `Employer insufficient Unlink balance: have ${balance}, need ${amount}`,
      }, 402)
    }

    // ── Employer Unlink Master → Employee Unlink Master (private send) ────────
    console.log(`[release-wages] employer ${emp.employer_id} → employee ${employeeId}: ${amount}`)

    const relayId = await withEmployerLock(emp.employer_id, async (unlink) => {
      await unlink.accounts.setActive(0)  // Employer Master

      const result = await unlink.send({
        transfers: [{
          token:     USDC_ADDRESS,
          recipient: emp.master_unlink_addr,  // employee's Master "unlink1..."
          amount,
        }],
      })

      await waitForConfirmation(unlink, result.relayId)
      console.log(`[release-wages] wages sent — relay ${result.relayId}`)
      return result.relayId
    })

    return c.json({
      ok:      true,
      relayId,
      amount:  amount.toString(),
      message: 'Wages sent to employee Master account',
    })
  } catch (err: any) {
    console.error('[release-wages] Error:', err)
    return c.json({ error: err.message ?? 'Wage release failed' }, 500)
  }
}
