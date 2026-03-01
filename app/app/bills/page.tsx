'use client'

/**
 * /bills — Recurring bill management
 *
 * Shows configured bills + payment history.
 * Bills are paid automatically by the executor scheduler via x402 — no user action.
 * This page is purely informational / configuration management.
 */
import React, { useState, useEffect } from 'react'
import { EXECUTOR_URL } from '@/lib/contracts'

interface Bill {
  id:               number
  biller_id:        string
  label:            string
  frequency_seconds: number
  last_paid_at:     number
  nextDueAt:        number
  overdue:          boolean
  active:           number
}

const FREQ_LABELS: Record<number, string> = {
  2592000:  'Monthly',
  7776000:  'Quarterly',
  31536000: 'Annual',
}

const BILLER_ICONS: Record<string, string> = {
  electric:  '⚡',
  insurance: '🏥',
}

function formatTs(ts: number): string {
  if (!ts) return 'Never'
  return new Date(ts * 1000).toLocaleDateString()
}

export default function BillsPage() {
  const [employeeId, setEmployeeId] = useState('0')
  const [bills, setBills]           = useState<Bill[]>([])
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)

  useEffect(() => {
    async function fetchBills() {
      setLoading(true)
      try {
        const res = await fetch(`${EXECUTOR_URL}/status/${employeeId}`)
        if (!res.ok) { setError('Employee not found'); return }
        const data = await res.json()
        setBills(data.bills ?? [])
        setError(null)
      } catch {
        setError('Could not reach payroll server')
      } finally {
        setLoading(false)
      }
    }
    fetchBills()
  }, [employeeId])

  return (
    <div className="max-w-2xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Recurring Bills</h1>
          <p className="text-gray-500 text-sm mt-1">
            Bills are paid automatically from your Utilities account — no action needed.
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

      {error && (
        <div className="mb-4 p-3 bg-red-400/10 border border-red-400/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : bills.length === 0 ? (
        <div className="bg-[#14141F] border border-[#2A2A3A] rounded-xl p-10 text-center">
          <div className="text-gray-500 text-sm mb-3">No recurring bills configured.</div>
          <a href="/setup" className="text-[#836EF9] hover:underline text-sm">
            Add bills during setup →
          </a>
        </div>
      ) : (
        <div className="space-y-4">
          {bills.map(bill => (
            <div key={bill.id} className="bg-[#14141F] border border-[#2A2A3A] rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{BILLER_ICONS[bill.biller_id] ?? '📄'}</span>
                  <div>
                    <div className="text-white font-medium">{bill.label}</div>
                    <div className="text-gray-500 text-xs">
                      {FREQ_LABELS[bill.frequency_seconds] ?? 'Custom'} · automatic
                    </div>
                  </div>
                </div>
                <div className={`px-2 py-0.5 rounded-full text-xs font-medium
                  ${bill.overdue
                    ? 'bg-orange-400/10 text-orange-400'
                    : 'bg-green-400/10 text-green-400'}`}
                >
                  {bill.overdue ? 'Paying...' : 'Auto'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-gray-500 mb-0.5">Last paid</div>
                  <div className="text-gray-300">{formatTs(bill.last_paid_at)}</div>
                </div>
                <div>
                  <div className="text-gray-500 mb-0.5">Next due</div>
                  <div className={bill.overdue ? 'text-orange-400' : 'text-gray-300'}>
                    {formatTs(bill.nextDueAt)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* How it works */}
      <div className="mt-6 bg-[#14141F] border border-[#2A2A3A] rounded-xl p-5">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">How automatic bill pay works</div>
        <div className="flex flex-col gap-1.5 text-xs text-gray-400">
          {[
            ['1', 'Bill due date is detected by the scheduler'],
            ['2', 'Payment is initiated from your Utilities account'],
            ['3', 'Funds are sent directly to the biller'],
            ['4', 'Confirmation logged in your transfer history'],
          ].map(([step, what]) => (
            <div key={step} className="flex gap-2">
              <span className="text-[#836EF9] w-4 shrink-0 font-mono">{step}.</span>
              <span>{what}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
