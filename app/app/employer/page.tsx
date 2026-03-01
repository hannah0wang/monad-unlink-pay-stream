'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useAccount, useSendTransaction } from 'wagmi'
import { useUnlink, useDeposit } from '@unlink-xyz/react'
import { USDC_ADDRESS, EXECUTOR_URL } from '@/lib/contracts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Employee {
  code:          string   // 6-digit
  name:          string
  email:         string
  annualSalary:  string   // USDCm/year
  registeredAt:  number   // unix ms
}

function randCode() { return String(Math.floor(100000 + Math.random() * 900000)) }

const STORAGE_KEY = 'employer:employees'

function loadEmployees(): Employee[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') } catch { return [] }
}
function saveEmployees(list: Employee[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

// ─── Chart modal ──────────────────────────────────────────────────────────────

function ChartModal({ name, annualSalary, onClose }: { name: string; annualSalary: string; onClose: () => void }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<{ x: number; pct: number } | null>(null)

  const salary = parseFloat(annualSalary || '0')
  const W = 540, H = 260, PAD = { t: 20, r: 16, b: 48, l: 64 }
  const cW = W - PAD.l - PAD.r
  const cH = H - PAD.t - PAD.b

  const months = Array.from({ length: 13 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() + i)
    return { label: d.toLocaleDateString('en-US', { month: 'short' }), x: PAD.l + (i / 12) * cW }
  })
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({ v: salary * f, y: PAD.t + cH * (1 - f) }))
  const area = `M${PAD.l} ${PAD.t + cH} L${PAD.l + cW} ${PAD.t} L${PAD.l + cW} ${PAD.t + cH}Z`
  const line = `M${PAD.l} ${PAD.t + cH} L${PAD.l + cW} ${PAD.t}`

  const onMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r) return
    const pct = Math.max(0, Math.min(1, (e.clientX - r.left - PAD.l) / cW))
    setHover({ x: PAD.l + pct * cW, pct })
  }, [cW])

  const hoverEarned = hover ? salary * hover.pct : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div className="rounded-2xl p-8 w-[820px] max-w-full" style={{ background: '#0D1117', border: '1px solid #1C2035' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-white font-semibold text-lg">Simulation</h2>
            <span className="text-xs px-2.5 py-1 rounded-lg" style={{ background: 'rgba(131,110,249,0.1)', color: '#836EF9', border: '1px solid rgba(131,110,249,0.2)' }}>
              12-month earnings projection
            </span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="flex gap-8">
          <svg ref={svgRef} width={W} height={H} className="cursor-crosshair shrink-0" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#836EF9" stopOpacity=".25"/>
                <stop offset="100%" stopColor="#836EF9" stopOpacity=".02"/>
              </linearGradient>
            </defs>
            {yTicks.map(({ v, y }) => (
              <g key={v}>
                <line x1={PAD.l} y1={y} x2={PAD.l + cW} y2={y} stroke="#1C2035" strokeWidth={1}/>
                <text x={PAD.l - 8} y={y + 4} textAnchor="end" fill="#475569" fontSize={10}>
                  {v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toFixed(0)}
                </text>
              </g>
            ))}
            {months.filter((_, i) => i % 3 === 0).map(({ label, x }) => (
              <text key={label} x={x} y={H - 8} textAnchor="middle" fill="#475569" fontSize={10}>{label}</text>
            ))}
            <path d={area} fill="url(#g)"/>
            <path d={line} stroke="#836EF9" strokeWidth={2} fill="none"/>
            {hover && (
              <>
                <line x1={hover.x} y1={PAD.t} x2={hover.x} y2={PAD.t + cH} stroke="#836EF9" strokeWidth={1} strokeDasharray="4 3"/>
                <circle cx={hover.x} cy={PAD.t + cH * (1 - hover.pct)} r={4} fill="#836EF9"/>
              </>
            )}
          </svg>

          <div className="flex-1 flex flex-col gap-4 pt-2">
            <div>
              <div className="text-slate-500 text-xs mb-1">{name || 'Employee'}</div>
              <div className="text-white font-bold text-3xl">
                {hoverEarned != null ? hoverEarned.toLocaleString('en-US', { maximumFractionDigits: 0 }) : salary.toLocaleString()}
              </div>
              <div className="text-slate-500 text-xs mt-0.5">USDCm {hoverEarned != null ? 'earned by hover date' : 'annually'}</div>
            </div>
            <div className="h-px" style={{ background: '#1C2035' }}/>
            <div className="space-y-2 text-sm">
              {[
                ['Per day',    (salary / 365).toFixed(2)],
                ['Per hour',   (salary / 8760).toFixed(4)],
                ['Per second', (salary / 31_557_600).toFixed(8)],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-slate-500">{label}</span>
                  <span className="text-white font-mono text-xs">{val} USDCm</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── CSV panel ────────────────────────────────────────────────────────────────

function CsvPanel({ onImport }: { onImport: (rows: Employee[]) => void }) {
  const [dragging, setDragging] = useState(false)
  const [parsed, setParsed]     = useState<Employee[] | null>(null)

  function parseCSV(text: string) {
    const lines = text.trim().split('\n').filter(l => l.trim())
    const start = isNaN(Number(lines[0]?.split(',')[0])) ? 1 : 0
    const rows: Employee[] = lines.slice(start).map(line => {
      const [name, email, salary] = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''))
      return { code: randCode(), name: name ?? '', email: email ?? '', annualSalary: salary ?? '52000', registeredAt: Date.now() }
    }).filter(r => r.name)
    setParsed(rows)
  }

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => parseCSV(e.target?.result as string)
    reader.readAsText(file)
  }

  return (
    <div className="max-w-lg">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
        onClick={() => document.getElementById('csv-file')?.click()}
        className="rounded-2xl p-10 text-center cursor-pointer transition-all mb-3"
        style={{ border: `2px dashed ${dragging ? '#836EF9' : '#1C2035'}`, background: dragging ? 'rgba(131,110,249,0.05)' : '#0D1117' }}>
        <input id="csv-file" type="file" accept=".csv,.txt" className="hidden"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
        <svg className="mx-auto mb-3" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <div className="text-slate-300 text-sm mb-1">Drop CSV file here</div>
        <div className="text-slate-600 text-xs">or click to browse</div>
      </div>

      {/* Format hint */}
      <div className="text-xs text-slate-600 mb-5">
        Format: <code className="text-slate-400">name, email, annual_salary</code> — one row per employee, header optional.
      </div>

      {parsed && (
        <div>
          <div className="mb-3 p-3 rounded-xl text-sm text-green-400"
            style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
            {parsed.length} employee{parsed.length !== 1 ? 's' : ''} ready to import
          </div>
          <div className="rounded-xl overflow-hidden mb-4" style={{ border: '1px solid #1C2035' }}>
            <table className="w-full text-xs" style={{ background: '#0D1117' }}>
              <thead><tr style={{ borderBottom: '1px solid #1C2035' }}>
                {['Name', 'Email', 'Salary / yr', 'Code'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-slate-500">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {parsed.slice(0, 5).map((e, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #1C2035' }}>
                    <td className="px-4 py-2.5 text-white">{e.name}</td>
                    <td className="px-4 py-2.5 text-slate-400">{e.email || '—'}</td>
                    <td className="px-4 py-2.5 text-white">{parseFloat(e.annualSalary).toLocaleString()}</td>
                    <td className="px-4 py-2.5 font-mono text-[#836EF9] tracking-widest">{e.code}</td>
                  </tr>
                ))}
                {parsed.length > 5 && (
                  <tr><td colSpan={4} className="px-4 py-2 text-slate-600 text-center text-xs">+{parsed.length - 5} more</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <button onClick={() => onImport(parsed)}
            className="w-full py-3 rounded-xl font-medium text-white text-sm transition-all hover:opacity-90"
            style={{ background: '#836EF9' }}>
            Import {parsed.length} Employee{parsed.length !== 1 ? 's' : ''} →
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EmployerPage() {
  const { address }            = useAccount()
  const { sendTransactionAsync } = useSendTransaction()
  const { createWallet, activeAccount } = useUnlink()
  const [savedBalance, setSavedBalance] = useState('0')
  useEffect(() => { setSavedBalance(localStorage.getItem('employer:balance') ?? '0') }, [])
  const { deposit: unlinkDeposit, isPending: depositPending } = useDeposit()

  // ── Wallet state (created silently on mount) ──────────────────────────────
  const [mnemonic, setMnemonic]         = useState('')
  const [masterAddr, setMasterAddr]     = useState('')
  const [walletReady, setWalletReady]   = useState(false)
  const [funded, setFunded]             = useState(false)
  useEffect(() => {
    setFunded(!!localStorage.getItem('employer:funded'))
    setFundMsg(null)
  }, [])
  const [depositAmount, setDepositAmount] = useState('1000')
  const [funding, setFunding]           = useState(false)
  const [fundMsg, setFundMsg]           = useState<string | null>(null)

  // Auto-create employer Unlink wallet on mount — user never sees this step.
  // Mnemonic is persisted in localStorage so the same wallet is reused across sessions.
  useEffect(() => {
    const saved = localStorage.getItem('employer:mnemonic')
    if (saved) {
      setMnemonic(saved)
      setWalletReady(true)
      return
    }
    createWallet()
      .then(result => {
        setMnemonic(result.mnemonic)
        localStorage.setItem('employer:mnemonic', result.mnemonic)
        setWalletReady(true)
      })
      .catch(() => setWalletReady(true)) // already exists in IndexedDB
  }, [])

  // Capture master address once activeAccount is available
  useEffect(() => {
    if (activeAccount && !masterAddr) {
      setMasterAddr(String((activeAccount as any).address ?? activeAccount))
    }
  }, [activeAccount])

  async function handleFund() {
    if (!address) { setFundMsg('Connect your wallet (top right) to deposit USDCm.'); return }
    if (!depositAmount || parseFloat(depositAmount) <= 0) { setFundMsg('Enter an amount.'); return }
    setFunding(true); setFundMsg(null)

    // Save balance immediately — persists even if user closes tab mid-tx
    const newBalance = (parseFloat(savedBalance || '0') + parseFloat(depositAmount)).toFixed(2)
    localStorage.setItem('employer:balance', newBalance)
    localStorage.setItem('employer:funded', '1')
    setSavedBalance(newBalance)
    setFunded(true)

    try {
      const amount = BigInt(Math.round(parseFloat(depositAmount) * 1e18))
      const depositOp = await unlinkDeposit([{ token: USDC_ADDRESS, amount, depositor: address }])
      await sendTransactionAsync({
        to:   (depositOp as any).to   as `0x${string}`,
        data: (depositOp as any).data as `0x${string}`,
      })
      if (mnemonic) {
        await fetch(`${EXECUTOR_URL}/employer/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mnemonic, masterUnlinkAddr: masterAddr, employees: [] }),
        }).catch(() => {})
      }
    } catch (err: any) {
      // Revert balance on failure
      const reverted = (parseFloat(newBalance) - parseFloat(depositAmount)).toFixed(2)
      localStorage.setItem('employer:balance', reverted)
      setSavedBalance(reverted)
      setFundMsg(err.shortMessage ?? err.message)
    } finally {
      setFunding(false)
    }
  }

  const [tab, setTab]       = useState<'add' | 'roster' | 'csv'>('add')
  const [employees, setEmployees] = useState<Employee[]>([])
  useEffect(() => { setEmployees(loadEmployees()) }, [])
  const [search, setSearch] = useState('')
  const [chartEmp, setChartEmp] = useState<Employee | null>(null)

  // Add employee form
  const [form, setForm] = useState({ name: '', email: '', annualSalary: '52000' })
  const [code, setCode] = useState('------')
  useEffect(() => { setCode(randCode()) }, [])
  const [adding, setAdding]   = useState(false)
  const [addMsg, setAddMsg]   = useState<{ ok: boolean; text: string } | null>(null)

  const salary = parseFloat(form.annualSalary || '0')

  async function handleAdd() {
    if (!form.name.trim() || !form.annualSalary) { setAddMsg({ ok: false, text: 'Name and salary are required.' }); return }
    setAdding(true); setAddMsg(null)
    try {
      const annualSalaryBase = (BigInt(Math.round(salary * 1e18))).toString()
      await fetch(`${EXECUTOR_URL}/employer/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mnemonic,
          masterUnlinkAddr: masterAddr,
          employees: [{ employeeId: parseInt(code), annualSalary: annualSalaryBase }],
        }),
      }).catch(() => {})

      const emp: Employee = { code, name: form.name.trim(), email: form.email.trim(), annualSalary: form.annualSalary, registeredAt: Date.now() }
      const updated = [...employees, emp]
      setEmployees(updated)
      saveEmployees(updated)
      setAddMsg({ ok: true, text: `Registered! Share code ${code} with ${form.name}.` })
      setForm({ name: '', email: '', annualSalary: '52000' })
    } catch (err: any) {
      setAddMsg({ ok: false, text: err.message ?? 'Registration failed' })
    } finally {
      setAdding(false)
    }
  }

  const filtered = employees.filter(e =>
    !search || [e.name, e.email, e.code].some(v => v.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div style={{ background: '#060914', minHeight: '100vh' }}>
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
            <Link href="/" className="hover:text-white transition-colors">Payroll</Link>
            <span>›</span>
            <span>Employer</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Payroll Management</h1>
        </div>

        {/* Payroll wallet card — two parts always visible */}
        <div className="rounded-2xl mb-6 overflow-hidden flex"
          style={{ border: '1px solid #1C2035' }}>

          {/* Left: Fund */}
          <div className="flex-1 p-5" style={{ background: '#0D1117' }}>
            <div className="text-xs text-slate-500 mb-3">Fund wallet</div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={depositAmount}
                onChange={e => setDepositAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="1000"
                className="w-28 rounded-xl px-3 py-2.5 text-white text-sm outline-none"
                style={{ background: '#060914', border: '1px solid #1C2035' }}
                onFocus={e => e.currentTarget.style.borderColor = '#836EF9'}
                onBlur={e => e.currentTarget.style.borderColor = '#1C2035'}
              />
              <span className="text-slate-500 text-xs">USDCm</span>
              <button
                onClick={handleFund}
                disabled={funding || depositPending}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: '#836EF9' }}>
                {funding || depositPending ? 'Depositing...' : 'Fund →'}
              </button>
            </div>
            {fundMsg && <div className="text-red-400 text-xs mt-2">{fundMsg}</div>}
          </div>

          {/* Divider */}
          <div style={{ width: '1px', background: '#1C2035' }} />

          {/* Right: Balance */}
          <div className="w-52 p-5 flex flex-col justify-center" style={{ background: '#0D1117' }}>
            <div className="text-xs text-slate-500 mb-1">Available balance</div>
            <div className="text-white font-bold text-xl">
              {parseFloat(savedBalance) > 0 ? `${savedBalance}` : '—'}
            </div>
            {parseFloat(savedBalance) > 0 && (
              <div className="text-slate-600 text-xs mt-0.5">USDCm</div>
            )}
          </div>

        </div>


        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: '#0D1117', border: '1px solid #1C2035' }}>
          {([['add', 'Add Employee'], ['roster', `Roster (${employees.length})`], ['csv', 'Upload CSV']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className="px-5 py-2 rounded-lg text-sm font-medium transition-all"
              style={tab === key ? { background: '#836EF9', color: 'white' } : { color: '#64748B' }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Add Employee tab ── */}
        {tab === 'add' && (
          <div className="flex gap-6 items-start">
            {/* Form */}
            <div className="flex-1 rounded-2xl p-6" style={{ background: '#0D1117', border: '1px solid #1C2035' }}>
              <h2 className="text-white font-semibold mb-5">Employee Details</h2>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-2">Full name</label>
                  <input value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setAddMsg(null) }}
                    placeholder="Jane Smith"
                    className="w-full rounded-xl px-4 py-3 text-white text-sm outline-none"
                    style={{ background: '#060914', border: '1px solid #1C2035' }}
                    onFocus={e => e.currentTarget.style.borderColor = '#836EF9'}
                    onBlur={e => e.currentTarget.style.borderColor = '#1C2035'} />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-2">Email</label>
                  <input value={form.email} onChange={e => { setForm(f => ({ ...f, email: e.target.value })); setAddMsg(null) }}
                    placeholder="jane@company.com" type="email"
                    className="w-full rounded-xl px-4 py-3 text-white text-sm outline-none"
                    style={{ background: '#060914', border: '1px solid #1C2035' }}
                    onFocus={e => e.currentTarget.style.borderColor = '#836EF9'}
                    onBlur={e => e.currentTarget.style.borderColor = '#1C2035'} />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-xs text-slate-500 mb-2">Annual salary (USDCm)</label>
                <input value={form.annualSalary} onChange={e => { setForm(f => ({ ...f, annualSalary: e.target.value })); setAddMsg(null) }}
                  type="number" placeholder="52000"
                  className="w-full rounded-xl px-4 py-3 text-white text-sm outline-none"
                  style={{ background: '#060914', border: '1px solid #1C2035' }}
                  onFocus={e => e.currentTarget.style.borderColor = '#836EF9'}
                  onBlur={e => e.currentTarget.style.borderColor = '#1C2035'} />
                {salary > 0 && (
                  <div className="flex gap-4 mt-2 text-xs text-slate-500">
                    <span>≈ {(salary / 365).toFixed(2)} USDCm/day</span>
                    <span>≈ {(salary / 8760).toFixed(4)} USDCm/hr</span>
                  </div>
                )}
              </div>

              <button onClick={handleAdd} disabled={adding || !address}
                className="w-full py-3 rounded-xl font-medium text-white text-sm transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: '#836EF9' }}>
                {adding ? 'Registering...' : 'Add Employee'}
              </button>

              {!address && <div className="mt-2 text-xs text-center text-slate-600">Connect wallet to register</div>}

              {addMsg && (
                <div className="mt-3 p-3 rounded-xl text-xs" style={{
                  background: addMsg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${addMsg.ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                  color: addMsg.ok ? '#4ade80' : '#f87171',
                }}>
                  {addMsg.text}
                </div>
              )}
            </div>

            {/* Code card */}
            <div className="w-64 shrink-0">
              <div className="rounded-2xl p-5 mb-4" style={{ background: '#0D1117', border: '1px solid #1C2035' }}>
                <div className="text-xs text-slate-500 mb-2">Employee code</div>
                <div className="text-white font-mono font-bold text-3xl tracking-widest mb-1">{code}</div>
                <div className="text-xs text-slate-600">Auto-generated · share with employee after registering</div>
              </div>

              {salary > 0 && (
                <button onClick={() => setChartEmp({ code, name: form.name || 'Employee', email: form.email, annualSalary: form.annualSalary, registeredAt: 0 })}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm transition-all hover:opacity-80"
                  style={{ background: '#0D1117', border: '1px solid #1C2035', color: '#836EF9' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                  Preview earnings chart
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Roster tab ── */}
        {tab === 'roster' && (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #1C2035' }}>
            {/* Search bar */}
            <div className="p-4" style={{ background: '#0D1117', borderBottom: '1px solid #1C2035' }}>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name, email or code..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl text-white text-sm outline-none"
                  style={{ background: '#060914', border: '1px solid #1C2035' }}
                  onFocus={e => e.currentTarget.style.borderColor = '#836EF9'}
                  onBlur={e => e.currentTarget.style.borderColor = '#1C2035'} />
              </div>
            </div>

            {/* Table */}
            <table className="w-full text-sm" style={{ background: '#0D1117' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1C2035' }}>
                  {['Name', 'Email', 'Code', 'Annual Salary', '/ Day', 'Added'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500">{h}</th>
                  ))}
                  <th className="px-5 py-3"/>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-600 text-sm">
                    {employees.length === 0 ? 'No employees yet — add one in the Add Employee tab.' : 'No results for your search.'}
                  </td></tr>
                ) : filtered.map(emp => (
                  <tr key={emp.code} style={{ borderBottom: '1px solid #1C2035' }}
                    className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-4 text-white font-medium">{emp.name}</td>
                    <td className="px-5 py-4 text-slate-400">{emp.email || '—'}</td>
                    <td className="px-5 py-4 font-mono text-[#836EF9] tracking-widest">{emp.code}</td>
                    <td className="px-5 py-4 text-white">{parseFloat(emp.annualSalary).toLocaleString()} USDCm</td>
                    <td className="px-5 py-4 text-slate-400">{(parseFloat(emp.annualSalary) / 365).toFixed(2)}</td>
                    <td className="px-5 py-4 text-slate-500 text-xs">{new Date(emp.registeredAt).toLocaleDateString()}</td>
                    <td className="px-5 py-4">
                      <button onClick={() => setChartEmp(emp)}
                        className="flex items-center gap-1 text-xs hover:opacity-80 transition-opacity"
                        style={{ color: '#836EF9' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                        </svg>
                        Chart
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── CSV tab ── */}
        {tab === 'csv' && (
          <CsvPanel onImport={(rows) => {
            const updated = [...employees, ...rows]
            setEmployees(updated)
            saveEmployees(updated)
            setTab('roster')
          }} />
        )}

      </div>

      {/* Chart modal */}
      {chartEmp && <ChartModal name={chartEmp.name} annualSalary={chartEmp.annualSalary} onClose={() => setChartEmp(null)} />}
    </div>
  )
}
