# Payroll Ninja

<img width="842" height="829" alt="image" src="https://github.com/user-attachments/assets/3d542c68-39a6-4358-94bd-e2dc980fa652" />

<img width="842" height="752" alt="image" src="https://github.com/user-attachments/assets/fd8d63fd-6f6c-472e-a16f-fe577ec7d312" />

<img width="842" height="617" alt="image" src="https://github.com/user-attachments/assets/b0d32f91-e77b-46be-9b07-0aa7a870c905" />



**Private, real-time streaming payroll on Monad via Unlink.**

Wages stream continuously into dedicated ZK-private buckets — taxes, retirement, health, utilities, take-home — all invisible on-chain. Bills pay themselves. The employer's identity and payroll amounts are fully private after a single lump-sum deposit.

---

## Architecture

```
Employer Unlink wallet
  └─ private send every cycle ──► Employee Master account (ZK, hidden)
                                      └─ private routing ──► Taxes bucket
                                                         ──► Retirement bucket
                                                         ──► Health bucket
                                                         ──► Utilities bucket
                                                         ──► Net (take-home) bucket

Scheduler detects due bills
  └─ executor calls biller via x402 ──► Biller address receives USDCm
  └─ Utilities bucket ──(Unlink withdraw)──► Executor EOA (reimbursement)
```

### Components

| Component | Stack | Port |
|---|---|---|
| **App** | Next.js 14, wagmi, RainbowKit, Unlink React SDK | 3000 |
| **Executor** | Node.js 24, Hono, Unlink Node SDK | 3001 |
| **Electric biller** | Node.js, Hono, x402 | 3002 |
| **Insurance biller** | Node.js, Hono, x402 | 3003 |

### Smart Contracts (Monad testnet)

`PayrollManager.sol` — optional on-chain registry. Not in the active payment path; wages flow entirely through Unlink.

---

## Privacy model

| Event | Visible on-chain | Hidden |
|---|---|---|
| Employer lump-sum deposit | EOA address + amount (once) | Which account credited |
| Per-cycle wages | Nothing — ZK private send | Everything |
| Bucket routing | Nothing — ZK private sends | Everything |
| x402 bill payment | Executor EOA + biller address + amount | Which employee |
| Bill reimbursement | Amount + executor EOA | Source bucket / employee |

The only public trace is the employer's initial deposit. Every payroll cycle and all bucket routing is invisible.

---

## Key technical decisions

### Unlink as the privacy primitive

All payments happen inside the Unlink ZK pool on Monad testnet. Both employer and employee wallets are managed server-side by the executor (mnemonic stored in SQLite). The executor operates autonomously — no user interaction after one-time setup.

- **Employer wallet**: one account (Master), holds payroll float
- **Employee wallet**: 6 accounts (Master + 5 buckets), derived from same mnemonic
- **Account derivation**: BIP-39 mnemonic → deterministic keypairs → same `unlink1...` addresses across browser and executor

### x402 for machine-to-machine bill payments

x402 is used for **executor → biller** flow. When a bill is due, the executor calls the biller's HTTP endpoint. The biller returns `402 Payment Required` with `payTo: billerAddress`. `wrapFetchWithPaymentFromConfig` signs a Permit2 authorization (off-chain) and retries. The molandak facilitator verifies on-chain. The executor is then reimbursed from the employee's private Utilities bucket.


### Scheduler

`setInterval(30s)` — checks for due employees and bills. Timestamps advanced in DB *before* execution (idempotency). On restart, already-advanced timestamps prevent double-payment.

---

## Token addresses

| Token | Address |
|---|---|
| USDCm (Monad testnet) | `0xc4fB617E4E4CfbdEb07216dFF62B4E46a2D6FdF6` |
| Unlink pool | `0x0813da0a10328e5ed617d37e514ac2f6fa49a254` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

---

## Running locally

**Prerequisites:** Node.js 24 (via [Volta](https://volta.sh)), Bun, a Monad testnet wallet with MON and USDCm.

**1. Configure**

```bash
# Fill in EXECUTOR_PRIVATE_KEY and EXECUTOR_ADDRESS
cp .env.example .env   # or edit .env directly
```

**2. Executor** (Terminal 1)

```bash
cd executor
npm install   # installs deps including better-sqlite3
volta run --node 24 node --env-file=../.env --import=tsx/esm index.ts
```

**3. App** (Terminal 2)

```bash
cd app
bun install
bun run dev
```

**4. Billers** (Terminal 3, optional — needed for bill payment demo)

```bash
cd executor
volta run --node 24 node --env-file=../.env --import=tsx/esm biller/electric.ts &
volta run --node 24 node --env-file=../.env --import=tsx/esm biller/insurance.ts
```

Open [http://localhost:3000](http://localhost:3000).

---

## E2E test (no frontend required)

```bash
cd executor

# Terminal 1: start executor
volta run --node 24 node --env-file=../.env --import=tsx/esm index.ts

# Terminal 2: run test
volta run --node 24 node --env-file=../.env --import=tsx/esm scripts/test.ts
```

The test creates real Unlink wallets, deposits USDCm into the employer's Unlink wallet, registers both parties with the executor, and triggers a full payroll cycle (employer → employee Master → 5 private bucket sends).

---

## Faucets

| Asset | URL |
|---|---|
| MON (gas) | https://faucet.monad.xyz |
| USDCm | https://faucet.unlink.xyz |

---

## Built with

- [Monad](https://monad.xyz) — high-performance EVM L1
- [Unlink](https://unlink.xyz) — ZK private transfers
- [x402](https://x402.org) — HTTP payment protocol
- [Hono](https://hono.dev) — lightweight Node.js server
- [Next.js](https://nextjs.org) — React framework
- [wagmi](https://wagmi.sh) + [RainbowKit](https://rainbowkit.com) — wallet connection
