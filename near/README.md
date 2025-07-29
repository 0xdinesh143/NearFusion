# 🌉 EVM ↔ NEAR Atomic Swap Contracts

NEAR Protocol smart contracts for trustless cross-chain atomic swaps between EVM chains and NEAR.

## 🏗️ Architecture

This system implements **Hash Time Locked Contracts (HTLCs)** on NEAR to enable atomic swaps:

- **EscrowFactory**: Creates escrow contracts for cross-chain swaps
- **EscrowSrc**: Source escrow for EVM→NEAR swaps  
- **EscrowDst**: Destination escrow for NEAR→EVM swaps
- **Atomic Guarantee**: Either both parties get their desired assets, or both get refunded

## 🔄 Supported Swap Directions

1. **EVM → NEAR**: Trade ETH/ERC20 tokens for NEAR/NEP141 tokens
2. **NEAR → EVM**: Trade NEAR/NEP141 tokens for ETH/ERC20 tokens

## 🚀 Quick Start

### Prerequisites
```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# Install NEAR CLI
npm install -g near-cli-rs@latest
```

### Build Contracts
```bash
cargo near build
```

### Deploy Contracts
```bash
# Deploy to testnet
near contract deploy <account-id> use-file target/near/escrow_factory.wasm without-init-call network-config testnet sign-with-keychain send
```

## 💱 Contract Interfaces

### EscrowFactory
- `create_src_escrow`: Creates source escrow for EVM→NEAR swaps
- `create_dst_escrow`: Creates destination escrow for NEAR→EVM swaps

### Escrow Contracts
- `withdraw`: Withdraw funds with secret (reveals hashlock)
- `cancel`: Cancel escrow and refund (after timelock)
- `rescue_funds`: Emergency fund recovery

## 🔐 Cryptographic Flow

Uses SHA-256 hashlocks compatible with EVM contracts:
```rust
use sha2::{Sha256, Digest};

fn create_hashlock(secret: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(secret.as_bytes());
    hex::encode(hasher.finalize())
}
```

## 🛡️ Security Features

- **Hash Time Locked Contracts**: SHA-256 ensures atomic execution
- **Timelock Safety**: Automatic refunds prevent fund loss  
- **Storage Management**: Proper NEAR storage deposit handling
- **Cross-Contract Safety**: Secure Promise-based async calls

## 🔧 Development

### Run Tests
```bash
cargo test
```

### Format Code  
```bash
cargo fmt
```

### Lint Code
```bash
cargo clippy
``` 