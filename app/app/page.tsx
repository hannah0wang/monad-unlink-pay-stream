'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useUnlink } from '@unlink-xyz/react'
import { useAccount } from 'wagmi'
import Link from 'next/link'

const BUCKETS = [
  { color: '#F97316', label: 'Taxes',    pct: 25 },
  { color: '#22C55E', label: '401(k)',   pct: 6  },
  { color: '#3B82F6', label: 'Health',   pct: 7  },
  { color: '#EAB308', label: 'Utilities', pct: 10 },
  { color: '#A855F7', label: 'Take-Home', pct: 52 },
]

export default function Home() {
  const { isConnected } = useAccount()
  const { ready, walletExists, activeAccount, createWallet } = useUnlink()

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#060914' }}>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-8"
          style={{ background: 'rgba(131,110,249,0.1)', border: '1px solid rgba(131,110,249,0.25)', color: '#836EF9' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-[#836EF9] animate-pulse" />
          Automated · Encrypted · Instant
        </div>

        <h1 className="text-5xl md:text-6xl font-bold text-white tracking-tight mb-5 max-w-2xl leading-tight">
          Your paycheck,<br />
          <span style={{ background: 'linear-gradient(135deg, #836EF9, #A78BFA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            fully automated.
          </span>
        </h1>
        <p className="text-slate-400 text-lg max-w-xl mb-10 leading-relaxed">
          Every paycheck automatically splits into dedicated accounts for taxes, retirement,
          health, bills, and take-home. Set it up once. Never think about it again.
        </p>

        {/* Allocation preview bar */}
        <div className="w-full max-w-sm mb-10">
          <div className="flex h-2.5 rounded-full overflow-hidden mb-3" style={{ gap: '2px' }}>
            {BUCKETS.map(b => (
              <div key={b.label} className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ background: b.color, flex: b.pct }} />
            ))}
          </div>
          <div className="flex justify-between">
            {BUCKETS.map(b => (
              <div key={b.label} className="flex flex-col items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ background: b.color }} />
                <span className="text-xs text-slate-500">{b.label}</span>
                <span className="text-xs font-semibold text-white">{b.pct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-4">
          <ConnectButton />

          {isConnected && ready && !walletExists && (
            <button onClick={() => createWallet()}
              className="px-6 py-3 rounded-2xl font-medium text-white transition-all hover:opacity-90 active:scale-95"
              style={{ background: 'linear-gradient(135deg, #836EF9, #6B52E0)' }}>
              Create Your Secure Wallet
            </button>
          )}

          {isConnected && walletExists && activeAccount && (
            <div className="text-center">
              <div className="text-xs text-slate-500 mb-1">Connected Account</div>
              <div className="font-mono text-xs px-3 py-1.5 rounded-lg"
                style={{ color: '#836EF9', background: 'rgba(131,110,249,0.1)' }}>
                {String(activeAccount).slice(0, 16)}…{String(activeAccount).slice(-8)}
              </div>
            </div>
          )}

          {isConnected && (
            <div className="flex gap-2 mt-1">
              <Link href="/employer"
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-80"
                style={{ border: '1px solid #836EF9', color: '#836EF9' }}>
                I'm an Employer
              </Link>
              <Link href="/setup"
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-80"
                style={{ border: '1px solid #1C2035', color: '#94A3B8' }}>
                Get Started
              </Link>
              <Link href="/dashboard"
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                style={{ background: '#836EF9', color: 'white' }}>
                My Dashboard →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Feature row */}
      <div className="border-t px-6 py-10" style={{ borderColor: '#1C2035' }}>
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: '🔒', title: 'Bank-Level Privacy',  desc: 'Balances stay encrypted — visible only to you' },
            { icon: '⚙️', title: 'Smart Routing',        desc: 'Gross pay splits automatically every cycle' },
            { icon: '📋', title: 'Auto Bill Pay',        desc: 'Utilities account pays your bills on schedule' },
            { icon: '📊', title: 'Full Visibility',      desc: 'Real-time breakdown across all your accounts' },
          ].map(f => (
            <div key={f.title} className="p-4 rounded-2xl" style={{ background: '#0D1117', border: '1px solid #1C2035' }}>
              <div className="text-2xl mb-2">{f.icon}</div>
              <div className="text-sm font-semibold text-white mb-1">{f.title}</div>
              <div className="text-xs text-slate-500">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
