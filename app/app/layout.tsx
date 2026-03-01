'use client'

import './globals.css'
import '@rainbow-me/rainbowkit/styles.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { UnlinkProvider } from '@unlink-xyz/react'
import { wagmiConfig } from '@/lib/wagmi'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import NinjaLogo from '@/components/NinjaLogo'

// Infer current role from pathname so nav is always in sync
function useRole(): 'employee' | 'employer' | null {
  const path = usePathname()
  if (!path) return null
  if (path.startsWith('/employer')) return 'employer'
  if (['/setup', '/dashboard', '/history', '/bills'].some(p => path.startsWith(p))) return 'employee'
  return null
}

const EMPLOYEE_NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/history',   label: 'History'   },
  { href: '/bills',     label: 'Bills'      },
]

const EMPLOYER_NAV = [
  { href: '/employer', label: 'Payroll Management' },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <html lang="en">
      <body>
        <WagmiProvider config={wagmiConfig}>
          <QueryClientProvider client={queryClient}>
            <RainbowKitProvider theme={darkTheme({ accentColor: '#836EF9', accentColorForeground: 'white', borderRadius: 'medium' })}>
              <UnlinkProvider chain="monad-testnet">
                <Nav />
                <main>{children}</main>
              </UnlinkProvider>
            </RainbowKitProvider>
          </QueryClientProvider>
        </WagmiProvider>
      </body>
    </html>
  )
}

function Nav() {
  const role = useRole()
  const path = usePathname()
  const { ConnectButton } = require('@rainbow-me/rainbowkit')

  const links = role === 'employer' ? EMPLOYER_NAV
              : role === 'employee' ? EMPLOYEE_NAV
              : []

  return (
    <nav style={{ background: '#0A0D17', borderBottom: '1px solid #1C2035' }}
      className="flex items-center justify-between px-6 py-3.5">
      <div className="flex items-center gap-6">

        {/* Logo — always links home */}
        <Link href="/" className="font-bold text-base tracking-tight flex items-center gap-2"
          style={{ color: '#836EF9' }}>
          <NinjaLogo size={22} />
          Payroll Ninja
        </Link>

        {/* Role badge + nav links */}
        {role && (
          <div className="flex items-center gap-1">
            <span className="text-xs px-2 py-0.5 rounded-md mr-2 font-medium"
              style={{
                background: role === 'employer' ? 'rgba(34,197,94,0.1)' : 'rgba(131,110,249,0.1)',
                color:      role === 'employer' ? '#22C55E' : '#836EF9',
                border:     role === 'employer' ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(131,110,249,0.2)',
              }}>
              {role === 'employer' ? 'Employer' : 'Employee'}
            </span>

            {links.map(({ href, label }) => {
              const active = path === href || path.startsWith(href + '/')
              return (
                <Link key={href} href={href}
                  className="px-3 py-1.5 rounded-lg transition-colors text-sm"
                  style={{
                    color:      active ? 'white' : '#94A3B8',
                    background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
                  }}>
                  {label}
                </Link>
              )
            })}
          </div>
        )}
      </div>

      <ConnectButton />
    </nav>
  )
}
