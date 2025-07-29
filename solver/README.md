# NearFusion Shade Agent Solver

A decentralized backend service for cross-chain atomic swaps using NEAR's Shade Agent Framework and Trusted Execution Environment (TEE). This solver provides REST API endpoints for frontend applications to initiate and manage cross-chain swaps between EVM chains (Ethereum, Polygon, BSC, Arbitrum) and NEAR Protocol.

## 🔧 Architecture

The solver is built with a modular architecture inspired by atomic swap protocols, providing a secure and verifiable backend service for cross-chain operations.

### Key Components

- 🔍 **Quote Service** - Calculates swap quotes and exchange rates using multiple price feeds
- ⚡ **Swap Service** - Handles user-initiated atomic swaps with escrow contract management
- 🔒 **TEE Security Service** - Provides privacy and verifiability through Trusted Execution Environment
- 🌐 **EVM Escrow Service** - Manages escrow contracts on Ethereum, Polygon, BSC, and Arbitrum
- 🪐 **NEAR Escrow Service** - Manages escrow contracts on NEAR Protocol
- 📡 **REST API Server** - Provides endpoints for frontend integration

## ✨ Features

### 🔄 Cross-Chain Atomic Swaps

- **EVM ↔ NEAR**: Seamless swaps between Ethereum, Polygon, BSC, Arbitrum and NEAR
- **Hash Time Locked Contracts**: Trustless atomic execution with timelock safety
- **Multi-Chain Support**: Single backend handles multiple blockchain networks

### 📊 Quote Calculation

- **Real-time Pricing**: Integration with DefiLlama, CoinGecko, and custom price feeds
- **Fee Estimation**: Accurate gas cost and protocol fee calculations
- **Slippage Protection**: Configurable slippage tolerance and minimum received amounts

### 🔐 TEE Security & Privacy

- **Remote Attestation**: Verifiable proof of code integrity
- **Secure Key Management**: Hardware-protected private keys
- **Privacy-Preserving Computation**: Sensitive calculations protected from external access

### ⚙️ Production Ready

- **Health Monitoring**: Comprehensive health checks and metrics
- **Graceful Shutdown**: Clean termination of active swaps
- **Error Handling**: Robust error recovery and logging
- **Load Balancing**: Horizontal scaling support

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Access to EVM RPC endpoints
- NEAR account and private key
- (Optional) TEE hardware for production

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd solver

# Install dependencies
npm install

# Copy environment configuration
cp env.example .env

# Edit configuration
nano .env
```

### Configuration

Update `.env` with your configuration:

```bash
# NEAR Configuration
NEAR_NETWORK_ID=testnet
NEAR_ACCOUNT_ID=your-solver.testnet
NEAR_PRIVATE_KEY=your-near-private-key

# EVM Configuration
ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/your-api-key
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/your-api-key
BSC_RPC_URL=https://bsc-dataseed1.binance.org
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
EVM_PRIVATE_KEY=your-evm-private-key

# Contract Addresses
ETHEREUM_ESCROW_FACTORY=0x...
POLYGON_ESCROW_FACTORY=0x...
BSC_ESCROW_FACTORY=0x...
ARBITRUM_ESCROW_FACTORY=0x...
NEAR_ESCROW_FACTORY=escrow-factory.testnet

# Server Configuration
SOLVER_PORT=3000
CORS_ORIGINS=http://localhost:3000,https://your-frontend.com

# Price Feeds (Optional)
COINGECKO_API_KEY=your-coingecko-api-key

# TEE Configuration (Production)
TEE_ATTESTATION_URL=https://attestation.phala.network
PHALA_CLOUD_API_KEY=your-phala-api-key
```

### Development

```bash
# Start in development mode
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run tests
npm test

# Lint code
npm run lint
```

## 📖 API Reference

### Health Check

```bash
GET /health
```

Returns system health status and service availability.

### Solver State

```bash
GET /state
```

Returns current solver state including active swaps and balances.

### Metrics

```bash
GET /metrics
```

Returns performance metrics and statistics.

### Get Quote

```bash
POST /quote
Content-Type: application/json

{
  "sourceChain": "ethereum",
  "destinationChain": "near",
  "sourceToken": "0x0000000000000000000000000000000000000000",
  "destinationToken": "wrap.near",
  "amount": "1.0",
  "slippageTolerance": 1.0
}
```

### Create Swap

```bash
POST /swaps
Content-Type: application/json

{
  "sourceChain": "ethereum",
  "destinationChain": "near",
  "sourceToken": "0x0000000000000000000000000000000000000000",
  "destinationToken": "wrap.near",
  "amount": "1.0",
  "destinationAmount": "25.5",
  "userAddress": "0x742d35cc6434c0532925a3b8c17b3c7c1c2e7d8e",
  "recipientAddress": "user.near"
}
```

### Execute Swap Steps

```bash
# Execute first leg (create source escrow)
POST /swaps/{swapId}/first-leg

# Execute second leg (create destination escrow)
POST /swaps/{swapId}/second-leg

# Complete swap (reveal secret)
POST /swaps/{swapId}/complete
Content-Type: application/json

{
  "secret": "0x..."
}

# Cancel swap
POST /swaps/{swapId}/cancel
```

### Get Swap Information

```bash
# Get all swaps
GET /swaps

# Get specific swap
GET /swaps/{swapId}
```

### Supported Tokens

```bash
GET /chains/{chainId}/tokens
```

Returns list of supported tokens for the specified chain.

## 🔧 Development

### Project Structure

```
solver/
├── src/
│   ├── core/           # Core solver logic
│   ├── services/       # Service layer
│   ├── types/          # TypeScript definitions
│   ├── utils/          # Utility functions
│   └── index.ts        # Application entry point
├── package.json
├── tsconfig.json
├── Dockerfile
└── README.md
```

### Adding New Chains

1. Update `ChainId` type in `src/types/index.ts`
2. Add network configuration in `src/index.ts`
3. Update escrow services for the new chain
4. Add contract addresses to environment configuration

### Testing

The solver includes comprehensive tests for all components:

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test suite
npm test -- --testNamePattern="SwapService"
```

## 🔗 Integration with Existing Contracts

The solver integrates seamlessly with your existing escrow contracts:

### EVM Contracts

- **EscrowFactory**: Creates escrow contracts for cross-chain swaps
- **NearEscrowSrc**: Source escrow for EVM→NEAR swaps
- **NearEscrowDst**: Destination escrow for NEAR→EVM swaps

### NEAR Contracts

- **escrow-factory**: Creates NEAR escrow contracts
- **escrow-src**: Source escrow for NEAR→EVM swaps
- **escrow-dst**: Destination escrow for EVM→NEAR swaps

## 🔒 Security

### TEE Security

- **Code Attestation**: Verify solver code integrity via remote attestation
- **Key Protection**: Private keys secured in hardware enclaves
- **Computation Privacy**: Sensitive calculations protected from external access

### Operational Security

- **Timelock Safety**: All escrows include emergency timelock mechanisms
- **Balance Monitoring**: Continuous monitoring of solver token balances
- **Risk Limits**: Configurable limits on concurrent swaps and exposure

### Best Practices

- **Environment Isolation**: Run in production TEE environment
- **Key Rotation**: Regular rotation of API keys and credentials
- **Monitoring**: Comprehensive logging and alerting
- **Backup**: Regular backup of critical data and configurations

## 🐳 Docker Deployment

```bash
# Build Docker image
docker build -t NearFusion-solver .

# Run container
docker run -d \
  --name NearFusion-solver \
  -p 3000:3000 \
  --env-file .env \
  NearFusion-solver

# View logs
docker logs -f NearFusion-solver
```

## 🔍 Monitoring

### Logs

```bash
# View recent logs
GET /logs?limit=100

# Stream logs in real-time
tail -f logs/solver.log
```

### Metrics

The solver exposes comprehensive metrics:

- Swap success rate and volume
- Service health status
- Balance changes and utilization
- Performance metrics and timing

## 🐛 Troubleshooting

**Service Health Issues**

```bash
# Check service status
curl http://localhost:3000/health

# Check individual service health
curl http://localhost:3000/state
```

**EVM Connection Issues**

```bash
# Test Ethereum connection
curl -X POST -H "Content-Type: application/json" \
  --data '{"method":"eth_blockNumber","params":[],"id":1,"jsonrpc":"2.0"}' \
  $ETHEREUM_RPC_URL
```

**NEAR Connection Issues**

```bash
# Test NEAR account
near state $NEAR_ACCOUNT_ID --networkId $NEAR_NETWORK_ID
```

Enable debug logging:

```bash
LOG_LEVEL=debug npm run dev
```

Export logs for analysis:

```bash
curl http://localhost:3000/logs > solver-logs.json
```

## 📞 Support

For support and questions:

- 📧 Email: support@NearFusion.dev
- 💬 Discord: [NearFusion Community](https://discord.gg/NearFusion)
- 📖 Documentation: [docs.NearFusion.dev](https://docs.NearFusion.dev)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

**⚠️ Disclaimer**: This software is experimental and should be thoroughly tested before production use. Cross-chain operations involve financial risk - only use funds you can afford to lose.
