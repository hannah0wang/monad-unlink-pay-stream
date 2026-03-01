/**
 * Payroll scheduler — runs continuously in the background.
 *
 * Every TICK_MS seconds:
 *   1. Finds employees whose next_run_at has passed → runs payroll cycle
 *   2. Finds bills whose last_paid_at + frequency has passed → pays via x402
 *
 * Idempotency: timestamps are advanced in the DB BEFORE execution begins.
 * If the server restarts mid-cycle or a tick fires while a slow cycle is in
 * progress, the already-advanced timestamp prevents double-payment.
 */
import { db, getDueEmployees, getDueBills, updateBillPaid } from './db'
import { runCycleForEmployee } from '../routes/run-cycle'
import { payBillForEmployee } from '../routes/pay-bill'

const TICK_MS = 30_000

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
    console.log(`[scheduler] ${dueEmployees.length} cycle(s) due`)
  }

  for (const emp of dueEmployees) {
    // Advance next_run_at BEFORE executing — prevents double-run on restart / slow cycle
    db.run(
      'UPDATE employees SET next_run_at = ? WHERE employee_id = ?',
      now + emp.cadence_seconds,
      emp.employee_id,
    )

    try {
      const payslip = await runCycleForEmployee(emp.employee_id)
      console.log(
        `[scheduler] ✓ Cycle employee=${emp.employee_id} ` +
        `gross=${payslip.gross} relay=${payslip.relayId}`,
      )
    } catch (err: any) {
      console.error(`[scheduler] ✗ Cycle failed employee=${emp.employee_id}: ${err.message}`)
      // Roll back next_run_at so it retries next tick instead of waiting a full cadence
      db.run(
        'UPDATE employees SET next_run_at = ? WHERE employee_id = ?',
        now,
        emp.employee_id,
      )
    }
  }

  // ── Bill payments ───────────────────────────────────────────────────────────
  const dueBills = getDueBills(now)
  if (dueBills.length > 0) {
    console.log(`[scheduler] ${dueBills.length} bill(s) due`)
  }

  for (const bill of dueBills) {
    // Advance last_paid_at BEFORE executing — prevents double-payment
    const tentativePaidAt = now
    updateBillPaid(bill.id, tentativePaidAt)

    try {
      const receipt = await payBillForEmployee(bill.employee_id, bill)
      console.log(
        `[scheduler] ✓ Bill employee=${bill.employee_id} ` +
        `biller=${receipt.billerName} amount=$${Number(receipt.amount) / 1e6} ` +
        `relay=${receipt.relayId}`,
      )
    } catch (err: any) {
      console.error(`[scheduler] ✗ Bill failed bill=${bill.id}: ${err.message}`)
      // Roll back so it retries next tick
      updateBillPaid(bill.id, bill.last_paid_at)
    }
  }
}
