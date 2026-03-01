/**
 * Payroll cycle — core logic called by the scheduler.
 * Also exposed as POST /internal/runCycle (X-INTERNAL-KEY) for smoke testing.
 *
 * All Unlink operations go through withEmployeeLock() to prevent setActive()
 * races with concurrent status reads or bill payments.
 */
import type { Context } from 'hono'
import { waitForConfirmation } from '@unlink-xyz/node'
import { parseAbi } from 'viem'
import { walletClient, publicClient, EXECUTOR_ADDRESS, executorAccount } from '../lib/wallet'
import { withEmployeeLock, BUCKET } from '../lib/wallet-manager'
import { getEmployee, updateEmployeeRuntime, insertPayslip } from '../lib/db'
import { USDC_ADDRESS, PAYROLL_MANAGER_ADDRESS as PAYROLL_MANAGER } from '../lib/constants'

const PAYROLL_ABI = parseAbi([
  'function executePay(uint256 employeeId) external returns (uint256 amount)',
])
const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
])

function computeOpsFee(gross: bigint): bigint {
  // max($0.01, 0.1% of gross) — retained in executor wallet, funds x402 bill payments
  const pct = gross / 1000n
  const min = 10_000n
  return pct > min ? pct : min
}

export interface PayslipResult {
  employeeId:    number
  gross:         bigint
  opsFee:        bigint
  distributable: bigint
  buckets: { taxes: bigint; retirement: bigint; health: bigint; utilities: bigint; net: bigint }
  relayId:       string
  payTxHash:     `0x${string}`
  paidAt:        number
}

export async function runCycleForEmployee(employeeId: number): Promise<PayslipResult> {
  const config = getEmployee(employeeId)
  if (!config) throw new Error(`Employee ${employeeId} not registered`)
  if (!walletClient || !executorAccount) throw new Error('Executor wallet not configured')

  // ── 1. Pull wages from PayrollManager (on-chain) ───────────────────────────
  console.log(`[cycle:${employeeId}] executePay()`)
  const payTxHash = await walletClient.writeContract({
    address:      PAYROLL_MANAGER,
    abi:          PAYROLL_ABI,
    functionName: 'executePay',
    args:         [BigInt(employeeId)],
  })
  const payReceipt = await publicClient.waitForTransactionReceipt({ hash: payTxHash })
  if (payReceipt.status !== 'success') throw new Error('executePay reverted')

  const gross = parseGrossFromReceipt(payReceipt)

  // ── 2+3. Deposit into employee's Master Unlink account ─────────────────────
  // Uses mutex — no concurrent setActive interference
  let depositRelayId: string
  await withEmployeeLock(employeeId, async (unlink) => {
    await unlink.accounts.setActive(BUCKET.MASTER)

    // SDK generates ZK commitment + calldata; returns { to, calldata, relayId }
    const depositOp = await unlink.deposit({
      depositor: EXECUTOR_ADDRESS as `0x${string}`,
      deposits:  [{ token: USDC_ADDRESS, amount: gross }],
    })

    // Approve token to pool (depositOp.to is the Unlink pool address)
    const approveTx = await walletClient!.writeContract({
      address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve',
      args:    [depositOp.to as `0x${string}`, gross],
    })
    await publicClient.waitForTransactionReceipt({ hash: approveTx })

    // Submit deposit calldata from executor EOA
    const depositTxHash = await walletClient!.sendTransaction({
      to:   depositOp.to      as `0x${string}`,
      data: depositOp.calldata as `0x${string}`,
    })
    await publicClient.waitForTransactionReceipt({ hash: depositTxHash })

    await unlink.confirmDeposit(depositOp.relayId)
    depositRelayId = depositOp.relayId
    console.log(`[cycle:${employeeId}] deposited — relay ${depositOp.relayId}`)
  })

  // ── 4. Private routing: Master → 5 buckets ─────────────────────────────────
  const opsFee       = computeOpsFee(gross)
  const distributable = gross - opsFee
  const taxes       = (distributable * BigInt(config.taxes_bps))      / 10000n
  const retirement  = (distributable * BigInt(config.retirement_bps)) / 10000n
  const health      = (distributable * BigInt(config.health_bps))     / 10000n
  const utilities   = (distributable * BigInt(config.utilities_bps))  / 10000n
  const net         = distributable - taxes - retirement - health - utilities

  let sendRelayId: string
  await withEmployeeLock(employeeId, async (unlink) => {
    await unlink.accounts.setActive(BUCKET.MASTER)

    const transfers = [
      { token: USDC_ADDRESS, recipient: config.taxes_unlink_addr,      amount: taxes },
      { token: USDC_ADDRESS, recipient: config.retirement_unlink_addr,  amount: retirement },
      { token: USDC_ADDRESS, recipient: config.health_unlink_addr,      amount: health },
      { token: USDC_ADDRESS, recipient: config.utilities_unlink_addr,   amount: utilities },
      { token: USDC_ADDRESS, recipient: config.net_unlink_addr,         amount: net },
    ].filter(t => t.amount > 0n)

    console.log(`[cycle:${employeeId}] routing ${transfers.length} private sends`)
    const sendResult = await unlink.send({ transfers })
    await waitForConfirmation(unlink, sendResult.relayId)
    sendRelayId = sendResult.relayId
  })

  // ── 5. Record ──────────────────────────────────────────────────────────────
  const paidAt = Math.floor(Date.now() / 1000)

  insertPayslip({
    employee_id: employeeId,
    gross:       gross.toString(),
    ops_fee:     opsFee.toString(),
    taxes:       taxes.toString(),
    retirement:  retirement.toString(),
    health:      health.toString(),
    utilities:   utilities.toString(),
    net:         net.toString(),
    relay_id:    sendRelayId!,
  })
  updateEmployeeRuntime(employeeId, paidAt)

  console.log(`[cycle:${employeeId}] done — relay ${sendRelayId!}`)

  return {
    employeeId, gross, opsFee, distributable,
    buckets: { taxes, retirement, health, utilities, net },
    relayId:   sendRelayId!,
    payTxHash,
    paidAt,
  }
}

// ─── Internal HTTP route ──────────────────────────────────────────────────────

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
        gross:         p.gross.toString(),
        opsFee:        p.opsFee.toString(),
        distributable: p.distributable.toString(),
        buckets: Object.fromEntries(Object.entries(p.buckets).map(([k, v]) => [k, v.toString()])),
      },
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseGrossFromReceipt(receipt: { logs: readonly any[] }): bigint {
  // PayExecuted(uint256 indexed employeeId, uint256 amount)
  // amount is the first non-indexed field → first 32 bytes of log.data
  for (const log of receipt.logs) {
    if (log.data && log.data.length >= 66) {
      try {
        const amount = BigInt('0x' + log.data.slice(2, 66))
        if (amount > 0n) return amount
      } catch {}
    }
  }
  console.warn('[cycle] Could not parse amount from PayExecuted — defaulting to 100 USDC')
  return 100_000_000n
}
