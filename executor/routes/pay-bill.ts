/**
 * Automated bill payment — executor → biller via x402, reimbursed from Utilities bucket.
 *
 * Settlement sequence:
 *   1. Check Utilities bucket has enough balance to reimburse (pre-flight guard)
 *   2. Call biller via x402 → executor wallet pays biller (principal payment)
 *   3. Unlink withdraw: Utilities bucket → executor wallet (reimbursement)
 *   4. Record
 *
 * If Utilities has insufficient balance, the bill is skipped this cycle and
 * retried after the next payroll cycle fills the bucket.
 *
 * Money flow:
 *   Employee Utilities bucket ─(Unlink withdraw)─► Executor EOA ─(x402)─► Biller
 */
import { waitForConfirmation } from '@unlink-xyz/node'
import { wrapFetchWithPaymentFromConfig } from '@x402/fetch'
import { ExactEvmScheme } from '@x402/evm'
import { publicActions } from 'viem'
import { walletClient, executorAccount, EXECUTOR_ADDRESS } from '../lib/wallet'
import { withEmployeeLock, getBucketBalance, BUCKET } from '../lib/wallet-manager'
import { getEmployee, updateBillPaid, type Bill } from '../lib/db'
import { USDC_ADDRESS } from '../lib/constants'

// ─── Biller registry ──────────────────────────────────────────────────────────

export const BILLER_REGISTRY: Record<string, {
  name:              string
  url:               string
  address:           `0x${string}`   // biller's payTo address (used in 402 response)
  defaultAmountUsdc: bigint
}> = {
  // USDCm has 18 decimals: amounts use 1e18 base unit
  electric: {
    name:              'Monad Electric Co.',
    url:               process.env.ELECTRIC_BILLER_URL   ?? 'http://localhost:3002',
    address:           (process.env.ELECTRIC_BILLER_ADDRESS  ?? '0x0000000000000000000000000000000000000002') as `0x${string}`,
    defaultAmountUsdc: 12_500_000_000_000_000_000n,  // 12.5 USDCm
  },
  insurance: {
    name:              'Chain Life Insurance',
    url:               process.env.INSURANCE_BILLER_URL  ?? 'http://localhost:3003',
    address:           (process.env.INSURANCE_BILLER_ADDRESS ?? '0x0000000000000000000000000000000000000003') as `0x${string}`,
    defaultAmountUsdc: 89_000_000_000_000_000_000n,  // 89 USDCm
  },
}

export interface BillReceipt {
  billId:     number
  employeeId: number
  billerId:   string
  billerName: string
  amount:     bigint
  relayId:    string
  paidAt:     string
}

export async function payBillForEmployee(
  employeeId: number,
  bill: Bill,
): Promise<BillReceipt> {
  const config = getEmployee(employeeId)
  if (!config) throw new Error(`Employee ${employeeId} not registered`)

  const biller = BILLER_REGISTRY[bill.biller_id]
  if (!biller) throw new Error(`Unknown biller: ${bill.biller_id}`)

  if (!walletClient) throw new Error('Executor wallet not configured')

  let billAmount = biller.defaultAmountUsdc

  // ── Pre-flight: check Utilities bucket has enough balance ──────────────────
  // Don't front money we can't reimburse — skip and let the next payroll cycle
  // fill the Utilities bucket before retrying.
  const utilitiesBalance = await getBucketBalance(employeeId, BUCKET.UTILITIES, USDC_ADDRESS)

  if (utilitiesBalance < billAmount) {
    throw new Error(
      `Insufficient Utilities balance: have ${utilitiesBalance}, need ${billAmount}. ` +
      `Bill will retry after next payroll cycle fills the bucket.`
    )
  }

  // ── Step 1+2: Pay biller via x402 (executor → biller) ─────────────────────
  // The 402 challenge has payTo = biller's own address.
  // wrapFetchWithPayment pays that address from executor wallet.
  console.log(`[bill:${bill.id}] x402 payment to ${biller.name}`)
  try {
    const signerWithRead = walletClient!.extend(publicActions)
    const payingFetch = wrapFetchWithPaymentFromConfig(fetch, {
      schemes: [{ network: 'eip155:*', client: new ExactEvmScheme(signerWithRead as any) }],
    })
    const res = await payingFetch(`${biller.url}/pay`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ employeeId, billId: bill.id }),
    })
    if (res.ok) {
      const data = await res.json() as any
      const reported = data.receipt?.amount
      // USDCm has 18 decimals: convert human-readable string to base units
      if (reported) billAmount = BigInt(Math.round(parseFloat(reported) * 1e18))
      console.log(`[bill:${bill.id}] Biller confirmed: ${data.receipt?.confirmationCode}`)
    } else {
      console.warn(`[bill:${bill.id}] Biller returned ${res.status}, using default amount`)
    }
  } catch (err: any) {
    console.warn(`[bill:${bill.id}] x402 call failed (${err.message}), proceeding`)
  }

  // ── Step 3: Reimburse executor from Utilities bucket (Unlink withdraw) ─────
  // Utilities bucket → executor EOA, same amount paid to biller.
  // Uses mutex to avoid setActive race with status reads or concurrent cycles.
  let relayId: string
  await withEmployeeLock(employeeId, async (unlink) => {
    await unlink.accounts.setActive(BUCKET.UTILITIES)
    const result = await unlink.withdraw({
      withdrawals: [{
        token:     USDC_ADDRESS,
        amount:    billAmount,
        recipient: EXECUTOR_ADDRESS as `0x${string}`,
      }],
    })
    await waitForConfirmation(unlink, result.relayId)
    relayId = result.relayId
    await unlink.accounts.setActive(BUCKET.MASTER) // restore
  })

  // ── Step 4: Record ─────────────────────────────────────────────────────────
  const paidAt = Math.floor(Date.now() / 1000)
  updateBillPaid(bill.id, paidAt)
  console.log(`[bill:${bill.id}] Done — relay ${relayId!}`)

  return {
    billId:     bill.id,
    employeeId,
    billerId:   bill.biller_id,
    billerName: biller.name,
    amount:     billAmount,
    relayId:    relayId!,
    paidAt:     new Date(paidAt * 1000).toISOString(),
  }
}
