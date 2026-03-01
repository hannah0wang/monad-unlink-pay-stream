/**
 * Shared executor constants.
 * USDC_ADDRESS must match the address passed to PayrollManager's constructor at deploy time.
 * Set USDC_ADDRESS in executor/.env — it's read here once and imported everywhere.
 */
export const USDC_ADDRESS = (
  process.env.USDC_ADDRESS ?? '0xc4fB617E4E4CfbdEb07216dFF62B4E46a2D6FdF6'
) as `0x${string}`

// USDCm has 18 decimals (not 6 like Circle USDC)
export const TOKEN_DECIMALS = 18n
export const TOKEN_UNIT     = 10n ** TOKEN_DECIMALS   // 1 USDCm = 1_000_000_000_000_000_000

/** Format raw token amount as human-readable string (2 decimal places) */
export function formatToken(raw: bigint): string {
  const whole = raw / TOKEN_UNIT
  const frac  = ((raw % TOKEN_UNIT) * 100n) / TOKEN_UNIT
  return `${whole}.${frac.toString().padStart(2, '0')}`
}

export const PAYROLL_MANAGER_ADDRESS = (
  process.env.PAYROLL_MANAGER_ADDRESS ?? '0x0'
) as `0x${string}`
