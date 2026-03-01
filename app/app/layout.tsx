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
                <nav className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A3A] bg-[#14141F]">
                  <div className="flex items-center gap-8">
                    <Link href="/" className="font-bold text-lg text-[#836EF9]">
                      PrivateHCM
                    </Link>
                    <div className="flex gap-4 text-sm text-gray-400">
                      <Link href="/setup"     className="hover:text-white transition-colors">Setup</Link>
                      <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
                      <Link href="/employer"  className="hover:text-white transition-colors">Employer</Link>
                      <Link href="/bills"     className="hover:text-white transition-colors">Bills</Link>
                      <Link href="/history"   className="hover:text-white transition-colors">History</Link>
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
