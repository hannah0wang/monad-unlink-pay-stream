/**
 * Unlink SDK helpers for Private HCM
 *
 * Unlink provides ZK-private token transfers on Monad testnet.
 * Architecture:
 *   - Each employee has a Master account (index 0) + 5 spending buckets (1-5)
 *   - Wages land in Master; executor routes to buckets via private sends
 *   - Bill pay withdraws from Utilities bucket to a biller's public address
 *
 * SDK: @unlink-xyz/react@canary
 * Docs: https://docs.unlink.xyz
 */
export { encodeAddress, decodeAddress } from '@unlink-xyz/react'

// ─── Bucket account indices ────────────────────────────────────────────────────
// Must match executor/lib/wallet-manager.ts BUCKET constants.
export const BUCKET = {
  MASTER:     0,
  TAXES:      1,
  RETIREMENT: 2,
  HEALTH:     3,
  UTILITIES:  4,
  NET:        5,
} as const

export type BucketKey = keyof typeof BUCKET
export type BucketIndex = (typeof BUCKET)[BucketKey]

export const BUCKET_NAMES: Record<BucketKey, string> = {
  MASTER:     'Master',
  TAXES:      'Taxes',
  RETIREMENT: '401(k)',
  HEALTH:     'Health',
  UTILITIES:  'Utilities',
  NET:        'Take-Home',
}

export const BUCKET_COLORS: Record<BucketKey, string> = {
  MASTER:     '#836EF9',
  TAXES:      '#F97316',
  RETIREMENT: '#22C55E',
  HEALTH:     '#3B82F6',
  UTILITIES:  '#EAB308',
  NET:        '#A855F7',
}

// ─── Bucket config ─────────────────────────────────────────────────────────────
export interface BucketConfig {
  taxesBps:      number   // e.g. 2500 = 25%
  retirementBps: number   // e.g. 500  = 5%
  healthBps:     number   // e.g. 300  = 3%
  utilitiesBps:  number   // e.g. 1000 = 10%
  // net = 10000 - sum (derived)
}

export const DEFAULT_BUCKET_CONFIG: BucketConfig = {
  taxesBps:      2500,
  retirementBps: 500,
  healthBps:     300,
  utilitiesBps:  1000,
}

export function netBps(cfg: BucketConfig): number {
  return 10000 - cfg.taxesBps - cfg.retirementBps - cfg.healthBps - cfg.utilitiesBps
}

export function bpsToPercent(bps: number): string {
  return (bps / 100).toFixed(1) + '%'
}

// ─── Bucket addresses payload ─────────────────────────────────────────────────
// Sent to /register after wallet setup
export interface BucketAddresses {
  master:     string   // unlink1...
  taxes:      string
  retirement: string
  health:     string
  utilities:  string
  net:        string
}
