/**
 * POST /register
 *
 * Employee onboarding — x402 gated (one-time activation fee).
 * Stores mnemonic, bucket config, cadence, and initial bills.
 *
 * Body:
 *   employeeId:      number
 *   mnemonic:        string
 *   cadenceSeconds:  number       — 3600|86400|604800|1209600
 *   bucketAddresses: { master, taxes, retirement, health, utilities, net }
 *   bucketBps:       { taxesBps, retirementBps, healthBps, utilitiesBps }
 *   bills?:          Array<{ billerId, frequencySeconds }>
 */
import type { Context } from 'hono'
import { registerEmployeeWallet } from '../lib/wallet-manager'
import { upsertEmployee, insertBill } from '../lib/db'
import { BILLER_REGISTRY } from './pay-bill'

// 60s included for hackathon demo — remove in production
const VALID_CADENCES = new Set([60, 3600, 86400, 604800, 1209600])

export async function registerHandler(c: Context) {
  let body: {
    employeeId:     number
    mnemonic:       string
    cadenceSeconds: number
    bucketAddresses: {
      master:     string
      taxes:      string
      retirement: string
      health:     string
      utilities:  string
      net:        string
    }
    bucketBps: {
      taxesBps:      number
      retirementBps: number
      healthBps:     number
      utilitiesBps:  number
    }
    bills?: Array<{ billerId: string; frequencySeconds: number }>
  }

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const { employeeId, mnemonic, cadenceSeconds, bucketAddresses, bucketBps, bills = [] } = body

  if (typeof employeeId !== 'number' || typeof mnemonic !== 'string' || !bucketAddresses || !bucketBps) {
    return c.json({ error: 'Missing required fields' }, 400)
  }

  if (!VALID_CADENCES.has(cadenceSeconds)) {
    return c.json({ error: `cadenceSeconds must be one of: ${[...VALID_CADENCES].join(', ')}` }, 400)
  }

  const totalBps =
    (bucketBps.taxesBps ?? 0) +
    (bucketBps.retirementBps ?? 0) +
    (bucketBps.healthBps ?? 0) +
    (bucketBps.utilitiesBps ?? 0)

  if (totalBps > 10000) {
    return c.json({ error: `Bucket bps ${totalBps} exceeds 10000 (100%)` }, 400)
  }

  // Validate bill IDs
  for (const bill of bills) {
    if (!BILLER_REGISTRY[bill.billerId]) {
      return c.json({
        error: `Unknown billerId "${bill.billerId}". Known: ${Object.keys(BILLER_REGISTRY).join(', ')}`,
      }, 400)
    }
  }

  try {
    await registerEmployeeWallet(employeeId, mnemonic)

    upsertEmployee({
      employee_id:            employeeId,
      employer_id:            0,   // placeholder — set when employer calls /employer/register
      rate_per_period:        0,   // placeholder — set when employer calls /employer/register
      taxes_bps:              bucketBps.taxesBps      ?? 2500,
      retirement_bps:         bucketBps.retirementBps ?? 500,
      health_bps:             bucketBps.healthBps     ?? 300,
      utilities_bps:          bucketBps.utilitiesBps  ?? 1000,
      cadence_seconds:        cadenceSeconds,
      master_unlink_addr:     bucketAddresses.master,
      taxes_unlink_addr:      bucketAddresses.taxes,
      retirement_unlink_addr: bucketAddresses.retirement,
      health_unlink_addr:     bucketAddresses.health,
      utilities_unlink_addr:  bucketAddresses.utilities,
      net_unlink_addr:        bucketAddresses.net,
    })

    const billIds: number[] = []
    for (const bill of bills) {
      const id = insertBill(
        employeeId,
        bill.billerId,
        BILLER_REGISTRY[bill.billerId].name,
        bill.frequencySeconds,
      )
      billIds.push(id)
    }

    const cadenceLabel = { 60: 'demo (60s)', 3600: 'hourly', 86400: 'daily', 604800: 'weekly', 1209600: 'biweekly' }[cadenceSeconds] ?? 'custom'
    console.log(`[register] Employee ${employeeId} registered — ${cadenceLabel} cadence, ${bills.length} bill(s)`)

    return c.json({
      ok: true,
      employeeId,
      cadence: cadenceLabel,
      netBps: 10000 - totalBps,
      billIds,
      message: `Registered. Payroll will run automatically ${cadenceLabel}.`,
    })
  } catch (err: any) {
    console.error('[register] Error:', err)
    return c.json({ error: err.message ?? 'Registration failed' }, 500)
  }
}
