#!/bin/bash
set -e

echo "🔨 Building NEAR contracts..."

# Create target directory if it doesn't exist
mkdir -p target/near

# Build unified escrow contract
echo "Building unified escrow contract..."
cd contracts/escrow
cargo near build non-reproducible-wasm --locked
if [ -d "../../target/near/escrow" ]; then
    cp ../../target/near/escrow/escrow.wasm ../../target/near/
fi
cd ../..

# Build factory contract
echo "Building factory contract..."
cd contracts/factory
cargo near build non-reproducible-wasm --locked
if [ -d "../../target/near/factory" ]; then
    cp ../../target/near/factory/factory.wasm ../../target/near/
fi
cd ../..

echo "✅ All contracts built successfully!"
echo "📁 WASM files are in target/near/"
ls -la target/near/*.wasm 2>/dev/null || echo "No WASM files found in target/near/"

echo ""
echo "📋 Contract Summary:"
echo "  • escrow.wasm    - Unified escrow contract (handles both source & destination)"
echo "  • factory.wasm   - Factory contract for creating escrows" 