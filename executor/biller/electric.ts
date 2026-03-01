/**
 * Mock Electric Utility Biller — port 3002
 *
 * x402-compatible biller server. When the executor calls POST /pay,
 * it gets a 402 with payTo = this biller's own address.
 * The executor pays the 402 from its wallet (that's the bill being settled).
 * After payment, the executor's Utilities Unlink withdrawal reimburses it.
 *
 * Start: bun run biller:electric
 */
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { x402Gate } from '../lib/x402'

const BILL_AMOUNT  = '12.50'
const BILLER_NAME  = 'Monad Electric Co.'
const PORT         = 3002

// Biller's own settlement address — payTo in the 402 challenge.
// Executor pays HERE. This must match BILLER_REGISTRY.electric.address in pay-bill.ts.
const BILLER_ADDRESS = (
  process.env.ELECTRIC_BILLER_ADDRESS ?? '0x0000000000000000000000000000000000000002'
) as `0x${string}`

const app = new Hono()
app.use(logger())
app.use(cors())

app.get('/', (c) =>
  c.json({
    biller:      BILLER_NAME,
    amount:      BILL_AMOUNT,
    currency:    'USDCm',
    description: 'Monthly electricity — Monad testnet',
    payTo:       BILLER_ADDRESS,
    payEndpoint: 'POST /pay',
  }),
)

// x402-gated: the 402 payTo is the BILLER'S address, not the executor's.
// The executor pays this amount directly to the biller when settling a bill.
app.post(
  '/pay',
  x402Gate(BILL_AMOUNT, `${BILLER_NAME} — monthly electricity`, BILLER_ADDRESS),
  (c) =>
    c.json({
      ok: true,
      receipt: {
        biller:           BILLER_NAME,
        amount:           BILL_AMOUNT,
        currency:         'USDCm',
        paidAt:           new Date().toISOString(),
        confirmationCode: `ELEC-${Date.now()}`,
      },
    }),
)

import { serve } from '@hono/node-server'

console.log(`\n⚡ ${BILLER_NAME}  http://localhost:${PORT}  payTo: ${BILLER_ADDRESS}`)

serve({ fetch: app.fetch, port: PORT })
