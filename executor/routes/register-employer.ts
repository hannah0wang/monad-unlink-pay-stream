/**
 * POST /employer/register
 *
 * Employer onboarding — stores their Unlink mnemonic so the executor can
 * private-send wages on their behalf automatically.
 *
 * Body:
 *   mnemonic:          string   — employer's Unlink wallet mnemonic
 *   masterUnlinkAddr:  string   — employer's Master account "unlink1..." address
 *   employees: Array<{
 *     employeeId:      number   — must match employee's /register employeeId
 *     annualSalary:    string   — USDCm annual salary in 18-dec base units (as string)
 *   }>
 *
 * The employer must have already:
 *   1. Created a Unlink wallet (browser)
 *   2. Deposited enough USDCm into their Unlink Master account
 *   3. Each employee must have already called POST /register
 */
import type { Context } from 'hono'
import { registerEmployerWallet } from '../lib/wallet-manager'
import { insertEmployer, upsertEmployee, getEmployee } from '../lib/db'

export async function registerEmployerHandler(c: Context) {
  let body: {
    mnemonic:         string
    masterUnlinkAddr: string
    employees: Array<{
      employeeId:    number
      annualSalary?: string
      ratePerPeriod?: number  // legacy: used by test script
    }>
  }

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const { mnemonic, masterUnlinkAddr, employees } = body

  if (!mnemonic || !masterUnlinkAddr || !Array.isArray(employees) || employees.length === 0) {
    return c.json({ error: 'mnemonic, masterUnlinkAddr, and employees[] required' }, 400)
  }

  // Validate all employees exist (they must have registered first)
  for (const { employeeId } of employees) {
    const existing = getEmployee(employeeId)
    if (!existing) {
      return c.json({
        error: `Employee ${employeeId} not registered. Employee must call POST /register first.`,
      }, 400)
    }
  }

  try {
    // Insert employer record first to get the auto-incremented employer_id
    const employerId = insertEmployer(masterUnlinkAddr)

    // Initialize employer's Unlink wallet with the correct employer_id path
    await registerEmployerWallet(employerId, mnemonic)

    // Link employees to this employer and set their rate
    for (const { employeeId, annualSalary, ratePerPeriod } of employees) {
      const existing = getEmployee(employeeId)!
      // Accept either annualSalary (new) or ratePerPeriod (legacy test script)
      // Convert legacy ratePerPeriod (per-cycle amount) → annual salary
      // annual = ratePerPeriod * (seconds_per_year / cadence_seconds)
      const cadence = BigInt(existing.cadence_seconds || 60)
      const finalAnnualSalary = annualSalary && annualSalary !== '0'
        ? annualSalary
        : ratePerPeriod
          ? (BigInt(ratePerPeriod) * 31_557_600n / cadence).toString()
          : existing.annual_salary || '0'
      upsertEmployee({
        ...existing,
        employer_id:     employerId,
        annual_salary:   finalAnnualSalary,
        rate_per_period: ratePerPeriod ?? existing.rate_per_period,
      })
    }

    console.log(
      `[employer/register] Employer ${employerId} registered with ` +
      `${employees.length} employee(s)`
    )

    return c.json({
      ok: true,
      employerId,
      employees: employees.map(e => ({ employeeId: e.employeeId, annualSalary: e.annualSalary })),
      message: 'Employer registered. Executor will private-send wages automatically.',
    })
  } catch (err: any) {
    console.error('[employer/register] Error:', err)
    return c.json({ error: err.message ?? 'Registration failed' }, 500)
  }
}
