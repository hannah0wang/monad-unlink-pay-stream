'use client'

/**
 * /dashboard — Automated payroll status view
 *
 * No manual triggers. Polls GET /status/:employeeId every 30s to show:
 *   - Bucket balances (from Unlink SDK)
 *   - Next scheduled payroll run + countdown
 *   - Recent payslips
 *   - Upcoming bill payments
 */
import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useUnlink } from '@unlink-xyz/react'
import { BUCKET, BUCKET_NAMES, BUCKET_COLORS, type BucketKey } from '@/lib/unlink'
import { EXECUTOR_URL, formatUsdc } from '@/lib/contracts'

interface StatusResponse {
  employeeId: number
  schedule: {
    cadenceSeconds: number
    lastRunAt:      number
    nextRunAt:      number
    nextRunIn:      number  // seconds
  }
  recentPayslips: Array<{
    id:         number
    gross:      string
    ops_fee:    string
    taxes:      string
    retirement: string
    health:     string
    utilities:  string
    net:        string
    paid_at:    number
  }>
  bills: Array<{
    id:               number
    biller_id:        string
    label:            string
    frequency_seconds: number
    last_paid_at:     number
    nextDueAt:        number
    overdue:          boolean
  }>
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return 'imminently'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  if (h > 0)  return `${h}h ${m}m`
  if (m > 0)  return `${m}m ${s}s`
  return `${s}s`
}

function formatTs(ts: number): string {
  if (!ts) return 'Never'
  return new Date(ts * 1000).toLocaleString()
}

export default function DashboardPage() {
  const { address } = useAccount()
  const { walletExists, balances } = useUnlink() as any

  const [employeeId, setEmployeeId] = useState('0')
  const [status, setStatus]         = useState<StatusResponse | null>(null)
  const [countdown, setCountdown]   = useState(0)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Poll executor for status every 30s
  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch(`${EXECUTOR_URL}/status/${employeeId}`)
        if (!res.ok) { setFetchError(`Employee ${employeeId} not found on executor`); return }
        const data: StatusResponse = await res.json()
        setStatus(data)
        setCountdown(data.schedule.nextRunIn)
        setFetchError(null)
      } catch {
        setFetchError('Could not reach executor')
      }
    }
    fetchStatus()
    const interval = setInterval(fetchStatus, 30_000)
    return () => clearInterval(interval)
  }, [employeeId])

  // Local countdown tick
  useEffect(() => {
    const t = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000)
    return () => clearInterval(t)
  }, [])

  const cadenceLabel = status
    ? { 3600: 'hourly', 86400: 'daily', 604800: 'weekly', 1209600: 'biweekly' }[status.schedule.cadenceSeconds] ?? 'custom'
    : '—'

  return (
    <div className="max-w-3xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">
            Your payroll runs automatically — sit back and watch.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Employee ID</label>
          <input
            type="number"
            value={employeeId}
            onChange={e => setEmployeeId(e.target.value)}
            className="w-16 bg-[#14141F] border border-[#2A2A3A] rounded-lg px-2 py-1 text-white text-sm text-center focus:border-[#836EF9] outline-none"
          />
        </div>
      </div>

      {fetchError && (
        <div className="mb-6 p-3 bg-red-400/10 border border-red-400/20 rounded-lg text-red-400 text-sm">
          {fetchError}
        </div>
      )}

      {/* Next run countdown */}
      {status && (
        <div className="bg-[#14141F] border border-[#836EF9]/30 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Next payroll run</div>
              <div className="text-3xl font-mono font-bold text-[#836EF9]">
                {formatDuration(countdown)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {formatTs(status.schedule.nextRunAt)} · {cadenceLabel}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500 mb-1">Last run</div>
              <div className="text-sm text-gray-300">{formatTs(status.schedule.lastRunAt)}</div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Scheduler running — no action required
          </div>
        </div>
      )}

      {/* Bucket balances */}
      {walletExists ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          {(Object.keys(BUCKET) as BucketKey[]).map(key => {
            const idx = BUCKET[key]
            const bal = Array.isArray(balances) ? balances[idx] : balances?.[idx]
            return (
              <div key={key} className="bg-[#14141F] border border-[#2A2A3A] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: BUCKET_COLORS[key] }} />
                  <span className="text-gray-400 text-xs">{BUCKET_NAMES[key]}</span>
                </div>
                <div className="text-white font-bold text-lg">
                  {bal !== undefined ? formatUsdc(BigInt(bal ?? 0)) : '—'}
                </div>
                <div className="text-xs text-gray-600">USDC</div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-[#14141F] border border-[#2A2A3A] rounded-xl p-6 text-center mb-6">
          <p className="text-gray-500 text-sm mb-3">No Unlink wallet found.</p>
          <a href="/setup" className="text-[#836EF9] hover:underline text-sm">Complete setup →</a>
        </div>
      )}

      {/* Upcoming bills */}
      {status?.bills && status.bills.length > 0 && (
        <div className="bg-[#14141F] border border-[#2A2A3A] rounded-xl p-5 mb-6">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Upcoming Bills</div>
          <div className="space-y-2">
            {status.bills.map(bill => (
              <div key={bill.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${bill.overdue ? 'bg-red-400' : 'bg-yellow-400'}`} />
                  <span className="text-gray-300">{bill.label}</span>
                </div>
                <div className="text-right">
                  <div className={`text-xs ${bill.overdue ? 'text-red-400' : 'text-gray-500'}`}>
                    {bill.overdue ? 'Overdue — paying now' : `Due ${formatTs(bill.nextDueAt)}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-gray-600">
            Paid automatically from Utilities bucket via x402
          </div>
        </div>
      )}

      {/* Recent payslips */}
      {status?.recentPayslips && status.recentPayslips.length > 0 && (
        <div className="bg-[#14141F] border border-[#2A2A3A] rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Recent Payslips</div>
          <div className="space-y-3">
            {status.recentPayslips.map(p => (
              <div key={p.id} className="p-3 bg-[#0E0E16] rounded-lg">
                <div className="flex justify-between text-xs text-gray-500 mb-2">
                  <span>{formatTs(p.paid_at)}</span>
                  <span className="text-white font-medium">{formatUsdc(BigInt(p.gross))} USDC gross</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {[
                    ['Taxes',     p.taxes],
                    ['401k',      p.retirement],
                    ['Health',    p.health],
                    ['Utilities', p.utilities],
                    ['Take-Home', p.net],
                    ['Ops Fee',   p.ops_fee],
                  ].map(([label, val]) => (
                    <div key={label as string}>
                      <span className="text-gray-600">{label} </span>
                      <span className="text-gray-300">{formatUsdc(BigInt(val as string))}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-center">
            <a href="/history" className="text-xs text-[#836EF9] hover:underline">
              Full private transfer history →
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
