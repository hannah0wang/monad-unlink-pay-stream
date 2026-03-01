/**
 * Mock Insurance Biller — port 3003
 *
 * Same pattern as electric.ts. payTo = this biller's own address.
 *
 * Start: bun run biller:insurance
 */
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { x402Gate } from '../lib/x402'

const BILL_AMOUNT  = '89.00'
const BILLER_NAME  = 'Chain Life Insurance'
const PORT         = 3003

const BILLER_ADDRESS = (
  process.env.INSURANCE_BILLER_ADDRESS ?? '0x0000000000000000000000000000000000000003'
) as `0x${string}`

const app = new Hono()
app.use(logger())
app.use(cors())

app.get('/', (c) =>
  c.json({
    biller:      BILLER_NAME,
    amount:      BILL_AMOUNT,
    currency:    'USDCm',
    description: 'Monthly health insurance premium',
    payTo:       BILLER_ADDRESS,
    payEndpoint: 'POST /pay',
  }),
)

app.post(
  '/pay',
  x402Gate(BILL_AMOUNT, `${BILLER_NAME} — monthly premium`, BILLER_ADDRESS),
  (c) =>
    c.json({
      ok: true,
      receipt: {
        biller:           BILLER_NAME,
        amount:           BILL_AMOUNT,
        currency:         'USDCm',
        paidAt:           new Date().toISOString(),
        confirmationCode: `INS-${Date.now()}`,
        coverage:         'Full medical, dental, vision — Monad testnet',
      },
    }),
)

console.log(`\n🏥 ${BILLER_NAME}  http://localhost:${PORT}  payTo: ${BILLER_ADDRESS}`)

export default { port: PORT, fetch: app.fetch }
