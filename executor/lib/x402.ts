/**
 * x402 Resource Server middleware for Hono.
 * Uses the official @x402/core/server + @x402/evm packages with the
 * molandak facilitator to verify on-chain payments on Monad testnet.
 */
import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import type { Context, Next } from 'hono'
import { USDC_ADDRESS } from './constants'
const MONAD_TESTNET   = 'eip155:10143'
const FACILITATOR_URL = 'https://x402-facilitator.molandak.org'

const facilitator = new HTTPFacilitatorClient(FACILITATOR_URL)

export const resourceServer = x402ResourceServer({
  facilitator,
  scheme: ExactEvmScheme,
})

/**
 * Hono middleware factory.
 *
 * @param priceUsdc   Human-readable USDC amount, e.g. "12.50"
 * @param description Shown in the 402 response to the payer
 * @param payTo       Address that must receive the payment.
 *                    Defaults to EXECUTOR_ADDRESS.
 *                    Biller servers pass their OWN address so the facilitator
 *                    verifies the payment went to the right recipient.
 */
export function x402Gate(
  priceUsdc: string,
  description: string,
  payTo?: `0x${string}`,
) {
  return async (c: Context, next: Next) => {
    const recipient = payTo ?? (process.env.EXECUTOR_ADDRESS as `0x${string}`)
    const paymentHeader = c.req.header('x-payment')

    if (!paymentHeader) {
      const paymentRequired = resourceServer.paymentRequired({
        price:       priceUsdc,
        network:     MONAD_TESTNET,
        token:       USDC_ADDRESS,
        payTo:       recipient,
        description,
      })
      return c.json(paymentRequired, 402)
    }

    const verified = await resourceServer.verify(paymentHeader)
    if (!verified.valid) {
      return c.json({ error: verified.reason ?? 'Payment verification failed' }, 402)
    }

    c.set('payment', verified)
    await next()
  }
}
