/**
 * x402 middleware for Hono using @x402/hono.
 *
 * Monad testnet (eip155:10143) is not in x402/evm's built-in stablecoin registry,
 * so we register a custom money parser that converts "$X.XX" prices to USDCm
 * (18 decimals, 0xc4fB617...) base units.
 */
import { paymentMiddleware, x402ResourceServer } from '@x402/hono'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { HTTPFacilitatorClient } from '@x402/core/server'

const FACILITATOR_URL = process.env.X402_FACILITATOR_URL
  ?? 'https://x402-facilitator.molandak.org'

const USDCm = '0xc4fB617E4E4CfbdEb07216dFF62B4E46a2D6FdF6'
const MONAD_TESTNET = 'eip155:10143'

// Register USDCm as the default payment token for Monad testnet.
// x402/evm doesn't have this chain in its stablecoin registry by default.
const evmScheme = new ExactEvmScheme()
evmScheme.registerMoneyParser(async (amount: string, network: string) => {
  if (network === MONAD_TESTNET) {
    // Convert dollar amount to USDCm base units (18 decimals)
    const baseUnits = BigInt(Math.round(parseFloat(amount) * 1e18))
    return {
      amount: baseUnits.toString(),
      asset:  USDCm,
      // USDCm is a basic ERC-20 with no EIP-3009 or EIP-2612 permit support.
      // Permit2 IS deployed on Monad testnet, so we use it instead.
      // This allows off-chain signing for any ERC-20 via Permit2's standard.
      extra: {
        assetTransferMethod: 'permit2',
      },
    }
  }
  return null
})

export const resourceServer = new x402ResourceServer(
  new HTTPFacilitatorClient({ url: FACILITATOR_URL })
).register(MONAD_TESTNET, evmScheme)

/**
 * Hono middleware factory for x402 payment gating.
 *
 * @param priceUsdc   Human-readable amount e.g. "0.01", "12.50" (interpreted as USDCm)
 * @param description Shown to payer in the 402 response
 * @param payTo       Address that receives the payment (defaults to EXECUTOR_ADDRESS)
 */
export function x402Gate(
  priceUsdc: string,
  description: string,
  payTo?: `0x${string}`,
) {
  const recipient = payTo ?? (process.env.EXECUTOR_ADDRESS as `0x${string}`)

  return paymentMiddleware(
    {
      '*': {
        accepts: {
          scheme:  'exact',
          price:   `$${priceUsdc}`,
          network: MONAD_TESTNET,
          payTo:   recipient,
        },
        description,
      },
    },
    resourceServer,
  )
}
