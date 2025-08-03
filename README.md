# NearFusion 🌉

**Cross-chain atomic swaps between Ethereum/EVM chains and NEAR Protocol**

Swap ETH seamlessly between Ethereum and NEAR - no bridges, no trust required.

## What This Does

Ever wanted to swap your ETH for NEAR tokens without using a centralized exchange or risky bridge? That's exactly what NearFusion does. It's like having a trustless exchange that works across completely different blockchains.

The magic happens through atomic swaps - either both people get their tokens, or both get refunded. No one can run away with your money.

## How It Works

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌───────────────┐
│   Frontend  │◄──►│   Solver    │◄──►│EVM Contracts│    │ NEAR Contracts│
│  (Next.js)  │    │ (TEE Agent) │    │  (Solidity) │    │   (Rust)      │
└─────────────┘    └─────────────┘    └─────────────┘    └───────────────┘
```

1. **Frontend** - Beautiful swap interface where users connect their wallets
2. **Solver** - Backend service that coordinates swaps and provides quotes
3. **Smart Contracts** - Handle the actual token locks and releases on each chain

### The Secret Sauce: Hash Time Locked Contracts (HTLCs)

Think of it like a digital escrow that works with math instead of lawyers:

- Alice wants to trade 1 ETH for 25 NEAR with Bob
- Both lock their tokens in smart contracts with the same secret hash
- When Alice reveals the secret to claim her NEAR, Bob can use that same secret to claim the ETH
- If no one reveals the secret in time, both get refunded automatically

## Project Structure

```
├── frontend/     # Next.js app with wallet connections
├── solver/       # Node.js backend with TEE security
├── evm/          # Solidity contracts for Ethereum/Polygon/BSC/Arbitrum
└── near/         # Rust contracts for NEAR Protocol
```

## Technology Choices & Why

**Frontend: Next.js + TypeScript**

- Need wallet connections for multiple chains (Wagmi for EVM, NEAR Wallet Selector)
- TypeScript prevents the stupid bugs that waste hours
- Tailwind makes it actually look good without fighting CSS

**Solver: Near Shade Agent + TEE (Trusted Execution Environment)**

- Coordinates swaps across different blockchains
- TEE ensures the solver can't cheat or see your secrets
- REST API makes it easy for frontends to integrate

**Smart Contracts: Solidity + Rust**

- Solidity for EVM chains (Ethereum, Polygon, BSC, Arbitrum)
- Rust for NEAR (because that's what NEAR uses)
- HTLCs are the same concept, just different languages

## Quick Start

Want to see it in action?

```bash
# Start the frontend
cd frontend && npm install && npm run dev

# Start the solver (in another terminal)
cd solver && npm install && npm run dev
```

Visit `http://localhost:3000` and try swapping some tokens!

## Why Build This?

Current cross-chain solutions suck:

- **Bridges** get hacked and lose $100M+ regularly
- **Centralized exchanges** require KYC and can freeze your funds
- **Existing DEXs** only work within one ecosystem

Atomic swaps solve this by removing trust entirely. No bridges to hack, no funds to freeze, no single points of failure.

## Current Status

🚧 **Hackathon MVP** - Built for 1inch & ETHGlobal Unite DeFi hackathon

- ✅ Working HTLC contracts on EVM and NEAR
- ✅ Beautiful frontend with wallet connections
- ✅ TEE-secured solver backend
- ✅ End-to-end swap demo
- 🔄 Integrating with real liquidity sources
- 🔄 Production security audits


