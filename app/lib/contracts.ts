// USDCm on Monad testnet — set at PayrollManager deploy time (immutable in contract)
// This should match the USDC_ADDRESS used when deploying.
export const USDC_ADDRESS = (
  process.env.NEXT_PUBLIC_USDC_ADDRESS ?? '0xc4fB617E4E4CfbdEb07216dFF62B4E46a2D6FdF6'
) as `0x${string}`

export const PAYROLL_MANAGER_ADDRESS = (
  process.env.NEXT_PUBLIC_PAYROLL_MANAGER_ADDRESS ?? '0x0000000000000000000000000000000000000001'
) as `0x${string}`

export const EXECUTOR_URL =
  process.env.NEXT_PUBLIC_EXECUTOR_URL ?? 'http://localhost:3001'

// ─── USDCm ABI (standard ERC-20, 6 decimals) ──────────────────────────────────
export const USDC_ABI = [
  { name: 'balanceOf',  type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'approve',    type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }] },
  { name: 'allowance',  type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ type: 'uint256' }] },
] as const

// ─── PayrollManager ABI ────────────────────────────────────────────────────────
// Note: registerEmployee no longer takes an unlink address — privacy is preserved
// by keeping all unlink identifiers off-chain in the executor DB.
export const PAYROLL_MANAGER_ABI = [
  {
    name: 'fundPayroll',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'registerEmployee',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'ratePerPeriod',  type: 'uint256' },
      { name: 'periodSeconds',  type: 'uint256' },
    ],
    outputs: [{ name: 'id', type: 'uint256' }],
  },
  {
    name: 'employees',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [
      { name: 'employer',      type: 'address' },
      { name: 'ratePerPeriod', type: 'uint256' },
      { name: 'periodSeconds', type: 'uint256' },
      { name: 'lastPaidAt',    type: 'uint256' },
      { name: 'active',        type: 'bool' },
    ],
  },
  {
    name: 'payrollBalance',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'employer', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'nextEmployeeId',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'USDC',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    name: 'deactivateEmployee',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'employeeId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'withdrawPayroll',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  // Events
  {
    name: 'EmployeeRegistered',
    type: 'event',
    inputs: [
      { name: 'id',            type: 'uint256', indexed: true },
      { name: 'employer',      type: 'address', indexed: true },
      { name: 'ratePerPeriod', type: 'uint256', indexed: false },
      { name: 'periodSeconds', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'PayrollFunded',
    type: 'event',
    inputs: [
      { name: 'employer', type: 'address', indexed: true },
      { name: 'amount',   type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'PayExecuted',
    type: 'event',
    inputs: [
      { name: 'employeeId', type: 'uint256', indexed: true },
      { name: 'amount',     type: 'uint256', indexed: false },
    ],
  },
] as const

// ─── Formatting helpers ────────────────────────────────────────────────────────
// USDCm has 18 decimals (not 6 like Circle USDC)
const TOKEN_UNIT = 1_000_000_000_000_000_000n

export function formatUsdc(amount: bigint): string {
  const whole = amount / TOKEN_UNIT
  const frac  = ((amount % TOKEN_UNIT) * 100n) / TOKEN_UNIT
  return `${whole}.${frac.toString().padStart(2, '0')}`
}

export function parseUsdc(amount: string): bigint {
  return BigInt(Math.round(parseFloat(amount) * 1e18))
}
