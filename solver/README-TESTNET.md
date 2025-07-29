# CrossFusion Solver - Testnet Integration Guide

This guide covers the setup and usage of the CrossFusion Solver with **Base Sepolia** and **NEAR testnet** for cross-chain atomic swaps.

## 🌐 Supported Networks

- **EVM**: Base Sepolia (Chain ID: 84532)
- **NEAR**: NEAR Protocol Testnet

## 🚀 Quick Start

### 1. Environment Setup

```bash
# Copy the testnet configuration
cp config.testnet.txt .env

# Edit .env with your actual values
nano .env
```

### 2. Required Configuration

Update the following values in your `.env` file:

```bash
# NEAR Testnet
NEAR_ACCOUNT_ID=your-solver.testnet
NEAR_PRIVATE_KEY=your-near-private-key
NEAR_ESCROW_FACTORY=your-deployed-factory.testnet

# Base Sepolia
BASE_SEPOLIA_ESCROW_FACTORY=0xYourDeployedFactoryAddress

# Your private key for EVM transactions
EVM_PRIVATE_KEY=your-evm-private-key

# Optional: API keys for enhanced functionality
COINGECKO_API_KEY=your-api-key
PHALA_CLOUD_API_KEY=your-tee-api-key
```

### 3. Install and Run

```bash
npm install
npm run build
npm start
```

## 🧪 Testing the Integration

Run the integration test script:

```bash
node test-integration.js
```

This will test all endpoints and verify the solver is properly configured.

## 📡 API Endpoints

### Health and Status

- `GET /health` - Service health check
- `GET /state` - Current solver state
- `GET /metrics` - Performance metrics
- `GET /logs?limit=100` - Recent logs

### Swap Operations

- `POST /quote` - Get swap quote
- `POST /swaps` - Create new swap
- `GET /swaps` - List all swaps
- `GET /swaps/:id` - Get specific swap
- `POST /swaps/:id/first-leg` - Execute first leg
- `POST /swaps/:id/second-leg` - Execute second leg
- `POST /swaps/:id/complete` - Complete swap
- `POST /swaps/:id/cancel` - Cancel swap

### Token Information

- `GET /chains/:chainId/tokens` - Get supported tokens

## 🔄 Swap Flow Example

### 1. Get Quote

```bash
curl -X POST http://localhost:3000/quote \
  -H "Content-Type: application/json" \
  -d '{
    "sourceChain": "near",
    "destinationChain": "base-sepolia",
    "sourceToken": "wrap.near",
    "destinationToken": "0x0000000000000000000000000000000000000000",
    "amount": "1000000000000000000000000"
  }'
```

### 2. Create Swap

```bash
curl -X POST http://localhost:3000/swaps \
  -H "Content-Type: application/json" \
  -d '{
    "sourceChain": "near",
    "destinationChain": "base-sepolia",
    "sourceToken": "wrap.near",
    "destinationToken": "0x0000000000000000000000000000000000000000",
    "amount": "1000000000000000000000000",
    "destinationAmount": "0.1",
    "userAddress": "user.testnet",
    "recipientAddress": "0xUserEthAddress"
  }'
```

### 3. Execute Swap

```bash
# Execute first leg
curl -X POST http://localhost:3000/swaps/{swapId}/first-leg

# Execute second leg
curl -X POST http://localhost:3000/swaps/{swapId}/second-leg

# Complete swap with secret
curl -X POST http://localhost:3000/swaps/{swapId}/complete \
  -H "Content-Type: application/json" \
  -d '{"secret": "your-secret-here"}'
```

## 🔧 Contract Deployment

### NEAR Contracts

1. Build contracts:

```bash
cd ../near
./build.sh
```

2. Deploy factory:

```bash
cd scripts
./deploy.sh -f your-factory.testnet -t your-treasury.testnet
```

### EVM Contracts (Base Sepolia)

1. Configure Hardhat for Base Sepolia:

```bash
cd ../evm
# Update hardhat.config.ts with Base Sepolia network
```

2. Deploy contracts:

```bash
npx hardhat deploy --network base-sepolia
```

## 🛠️ Development

### Adding New Endpoints

Add custom endpoints in `src/index.ts`:

```typescript
app.get("/custom-endpoint", (req, res) => {
  // Your logic here
  res.json({ success: true, data: "Custom response" });
});
```

### Monitoring and Debugging

- Set `LOG_LEVEL=debug` for detailed logs
- Use `/health` endpoint for service monitoring
- Check `/metrics` for performance data
- View `/logs` for recent activity

## 🔐 Security Considerations

### Testnet Safety

- Use only testnet tokens and accounts
- Never use mainnet private keys
- Implement proper key management for production

### Production Readiness

- Use environment-specific configurations
- Implement proper error handling
- Add rate limiting and authentication
- Use secure key storage (AWS Secrets Manager, etc.)

## 🐛 Troubleshooting

### Common Issues

1. **Health check fails**

   - Verify RPC URLs are accessible
   - Check private keys are correctly formatted
   - Ensure accounts exist and have sufficient balance

2. **Contract calls fail**

   - Verify contract addresses are correct
   - Check if contracts are deployed
   - Ensure account has necessary permissions

3. **NEAR connection issues**

   - Verify NEAR account ID exists
   - Check private key format (should include `ed25519:` prefix)
   - Ensure testnet RPC is accessible

4. **EVM connection issues**
   - Verify Base Sepolia RPC URL
   - Check EVM private key format
   - Ensure wallet has ETH for gas fees

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug npm start
```

## 📚 Resources

- [Base Sepolia Testnet](https://docs.base.org/network-information)
- [NEAR Testnet](https://docs.near.org/concepts/basics/networks)
- [CrossFusion Documentation](../README.md)

## 🤝 Support

For issues and questions:

1. Check the logs: `GET /logs`
2. Verify health: `GET /health`
3. Run integration tests: `node test-integration.js`
4. Review this documentation

---

**Ready to swap! 🌉** Your CrossFusion Solver is now configured for testnet cross-chain atomic swaps between Base Sepolia and NEAR.
