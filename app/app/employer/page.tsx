'use client'

/**
 * /employer — Employer payroll management
 *
 * Actions:
 *   1. Register an employee (rate + cadence) on PayrollManager
 *      — no Unlink address on-chain; employee registers their Unlink wallet
 *        separately with the executor via /setup
 *   2. Fund payroll (approve USDCm + fundPayroll) on PayrollManager
 *   3. View current payroll balance
 *
 * After registering on-chain, give the employeeId to your employee.
 * They enter it during /setup to link their Unlink wallet to this payroll slot.
 */
import { useState } from 'react'
import { useAccount, useWriteContract, useReadContract } from 'wagmi'
import { parseUnits } from 'viem'
import {
  PAYROLL_MANAGER_ADDRESS,
  PAYROLL_MANAGER_ABI,
  USDC_ADDRESS,
  USDC_ABI,
  formatUsdc,
  parseUsdc,
} from '@/lib/contracts'

const PERIOD_OPTIONS = [
  { label: 'Hourly',  value: 3600 },
  { label: 'Daily',   value: 86400 },
  { label: 'Weekly',  value: 604800 },
  { label: 'Monthly', value: 2592000 },
]

export default function EmployerPage() {
  const { address } = useAccount()
  const { writeContractAsync } = useWriteContract()

  // Register employee form
  const [rate, setRate]             = useState('100')   // USDCm per period
  const [period, setPeriod]         = useState(86400)
  const [regStatus, setRegStatus]   = useState<string | null>(null)
  const [regLoading, setRegLoading] = useState(false)
  const [lastEmployeeId, setLastEmployeeId] = useState<number | null>(null)

  // Fund payroll form
  const [fundAmount, setFundAmount]   = useState('1000')
  const [fundStatus, setFundStatus]   = useState<string | null>(null)
  const [fundLoading, setFundLoading] = useState(false)

  // On-chain data
  const { data: payrollBalance, refetch: refetchBalance } = useReadContract({
    address: PAYROLL_MANAGER_ADDRESS,
    abi: PAYROLL_MANAGER_ABI,
    functionName: 'payrollBalance',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // Next employeeId (shown after registration so employer can relay it to employee)
  const { data: nextEmployeeId } = useReadContract({
    address: PAYROLL_MANAGER_ADDRESS,
    abi: PAYROLL_MANAGER_ABI,
    functionName: 'nextEmployeeId',
    query: { enabled: true },
  })

  // ── Register employee ──────────────────────────────────────────────────────
  async function handleRegister() {
    if (!address) return
    setRegLoading(true)
    setRegStatus('Registering employee...')
    try {
      const ratePerPeriod = parseUsdc(rate)
      const tx = await writeContractAsync({
        address: PAYROLL_MANAGER_ADDRESS,
        abi: PAYROLL_MANAGER_ABI,
        functionName: 'registerEmployee',
        args: [ratePerPeriod, BigInt(period)],
      })
      // nextEmployeeId before tx = the new employee's id
      const newId = nextEmployeeId !== undefined ? Number(nextEmployeeId) : null
      setLastEmployeeId(newId)
      setRegStatus(`✅ Registered! Employee ID: ${newId} — give this to your employee`)
    } catch (err: any) {
      setRegStatus(`❌ ${err.shortMessage ?? err.message}`)
    } finally {
      setRegLoading(false)
    }
  }

  // ── Fund payroll ───────────────────────────────────────────────────────────
  async function handleFundPayroll() {
    if (!address) return
    setFundLoading(true)
    setFundStatus('Approving USDC...')
    try {
      const amount = parseUsdc(fundAmount)

      // 1. Approve USDC to PayrollManager
      const approveTx = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'approve',
        args: [PAYROLL_MANAGER_ADDRESS, amount],
      })
      setFundStatus('Approval sent, funding payroll...')

      // 2. Fund payroll
      const fundTx = await writeContractAsync({
        address: PAYROLL_MANAGER_ADDRESS,
        abi: PAYROLL_MANAGER_ABI,
        functionName: 'fundPayroll',
        args: [amount],
      })

      await refetchBalance()
      setFundStatus(`✅ Payroll funded: ${fundAmount} USDC. tx: ${fundTx.slice(0, 18)}...`)
    } catch (err: any) {
      setFundStatus(`❌ ${err.shortMessage ?? err.message}`)
    } finally {
      setFundLoading(false)
    }
  }

  const periodLabel = PERIOD_OPTIONS.find(o => o.value === period)?.label ?? 'Custom'

  return (
    <div className="max-w-2xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Employer Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Register employees and fund payroll via PayrollManager</p>
        </div>
        <a
          href="https://faucet.circle.com"
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 text-xs border border-[#2A2A3A] text-gray-400 rounded-lg hover:bg-[#2A2A3A] transition-colors"
        >
          Get USDC ↗
        </a>
      </div>

      {/* Balance summary */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-[#14141F] border border-[#2A2A3A] rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Payroll Balance (locked)</div>
          <div className="text-white font-bold text-xl">
            {payrollBalance !== undefined ? formatUsdc(payrollBalance) : '—'} USDC
          </div>
          <div className="text-xs text-gray-600 mt-0.5">Available in PayrollManager</div>
        </div>
        <div className="bg-[#14141F] border border-[#2A2A3A] rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Wallet USDC</div>
          <div className="text-white font-bold text-xl">
            {usdcBalance !== undefined ? formatUsdc(usdcBalance) : '—'} USDC
          </div>
          <div className="text-xs text-gray-600 mt-0.5">Available to fund</div>
        </div>
      </div>

      {/* Register employee */}
      <div className="bg-[#14141F] border border-[#2A2A3A] rounded-xl p-6 mb-4">
        <h2 className="text-white font-medium mb-1">Register Employee</h2>
        <p className="text-gray-500 text-xs mb-4">
          Set the pay rate and cadence. Share the Employee ID with your employee after registering so they can complete their setup.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Rate per Period (USDC)</label>
            <input
              type="number"
              value={rate}
              onChange={e => setRate(e.target.value)}
              className="w-full bg-[#0E0E16] border border-[#2A2A3A] rounded-lg px-3 py-2 text-white text-sm focus:border-[#836EF9] outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Pay Cadence</label>
            <select
              value={period}
              onChange={e => setPeriod(parseInt(e.target.value))}
              className="w-full bg-[#0E0E16] border border-[#2A2A3A] rounded-lg px-3 py-2 text-white text-sm focus:border-[#836EF9] outline-none"
            >
              {PERIOD_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="p-3 bg-[#0E0E16] rounded-lg text-xs text-gray-500 mb-4">
          {rate} USDC every {periodLabel.toLowerCase()} →{' '}
          {((parseFloat(rate) / period) * 86400).toFixed(2)} USDC/day
        </div>

        <button
          onClick={handleRegister}
          disabled={regLoading || !address}
          className="w-full py-2.5 bg-[#836EF9] text-white rounded-xl text-sm font-medium hover:bg-[#6B52E0] disabled:opacity-50 transition-colors"
        >
          {regLoading ? 'Registering...' : 'Register Employee On-Chain'}
        </button>

        {regStatus && (
          <div className="mt-3 p-2 text-xs text-gray-300 bg-[#0E0E16] rounded-lg">{regStatus}</div>
        )}

        {lastEmployeeId !== null && (
          <div className="mt-3 p-3 bg-green-400/10 border border-green-400/20 rounded-lg">
            <div className="text-xs text-green-400 mb-1">Employee ID assigned</div>
            <div className="text-white font-mono font-bold text-lg">{lastEmployeeId}</div>
            <div className="text-xs text-gray-500 mt-1">
              Share this ID with your employee — they'll enter it during account setup.
            </div>
          </div>
        )}
      </div>

      {/* Fund payroll */}
      <div className="bg-[#14141F] border border-[#2A2A3A] rounded-xl p-6">
        <h2 className="text-white font-medium mb-4">Fund Payroll</h2>
        <p className="text-gray-500 text-sm mb-4">
          Add funds to the payroll pool. The system automatically distributes wages to each employee on their scheduled pay date.
        </p>

        <div className="flex gap-3 mb-4">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Amount (USDC)</label>
            <input
              type="number"
              value={fundAmount}
              onChange={e => setFundAmount(e.target.value)}
              className="w-full bg-[#0E0E16] border border-[#2A2A3A] rounded-lg px-3 py-2 text-white text-sm focus:border-[#836EF9] outline-none"
            />
          </div>
        </div>

        <button
          onClick={handleFundPayroll}
          disabled={fundLoading || !address}
          className="w-full py-2.5 bg-[#836EF9] text-white rounded-xl text-sm font-medium hover:bg-[#6B52E0] disabled:opacity-50 transition-colors"
        >
          {fundLoading ? 'Processing...' : `Add ${fundAmount} USDC to Payroll Pool`}
        </button>

        {fundStatus && (
          <div className="mt-3 p-2 text-xs text-gray-300 bg-[#0E0E16] rounded-lg">{fundStatus}</div>
        )}
      </div>

      {/* Privacy note */}
      <div className="mt-4 p-4 bg-[#836EF9]/5 border border-[#836EF9]/20 rounded-xl">
        <div className="text-xs text-gray-400">
          <span className="text-[#836EF9] font-medium">Employee Privacy:</span> Salary amounts and spending are fully encrypted. Employees see their own accounts — nothing is visible to other parties.
        </div>
      </div>
    </div>
  )
}
