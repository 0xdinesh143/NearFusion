import { cookieStorage, createStorage, http } from '@wagmi/core'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { baseSepolia } from '@reown/appkit/networks'

// Get projectId from https://dashboard.reown.com
export const projectId = "783466dbd8bb54ae3bf3339a275441ae"

if (!projectId) {
  throw new Error('Project ID is not defined')
}

// Use Base Sepolia testnet for cross-chain swaps with NEAR
export const networks = [baseSepolia]

// Solver API configuration
export const SOLVER_API_URL = process.env.NEXT_PUBLIC_SOLVER_API_URL || 'http://localhost:3000'

// Network configurations
export const NETWORK_CONFIG = {
  'base-sepolia': {
    chainId: 84532,
    name: 'Base Sepolia',
    currency: 'ETH',
    explorerUrl: 'https://sepolia-explorer.base.org',
    rpcUrl: 'https://sepolia.base.org'
  },
  'near': {
    networkId: 'testnet',
    name: 'NEAR Testnet', 
    currency: 'NEAR',
    explorerUrl: 'https://explorer.testnet.near.org',
    rpcUrl: 'https://rpc.testnet.near.org'
  }
}

// Supported tokens for each network
export const SUPPORTED_TOKENS = {
  'base-sepolia': [
    {
      symbol: 'ETH',
      address: '0x0000000000000000000000000000000000000000',
      decimals: 18,
      name: 'Ethereum',
      icon: 'https://assets.coingecko.com/coins/images/279/standard/ethereum.png'
    },
    {
      symbol: 'USDC',
      address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      decimals: 6,
      name: 'USD Coin',
      icon: 'https://assets.coingecko.com/coins/images/6319/standard/USD_Coin_icon.png'
    }
  ],
  'near': [
    {
      symbol: 'NEAR',
      address: 'wrap.near',
      decimals: 24,
      name: 'NEAR Protocol',
      icon: 'https://assets.coingecko.com/coins/images/10365/standard/near.jpg'
    },
  ]
}

//Set up the Wagmi Adapter (Config)
export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({
    storage: cookieStorage
  }),
  ssr: true,
  projectId,
  networks
})

export const config = wagmiAdapter.wagmiConfig