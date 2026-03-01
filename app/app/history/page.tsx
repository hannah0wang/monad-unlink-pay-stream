'use client'

/**
 * /history — Private transfer log
 *
 * Uses useUnlinkHistory() to display all private transfers across all bucket accounts.
 * These are encrypted on-chain — only you can see them.
 */
import { useUnlinkHistory } from '@unlink-xyz/react'
import { BUCKET_NAMES, BUCKET_COLORS } from '@/lib/unlink'

type HistoryKind = 'Deposit' | 'Send' | 'Withdraw' | 'Receive'

interface HistoryEntry {
  id: string
  kind: HistoryKind
  timestamp: number
  amounts: Array<{ token: string; delta: bigint | string }>
  relayId?: string
  accountIndex?: number
}

const KIND_COLOR: Record<HistoryKind, string> = {
  Deposit:  'text-green-400 bg-green-400/10',
  Receive:  'text-blue-400 bg-blue-400/10',
  Send:     'text-orange-400 bg-orange-400/10',
  Withdraw: 'text-purple-400 bg-purple-400/10',
}

function formatDelta(delta: bigint | string): string {
  const n = typeof delta === 'bigint' ? delta : BigInt(delta)
  const abs = n < 0n ? -n : n
  const human = (Number(abs) / 1e6).toFixed(2)
  return (n < 0n ? '−' : '+') + human
}

function accountLabel(idx: number | undefined): string {
  if (idx === undefined) return '?'
  const key = Object.entries({
    MASTER: 0, TAXES: 1, RETIREMENT: 2, HEALTH: 3, UTILITIES: 4, NET: 5,
  }).find(([, v]) => v === idx)?.[0] as keyof typeof BUCKET_NAMES | undefined
  return key ? BUCKET_NAMES[key] : `Account ${idx}`
}

export default function HistoryPage() {
  const { history, loading, refresh } = useUnlinkHistory() as {
    history: HistoryEntry[]
    loading: boolean
    refresh: () => void
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Private Transfer History</h1>
          <p className="text-gray-500 text-sm mt-1">
            ZK-encrypted transfers across all your Unlink accounts
          </p>
        </div>
        <button
          onClick={refresh}
          className="px-3 py-1.5 text-xs border border-[#2A2A3A] text-gray-400 rounded-lg hover:bg-[#2A2A3A] transition-colors"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading history...</div>
      ) : !history?.length ? (
        <div className="bg-[#14141F] border border-[#2A2A3A] rounded-xl p-10 text-center text-gray-500">
          No transfers yet. Run a payroll cycle to see entries here.
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((entry) => {
            const kind = entry.kind as HistoryKind
            const colorClass = KIND_COLOR[kind] ?? 'text-gray-400 bg-gray-400/10'
            const date = new Date(entry.timestamp * 1000)
            return (
              <div
                key={entry.id}
                className="bg-[#14141F] border border-[#2A2A3A] rounded-xl p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
                      {kind}
                    </span>
                    <div>
                      <div className="text-white text-sm font-medium">
                        {accountLabel(entry.accountIndex)}
                      </div>
                      <div className="text-gray-600 text-xs mt-0.5">
                        {date.toLocaleDateString()} {date.toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    {(entry.amounts ?? []).map((a, i) => (
                      <div
                        key={i}
                        className={`text-sm font-mono font-medium ${
                          String(a.delta).startsWith('-') || (typeof a.delta === 'bigint' && a.delta < 0n)
                            ? 'text-red-400'
                            : 'text-green-400'
                        }`}
                      >
                        {formatDelta(a.delta)} USDC
                      </div>
                    ))}
                  </div>
                </div>
                {entry.relayId && (
                  <div className="mt-2 text-xs text-gray-700 font-mono truncate">
                    relay: {entry.relayId}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Privacy note */}
      <div className="mt-6 p-4 bg-[#836EF9]/5 border border-[#836EF9]/20 rounded-xl">
        <div className="text-xs text-gray-400">
          <span className="text-[#836EF9] font-medium">Private:</span> These transfers are
          ZK-encrypted on Monad. The public blockchain sees only a single deposit transaction —
          all bucket routing and bill payments are invisible.
        </div>
      </div>
    </div>
  )
}
