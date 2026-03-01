/**
 * Payroll database — employee configs, bills, payslips.
 * Unlink wallets are stored separately in ./data/employee-{id}.db by the SDK.
 */
import { Database } from 'bun:sqlite'
import { mkdirSync } from 'fs'

mkdirSync('./data', { recursive: true })

export const db = new Database('./data/payroll.db')

// ─── Schema ───────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    employee_id             INTEGER PRIMARY KEY,
    taxes_bps               INTEGER NOT NULL DEFAULT 2500,
    retirement_bps          INTEGER NOT NULL DEFAULT 500,
    health_bps              INTEGER NOT NULL DEFAULT 300,
    utilities_bps           INTEGER NOT NULL DEFAULT 1000,
    cadence_seconds         INTEGER NOT NULL DEFAULT 86400,
    last_run_at             INTEGER NOT NULL DEFAULT 0,
    next_run_at             INTEGER NOT NULL DEFAULT 0,
    master_unlink_addr      TEXT NOT NULL DEFAULT '',
    taxes_unlink_addr       TEXT NOT NULL DEFAULT '',
    retirement_unlink_addr  TEXT NOT NULL DEFAULT '',
    health_unlink_addr      TEXT NOT NULL DEFAULT '',
    utilities_unlink_addr   TEXT NOT NULL DEFAULT '',
    net_unlink_addr         TEXT NOT NULL DEFAULT '',
    registered_at           INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS bills (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id       INTEGER NOT NULL,
    biller_id         TEXT NOT NULL,
    label             TEXT NOT NULL DEFAULT '',
    frequency_seconds INTEGER NOT NULL DEFAULT 2592000,
    last_paid_at      INTEGER NOT NULL DEFAULT 0,
    active            INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS payslips (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    gross       TEXT NOT NULL,
    ops_fee     TEXT NOT NULL,
    taxes       TEXT NOT NULL,
    retirement  TEXT NOT NULL,
    health      TEXT NOT NULL,
    utilities   TEXT NOT NULL,
    net         TEXT NOT NULL,
    relay_id    TEXT,
    paid_at     INTEGER DEFAULT (unixepoch())
  );
`)

// Safe migrations for existing DBs
for (const sql of [
  `ALTER TABLE employees ADD COLUMN cadence_seconds INTEGER NOT NULL DEFAULT 86400`,
  `ALTER TABLE employees ADD COLUMN last_run_at INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE employees ADD COLUMN next_run_at INTEGER NOT NULL DEFAULT 0`,
]) {
  try { db.run(sql) } catch {}
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmployeeConfig {
  employee_id:            number
  taxes_bps:              number
  retirement_bps:         number
  health_bps:             number
  utilities_bps:          number
  cadence_seconds:        number
  last_run_at:            number
  next_run_at:            number
  master_unlink_addr:     string
  taxes_unlink_addr:      string
  retirement_unlink_addr: string
  health_unlink_addr:     string
  utilities_unlink_addr:  string
  net_unlink_addr:        string
}

export interface Bill {
  id:               number
  employee_id:      number
  biller_id:        string
  label:            string
  frequency_seconds: number
  last_paid_at:     number
  active:           number
}

export interface Payslip {
  id:         number
  employee_id: number
  gross:      string
  ops_fee:    string
  taxes:      string
  retirement: string
  health:     string
  utilities:  string
  net:        string
  relay_id:   string | null
  paid_at:    number
}

// ─── Employee helpers ─────────────────────────────────────────────────────────

export function getEmployee(employeeId: number): EmployeeConfig | null {
  return db
    .query<EmployeeConfig, [number]>('SELECT * FROM employees WHERE employee_id = ?')
    .get(employeeId) ?? null
}

export function upsertEmployee(config: Omit<EmployeeConfig, 'last_run_at' | 'next_run_at'> & {
  last_run_at?: number
  next_run_at?: number
}): void {
  const now = Math.floor(Date.now() / 1000)
  const next = now + config.cadence_seconds
  db.run(`
    INSERT INTO employees (
      employee_id, taxes_bps, retirement_bps, health_bps, utilities_bps,
      cadence_seconds, last_run_at, next_run_at,
      master_unlink_addr, taxes_unlink_addr, retirement_unlink_addr,
      health_unlink_addr, utilities_unlink_addr, net_unlink_addr
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(employee_id) DO UPDATE SET
      taxes_bps              = excluded.taxes_bps,
      retirement_bps         = excluded.retirement_bps,
      health_bps             = excluded.health_bps,
      utilities_bps          = excluded.utilities_bps,
      cadence_seconds        = excluded.cadence_seconds,
      next_run_at            = excluded.next_run_at,
      master_unlink_addr     = excluded.master_unlink_addr,
      taxes_unlink_addr      = excluded.taxes_unlink_addr,
      retirement_unlink_addr = excluded.retirement_unlink_addr,
      health_unlink_addr     = excluded.health_unlink_addr,
      utilities_unlink_addr  = excluded.utilities_unlink_addr,
      net_unlink_addr        = excluded.net_unlink_addr
  `,
    config.employee_id,
    config.taxes_bps,
    config.retirement_bps,
    config.health_bps,
    config.utilities_bps,
    config.cadence_seconds,
    config.last_run_at ?? 0,
    config.next_run_at ?? next,
    config.master_unlink_addr,
    config.taxes_unlink_addr,
    config.retirement_unlink_addr,
    config.health_unlink_addr,
    config.utilities_unlink_addr,
    config.net_unlink_addr,
  )
}

export function updateEmployeeRuntime(employeeId: number, lastRunAt: number): void {
  const emp = getEmployee(employeeId)
  if (!emp) return
  db.run(
    'UPDATE employees SET last_run_at = ?, next_run_at = ? WHERE employee_id = ?',
    lastRunAt,
    lastRunAt + emp.cadence_seconds,
    employeeId,
  )
}

export function getDueEmployees(now: number): EmployeeConfig[] {
  return db
    .query<EmployeeConfig, [number]>(
      'SELECT * FROM employees WHERE next_run_at > 0 AND next_run_at <= ?',
    )
    .all(now)
}

// ─── Bill helpers ─────────────────────────────────────────────────────────────

export function insertBill(
  employeeId: number,
  billerId: string,
  label: string,
  frequencySeconds: number,
): number {
  const result = db.run(
    'INSERT INTO bills (employee_id, biller_id, label, frequency_seconds) VALUES (?, ?, ?, ?)',
    employeeId, billerId, label, frequencySeconds,
  )
  return Number(result.lastInsertRowid)
}

export function getBillsForEmployee(employeeId: number): Bill[] {
  return db
    .query<Bill, [number]>('SELECT * FROM bills WHERE employee_id = ? AND active = 1')
    .all(employeeId)
}

export function getDueBills(now: number): Bill[] {
  return db
    .query<Bill, [number]>(
      'SELECT * FROM bills WHERE active = 1 AND last_paid_at + frequency_seconds <= ?',
    )
    .all(now)
}

export function updateBillPaid(billId: number, paidAt: number): void {
  db.run('UPDATE bills SET last_paid_at = ? WHERE id = ?', paidAt, billId)
}

export function cancelBill(billId: number, employeeId: number): void {
  db.run('UPDATE bills SET active = 0 WHERE id = ? AND employee_id = ?', billId, employeeId)
}

// ─── Payslip helpers ──────────────────────────────────────────────────────────

export function insertPayslip(p: Omit<Payslip, 'id' | 'paid_at'>): void {
  db.run(`
    INSERT INTO payslips (employee_id, gross, ops_fee, taxes, retirement, health, utilities, net, relay_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, p.employee_id, p.gross, p.ops_fee, p.taxes, p.retirement, p.health, p.utilities, p.net, p.relay_id)
}

export function getRecentPayslips(employeeId: number, limit = 5): Payslip[] {
  return db
    .query<Payslip, [number, number]>(
      'SELECT * FROM payslips WHERE employee_id = ? ORDER BY paid_at DESC LIMIT ?',
    )
    .all(employeeId, limit)
}
