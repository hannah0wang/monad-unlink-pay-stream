'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useUnlink } from '@unlink-xyz/react'
import { BUCKET, BUCKET_NAMES, BUCKET_COLORS, type BucketKey } from '@/lib/unlink'
import { EXECUTOR_URL, formatUsdc } from '@/lib/contracts'
import Link from 'next/link'

// ─── Types ─────────────────────────────────────────────────────────────────────
interface StatusResponse {
  employeeId: number
  schedule: {
    cadenceSeconds: number
    lastRunAt:      number
    nextRunAt:      number
    nextRunIn:      number
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

// ─── Donut Chart ───────────────────────────────────────────────────────────────
interface ChartSlice { color: string; pct: number; label: string; value: string }

function DonutChart({ slices, centerLabel, centerSub, size = 220 }: {
  slices: ChartSlice[]; centerLabel: string; centerSub: string; size?: number
}) {
  const strokeW = Math.round(size * 0.115)
  const r = (size - strokeW) / 2 - 2
  const circ = 2 * Math.PI * r
  const cx = size / 2, cy = size / 2
  let cumPct = 0

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1C2035" strokeWidth={strokeW} />
      {slices.filter(s => s.pct > 0.5).map((slice, i) => {
        const dashLen = (slice.pct / 100) * circ
        const offset  = circ / 4 - (cumPct / 100) * circ
        cumPct += slice.pct
        return (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={slice.color} strokeWidth={strokeW}
            strokeDasharray={`${dashLen} ${circ}`}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dasharray 0.4s ease' }}
          />
        )
      })}
      <text x={cx} y={cy - 10} textAnchor="middle" fill="white"
        fontSize={size * 0.11} fontWeight="700" fontFamily="Inter, system-ui">
        {centerLabel}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="#64748B"
        fontSize={size * 0.065} fontFamily="Inter, system-ui">
        {centerSub}
      </text>
    </svg>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function formatDuration(s: number) {
  if (s <= 0) return 'soon'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}
function formatTs(ts: number) {
  if (!ts) return 'Never'
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// ─── Health Plans ──────────────────────────────────────────────────────────────
const HEALTH_PLANS = [
  { id: 'none',     label: 'No Coverage',  pct: 0,  desc: 'Self-insured' },
  { id: 'basic',    label: 'Basic HMO',    pct: 4,  desc: '~$200/mo contribution' },
  { id: 'standard', label: 'PPO Standard', pct: 7,  desc: '~$350/mo contribution' },
  { id: 'premium',  label: 'PPO Premium',  pct: 11, desc: '~$550/mo contribution' },
  { id: 'family',   label: 'Family Plan',  pct: 18, desc: '~$900/mo contribution' },
]

// ─── Tab config ────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'retirement' | 'taxes' | 'health' | 'utilities' | 'net'

const TABS: Array<{ key: Tab; label: string; icon: string; bucket: BucketKey | null }> = [
  { key: 'overview',   label: 'Overview',  icon: '◈',  bucket: null },
  { key: 'retirement', label: '401(k)',     icon: '📈', bucket: 'RETIREMENT' },
  { key: 'taxes',      label: 'Taxes',      icon: '🏛', bucket: 'TAXES' },
  { key: 'health',     label: 'Health',     icon: '🏥', bucket: 'HEALTH' },
  { key: 'utilities',  label: 'Utilities',  icon: '⚡', bucket: 'UTILITIES' },
  { key: 'net',        label: 'Take-Home',  icon: '💰', bucket: 'NET' },
]

// ─── Dashboard ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { walletExists, balances } = useUnlink() as any

  const [employeeId, setEmployeeId] = useState('0')
  const [status, setStatus]         = useState<StatusResponse | null>(null)
  const [countdown, setCountdown]   = useState(0)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [activeTab, setActiveTab]   = useState<Tab>('overview')

  // Adjustable allocations
  const [retirementPct, setRetirementPct] = useState(6)
  const [healthPlan, setHealthPlan]       = useState('standard')
  const [utilitiesPct, setUtilitiesPct]   = useState(10)
  const taxesPct = 25

  const selectedPlan = HEALTH_PLANS.find(p => p.id === healthPlan)!
  const healthPct    = selectedPlan.pct
  const netPct       = Math.max(0, 100 - taxesPct - retirementPct - healthPct - utilitiesPct)

  // Poll executor
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${EXECUTOR_URL}/status/${employeeId}`)
        if (!res.ok) { setFetchError(`Employee ${employeeId} not found`); return }
        const data: StatusResponse = await res.json()
        setStatus(data); setCountdown(data.schedule.nextRunIn); setFetchError(null)
      } catch { setFetchError('Unable to reach payroll server — showing default allocations') }
    }
    load()
    const iv = setInterval(load, 30_000)
    return () => clearInterval(iv)
  }, [employeeId])

  useEffect(() => {
    const t = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000)
    return () => clearInterval(t)
  }, [])

  // Balances
  const getBal = (key: BucketKey): bigint => {
    const idx = BUCKET[key]
    const b   = Array.isArray(balances) ? balances[idx] : balances?.[idx]
    return BigInt(b ?? 0)
  }
  const bucketKeys: BucketKey[] = ['TAXES', 'RETIREMENT', 'HEALTH', 'UTILITIES', 'NET']
  const totalBal = bucketKeys.reduce((s, k) => s + getBal(k), 0n)
  const hasBalances = totalBal > 0n

  const allocMap: Record<BucketKey, number> = {
    MASTER: 0, TAXES: taxesPct, RETIREMENT: retirementPct,
    HEALTH: healthPct, UTILITIES: utilitiesPct, NET: netPct,
  }

  const chartSlices: ChartSlice[] = bucketKeys.map(k => ({
    color: BUCKET_COLORS[k],
    label: BUCKET_NAMES[k],
    pct:   hasBalances ? Number((getBal(k) * 10000n) / (totalBal || 1n)) / 100 : allocMap[k],
    value: formatUsdc(getBal(k)),
  }))

  const centerLabel = hasBalances ? `$${formatUsdc(totalBal)}` : `${netPct}%`
  const centerSub   = hasBalances ? 'USDC total' : 'take-home'

  return (
    <div className="min-h-screen" style={{ background: '#060914' }}>
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Your Paycheck</h1>
            <p className="text-slate-500 text-sm mt-0.5">Automated payroll · encrypted & private</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Employee #</label>
            <input type="number" value={employeeId} onChange={e => setEmployeeId(e.target.value)}
              className="w-16 rounded-lg px-2 py-1.5 text-white text-sm text-center outline-none"
              style={{ background: '#0D1117', border: '1px solid #1C2035' }} />
          </div>
        </div>

        {/* Status banner */}
        {status && (
          <div className="flex items-center gap-3 rounded-2xl px-5 py-3 mb-6"
            style={{ background: 'rgba(131,110,249,0.08)', border: '1px solid rgba(131,110,249,0.2)' }}>
            <span className="w-2 h-2 rounded-full bg-[#836EF9] animate-pulse shrink-0" />
            <span className="text-sm text-slate-300">
              Next payroll in{' '}
              <span className="text-[#836EF9] font-semibold font-mono">{formatDuration(countdown)}</span>
            </span>
            <span className="text-xs text-slate-600 ml-auto">
              Last run: {formatTs(status.schedule.lastRunAt)}
            </span>
          </div>
        )}
        {fetchError && (
          <div className="mb-6 p-3 rounded-xl text-sm text-amber-400"
            style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            {fetchError}
          </div>
        )}
        {!walletExists && (
          <div className="mb-6 p-4 rounded-2xl text-center"
            style={{ background: '#0D1117', border: '1px solid #1C2035' }}>
            <p className="text-slate-400 text-sm mb-2">Wallet not configured yet.</p>
            <Link href="/setup" className="text-[#836EF9] text-sm hover:underline">Complete setup →</Link>
          </div>
        )}

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">

          {/* Left: chart + legend */}
          <div className="rounded-3xl p-6" style={{ background: '#0D1117', border: '1px solid #1C2035' }}>
            <div className="flex justify-center mb-4">
              <DonutChart slices={chartSlices} centerLabel={centerLabel} centerSub={centerSub} size={210} />
            </div>
            <div className="space-y-3">
              {chartSlices.map(slice => {
                const tab = TABS.find(t => t.bucket && BUCKET_NAMES[t.bucket] === slice.label)
                return (
                  <div key={slice.label}
                    className="flex items-center justify-between cursor-pointer group"
                    onClick={() => tab && setActiveTab(tab.key)}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0 group-hover:scale-125 transition-transform"
                        style={{ background: slice.color }} />
                      <span className="text-sm text-slate-400 group-hover:text-white transition-colors">
                        {slice.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{slice.pct.toFixed(1)}%</span>
                      {hasBalances && <span className="text-xs text-slate-600">${slice.value}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right: tab panel */}
          <div className="rounded-3xl overflow-hidden" style={{ background: '#0D1117', border: '1px solid #1C2035' }}>
            {/* Tab bar */}
            <div className="flex border-b px-3 pt-3 gap-0.5 overflow-x-auto" style={{ borderColor: '#1C2035' }}>
              {TABS.map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-t-xl text-sm font-medium transition-all whitespace-nowrap"
                  style={activeTab === tab.key
                    ? { background: '#060914', color: 'white', borderBottom: '2px solid #836EF9', marginBottom: '-1px' }
                    : { color: '#64748B' }}>
                  <span>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-6">

              {/* ── Overview ── */}
              {activeTab === 'overview' && (
                <div>
                  <h2 className="text-lg font-semibold text-white mb-1">Allocation Overview</h2>
                  <p className="text-slate-500 text-sm mb-5">
                    Your paycheck is automatically split and deposited into each account every pay cycle.
                  </p>
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    {bucketKeys.map(key => {
                      const tab = TABS.find(t => t.bucket === key)
                      return (
                        <div key={key}
                          className="p-4 rounded-2xl cursor-pointer hover:scale-[1.02] transition-transform"
                          style={{ background: '#060914', border: `1px solid ${BUCKET_COLORS[key]}30` }}
                          onClick={() => tab && setActiveTab(tab.key)}>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: BUCKET_COLORS[key] }} />
                            <span className="text-xs text-slate-500 uppercase tracking-wider">{BUCKET_NAMES[key]}</span>
                          </div>
                          <div className="text-xl font-bold text-white">
                            {hasBalances ? `$${formatUsdc(getBal(key))}` : `${allocMap[key]}%`}
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">{hasBalances ? 'USDC' : 'of gross'}</div>
                        </div>
                      )
                    })}
                  </div>
                  {status?.recentPayslips?.[0] && (() => {
                    const p = status.recentPayslips[0]
                    return (
                      <div>
                        <div className="text-xs text-slate-600 uppercase tracking-wider mb-2">Latest Payslip</div>
                        <div className="p-4 rounded-2xl" style={{ background: '#060914', border: '1px solid #1C2035' }}>
                          <div className="flex justify-between text-xs text-slate-500 mb-3">
                            <span>{formatTs(p.paid_at)}</span>
                            <span className="text-white font-semibold">${p.gross ? formatUsdc(BigInt(p.gross)) : '0.00'} gross</span>
                          </div>
                          <div className="grid grid-cols-3 gap-y-2.5 text-xs">
                            {[['Taxes', p.taxes], ['401(k)', p.retirement], ['Health', p.health],
                              ['Utilities', p.utilities], ['Take-Home', p.net],
                            ].filter(([, v]) => v != null).map(([l, v]) => (
                              <div key={l as string}>
                                <div className="text-slate-600 mb-0.5">{l as string}</div>
                                <div className="text-white font-medium">${formatUsdc(BigInt(v as string))}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* ── 401(k) ── */}
              {activeTab === 'retirement' && (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl"
                      style={{ background: `${BUCKET_COLORS.RETIREMENT}20` }}>📈</div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">401(k) Retirement</h2>
                      <p className="text-slate-500 text-sm">Auto-withheld each paycheck, pre-tax</p>
                    </div>
                  </div>
                  {walletExists && (
                    <div className="p-4 rounded-2xl mb-6" style={{ background: '#060914', border: '1px solid #1C2035' }}>
                      <div className="text-xs text-slate-500 mb-1">Current Balance</div>
                      <div className="text-3xl font-bold" style={{ color: BUCKET_COLORS.RETIREMENT }}>
                        ${formatUsdc(getBal('RETIREMENT'))}
                      </div>
                      <div className="text-xs text-slate-600">USDC</div>
                    </div>
                  )}
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-3">
                      <label className="text-sm font-medium text-white">Contribution Rate</label>
                      <span className="text-2xl font-bold" style={{ color: BUCKET_COLORS.RETIREMENT }}>
                        {retirementPct}%
                      </span>
                    </div>
                    <input type="range" min={0} max={50} step={1} value={retirementPct}
                      onChange={e => setRetirementPct(Number(e.target.value))}
                      className="w-full h-2 rounded-full appearance-none cursor-pointer"
                      style={{ accentColor: BUCKET_COLORS.RETIREMENT }} />
                    <div className="flex justify-between text-xs text-slate-600 mt-1.5">
                      <span>0%</span><span>IRS 2024 limit: $23k/yr ≈ 23%</span><span>50%</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ['Per paycheck',   `${retirementPct}% of gross`],
                      ['Tax treatment',  'Pre-tax (traditional)'],
                      ['Employer match', 'Up to 4%'],
                      ['Vesting',        'Immediate'],
                    ].map(([label, value]) => (
                      <div key={label} className="p-3 rounded-xl" style={{ background: '#060914', border: '1px solid #1C2035' }}>
                        <div className="text-xs text-slate-500 mb-1">{label}</div>
                        <div className="text-white font-medium text-sm">{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 p-3 rounded-xl text-xs"
                    style={{ background: `${BUCKET_COLORS.RETIREMENT}0D`, color: BUCKET_COLORS.RETIREMENT, border: `1px solid ${BUCKET_COLORS.RETIREMENT}25` }}>
                    Changes take effect on your next payroll cycle
                  </div>
                </div>
              )}

              {/* ── Taxes ── */}
              {activeTab === 'taxes' && (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl"
                      style={{ background: `${BUCKET_COLORS.TAXES}20` }}>🏛</div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">Tax Withholding</h2>
                      <p className="text-slate-500 text-sm">Calculated automatically · read-only</p>
                    </div>
                  </div>
                  {walletExists && (
                    <div className="p-4 rounded-2xl mb-6" style={{ background: '#060914', border: '1px solid #1C2035' }}>
                      <div className="text-xs text-slate-500 mb-1">Held in Escrow</div>
                      <div className="text-3xl font-bold" style={{ color: BUCKET_COLORS.TAXES }}>
                        ${formatUsdc(getBal('TAXES'))}
                      </div>
                      <div className="text-xs text-slate-600">USDC · routed at tax season</div>
                    </div>
                  )}
                  <div className="space-y-2.5 mb-5">
                    {[
                      { label: 'Federal Income Tax',      rate: '22%',   color: '#F97316', desc: 'Standard bracket withholding' },
                      { label: 'State Income Tax',         rate: '3.07%', color: '#FB923C', desc: 'Configured rate in Employee Setup' },
                      { label: 'FICA — Social Security',   rate: '6.2%',  color: '#FDBA74', desc: 'Employer also matches 6.2%' },
                      { label: 'FICA — Medicare',          rate: '1.45%', color: '#FED7AA', desc: 'Required by federal law' },
                    ].map(item => (
                      <div key={item.label} className="flex items-center justify-between p-3.5 rounded-xl"
                        style={{ background: '#060914', border: '1px solid #1C2035' }}>
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
                          <div>
                            <div className="text-sm text-white">{item.label}</div>
                            <div className="text-xs text-slate-600">{item.desc}</div>
                          </div>
                        </div>
                        <span className="font-semibold text-white">{item.rate}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between p-4 rounded-xl" style={{ background: '#1C2035' }}>
                    <span className="font-semibold text-white">Total Withholding</span>
                    <span className="font-bold text-xl" style={{ color: BUCKET_COLORS.TAXES }}>~32.7%</span>
                  </div>
                  <div className="mt-3 p-3 rounded-xl text-xs"
                    style={{ background: `${BUCKET_COLORS.TAXES}0D`, color: BUCKET_COLORS.TAXES, border: `1px solid ${BUCKET_COLORS.TAXES}25` }}>
                    Rates are estimated. Actual withholding set during Employee Setup.
                  </div>
                </div>
              )}

              {/* ── Health ── */}
              {activeTab === 'health' && (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl"
                      style={{ background: `${BUCKET_COLORS.HEALTH}20` }}>🏥</div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">Health Insurance</h2>
                      <p className="text-slate-500 text-sm">Premium withheld pre-tax each paycheck</p>
                    </div>
                  </div>
                  {walletExists && (
                    <div className="p-4 rounded-2xl mb-5" style={{ background: '#060914', border: '1px solid #1C2035' }}>
                      <div className="text-xs text-slate-500 mb-1">Health Bucket Balance</div>
                      <div className="text-3xl font-bold" style={{ color: BUCKET_COLORS.HEALTH }}>
                        ${formatUsdc(getBal('HEALTH'))}
                      </div>
                      <div className="text-xs text-slate-600">USDC</div>
                    </div>
                  )}
                  <div className="space-y-2">
                    {HEALTH_PLANS.map(plan => {
                      const active = healthPlan === plan.id
                      return (
                        <button key={plan.id} onClick={() => setHealthPlan(plan.id)}
                          className="w-full flex items-center justify-between p-4 rounded-2xl transition-all text-left"
                          style={{
                            background: active ? `${BUCKET_COLORS.HEALTH}10` : '#060914',
                            border: `1px solid ${active ? BUCKET_COLORS.HEALTH : '#1C2035'}`,
                          }}>
                          <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                              style={{ borderColor: active ? BUCKET_COLORS.HEALTH : '#334155' }}>
                              {active && <div className="w-2 h-2 rounded-full" style={{ background: BUCKET_COLORS.HEALTH }} />}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-white">{plan.label}</div>
                              <div className="text-xs text-slate-500">{plan.desc}</div>
                            </div>
                          </div>
                          <div className="text-sm font-semibold" style={{ color: active ? BUCKET_COLORS.HEALTH : '#64748B' }}>
                            {plan.pct}%
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-4 p-3 rounded-xl text-xs"
                    style={{ background: `${BUCKET_COLORS.HEALTH}0D`, color: BUCKET_COLORS.HEALTH, border: `1px solid ${BUCKET_COLORS.HEALTH}25` }}>
                    Plan changes require re-enrollment. Contact HR to update your selection.
                  </div>
                </div>
              )}

              {/* ── Utilities ── */}
              {activeTab === 'utilities' && (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl"
                      style={{ background: `${BUCKET_COLORS.UTILITIES}20` }}>⚡</div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">Utilities & Bills</h2>
                      <p className="text-slate-500 text-sm">Bills paid automatically — no action needed</p>
                    </div>
                  </div>
                  {walletExists && (
                    <div className="p-4 rounded-2xl mb-5" style={{ background: '#060914', border: '1px solid #1C2035' }}>
                      <div className="text-xs text-slate-500 mb-1">Utilities Balance</div>
                      <div className="text-3xl font-bold" style={{ color: BUCKET_COLORS.UTILITIES }}>
                        ${formatUsdc(getBal('UTILITIES'))}
                      </div>
                      <div className="text-xs text-slate-600">USDC</div>
                    </div>
                  )}
                  {status?.bills && status.bills.length > 0 ? (
                    <div className="space-y-2.5 mb-5">
                      {status.bills.map(bill => (
                        <div key={bill.id} className="flex items-center justify-between p-4 rounded-2xl"
                          style={{ background: '#060914', border: '1px solid #1C2035' }}>
                          <div className="flex items-center gap-3">
                            <div className="w-2.5 h-2.5 rounded-full"
                              style={{ background: bill.overdue ? '#F87171' : BUCKET_COLORS.UTILITIES }} />
                            <div>
                              <div className="text-sm font-medium text-white">{bill.label}</div>
                              <div className="text-xs text-slate-500">
                                {bill.overdue ? 'Overdue — paying now' : `Due ${formatTs(bill.nextDueAt)}`}
                              </div>
                            </div>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${bill.overdue ? 'text-red-400 bg-red-400/10' : 'text-yellow-400 bg-yellow-400/10'}`}>
                            {bill.overdue ? 'OVERDUE' : 'SCHEDULED'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 mb-5">
                      <div className="text-3xl mb-2">⚡</div>
                      <div className="text-slate-500 text-sm mb-2">No bills configured yet</div>
                      <Link href="/setup" className="text-[#836EF9] text-sm hover:underline">Add bills in Setup →</Link>
                    </div>
                  )}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-white">Budget Allocation</span>
                      <span className="text-xl font-bold" style={{ color: BUCKET_COLORS.UTILITIES }}>{utilitiesPct}%</span>
                    </div>
                    <input type="range" min={5} max={30} step={1} value={utilitiesPct}
                      onChange={e => setUtilitiesPct(Number(e.target.value))}
                      className="w-full h-2 rounded-full appearance-none cursor-pointer"
                      style={{ accentColor: BUCKET_COLORS.UTILITIES }} />
                    <div className="flex justify-between text-xs text-slate-600 mt-1.5">
                      <span>5%</span><span>Covers bills + buffer</span><span>30%</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Take-Home ── */}
              {activeTab === 'net' && (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl"
                      style={{ background: `${BUCKET_COLORS.NET}20` }}>💰</div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">Take-Home Pay</h2>
                      <p className="text-slate-500 text-sm">After all deductions — yours to spend</p>
                    </div>
                  </div>
                  <div className="p-6 rounded-2xl mb-5"
                    style={{ background: `${BUCKET_COLORS.NET}0D`, border: `1px solid ${BUCKET_COLORS.NET}30` }}>
                    <div className="text-xs text-slate-500 mb-1">
                      {walletExists ? 'Available Balance' : 'Projected Take-Home'}
                    </div>
                    <div className="text-4xl font-bold mb-1" style={{ color: BUCKET_COLORS.NET }}>
                      {walletExists ? `$${formatUsdc(getBal('NET'))}` : `${netPct}%`}
                    </div>
                    <div className="text-xs text-slate-600">
                      {walletExists ? 'USDC · spendable now' : 'of each paycheck'}
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl" style={{ background: '#060914', border: '1px solid #1C2035' }}>
                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">Deduction Breakdown</div>
                    <div className="space-y-2.5 text-sm">
                      {[
                        ['Taxes',     `${taxesPct}%`,      BUCKET_COLORS.TAXES],
                        ['401(k)',    `${retirementPct}%`,  BUCKET_COLORS.RETIREMENT],
                        ['Health',    `${healthPct}%`,      BUCKET_COLORS.HEALTH],
                        ['Utilities', `${utilitiesPct}%`,   BUCKET_COLORS.UTILITIES],
                      ].map(([label, pct, color]) => (
                        <div key={label as string} className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-2 h-2 rounded-full" style={{ background: color as string }} />
                            <span className="text-slate-400">{label as string}</span>
                          </div>
                          <span className="font-medium text-slate-300">− {pct as string}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-2.5 border-t font-semibold"
                        style={{ borderColor: '#1C2035' }}>
                        <span className="text-white">Take-Home</span>
                        <span className="text-lg" style={{ color: BUCKET_COLORS.NET }}>{netPct.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* Payslip history */}
        {status?.recentPayslips && status.recentPayslips.length > 1 && (
          <div className="mt-5 rounded-3xl p-6" style={{ background: '#0D1117', border: '1px solid #1C2035' }}>
            <div className="text-xs text-slate-600 uppercase tracking-wider mb-4">Payslip History</div>
            <div className="space-y-2.5">
              {status.recentPayslips.slice(1).map(p => (
                <div key={p.id} className="flex items-center justify-between p-3.5 rounded-xl text-sm"
                  style={{ background: '#060914', border: '1px solid #1C2035' }}>
                  <span className="text-slate-500">{formatTs(p.paid_at)}</span>
                  <div className="flex gap-5 text-xs">
                    <span className="text-slate-500">Gross <span className="text-white font-medium">${p.gross ? formatUsdc(BigInt(p.gross)) : '0.00'}</span></span>
                    <span className="text-slate-500">Net <span className="text-white font-medium">${p.net ? formatUsdc(BigInt(p.net)) : '0.00'}</span></span>
                    <span className="text-slate-500">401k <span className="text-white font-medium">${p.retirement ? formatUsdc(BigInt(p.retirement)) : '0.00'}</span></span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-center">
              <Link href="/history" className="text-xs text-[#836EF9] hover:underline">Full transfer history →</Link>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
