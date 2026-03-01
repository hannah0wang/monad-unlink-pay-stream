'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useUnlink } from '@unlink-xyz/react'
import { useAccount } from 'wagmi'
import Link from 'next/link'

const FEATURES = [
  { icon: '🔒', label: 'Private Buckets',   desc: '6 Unlink accounts per employee' },
  { icon: '⚡', label: 'x402 Payroll',       desc: 'Pay-per-execution cycle trigger' },
  { icon: '💸', label: 'Auto-Routing',       desc: 'Master → Taxes, 401k, Health...' },
  { icon: '🏦', label: 'Bill Pay',           desc: 'Utilities bucket → biller' },
  { icon: '📊', label: 'Private History',    desc: 'ZK-encrypted transfer log' },
  { icon: '🟣', label: 'Monad + Unlink',     desc: 'Real Circle USDC testnet' },
]

export default function Home() {
  const { isConnected, address } = useAccount()
  const { ready, walletExists, activeAccount, createWallet } = useUnlink()

  return (
    <div className="min-h-screen bg-[#0E0E16] flex flex-col items-center justify-center p-8">
      {/* Hero */}
      <div className="text-center mb-12 max-w-2xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#836EF9]/10 border border-[#836EF9]/30 text-[#836EF9] text-sm mb-6">
          <span className="w-2 h-2 rounded-full bg-[#836EF9] animate-pulse" />
          Built on Monad + Unlink
        </div>
        <h1 className="text-5xl font-bold text-white mb-4">
          Private HCM<br />
          <span className="text-[#836EF9]">On-Chain Payroll</span>
        </h1>
        <p className="text-gray-400 text-lg">
          Wages route privately through Unlink ZK accounts into spending buckets —
          taxes, 401k, health, utilities, take-home — all invisible on-chain.
        </p>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-12 max-w-2xl w-full">
        {FEATURES.map((f) => (
          <div key={f.label} className="bg-[#14141F] border border-[#2A2A3A] rounded-xl p-4">
            <div className="text-2xl mb-2">{f.icon}</div>
            <div className="text-white font-medium text-sm">{f.label}</div>
            <div className="text-gray-500 text-xs mt-1">{f.desc}</div>
          </div>
        ))}
      </div>

      {/* Connect + wallet */}
      <div className="flex flex-col items-center gap-4">
        <ConnectButton />

        {isConnected && ready && !walletExists && (
          <button
            onClick={() => createWallet()}
            className="px-6 py-3 bg-[#836EF9] text-white rounded-xl font-medium hover:bg-[#6B52E0] transition-colors"
          >
            Create Unlink Private Wallet
          </button>
        )}

        {isConnected && walletExists && activeAccount && (
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">Unlink Master Address</div>
            <div className="font-mono text-xs text-[#836EF9] bg-[#836EF9]/10 px-3 py-1 rounded-lg">
              {String(activeAccount).slice(0, 16)}...{String(activeAccount).slice(-8)}
            </div>
          </div>
        )}

        {isConnected && (
          <div className="flex gap-3 mt-2">
            <Link
              href="/employer"
              className="px-4 py-2 border border-[#836EF9] text-[#836EF9] rounded-lg text-sm hover:bg-[#836EF9]/10 transition-colors"
            >
              I'm an Employer
            </Link>
            <Link
              href="/setup"
              className="px-4 py-2 border border-[#2A2A3A] text-gray-300 rounded-lg text-sm hover:bg-[#2A2A3A] transition-colors"
            >
              Employee Setup
            </Link>
            <Link
              href="/dashboard"
              className="px-4 py-2 border border-[#2A2A3A] text-gray-300 rounded-lg text-sm hover:bg-[#2A2A3A] transition-colors"
            >
              Dashboard
            </Link>
          </div>
        )}
      </div>

      {/* Architecture */}
      <div className="mt-16 max-w-xl w-full">
        <div className="bg-[#14141F] border border-[#2A2A3A] rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Architecture</div>
          <div className="flex flex-col gap-2 text-sm">
            {[
              ['Employer',  'bg', 'Funds PayrollManager.sol on Monad'],
              ['x402',      'orange', 'Employee pays $0.01 to trigger cycle'],
              ['Executor',  'purple', 'Calls executePay() → deposits into Unlink'],
              ['Unlink',    'green', 'Private routes: Master → 5 buckets (ZK)'],
              ['Bill Pay',  'blue', 'Utilities bucket → biller public address'],
            ].map(([label, _color, desc]) => (
              <div key={label} className="flex gap-3 items-start">
                <span className="text-[#836EF9] font-mono text-xs bg-[#836EF9]/10 px-2 py-0.5 rounded mt-0.5 shrink-0 w-20 text-center">
                  {label}
                </span>
                <span className="text-gray-300 text-xs">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
