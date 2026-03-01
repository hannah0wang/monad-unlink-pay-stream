const fs   = require('fs')
const path = require('path')

// Load root .env so we have one file for everything
const rootEnv = path.resolve(__dirname, '../.env')
if (fs.existsSync(rootEnv)) {
  for (const line of fs.readFileSync(rootEnv, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = val  // don't override if already set
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false }
    return config
  },

  // Map root .env vars → NEXT_PUBLIC_ so the browser can access them
  env: {
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: process.env.WALLETCONNECT_PROJECT_ID,
    NEXT_PUBLIC_USDC_ADDRESS:             process.env.USDC_ADDRESS,
    NEXT_PUBLIC_MONAD_RPC_URL:            process.env.MONAD_RPC_URL,
    NEXT_PUBLIC_EXECUTOR_URL:             process.env.EXECUTOR_URL,
  },
}

module.exports = nextConfig
