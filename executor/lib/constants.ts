/**
 * Shared executor constants.
 * USDC_ADDRESS must match the address passed to PayrollManager's constructor at deploy time.
 * Set USDC_ADDRESS in executor/.env — it's read here once and imported everywhere.
 */
export const USDC_ADDRESS = (
  process.env.USDC_ADDRESS ?? '0xc4fB617E4E4CfbdEb07216dFF62B4E46a2D6FdF6'
) as `0x${string}`

export const PAYROLL_MANAGER_ADDRESS = (
  process.env.PAYROLL_MANAGER_ADDRESS ?? '0x0'
) as `0x${string}`
