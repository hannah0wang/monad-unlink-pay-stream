'use client'

import './globals.css'
import '@rainbow-me/rainbowkit/styles.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { UnlinkProvider } from '@unlink-xyz/react'
import { wagmiConfig } from '@/lib/wagmi'
import { useState } from 'react'
import Link from 'next/link'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <html lang="en">
      <body>
        <WagmiProvider config={wagmiConfig}>
          <QueryClientProvider client={queryClient}>
            <RainbowKitProvider
              theme={darkTheme({
                accentColor: '#836EF9',
                accentColorForeground: 'white',
                borderRadius: 'medium',
              })}
            >
              <UnlinkProvider chain="monad-testnet">
                <nav style={{ background: '#0A0D17', borderBottom: '1px solid #1C2035' }}
                  className="flex items-center justify-between px-6 py-3.5">
                  <div className="flex items-center gap-8">
                    <Link href="/" className="font-bold text-base tracking-tight" style={{ color: '#836EF9' }}>
                      PrivateHCM
                    </Link>
                    <div className="flex gap-1 text-sm">
                      {[
                        { href: '/dashboard', label: 'Dashboard' },
                        { href: '/setup',     label: 'Setup' },
                        { href: '/employer',  label: 'Employer' },
                        { href: '/history',   label: 'History' },
                      ].map(({ href, label }) => (
                        <Link key={href} href={href}
                          className="px-3 py-1.5 rounded-lg transition-colors text-slate-400 hover:text-white hover:bg-white/5">
                          {label}
                        </Link>
                      ))}
                    </div>
                  </div>
                  <WalletArea />
                </nav>
                <main>{children}</main>
              </UnlinkProvider>
            </RainbowKitProvider>
          </QueryClientProvider>
        </WagmiProvider>
      </body>
    </html>
  )
}

function WalletArea() {
  const { ConnectButton } = require('@rainbow-me/rainbowkit')
  return <ConnectButton />
}
