#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
NETWORK="testnet"
FACTORY_ACCOUNT=""
CREATION_FEE="100000000000000000000000" # 0.1 NEAR
TREASURY=""

# Help function
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -f, --factory ACCOUNT     Factory account ID (required)"
    echo "  -n, --network NETWORK     Network (testnet/mainnet, default: testnet)"
    echo "  -c, --creation-fee FEE    Creation fee in yoctoNEAR (default: 0.1 NEAR)"
    echo "  -t, --treasury ACCOUNT    Treasury account for fees (optional)"
    echo "  -h, --help               Show this help"
    echo ""
    echo "Example:"
    echo "  $0 -f my-factory.testnet -t my-treasury.testnet"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--factory)
            FACTORY_ACCOUNT="$2"
            shift 2
            ;;
        -n|--network)
            NETWORK="$2"
            shift 2
            ;;
        -c|--creation-fee)
            CREATION_FEE="$2"
            shift 2
            ;;
        -t|--treasury)
            TREASURY="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate required parameters
if [ -z "$FACTORY_ACCOUNT" ]; then
    echo -e "${RED}Error: Factory account is required${NC}"
    show_help
    exit 1
fi

echo -e "${GREEN}🚀 Deploying NEAR Escrow Contracts${NC}"
echo -e "${YELLOW}Network: $NETWORK${NC}"
echo -e "${YELLOW}Factory Account: $FACTORY_ACCOUNT${NC}"
echo -e "${YELLOW}Creation Fee: $CREATION_FEE yoctoNEAR${NC}"
echo -e "${YELLOW}Treasury: ${TREASURY:-"None"}${NC}"
echo ""

# Build contracts first
echo -e "${GREEN}🔨 Building contracts...${NC}"
./build.sh

# Deploy factory contract
echo -e "${GREEN}📦 Deploying EscrowFactory contract...${NC}"
if [ -n "$TREASURY" ]; then
    INIT_ARGS='{"owner": "'$FACTORY_ACCOUNT'", "creation_fee": "'$CREATION_FEE'", "treasury": "'$TREASURY'"}'
else
    INIT_ARGS='{"owner": "'$FACTORY_ACCOUNT'", "creation_fee": "'$CREATION_FEE'", "treasury": null}'
fi

near contract deploy $FACTORY_ACCOUNT \
    use-file target/near/escrow_factory.wasm \
    with-init-call new json-args "$INIT_ARGS" \
    prepaid-gas 100.0Tgas \
    attached-deposit 0 \
    network-config $NETWORK \
    sign-with-keychain \
    send

# Update escrow WASM codes in factory
echo -e "${GREEN}📝 Updating escrow WASM codes in factory...${NC}"

# Convert WASM files to base64
SRC_CODE=$(base64 -i target/near/escrow_src.wasm | tr -d '\n')
DST_CODE=$(base64 -i target/near/escrow_dst.wasm | tr -d '\n')

# Note: This would require a more complex setup to upload large WASM files
# For now, we'll note this step for manual completion
echo -e "${YELLOW}⚠️  Note: You'll need to manually update escrow WASM codes using:${NC}"
echo "near contract call-function as-transaction $FACTORY_ACCOUNT update_escrow_code"
echo "  json-args '{\"src_code\": [binary_data], \"dst_code\": [binary_data]}'"
echo "  prepaid-gas 300.0Tgas network-config $NETWORK sign-with-keychain send"

echo ""
echo -e "${GREEN}✅ Deployment completed!${NC}"
echo -e "${GREEN}Factory contract deployed to: $FACTORY_ACCOUNT${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Update escrow WASM codes in the factory contract"
echo "2. Test escrow creation with your scripts"
echo "3. Set up your EVM contracts to work with this NEAR factory" 