#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
NETWORK="testnet"
FACTORY_ACCOUNT="crossfusion-factory.testnet"
TEST_ACCOUNT_PREFIX="test-escrow"
ORDER_HASH="0x$(openssl rand -hex 32)"
SECRET="test_secret_$(date +%s)"

# Help function
show_help() {
    echo -e "${BLUE}CrossFusion Escrow Creation Test Script${NC}"
    echo ""
    echo "This script tests the new unified escrow creation process."
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -f, --factory ACCOUNT     Factory account ID (required)"
    echo "  -n, --network NETWORK     Network (testnet/mainnet, default: testnet)"
    echo "  -h, --help               Show this help"
    echo ""
    echo "Example:"
    echo "  $0 -f crossfusion-factory.testnet"
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

if [ -z "$FACTORY_ACCOUNT" ]; then
    echo -e "${RED}❌ Factory account is required${NC}"
    show_help
    exit 1
fi

echo -e "${GREEN}🧪 Testing Escrow Creation${NC}"
echo -e "${YELLOW}Factory: $FACTORY_ACCOUNT${NC}"
echo -e "${YELLOW}Network: $NETWORK${NC}"
echo -e "${YELLOW}Order Hash: $ORDER_HASH${NC}"
echo ""

# Create test accounts
TEST_SRC_ACCOUNT="${TEST_ACCOUNT_PREFIX}-src-$(date +%s).testnet"
TEST_DST_ACCOUNT="${TEST_ACCOUNT_PREFIX}-dst-$(date +%s).testnet"

echo -e "${GREEN}👤 Creating test escrow accounts...${NC}"

# For testing, we'll use the initialize_escrow method instead of create_account
# This assumes you have pre-deployed escrow accounts or will create them

# Generate hashlock from secret
HASHLOCK=$(echo -n "$SECRET" | sha256sum | cut -d' ' -f1)

# Test source escrow creation
echo -e "${GREEN}🔄 Testing Source Escrow Creation...${NC}"

SRC_IMMUTABLES=$(cat << EOF
{
  "order_hash": "$ORDER_HASH",
  "hashlock": "$HASHLOCK",
  "maker": "alice.testnet",
  "taker": "bob.testnet", 
  "token": null,
  "amount": "1000000000000000000000000",
  "safety_deposit": "100000000000000000000000",
  "timelocks": {
    "deployed_at": 0,
    "withdrawal_period": 3600,
    "cancellation_period": 7200,
    "rescue_delay": 86400
  }
}
EOF
)

echo -e "${BLUE}📝 Source escrow immutables:${NC}"
echo "$SRC_IMMUTABLES" | jq '.'

# For demo, we'll show the call that would be made
echo -e "${YELLOW}📞 Source escrow creation call:${NC}"
echo "near contract call-function as-transaction $FACTORY_ACCOUNT create_src_escrow \\"
echo "  json-args '$SRC_IMMUTABLES' \\"
echo "  prepaid-gas 300.0Tgas \\"
echo "  attached-deposit 4 \\"  # 4 NEAR for deposit + fees
echo "  network-config $NETWORK \\"
echo "  sign-with-keychain \\"
echo "  send"

echo ""

# Test destination escrow creation  
echo -e "${GREEN}🔄 Testing Destination Escrow Creation...${NC}"

DST_ORDER_HASH="0x$(openssl rand -hex 32)"
DST_IMMUTABLES=$(cat << EOF
{
  "order_hash": "$DST_ORDER_HASH",
  "hashlock": "$HASHLOCK", 
  "maker": "charlie.testnet",
  "taker": "diana.testnet",
  "token": null,
  "amount": "2000000000000000000000000",
  "safety_deposit": "200000000000000000000000", 
  "timelocks": {
    "deployed_at": 0,
    "withdrawal_period": 3600,
    "cancellation_period": 7200,
    "rescue_delay": 86400
  }
}
EOF
)

echo -e "${BLUE}📝 Destination escrow immutables:${NC}"
echo "$DST_IMMUTABLES" | jq '.'

echo -e "${YELLOW}📞 Destination escrow creation call:${NC}"
echo "near contract call-function as-transaction $FACTORY_ACCOUNT create_dst_escrow \\"
echo "  json-args '$DST_IMMUTABLES' \\"
echo "  prepaid-gas 300.0Tgas \\"
echo "  attached-deposit 5.3 \\"  # 5.3 NEAR for deposit + fees
echo "  network-config $NETWORK \\"
echo "  sign-with-keychain \\"
echo "  send"

echo ""
echo -e "${GREEN}✅ Test commands generated!${NC}"
echo -e "${YELLOW}💡 To run these tests:${NC}"
echo "1. Run the source escrow creation command above"
echo "2. Run the destination escrow creation command above"
echo "3. Check the created escrows:"
echo "   near contract call-function as-read-only $FACTORY_ACCOUNT get_escrow_for_order json-args '{\"order_hash\": \"$ORDER_HASH\"}' network-config $NETWORK"
echo ""
echo -e "${BLUE}🔍 Remember: The secret for testing is: $SECRET${NC}"
echo -e "${BLUE}🔍 The hashlock is: $HASHLOCK${NC}"