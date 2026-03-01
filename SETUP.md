# Private HCM — Setup Guide

## Architecture

```
Employer → PayrollManager.sol (USDC escrow)
             ↓  x402 cycle trigger ($0.01 fee)
           Executor (Hono/Bun)
             ↓  PayrollManager.executePay()
           USDC → Unlink Pool → Employee Master Account
             ↓  5 private ZK transfers
           Taxes | 401k | Health | Utilities | Net
             ↓  x402 bill pay
           Utilities bucket → Biller public address
```

## Prerequisites
- [Foundry](https://getfoundry.sh/) (`foundryup`)
- [Bun](https://bun.sh/) (`curl -fsSL https://bun.sh/install | bash`)
- Node.js 18+ (for Next.js)
- A Monad testnet wallet with MON (for gas) and USDC (from faucet.circle.com)

---

## 1. Contracts (Foundry)

```bash
cd contracts

# Install dependencies
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge install foundry-rs/forge-std --no-commit

# Run tests
forge test -v

# Deploy (fill .env first)
cp .env.example .env
# Set PRIVATE_KEY and EXECUTOR_ADDRESS in .env
source .env
forge script script/Deploy.s.sol --rpc-url $MONAD_RPC_URL --broadcast
# → copies PAYROLL_MANAGER_ADDRESS into app/.env.local and executor/.env
```

---

## 1b. Pre-fund executor EOA with USDCm (required for bill payments)

The executor fronts bill payments via x402 from its own EOA wallet, then gets reimbursed
from each employee's private Utilities Unlink bucket. It needs a USDCm float to do this.

```bash
# Send $500 USDCm to executor EOA (replace addresses from your .env)
cast send $USDC_ADDRESS \
  "transfer(address,uint256)" $EXECUTOR_ADDRESS 500000000 \
  --private-key $PRIVATE_KEY \
  --rpc-url $MONAD_RPC_URL

# Verify
curl http://localhost:3001/health
# → { "executorFloat": "$500.00 USDCm", "floatWarning": null }
```

Reimbursements replenish the float automatically as employees' Utilities buckets are charged.

---

## 2. Executor (Bun/Hono)

```bash
cd executor
bun install

cp .env.example .env
# Fill in: EXECUTOR_PRIVATE_KEY, EXECUTOR_ADDRESS, PAYROLL_MANAGER_ADDRESS

bun run dev
# Main server: http://localhost:3001

# Optional: run mock billers (separate terminals)
bun run biller:electric    # http://localhost:3002
bun run biller:insurance   # http://localhost:3003
```

**Smoke test the x402 flow:**
```bash
# Should return 402 Payment Required
curl -s -X POST http://localhost:3001/x402/runCycle \
  -H "Content-Type: application/json" \
  -d '{"employeeId": 0}' | jq .
# → { "x402Version": "...", "accepts": [...] }

# Health check
curl http://localhost:3001/health
# → { "ok": true, ... }
```

---

## 3. Frontend (Next.js)

```bash
cd app
bun install

cp .env.local.example .env.local
# Fill in: NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID, NEXT_PUBLIC_PAYROLL_MANAGER_ADDRESS

bun run dev
# Opens http://localhost:3000
```

---

## Contract Addresses (fill after deploy)

| Contract         | Address |
|------------------|---------|
| PayrollManager   | `0x...` |
| USDCm            | `0xc4fB617E4E4CfbdEb07216dFF62B4E46a2D6FdF6` |
| Unlink Pool      | `0x0813da0a10328e5ed617d37e514ac2f6fa49a254` |

---

## Demo Script (3 min)

1. **[Setup]** Employee opens `/setup` → creates Unlink wallet → 6 bucket accounts → configures splits (25% taxes, 5% 401k, 3% health, 10% utilities, rest net) → registers with executor

2. **[Employer]** Opens `/employer` → registers employee (with unlink1... master address) → funds 1000 USDC into PayrollManager

3. **[x402 cycle]** Employee dashboard → "Run Payroll Cycle" → **show browser network tab**: 402 Payment Required → wrapFetchWithPayment auto-pays → 200 with payslip → bucket balances update

4. **[Privacy]** Show Monad explorer: only 1 public tx visible (deposit to Unlink pool) — the 5 bucket routing transfers are invisible (ZK private sends)

5. **[Bill pay]** "Pay Electric Bill" → second 402 challenge → Utilities bucket decreases → $12.50 USDC lands at biller address

---

## Faucets

| Asset | URL |
|-------|-----|
| MON (gas) | https://faucet.monad.xyz |
| USDCm     | https://faucet.unlink.xyz |
