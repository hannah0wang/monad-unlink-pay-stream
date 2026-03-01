/**
 * Per-employee Unlink Node SDK instances + async mutex.
 *
 * Each employee has their own SQLite DB at ./data/employee-{id}.db.
 *
 * MUTEX: Both the scheduler (runCycle, payBill) and the status endpoint
 * call unlink.accounts.setActive(). Since setActive mutates the active account
 * on the shared instance, concurrent async operations on the same employee
 * would interleave and read from the wrong account.
 *
 * We serialize per-employee Unlink operations with a simple promise chain mutex.
 * Any call that touches setActive must go through withEmployeeLock().
 *
 * Account indices:
 *   0 MASTER     — receives wages
 *   1 TAXES
 *   2 RETIREMENT
 *   3 HEALTH
 *   4 UTILITIES
 *   5 NET
 */
import { initUnlink, createSqliteStorage } from '@unlink-xyz/node'
import { mkdirSync } from 'fs'

mkdirSync('./data', { recursive: true })

type UnlinkInstance = Awaited<ReturnType<typeof initUnlink>>

const instances = new Map<number, UnlinkInstance>()
const locks     = new Map<number, Promise<void>>()

export const BUCKET = {
  MASTER:     0,
  TAXES:      1,
  RETIREMENT: 2,
  HEALTH:     3,
  UTILITIES:  4,
  NET:        5,
} as const

const BUCKET_COUNT = 6

// ─── Mutex ────────────────────────────────────────────────────────────────────

/**
 * Serialize async operations on the same employee's Unlink instance.
 * Any caller that uses setActive must wrap with this.
 */
export async function withEmployeeLock<T>(
  employeeId: number,
  fn: (unlink: UnlinkInstance) => Promise<T>,
): Promise<T> {
  const prev = locks.get(employeeId) ?? Promise.resolve()
  let release!: () => void
  const next = new Promise<void>(r => { release = r })
  locks.set(employeeId, next)

  try {
    await prev
    const unlink = await getEmployeeUnlink(employeeId)
    return await fn(unlink)
  } finally {
    release()
  }
}

// ─── Instance management ──────────────────────────────────────────────────────

/**
 * Register a new employee: import mnemonic, create 6 bucket accounts, sync.
 * Called once from POST /register.
 */
export async function registerEmployeeWallet(
  employeeId: number,
  mnemonic: string,
): Promise<UnlinkInstance> {
  const unlink = await initUnlink({
    chain:   'monad-testnet',
    storage: createSqliteStorage({ path: `./data/employee-${employeeId}.db` }),
    setup:   false,   // don't auto-create seed
    sync:    false,   // don't sync yet
  })

  await unlink.seed.importMnemonic(mnemonic)

  // Create all 6 bucket accounts (0 = Master, 1 = Taxes, ..., 5 = Net)
  for (let i = 0; i < BUCKET_COUNT; i++) {
    await unlink.accounts.create()
  }

  await unlink.sync()

  instances.set(employeeId, unlink)
  return unlink
}

/**
 * Load (or re-use) Unlink instance for an already-registered employee.
 * Seed + accounts already exist in SQLite from registration.
 */
export async function getEmployeeUnlink(employeeId: number): Promise<UnlinkInstance> {
  const cached = instances.get(employeeId)
  if (cached) return cached

  const unlink = await initUnlink({
    chain:   'monad-testnet',
    storage: createSqliteStorage({ path: `./data/employee-${employeeId}.db` }),
    setup:   false,
    sync:    true,
  })

  instances.set(employeeId, unlink)
  return unlink
}

// ─── Balance queries ──────────────────────────────────────────────────────────

/**
 * Read USDCm balance for every bucket account.
 * Uses the mutex — safe to call while scheduler is running.
 */
export async function getEmployeeBucketBalances(
  employeeId: number,
  usdcAddress: string,
): Promise<Record<string, string>> {
  return withEmployeeLock(employeeId, async (unlink) => {
    const result: Record<string, string> = {}
    for (const [key, idx] of Object.entries(BUCKET)) {
      await unlink.accounts.setActive(idx)
      const bal = await unlink.getBalance(usdcAddress)
      result[key] = bal.toString()
    }
    await unlink.accounts.setActive(BUCKET.MASTER) // restore
    return result
  })
}

/**
 * Read USDCm balance for a single bucket account.
 * Uses the mutex.
 */
export async function getBucketBalance(
  employeeId: number,
  bucketIndex: number,
  usdcAddress: string,
): Promise<bigint> {
  return withEmployeeLock(employeeId, async (unlink) => {
    await unlink.accounts.setActive(bucketIndex)
    const bal = await unlink.getBalance(usdcAddress)
    await unlink.accounts.setActive(BUCKET.MASTER) // restore
    return bal
  })
}
