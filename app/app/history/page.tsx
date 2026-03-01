'use client'

import { useState, useEffect } from 'react'
import { EXECUTOR_URL, formatUsdc } from '@/lib/contracts'

interface Payslip {
  id:         number
  gross:      string
  taxes:      string
  retirement: string
  health:     string
  utilities:  string
  net:        string
  relay_id:   string | null
  paid_at:    number
}

function formatTs(ts: number) {
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export default function HistoryPage() {
  const [employeeId] = useState(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('employeeId') ?? '0') : '0'
  )
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [loading, setLoading]   = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')

  useEffect(() => {
    fetch(`${EXECUTOR_URL}/status/${employeeId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.recentPayslips) setPayslips(data.recentPayslips)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [employeeId])

  const fields: Array<{ label: string; key: keyof Payslip; color: string }> = [
    { label: 'Gross',     key: 'gross',      color: '#94A3B8' },
    { label: 'Taxes',     key: 'taxes',      color: '#F97316' },
    { label: '401(k)',    key: 'retirement', color: '#22C55E' },
    { label: 'Health',    key: 'health',     color: '#3B82F6' },
    { label: 'Utilities', key: 'utilities',  color: '#EAB308' },
    { label: 'Net',       key: 'net',        color: '#A855F7' },
  ]

  const filtered = payslips.filter(p => {
    const ts = p.paid_at * 1000
    if (dateFrom && ts < new Date(dateFrom).getTime()) return false
    if (dateTo   && ts > new Date(dateTo).getTime() + 86_400_000 - 1) return false
    return true
  })

  return (
    <div className="max-w-2xl mx-auto p-8" style={{ background: '#060914', minHeight: '100vh' }}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Payslip History</h1>
        <p className="text-slate-500 text-sm mt-1">Every payroll cycle — detailed breakdown</p>
      </div>

      {/* Date filter */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center gap-2 flex-1">
          <label className="text-xs text-slate-500 shrink-0">From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="flex-1 rounded-xl px-3 py-2 text-white text-sm outline-none"
            style={{ background: '#0D1117', border: '1px solid #1C2035', colorScheme: 'dark' }}
          />
        </div>
        <div className="flex items-center gap-2 flex-1">
          <label className="text-xs text-slate-500 shrink-0">To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="flex-1 rounded-xl px-3 py-2 text-white text-sm outline-none"
            style={{ background: '#0D1117', border: '1px solid #1C2035', colorScheme: 'dark' }}
          />
        </div>
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo('') }}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors shrink-0">
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-600">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl p-10 text-center text-slate-600"
          style={{ background: '#0D1117', border: '1px solid #1C2035' }}>
          {payslips.length === 0
            ? 'No payslips yet. Payroll runs automatically on your configured cadence.'
            : 'No cycles found in this date range.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <div key={p.id} className="rounded-2xl p-5"
              style={{ background: '#0D1117', border: '1px solid #1C2035' }}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-slate-500 text-sm">{formatTs(p.paid_at)}</span>
                <span className="text-white font-semibold">${formatUsdc(BigInt(p.gross || 0))} gross</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {fields.slice(1).map(({ label, key, color }) => (
                  <div key={label} className="p-3 rounded-xl" style={{ background: '#060914', border: '1px solid #1C2035' }}>
                    <div className="text-xs mb-1" style={{ color }}>{label}</div>
                    <div className="text-white text-sm font-medium">
                      ${formatUsdc(BigInt(p[key] as string || 0))}
                    </div>
                  </div>
                ))}
              </div>
              {p.relay_id && (
                <div className="mt-3 text-xs text-slate-700 font-mono truncate">
                  relay: {p.relay_id}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 p-4 rounded-xl text-xs text-slate-500"
        style={{ background: 'rgba(131,110,249,0.05)', border: '1px solid rgba(131,110,249,0.15)' }}>
        <span className="text-[#836EF9] font-medium">Private:</span> Actual transfers are ZK-encrypted on-chain. These records come from the executor's local payslip log.
      </div>
    </div>
  )
}
