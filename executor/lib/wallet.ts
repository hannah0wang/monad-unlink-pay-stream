/**
 * Executor wallet — viem wallet client for Monad testnet.
 * Uses EXECUTOR_PRIVATE_KEY from env to sign and submit transactions.
 */
import { createWalletClient, createPublicClient, http, defineChain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: { name: 'MonadExplorer', url: 'https://testnet.monadexplorer.com' },
  },
  testnet: true,
})

const privateKey = process.env.EXECUTOR_PRIVATE_KEY as `0x${string}` | undefined
if (!privateKey && process.env.NODE_ENV !== 'test') {
  console.warn('[wallet] EXECUTOR_PRIVATE_KEY not set — tx submission disabled')
}

export const executorAccount = privateKey
  ? privateKeyToAccount(privateKey)
  : null

export const walletClient = executorAccount
  ? createWalletClient({
      account: executorAccount,
      chain: monadTestnet,
      transport: http(process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz'),
    })
  : null

export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz'),
})

export const EXECUTOR_ADDRESS = executorAccount?.address ?? '0x0000000000000000000000000000000000000000'

/**
 * Read the executor EOA's ERC-20 token balance.
 * Used to monitor USDCm float available for x402 bill payments.
 */
export async function getExecutorTokenBalance(tokenAddress: `0x${string}`): Promise<bigint> {
  return publicClient.readContract({
    address:      tokenAddress,
    abi:          [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] }] as const,
    functionName: 'balanceOf',
    args:         [EXECUTOR_ADDRESS as `0x${string}`],
  })
}
