/**
 * Payroll scheduler — runs continuously in the background.
 *
 * Every TICK_MS seconds:
 *   1. Finds employees whose next_run_at has passed → runs payroll cycle
 *   2. Checks executor USDCm float before bills, warns if low
 *   3. Finds bills whose last_paid_at + frequency has passed → pays via x402
 *
 * Idempotency: timestamps advanced in DB BEFORE executing.
 * On crash mid-cycle the advanced timestamp prevents double-payment.
 */
import { db, getDueEmployees, getDueBills, updateBillPaid } from './db'
import { runCycleForEmployee } from '../routes/run-cycle'
import { payBillForEmployee } from '../routes/pay-bill'
import { getExecutorTokenBalance } from './wallet'
import { USDC_ADDRESS } from './constants'

const TICK_MS = 30_000

// Warn if executor float drops below this — operator should top up
// USDCm has 18 decimals: 100 USDCm = 100 * 1e18
const MIN_FLOAT = 100_000_000_000_000_000_000n

export function startScheduler() {
  console.log(`[scheduler] Started — ticking every ${TICK_MS / 1000}s`)
  tick()
  setInterval(tick, TICK_MS)
}

async function tick() {
  const now = Math.floor(Date.now() / 1000)

  // ── Payroll cycles ──────────────────────────────────────────────────────────
  const dueEmployees = getDueEmployees(now)
  if (dueEmployees.length > 0) {
    console.log(`[scheduler] ${dueEmployees.length} payroll cycle(s) due`)
  }

  for (const emp of dueEmployees) {
    db.prepare('UPDATE employees SET next_run_at = ? WHERE employee_id = ?')
      .run(now + emp.cadence_seconds, emp.employee_id)
    try {
      const payslip = await runCycleForEmployee(emp.employee_id)
      console.log(
        `[scheduler] ✓ Cycle employee=${emp.employee_id} ` +
        `gross=${payslip.gross} wageRelay=${payslip.wageRelayId}`,
      )
    } catch (err: any) {
      console.error(`[scheduler] ✗ Cycle failed employee=${emp.employee_id}: ${err.message}`)
      db.prepare('UPDATE employees SET next_run_at = ? WHERE employee_id = ?').run(now, emp.employee_id)
    }
  }

  // ── Bill payments ───────────────────────────────────────────────────────────
  const dueBills = getDueBills(now)
  if (dueBills.length === 0) return

  console.log(`[scheduler] ${dueBills.length} bill(s) due`)

  // Check executor USDCm float before attempting any bill payments.
  // The executor fronts bills from its EOA wallet; if it's underfunded, payments will fail.
  try {
    const executorFloat = await getExecutorTokenBalance(USDC_ADDRESS)
    if (executorFloat < MIN_FLOAT) {
      console.warn(
        `[scheduler] ⚠ Executor USDCm float low: ${executorFloat / 1_000_000_000_000_000_000n} USDCm. ` +
        `Send USDCm to executor EOA to fund bill payments. ` +
        `Bills will still attempt (Utilities pre-flight may catch insufficient funds first).`
      )
    } else {
      console.log(`[scheduler] Executor float: ${executorFloat / 1_000_000_000_000_000_000n} USDCm`)
    }
  } catch {
    console.warn('[scheduler] Could not read executor USDCm balance')
  }

  for (const bill of dueBills) {
    updateBillPaid(bill.id, now)  // advance before executing (idempotency)
    try {
      const receipt = await payBillForEmployee(bill.employee_id, bill)
      console.log(
        `[scheduler] ✓ Bill employee=${bill.employee_id} ` +
        `biller=${receipt.billerName} $${Number(receipt.amount) / 1e6} ` +
        `relay=${receipt.relayId}`,
      )
    } catch (err: any) {
      console.error(`[scheduler] ✗ Bill failed bill=${bill.id}: ${err.message}`)
      updateBillPaid(bill.id, bill.last_paid_at)  // roll back on failure
    }
  }
}
