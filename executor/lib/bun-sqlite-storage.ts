/**
 * Bun-native SQLite storage for the Unlink Node SDK.
 *
 * The Unlink SDK's createSqliteStorage() uses better-sqlite3 which crashes Bun
 * due to V8/JavaScriptCore incompatibility. This implements the same Storage
 * interface using Bun's built-in bun:sqlite module instead.
 *
 * Drop-in replacement: use createBunSqliteStorage({ path }) anywhere you'd
 * use createSqliteStorage({ path }) from @unlink-xyz/node.
 */
import { Database } from 'bun:sqlite'
import { mkdirSync } from 'fs'
import { dirname } from 'path'

interface IterOptions {
  prefix?: string
  start?:  string
  end?:    string
  limit?:  number
  reverse?: boolean
}

export function createBunSqliteStorage(opts: { path: string }) {
  let db: Database | null = null

  function getDb(): Database {
    if (!db) throw new Error('Storage not opened')
    return db
  }

  return {
    async open() {
      mkdirSync(dirname(opts.path), { recursive: true })
      db = new Database(opts.path)
      db.exec(`PRAGMA journal_mode = WAL`)
      db.exec(`PRAGMA busy_timeout = 5000`)
      db.exec(`
        CREATE TABLE IF NOT EXISTS kv (
          key   TEXT PRIMARY KEY,
          value BLOB NOT NULL
        );
        CREATE TABLE IF NOT EXISTS meta (
          key   TEXT PRIMARY KEY,
          value INTEGER NOT NULL
        );
      `)
    },

    async get(key: string): Promise<Uint8Array | null> {
      const row = getDb()
        .query<{ value: Buffer }, [string]>('SELECT value FROM kv WHERE key = ?')
        .get(key)
      return row ? new Uint8Array(row.value) : null
    },

    async put(key: string, value: Uint8Array): Promise<void> {
      getDb().run(
        'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)',
        key,
        Buffer.from(value),
      )
    },

    async delete(key: string): Promise<void> {
      getDb().run('DELETE FROM kv WHERE key = ?', key)
    },

    async batch(ops: Array<{ put?: [string, Uint8Array]; del?: string }>): Promise<void> {
      const runBatch = getDb().transaction(() => {
        for (const op of ops) {
          if (op.put) {
            const [k, v] = op.put
            getDb().run('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', k, Buffer.from(v))
          }
          if (op.del) {
            getDb().run('DELETE FROM kv WHERE key = ?', op.del)
          }
        }
      })
      runBatch()
    },

    async iter(o: IterOptions = {}): Promise<Array<{ key: string; value: Uint8Array }>> {
      if (o.start && o.end && o.start > o.end) {
        throw new Error('iter start bound must not exceed end bound')
      }

      const conditions: string[] = []
      const params: (string | number)[] = []

      if (o.prefix) {
        const escaped = o.prefix.replace(/[%_\\]/g, '\\$&')
        conditions.push("key LIKE ? ESCAPE '\\'")
        params.push(escaped + '%')
      }
      if (o.start) { conditions.push('key >= ?'); params.push(o.start) }
      if (o.end)   { conditions.push('key <= ?'); params.push(o.end) }

      let sql = 'SELECT key, value FROM kv'
      if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ')
      sql += o.reverse ? ' ORDER BY key DESC' : ' ORDER BY key ASC'
      if (o.limit != null) { sql += ' LIMIT ?'; params.push(o.limit) }

      const rows = getDb().query<{ key: string; value: Buffer }, any>(sql).all(...params)
      return rows.map(row => ({ key: row.key, value: new Uint8Array(row.value) }))
    },

    async count(prefix?: string): Promise<number> {
      let sql = 'SELECT COUNT(*) as cnt FROM kv'
      const params: string[] = []
      if (prefix) {
        const escaped = prefix.replace(/[%_\\]/g, '\\$&')
        sql += " WHERE key LIKE ? ESCAPE '\\'"
        params.push(escaped + '%')
      }
      const row = getDb().query<{ cnt: number }, any>(sql).get(...params)
      return row?.cnt ?? 0
    },

    async getSchemaVersion(): Promise<number> {
      const row = getDb()
        .query<{ value: number }, []>("SELECT value FROM meta WHERE key = 'schema_version'")
        .get()
      return row?.value ?? 0
    },

    async setSchemaVersion(v: number): Promise<void> {
      getDb().run(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)",
        v,
      )
    },
  }
}
