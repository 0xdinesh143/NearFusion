#!/bin/bash
set -e

echo "🔨 Building NEAR contracts..."

# Create target directory if it doesn't exist
mkdir -p target/near

# Build all contracts using cargo near with automatic selection
echo "Building escrow-factory..."
cd contracts/escrow-factory
cargo near build non-reproducible-wasm --locked
if [ -d "../../target/near/escrow_factory" ]; then
    cp ../../target/near/escrow_factory/escrow_factory.wasm ../../target/near/
fi
cd ../..

echo "Building escrow-src..."
cd contracts/escrow-src
cargo near build non-reproducible-wasm --locked
if [ -d "../../target/near/escrow_src" ]; then
    cp ../../target/near/escrow_src/escrow_src.wasm ../../target/near/
fi
cd ../..

echo "Building escrow-dst..."
cd contracts/escrow-dst
cargo near build non-reproducible-wasm --locked
if [ -d "../../target/near/escrow_dst" ]; then
    cp ../../target/near/escrow_dst/escrow_dst.wasm ../../target/near/
fi
cd ../..

echo "✅ All contracts built successfully!"
echo "📁 WASM files are in target/near/"
ls -la target/near/*.wasm 2>/dev/null || echo "No WASM files found in target/near/" 