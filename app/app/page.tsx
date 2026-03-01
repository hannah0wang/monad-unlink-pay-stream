'use client'

import Link from 'next/link'

const BUCKETS = [
  { color: '#F97316', label: 'Taxes',     pct: 25 },
  { color: '#22C55E', label: '401(k)',    pct: 6  },
  { color: '#3B82F6', label: 'Health',    pct: 7  },
  { color: '#EAB308', label: 'Utilities', pct: 10 },
  { color: '#A855F7', label: 'Take-Home', pct: 52 },
]

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#060914' }}>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-8"
          style={{ background: 'rgba(131,110,249,0.1)', border: '1px solid rgba(131,110,249,0.25)', color: '#836EF9' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-[#836EF9] animate-pulse" />
          Stealth mode activated
        </div>

<h1 className="text-5xl md:text-6xl font-bold text-white tracking-tight mb-5 max-w-2xl leading-tight">
          Streaming payroll,<br />
          <span style={{ background: 'linear-gradient(135deg, #836EF9, #A78BFA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            completely private.
          </span>
        </h1>

        <p className="text-slate-400 text-lg max-w-lg mb-4 leading-relaxed">
          Get paid every hour, not every month. Set your own splits for taxes, retirement,
          and bills. Every transaction is ZK-encrypted — your salary is yours alone.
        </p>

        {/* Allocation bar */}
        <div className="w-full max-w-xs mb-12">
          <div className="flex h-2 rounded-full overflow-hidden mb-3" style={{ gap: '2px' }}>
            {BUCKETS.map(b => (
              <div key={b.label} className="h-full" style={{ background: b.color, flex: b.pct }} />
            ))}
          </div>
          <div className="flex justify-between">
            {BUCKETS.map(b => (
              <div key={b.label} className="flex flex-col items-center gap-0.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: b.color }} />
                <span className="text-[10px] text-slate-600">{b.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Role picker */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">

          {/* Employee */}
          <Link href="/setup"
            className="group p-6 rounded-2xl text-left transition-all hover:scale-[1.02] flex flex-col"
            style={{ background: '#0D1117', border: '1px solid rgba(131,110,249,0.3)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-4"
              style={{ background: 'rgba(131,110,249,0.15)' }}>
              👤
            </div>
            <div className="text-white font-semibold text-base mb-1">I'm an Employee</div>
            <div className="text-slate-500 text-sm leading-relaxed flex-1">
              Set up your private wallet, configure splits, and let payroll run automatically.
            </div>
            <div className="flex items-center gap-1.5 text-sm font-medium mt-4" style={{ color: '#836EF9' }}>
              Configure paycheck
              <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
            </div>
          </Link>

          {/* Employer */}
          <Link href="/employer"
            className="group p-6 rounded-2xl text-left transition-all hover:scale-[1.02] flex flex-col"
            style={{ background: '#0D1117', border: '1px solid rgba(34,197,94,0.25)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-4"
              style={{ background: 'rgba(34,197,94,0.1)' }}>
              🏢
            </div>
            <div className="text-white font-semibold text-base mb-1">I'm an Employer</div>
            <div className="text-slate-500 text-sm leading-relaxed flex-1">
              Fund payroll privately. Wages stream to your team automatically — no bank, no delay.
            </div>
            <div className="flex items-center gap-1.5 text-sm font-medium mt-4" style={{ color: '#22C55E' }}>
              Set up payroll <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
            </div>
          </Link>

        </div>
      </div>

      {/* Feature row */}
      <div className="border-t px-6 py-10" style={{ borderColor: '#1C2035' }}>
        <div className="max-w-3xl mx-auto grid grid-cols-3 gap-4">
          {[
            {
              icon: '⚡',
              title: 'Real-Time Streaming',
              desc: 'Paid every hour or every cycle — not monthly. Access your earnings as you earn them.',
            },
            {
              icon: '🎛️',
              title: 'Fully Configurable',
              desc: 'Set your own splits for taxes, 401k, health, bills. Change anytime.',
            },
            {
              icon: '🔒',
              title: 'ZK Private',
              desc: 'Your salary, splits, and spending are invisible on-chain. Only you can see your accounts.',
            },
          ].map(f => (
            <div key={f.title} className="p-5 rounded-2xl" style={{ background: '#0D1117', border: '1px solid #1C2035' }}>
              <div className="text-2xl mb-3">{f.icon}</div>
              <div className="text-sm font-semibold text-white mb-1.5">{f.title}</div>
              <div className="text-xs text-slate-500 leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
