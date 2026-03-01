/**
 * Unlink wallet instances for both employers and employees.
 *
 * Both use the same Unlink Node SDK pattern:
 *   - One SQLite DB per wallet: ./data/employer-{id}.db, ./data/employee-{id}.db
 *   - Mnemonic imported once at registration; SDK derives accounts deterministically
 *   - Separate async mutex per wallet to prevent setActive() races
 *
 * Employee bucket indices:
 *   0 MASTER      receives wages from employer
 *   1 TAXES
 *   2 RETIREMENT
 *   3 HEALTH
 *   4 UTILITIES   bills paid from here
 *   5 NET
 *
 * Employer wallet:
 *   0 MASTER      holds payroll funds; executor private-sends wages from here
 */
import { initUnlink, createSqliteStorage } from '@unlink-xyz/node'

type UnlinkInstance = Awaited<ReturnType<typeof initUnlink>>

// ─── Instance caches ──────────────────────────────────────────────────────────

const employeeInstances = new Map<number, UnlinkInstance>()
const employerInstances = new Map<number, UnlinkInstance>()

// ─── Mutexes (one per wallet) ─────────────────────────────────────────────────

const employeeLocks = new Map<number, Promise<void>>()
const employerLocks = new Map<number, Promise<void>>()

function makeLock<T>(
  locks: Map<number, Promise<void>>,
  id: number,
  fn: (unlink: UnlinkInstance) => Promise<T>,
  getInstance: (id: number) => Promise<UnlinkInstance>,
): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve()
  let release!: () => void
  const next = new Promise<void>(r => { release = r })
  locks.set(id, next)
  return prev.then(() => getInstance(id)).then(fn).finally(() => release())
}

export async function withEmployeeLock<T>(id: number, fn: (u: UnlinkInstance) => Promise<T>) {
  return makeLock(employeeLocks, id, fn, getEmployeeUnlink)
}

export async function withEmployerLock<T>(id: number, fn: (u: UnlinkInstance) => Promise<T>) {
  return makeLock(employerLocks, id, fn, getEmployerUnlink)
}

// ─── Bucket constants ─────────────────────────────────────────────────────────

export const BUCKET = {
  MASTER:     0,
  TAXES:      1,
  RETIREMENT: 2,
  HEALTH:     3,
  UTILITIES:  4,
  NET:        5,
} as const

const BUCKET_COUNT = 6

// ─── Shared init helpers ──────────────────────────────────────────────────────

async function importWallet(
  dbPath: string,
  mnemonic: string,
  accountCount: number,
  allowExisting = false,
): Promise<UnlinkInstance> {
  const unlink = await initUnlink({
    chain:   'monad-testnet',
    storage: createSqliteStorage({ path: dbPath }),
    setup:   false,
    sync:    false,
  })

  const seedExists = await unlink.seed.exists()
  if (seedExists && allowExisting) {
    await unlink.sync({ forceFullResync: true })
    return unlink
  }

  await unlink.seed.importMnemonic(mnemonic, { overwrite: true })
  for (let i = 0; i < accountCount; i++) {
    await unlink.accounts.create()
  }
  // forceFullResync ensures freshly-deposited notes are visible immediately
  await unlink.sync({ forceFullResync: true })
  return unlink
}

async function loadWallet(dbPath: string): Promise<UnlinkInstance> {
  return initUnlink({
    chain:   'monad-testnet',
    storage: createSqliteStorage({ path: dbPath }),
    setup:   false,
    sync:    true,
  })
}

// ─── Employee wallet ──────────────────────────────────────────────────────────

/** Called once at POST /register — imports mnemonic, creates 6 bucket accounts. */
export async function registerEmployeeWallet(employeeId: number, mnemonic: string): Promise<UnlinkInstance> {
  const unlink = await importWallet(`./data/employee-${employeeId}.db`, mnemonic, BUCKET_COUNT, true)
  employeeInstances.set(employeeId, unlink)
  return unlink
}

/** Load (or re-use) employee Unlink instance. */
export async function getEmployeeUnlink(employeeId: number): Promise<UnlinkInstance> {
  const cached = employeeInstances.get(employeeId)
  if (cached) return cached
  const unlink = await loadWallet(`./data/employee-${employeeId}.db`)
  employeeInstances.set(employeeId, unlink)
  return unlink
}

// ─── Employer wallet ──────────────────────────────────────────────────────────

/**
 * Called once at POST /employer/register — imports mnemonic, creates 1 Master account.
 * Employer only needs account 0 (Master) to hold and send wages.
 */
export async function registerEmployerWallet(employerId: number, mnemonic: string): Promise<UnlinkInstance> {
  // Employer only needs 1 account (Master at index 0)
  const unlink = await importWallet(`./data/employer-${employerId}.db`, mnemonic, 1, true)
  employerInstances.set(employerId, unlink)
  return unlink
}

/** Load (or re-use) employer Unlink instance. */
export async function getEmployerUnlink(employerId: number): Promise<UnlinkInstance> {
  const cached = employerInstances.get(employerId)
  if (cached) return cached
  const unlink = await loadWallet(`./data/employer-${employerId}.db`)
  employerInstances.set(employerId, unlink)
  return unlink
}

// ─── Balance queries ──────────────────────────────────────────────────────────

/** Read USDCm balance for all 6 employee bucket accounts. Uses mutex. */
export async function getEmployeeBucketBalances(employeeId: number, usdcAddress: string): Promise<Record<string, string>> {
  return withEmployeeLock(employeeId, async (unlink) => {
    const result: Record<string, string> = {}
    for (const [key, idx] of Object.entries(BUCKET)) {
      // sync() applies to the active account — must switch first, then sync
      await unlink.accounts.setActive(idx)
      await unlink.sync()
      result[key] = (await unlink.getBalance(usdcAddress)).toString()
    }
    await unlink.accounts.setActive(BUCKET.MASTER)
    return result
  })
}

/** Read USDCm balance for a single employee bucket. Uses mutex. */
export async function getBucketBalance(employeeId: number, bucketIndex: number, usdcAddress: string): Promise<bigint> {
  return withEmployeeLock(employeeId, async (unlink) => {
    await unlink.accounts.setActive(bucketIndex)
    const bal = await unlink.getBalance(usdcAddress)
    await unlink.accounts.setActive(BUCKET.MASTER)
    return bal
  })
}

/** Read employer's Master account USDCm balance. Uses mutex. */
export async function getEmployerBalance(employerId: number, usdcAddress: string): Promise<bigint> {
  return withEmployerLock(employerId, async (unlink) => {
    await unlink.accounts.setActive(0)  // Employer only has Master (index 0)
    return unlink.getBalance(usdcAddress)
  })
}
