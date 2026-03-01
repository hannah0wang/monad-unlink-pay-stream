/**
 * End-to-end test — no frontend required.
 *
 * What this tests:
 *   1. Creates real Unlink wallets (employee + employer) via Node SDK
 *   2. Deposits USDCm into employer Unlink wallet (from executor EOA)
 *   3. Registers employee with executor (POST /register)
 *   4. Registers employer with executor (POST /employer/register)
 *   5. Triggers a payroll cycle (POST /internal/runCycle)
 *      → internally: x402 wage request → employer sends → employee routes to buckets
 *   6. Checks bucket balances and payslip (GET /status/0)
 *
 * Requirements:
 *   - Executor running:  bun run dev          (terminal 1)
 *   - Run this script:   bun run test         (terminal 2)
 *   - Funded wallet set in root ../.env
 *
 * Cost: ~$10 USDCm for employer deposit + $0.01 x402 fee + gas
 */

import { initUnlink, createSqliteStorage, waitForConfirmation } from '@unlink-xyz/node'
import { createWalletClient, createPublicClient, http, defineChain, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mkdirSync, rmSync } from 'fs'

const EXECUTOR_URL  = 'http://localhost:3001'
const INTERNAL_KEY  = process.env.INTERNAL_KEY  ?? 'demo-internal-key'
const USDC          = process.env.USDC_ADDRESS  as `0x${string}`
const EXECUTOR_EOA  = process.env.EXECUTOR_ADDRESS as `0x${string}`
const PRIVATE_KEY   = process.env.EXECUTOR_PRIVATE_KEY as `0x${string}`
const MONAD_RPC     = process.env.MONAD_RPC_URL ?? 'https://testnet-rpc.monad.xyz'

if (!PRIVATE_KEY || PRIVATE_KEY === '0x') {
  console.error('EXECUTOR_PRIVATE_KEY not set in ../.env')
  process.exit(1)
}

// ─── Viem clients ─────────────────────────────────────────────────────────────

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [MONAD_RPC] } },
  testnet: true,
})

const account      = privateKeyToAccount(PRIVATE_KEY)
// retryCount + retryDelay handle 429 rate limiting from public testnet RPC
const walletClient = createWalletClient({ account, chain: monadTestnet, transport: http(MONAD_RPC, { retryCount: 5, retryDelay: 1500 }) })
const publicClient = createPublicClient({ chain: monadTestnet, transport: http(MONAD_RPC, { retryCount: 5, retryDelay: 1500 }) })

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function allowance(address owner, address spender) external view returns (uint256)',
])

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(step: string, msg: string) {
  console.log(`\n[${step}] ${msg}`)
}

function ok(msg: string) {
  console.log(`  ✓ ${msg}`)
}

function fail(msg: string) {
  console.error(`  ✗ ${msg}`)
}

async function post(path: string, body: object, headers: Record<string, string> = {}) {
  const res = await fetch(`${EXECUTOR_URL}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body:    JSON.stringify(body),
  })
  const data = await res.json()
  return { status: res.status, ok: res.ok, data }
}

// ─── Test data dir ────────────────────────────────────────────────────────────

const TEST_DIR = './test-data'
mkdirSync(TEST_DIR, { recursive: true })

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('━━━ Payroll Ninja — E2E Test ━━━')
console.log(`Executor: ${EXECUTOR_URL}`)
console.log(`EOA:      ${EXECUTOR_EOA}`)

// ── 1. Check executor is running ──────────────────────────────────────────────
log('1/7', 'Checking executor health...')
try {
  const health = await fetch(`${EXECUTOR_URL}/health`).then(r => r.json()) as any
  ok(`Executor running — float: ${health.executorFloat ?? 'unknown'}`)
  if (health.floatWarning) fail(`Float warning: ${health.floatWarning}`)
} catch {
  fail('Executor not running. Start it with: bun run dev')
  process.exit(1)
}

// ── 2. Create employee Unlink wallet ──────────────────────────────────────────
log('2/7', 'Creating employee Unlink wallet (6 accounts)...')

const employeeUnlink = await initUnlink({
  chain:   'monad-testnet',
  storage: createSqliteStorage({ path: `${TEST_DIR}/employee-test.db` }),
})

// initUnlink creates account 0 automatically. Create 5 more.
const existing = await employeeUnlink.accounts.list()
for (let i = existing.length; i < 6; i++) {
  await employeeUnlink.accounts.create()
}

const employeeAccounts = await employeeUnlink.accounts.list()
const employeeMnemonic = await employeeUnlink.seed.exportMnemonic()

ok(`Mnemonic: ${employeeMnemonic.split(' ').slice(0, 3).join(' ')}...`)
employeeAccounts.forEach(a => ok(`  [${a.index}] ${a.address}`))

// ── 3. Create employer Unlink wallet ──────────────────────────────────────────
log('3/7', 'Creating employer Unlink wallet...')

const employerUnlink = await initUnlink({
  chain:   'monad-testnet',
  storage: createSqliteStorage({ path: `${TEST_DIR}/employer-test.db` }),
})

const employerAccounts = await employerUnlink.accounts.list()
const employerMnemonic = await employerUnlink.seed.exportMnemonic()
const employerMaster   = employerAccounts[0]

ok(`Mnemonic: ${employerMnemonic.split(' ').slice(0, 3).join(' ')}...`)
ok(`Master:   ${employerMaster.address}`)

// ── 4. Deposit USDCm into employer Unlink wallet ──────────────────────────────
// ── Pre-approve USDCm to Permit2 (one-time, enables x402 payments) ───────────
// Permit2 is deployed on Monad testnet. USDCm doesn't support EIP-3009,
// so x402 uses Permit2 for off-chain payment authorization instead.
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as `0x${string}`
const UINT256_MAX = 2n ** 256n - 1n

try {
  ok('Approving USDCm to Permit2 (one-time setup for x402)...')
  const permit2Allowance = await publicClient.readContract({
    address: USDC, abi: ERC20_ABI, functionName: 'allowance',
    args: [EXECUTOR_EOA as `0x${string}`, PERMIT2],
  })
  if (permit2Allowance < UINT256_MAX / 2n) {
    const tx = await walletClient.writeContract({
      address: USDC, abi: ERC20_ABI, functionName: 'approve',
      args: [PERMIT2, UINT256_MAX],
    })
    await publicClient.waitForTransactionReceipt({ hash: tx })
    ok(`Permit2 approved: ${tx}`)
  } else {
    ok('Permit2 already approved, skipping')
  }
} catch (err: any) {
  fail(`Permit2 approval failed: ${err.shortMessage ?? err.message}`)
}

// Brief pause so executor's health-check RPC calls don't race with ours
await new Promise(r => setTimeout(r, 2000))
log('4/7', 'Depositing 10 USDCm into employer Unlink wallet...')

// USDCm has 18 decimals: 10 USDCm = 10 * 1e18
const DEPOSIT_AMOUNT = 10_000_000_000_000_000_000n   // 10 USDCm — enough for several test cycles

// Check current USDC balance first
const usdcBalance = await publicClient.readContract({
  address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [EXECUTOR_EOA],
})
ok(`Executor EOA balance: ${usdcBalance / 1_000_000_000_000_000_000n} USDCm`)

if (usdcBalance < DEPOSIT_AMOUNT) {
  fail(`Insufficient balance. Need 10 USDCm, have ${usdcBalance / 1_000_000_000_000_000_000n} USDCm`)
  fail('Get USDCm at: https://faucet.unlink.xyz')
  process.exit(1)
}

await employerUnlink.accounts.setActive(0)
const depositOp = await employerUnlink.deposit({
  depositor: EXECUTOR_EOA,
  deposits:  [{ token: USDC, amount: DEPOSIT_AMOUNT }],
})

// Approve
const approveTx = await walletClient.writeContract({
  address: USDC, abi: ERC20_ABI, functionName: 'approve',
  args:    [depositOp.to as `0x${string}`, DEPOSIT_AMOUNT],
})
await publicClient.waitForTransactionReceipt({ hash: approveTx })
ok(`Approved: ${approveTx}`)

// Deposit
const depositTx = await walletClient.sendTransaction({
  to:   depositOp.to      as `0x${string}`,
  data: depositOp.calldata as `0x${string}`,
})
await publicClient.waitForTransactionReceipt({ hash: depositTx })
ok(`Deposited: ${depositTx}`)

await employerUnlink.confirmDeposit(depositOp.relayId)
ok(`Confirmed relay: ${depositOp.relayId}`)

// ── 5. Register employee ───────────────────────────────────────────────────────
log('5/7', 'Registering employee (POST /register)...')

const reg = await post('/register', {
  employeeId:     0,
  mnemonic:       employeeMnemonic,
  cadenceSeconds: 60,
  bucketAddresses: {
    master:     employeeAccounts[0].address,
    taxes:      employeeAccounts[1].address,
    retirement: employeeAccounts[2].address,
    health:     employeeAccounts[3].address,
    utilities:  employeeAccounts[4].address,
    net:        employeeAccounts[5].address,
  },
  bucketBps: { taxesBps: 3100, retirementBps: 600, healthBps: 350, utilitiesBps: 1000 },
  bills: [],   // skip bills for basic test
})

if (reg.ok) {
  ok(`Employee registered — cadence: ${reg.data.cadence}, net: ${reg.data.netBps / 100}%`)
} else {
  fail(`Registration failed: ${reg.data.error}`)
  process.exit(1)
}

// ── 6. Register employer ───────────────────────────────────────────────────────
log('6/7', 'Registering employer (POST /employer/register)...')

// USDCm has 18 decimals: 1 USDCm = 1e18
const RATE = 1_000_000_000_000_000_000n  // 1 USDCm per 60s — small for testing

const empReg = await post('/employer/register', {
  mnemonic:        employerMnemonic,
  masterUnlinkAddr: employerMaster.address,
  employees: [{ employeeId: 0, ratePerPeriod: Number(RATE) }],
})

if (empReg.ok) {
  ok(`Employer registered — id: ${empReg.data.employerId}`)
} else {
  fail(`Employer registration failed: ${empReg.data.error}`)
  process.exit(1)
}

// ── 7. Trigger payroll cycle ───────────────────────────────────────────────────
log('7/7', 'Triggering payroll cycle (POST /internal/runCycle)...')
log('',    '  This runs: x402 wage request → employer sends $1 → employee routes to 5 buckets')
log('',    '  Wait ~30s for ZK proofs...')

const cycle = await post(
  '/internal/runCycle',
  { employeeId: 0 },
  { 'X-Internal-Key': INTERNAL_KEY },
)

if (cycle.ok) {
  const p = cycle.data.payslip
  ok(`Cycle complete!`)
  const fmt = (v: string) => {
    const raw = BigInt(v)
    const whole = raw / 1_000_000_000_000_000_000n
    const frac  = ((raw % 1_000_000_000_000_000_000n) * 100n) / 1_000_000_000_000_000_000n
    return `${whole}.${frac.toString().padStart(2, '0')}`
  }
  ok(`  Gross:      ${fmt(p.gross)} USDCm`)
  ok(`  Taxes:      ${fmt(p.buckets.taxes)} USDCm`)
  ok(`  Retirement: ${fmt(p.buckets.retirement)} USDCm`)
  ok(`  Health:     ${fmt(p.buckets.health)} USDCm`)
  ok(`  Utilities:  ${fmt(p.buckets.utilities)} USDCm`)
  ok(`  Net:        ${fmt(p.buckets.net)} USDCm`)
  ok(`  Wage relay:  ${p.wageRelayId}`)
  ok(`  Route relay: ${p.routeRelayId}`)
} else {
  fail(`Cycle failed: ${cycle.data.error}`)
  process.exit(1)
}

// ── Final: Check status ────────────────────────────────────────────────────────
console.log('\n━━━ Status ━━━')
const status = await fetch(`${EXECUTOR_URL}/status/0`).then(r => r.json()) as any
console.log(JSON.stringify(status, null, 2))

console.log('\n━━━ All tests passed ✓ ━━━')
