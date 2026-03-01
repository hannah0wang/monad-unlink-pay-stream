'use client'

/**
 * /setup — Employee onboarding wizard
 *
 * Tabs:
 *   1. Wallet    — create Unlink wallet
 *   2. Accounts  — create 6 private bucket accounts
 *   3. Cadence   — pay frequency + tax state (auto-computes taxesBps)
 *   4. Benefits  — 401k contribution %, health insurance plan
 *   5. Bills     — register recurring bills (electric, insurance, etc.)
 *   6. Register  — POST /register (free) → executor stores config
 *   7. Done
 *
 * After setup the employee never needs to interact — everything is automated.
 * x402 is used by the executor → biller (machine-to-machine), not here.
 */
import { useState, useEffect } from 'react'
import { useUnlink } from '@unlink-xyz/react'
import { useAccount } from 'wagmi'
import { BUCKET, BUCKET_NAMES, BUCKET_COLORS, type BucketAddresses } from '@/lib/unlink'
import { EXECUTOR_URL } from '@/lib/contracts'
import { STATE_TAX_RATES, FEDERAL_WITHHOLDING_PCT, taxBpsForState } from '@/lib/tax-rates'
import Link from 'next/link'

type Tab = 'accounts' | 'cadence' | 'benefits' | 'bills' | 'activate' | 'done'

const TABS: Tab[] = ['accounts', 'cadence', 'benefits', 'bills', 'activate', 'done']
const TAB_LABELS: Record<Tab, string> = {
  accounts: 'Accounts',
  cadence:  'Cadence',
  benefits: 'Benefits',
  bills:    'Bills',
  activate: 'Register',
  done:     'Done',
}

const CADENCE_OPTIONS = [
  { label: 'Hourly',   value: 3600,    sublabel: 'Best for contract work' },
  { label: 'Daily',    value: 86400,   sublabel: 'Common for gig workers' },
  { label: 'Weekly',   value: 604800,  sublabel: 'Standard' },
  { label: 'Biweekly', value: 1209600, sublabel: 'Most common in the US' },
]

const HEALTH_PLANS = [
  { id: 'none',       label: 'No Coverage',     premiumPct: 0,   description: 'Self-insured' },
  { id: 'basic',      label: 'Basic HMO',        premiumPct: 200, description: '~$200/mo employee contribution' },
  { id: 'standard',   label: 'PPO Standard',     premiumPct: 350, description: '~$350/mo employee contribution' },
  { id: 'premium',    label: 'PPO Premium',       premiumPct: 550, description: '~$550/mo employee contribution' },
  { id: 'family',     label: 'Family Plan',       premiumPct: 900, description: '~$900/mo employee contribution' },
]

const AVAILABLE_BILLERS = [
  { id: 'electric',  label: 'City Electric & Gas',  amount: '$12.50/mo', icon: '⚡' },
  { id: 'insurance', label: 'National Life Insurance', amount: '$89.00/mo', icon: '🏥' },
]

const BILL_FREQUENCIES = [
  { label: 'Monthly',   value: 2592000  },
  { label: 'Quarterly', value: 7776000  },
  { label: 'Annual',    value: 31536000 },
]

export default function SetupPage() {
  const { isConnected } = useAccount()
  const { ready, walletExists, createWallet, createAccount, accounts } = useUnlink() as any

  const [tab, setTab]               = useState<Tab>('accounts')
  const [mnemonic, setMnemonic]     = useState('')
  const [loading, setLoading]       = useState(false)
  const [status, setStatus]         = useState<string | null>(null)
  const [employeeId, setEmployeeId] = useState('0')

  // Bucket addresses
  const [bucketAddrs, setBucketAddrs] = useState<Partial<BucketAddresses>>({})

  // Cadence + taxes
  const [cadence, setCadence]   = useState(1209600)          // biweekly default
  const [stateCode, setStateCode] = useState('CA')
  const taxesBps = taxBpsForState(stateCode)

  // Benefits
  const [retirementPct, setRetirementPct] = useState(6)      // 6% default
  const [healthPlan, setHealthPlan]       = useState('standard')

  // Bills
  const [selectedBills, setSelectedBills] = useState<
    Array<{ billerId: string; frequencySeconds: number }>
  >([])

  // Auto-create wallet on mount — no button needed, user doesn't need to manage the mnemonic
  // (it's sent to the executor at registration and stored server-side)
  useEffect(() => {
    if (!ready) return
    createWallet()
      .then(result => setMnemonic(result.mnemonic))
      .catch(() => {}) // already exists — mnemonic already in storage, move on
  }, [ready])

  // ── Derived bps ────────────────────────────────────────────────────────────
  const retirementBps = retirementPct * 100
  const healthPlanData = HEALTH_PLANS.find(p => p.id === healthPlan)!
  // Health as % of a $5000/mo salary — very rough approximation for demo
  const healthBps = Math.round((healthPlanData.premiumPct / 5000) * 10000)
  const utilitiesBps = selectedBills.length > 0 ? 1000 : 0  // 10% buffer for bills if any
  const totalDeductionBps = taxesBps + retirementBps + healthBps + utilitiesBps
  const netBps = Math.max(0, 10000 - totalDeductionBps)

  function tabIndex(t: Tab) { return TABS.indexOf(t) }
  function goTo(t: Tab) { setTab(t); setStatus(null) }

  function toggleBill(billerId: string) {
    setSelectedBills(prev =>
      prev.find(b => b.billerId === billerId)
        ? prev.filter(b => b.billerId !== billerId)
        : [...prev, { billerId, frequencySeconds: 2592000 }]
    )
  }

  function setBillFreq(billerId: string, freq: number) {
    setSelectedBills(prev =>
      prev.map(b => b.billerId === billerId ? { ...b, frequencySeconds: freq } : b)
    )
  }

  // ── Step 1: Create 6 bucket accounts ─────────────────────────────────────
  async function handleCreateAccounts() {
    setLoading(true)
    const addrs: Partial<BucketAddresses> = {}
    try {
      const keys = Object.keys(BUCKET) as (keyof typeof BUCKET)[]
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        const idx = BUCKET[key]
        setStatus(`Setting up ${BUCKET_NAMES[key]} account (${i + 1}/${keys.length})...`)

        // Use existing account if already created, otherwise create it
        const existing = Array.isArray(accounts)
          ? accounts.find((a: any) => a.index === idx)
          : null

        let addr: string
        if (existing?.address) {
          addr = existing.address
        } else {
          try {
            const account = await createAccount(idx)
            addr = (account as any).address as string
          } catch (e: any) {
            // Account already exists at this index — get it from the accounts list
            const refreshed = Array.isArray(accounts)
              ? accounts.find((a: any) => a.index === idx)
              : null
            addr = refreshed?.address ?? ''
          }
        }
        addrs[key.toLowerCase() as keyof BucketAddresses] = addr
      }
      setBucketAddrs(addrs)
      setStatus('All accounts ready.')
      goTo('cadence')
    } catch (err: any) {
      setStatus(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // ── Step 6: Register (free — no x402 here) ────────────────────────────────
  // x402 is used by the executor when paying billers machine-to-machine,
  // not during employee onboarding.
  async function handleActivate() {
    setLoading(true)
    setStatus('Registering with executor...')
    try {
      const res = await fetch(`${EXECUTOR_URL}/register`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId:     parseInt(employeeId),
          mnemonic,
          cadenceSeconds: cadence,
          bucketAddresses: bucketAddrs,
          bucketBps: { taxesBps, retirementBps, healthBps, utilitiesBps },
          bills: selectedBills,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Registration failed')

      setStatus(`Registered! Payroll runs ${data.cadence} automatically.`)
      goTo('done')
    } catch (err: any) {
      setStatus(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  if (!isConnected) {
    return (
      <div className="max-w-lg mx-auto p-8 text-center">
        <p className="text-gray-400">Connect your wallet to get started.</p>
        <Link href="/" className="mt-4 inline-block text-[#836EF9] hover:underline">← Home</Link>
      </div>
    )
  }

  const currentTabIdx = tabIndex(tab)
  const stateInfo = STATE_TAX_RATES.find(s => s.state === stateCode)

  return (
    <div className="max-w-xl mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Employee Setup</h1>
        <p className="text-gray-500 text-sm mt-1">Configure once and let payroll run automatically.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-8 overflow-x-auto">
        {TABS.filter(t => t !== 'done').map((t, i) => (
          <button
            key={t}
            onClick={() => currentTabIdx > i && goTo(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors
              ${tab === t
                ? 'bg-[#836EF9] text-white'
                : currentTabIdx > i
                  ? 'bg-[#2A2A3A] text-gray-300 hover:text-white cursor-pointer'
                  : 'bg-[#14141F] text-gray-600 cursor-default'}`}
          >
            {currentTabIdx > i ? '✓ ' : ''}{TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* ── Tab 1: Accounts ── */}
      {tab === 'accounts' && (
        <div className="bg-[#14141F] border border-[#2A2A3A] rounded-xl p-6">
          <h2 className="text-white font-medium mb-2">Set Up Spending Accounts</h2>
          <p className="text-gray-400 text-sm mb-4">
            Each account is dedicated to a specific category. Your paycheck flows to each one automatically every pay period.
          </p>
          <div className="grid grid-cols-2 gap-2 mb-6">
            {(Object.keys(BUCKET) as (keyof typeof BUCKET)[]).map(key => (
              <div key={key} className="flex items-center gap-2 p-2 bg-[#0E0E16] rounded-lg">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ background: BUCKET_COLORS[key] }} />
                <span className="text-white text-sm">{BUCKET_NAMES[key]}</span>
                {bucketAddrs[key.toLowerCase() as keyof BucketAddresses] && (
                  <span className="text-green-400 text-xs ml-auto">✓</span>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={handleCreateAccounts}
            disabled={loading}
            className="w-full py-3 bg-[#836EF9] text-white rounded-xl font-medium hover:bg-[#6B52E0] disabled:opacity-50 transition-colors"
          >
            {loading ? status ?? 'Setting up accounts...' : 'Set Up My Accounts'}
          </button>
          <p className="text-center text-sm text-slate-500 mt-4">
            Already have an account?{' '}
            <Link href="/dashboard" className="font-medium hover:opacity-80 transition-opacity" style={{ color: '#836EF9' }}>
              Sign in →
            </Link>
          </p>
        </div>
      )}

      {/* ── Tab 3: Cadence + Taxes ── */}
      {tab === 'cadence' && (
        <div className="bg-[#14141F] border border-[#2A2A3A] rounded-xl p-6">
          <h2 className="text-white font-medium mb-4">Pay Cadence & Tax Withholding</h2>

          <div className="mb-5">
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">
              How often do you want to be paid?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CADENCE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setCadence(opt.value)}
                  className={`p-3 rounded-lg border text-left transition-colors
                    ${cadence === opt.value
                      ? 'border-[#836EF9] bg-[#836EF9]/10'
                      : 'border-[#2A2A3A] bg-[#0E0E16] hover:border-[#836EF9]/50'}`}
                >
                  <div className="text-white text-sm font-medium">{opt.label}</div>
                  <div className="text-gray-500 text-xs">{opt.sublabel}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-5">
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">
              Work / Live State (determines state income tax)
            </label>
            <select
              value={stateCode}
              onChange={e => setStateCode(e.target.value)}
              className="w-full bg-[#0E0E16] border border-[#2A2A3A] rounded-lg px-3 py-2 text-white text-sm focus:border-[#836EF9] outline-none"
            >
              {STATE_TAX_RATES.map(s => (
                <option key={s.state} value={s.state}>
                  {s.name} {s.rate === 0 ? '(no state tax)' : `(${s.rate}%)`}
                </option>
              ))}
            </select>
          </div>

          <div className="p-4 bg-[#0E0E16] rounded-xl text-sm">
            <div className="text-gray-500 text-xs uppercase tracking-wider mb-2">Computed withholding</div>
            <div className="flex justify-between text-gray-300 mb-1">
              <span>Federal (22% standard bracket)</span>
              <span>{FEDERAL_WITHHOLDING_PCT}%</span>
            </div>
            <div className="flex justify-between text-gray-300 mb-1">
              <span>State — {stateInfo?.name}</span>
              <span>{stateInfo?.rate ?? 0}%</span>
            </div>
            <div className="flex justify-between text-white font-medium border-t border-[#2A2A3A] mt-2 pt-2">
              <span>Total tax withholding</span>
              <span>{taxesBps / 100}% ({taxesBps} bps)</span>
            </div>
          </div>

          <button
            onClick={() => goTo('benefits')}
            className="w-full mt-4 py-3 bg-[#836EF9] text-white rounded-xl font-medium hover:bg-[#6B52E0] transition-colors"
          >
            Continue →
          </button>
        </div>
      )}

      {/* ── Tab 4: Benefits ── */}
      {tab === 'benefits' && (
        <div className="bg-[#14141F] border border-[#2A2A3A] rounded-xl p-6">
          <h2 className="text-white font-medium mb-4">401k & Health Benefits</h2>

          <div className="mb-5">
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">
              401(k) Contribution
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={50}
                value={retirementPct}
                onChange={e => setRetirementPct(parseInt(e.target.value))}
                className="flex-1 accent-[#836EF9]"
              />
              <span className="text-white font-medium w-12 text-right">{retirementPct}%</span>
            </div>
            <div className="text-xs text-gray-500 mt-1">{retirementPct * 100} bps withheld per paycheck</div>
          </div>

          <div className="mb-5">
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">
              Health Insurance Plan
            </label>
            <div className="space-y-2">
              {HEALTH_PLANS.map(plan => (
                <button
                  key={plan.id}
                  onClick={() => setHealthPlan(plan.id)}
                  className={`w-full p-3 rounded-lg border text-left flex justify-between items-center transition-colors
                    ${healthPlan === plan.id
                      ? 'border-[#836EF9] bg-[#836EF9]/10'
                      : 'border-[#2A2A3A] bg-[#0E0E16] hover:border-[#836EF9]/50'}`}
                >
                  <div>
                    <div className="text-white text-sm font-medium">{plan.label}</div>
                    <div className="text-gray-500 text-xs">{plan.description}</div>
                  </div>
                  {healthPlan === plan.id && <span className="text-[#836EF9]">✓</span>}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => goTo('bills')}
            className="w-full py-3 bg-[#836EF9] text-white rounded-xl font-medium hover:bg-[#6B52E0] transition-colors"
          >
            Continue →
          </button>
        </div>
      )}

      {/* ── Tab 5: Bills ── */}
      {tab === 'bills' && (
        <div className="bg-[#14141F] border border-[#2A2A3A] rounded-xl p-6">
          <h2 className="text-white font-medium mb-2">Recurring Bills</h2>
          <p className="text-gray-400 text-sm mb-4">
            Connect recurring bills to your Utilities account. They'll be paid automatically
            on schedule — no action needed from you.
          </p>

          <div className="space-y-3 mb-6">
            {AVAILABLE_BILLERS.map(biller => {
              const selected = selectedBills.find(b => b.billerId === biller.id)
              return (
                <div
                  key={biller.id}
                  className={`p-4 rounded-xl border transition-colors
                    ${selected ? 'border-[#836EF9] bg-[#836EF9]/5' : 'border-[#2A2A3A] bg-[#0E0E16]'}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{biller.icon}</span>
                      <div>
                        <div className="text-white text-sm font-medium">{biller.label}</div>
                        <div className="text-gray-500 text-xs">{biller.amount}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleBill(biller.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors
                        ${selected ? 'bg-[#836EF9] text-white' : 'border border-[#2A2A3A] text-gray-400 hover:border-[#836EF9]'}`}
                    >
                      {selected ? 'Added ✓' : 'Add'}
                    </button>
                  </div>
                  {selected && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-gray-500">Frequency:</span>
                      {BILL_FREQUENCIES.map(f => (
                        <button
                          key={f.value}
                          onClick={() => setBillFreq(biller.id, f.value)}
                          className={`px-2 py-0.5 rounded text-xs transition-colors
                            ${selected.frequencySeconds === f.value
                              ? 'bg-[#836EF9]/30 text-[#836EF9]'
                              : 'text-gray-500 hover:text-gray-300'}`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <button
            onClick={() => goTo('activate')}
            className="w-full py-3 bg-[#836EF9] text-white rounded-xl font-medium hover:bg-[#6B52E0] transition-colors"
          >
            Continue →
          </button>
        </div>
      )}

      {/* ── Tab 6: Review + Activate ── */}
      {tab === 'activate' && (
        <div className="bg-[#14141F] border border-[#2A2A3A] rounded-xl p-6">
          <h2 className="text-white font-medium mb-4">Review & Activate</h2>

          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">6-digit employee code (from your employer)</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="e.g. 482916"
              value={employeeId}
              onChange={e => setEmployeeId(e.target.value.replace(/\D/g, ''))}
              className="w-36 bg-[#0E0E16] border border-[#2A2A3A] rounded-lg px-3 py-2 text-white text-sm font-mono tracking-widest focus:border-[#836EF9] outline-none"
            />
          </div>

          {/* Summary */}
          <div className="space-y-2 mb-5 text-sm">
            {[
              ['Pay cadence', CADENCE_OPTIONS.find(c => c.value === cadence)?.label ?? cadence],
              ['Tax withholding', `${taxesBps / 100}% (federal + ${stateCode})`],
              ['401k', `${retirementPct}%`],
              ['Health', HEALTH_PLANS.find(p => p.id === healthPlan)?.label],
              ['Bills', selectedBills.length > 0 ? selectedBills.map(b => b.billerId).join(', ') : 'None'],
              ['Take-home', `~${(netBps / 100).toFixed(1)}%`],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between">
                <span className="text-gray-500">{label}</span>
                <span className="text-white">{value}</span>
              </div>
            ))}
          </div>

          <div className="mb-4 p-3 bg-[#14141F] border border-[#2A2A3A] rounded-lg text-xs text-gray-400">
            A small service fee is withheld automatically from each pay cycle — no upfront cost.
          </div>

          <button
            onClick={handleActivate}
            disabled={loading}
            className="w-full py-3 bg-[#836EF9] text-white rounded-xl font-medium hover:bg-[#6B52E0] disabled:opacity-50 transition-colors"
          >
            {loading ? (status ?? 'Activating...') : 'Activate Automated Payroll'}
          </button>
        </div>
      )}

      {/* ── Done ── */}
      {tab === 'done' && (
        <div className="bg-[#14141F] border border-green-500/30 rounded-xl p-8 text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-white font-medium text-xl mb-2">You're all set!</h2>
          <p className="text-gray-400 text-sm mb-6">
            Your payroll runs automatically every{' '}
            {CADENCE_OPTIONS.find(c => c.value === cadence)?.label.toLowerCase()}.
            Taxes, 401k, health, and bills are handled without any action from you.
          </p>
          <div className="flex gap-3 justify-center">
            <Link href="/dashboard" className="px-5 py-2.5 bg-[#836EF9] text-white rounded-xl text-sm font-medium hover:bg-[#6B52E0] transition-colors">
              View Dashboard
            </Link>
            <Link href="/" className="px-5 py-2.5 border border-[#2A2A3A] text-gray-300 rounded-xl text-sm hover:bg-[#2A2A3A] transition-colors">
              Home
            </Link>
          </div>
        </div>
      )}

      {/* Status */}
      {status && tab !== 'done' && (
        <div className="mt-4 p-3 bg-[#14141F] border border-[#2A2A3A] rounded-lg text-sm text-gray-300">
          {status}
        </div>
      )}

      {/* Mnemonic backup */}
      {mnemonic && tab !== 'done' && (
        <div className="mt-4 p-4 bg-yellow-400/10 border border-yellow-400/30 rounded-xl">
          <div className="text-yellow-400 text-xs font-medium mb-2">⚠ Back up your recovery phrase</div>
          <div className="font-mono text-xs text-yellow-300 break-all">{mnemonic}</div>
        </div>
      )}
    </div>
  )
}
