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
MAKER_ACCOUNT=""
TAKER_ACCOUNT=""
AMOUNT="1000000000000000000000000" # 1 NEAR

# Help function
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -f, --factory ACCOUNT     Factory account ID (required)"
    echo "  -m, --maker ACCOUNT       Maker account ID (required)"
    echo "  -t, --taker ACCOUNT       Taker account ID (required)"
    echo "  -a, --amount AMOUNT       Amount in yoctoNEAR (default: 1 NEAR)"
    echo "  -n, --network NETWORK     Network (testnet/mainnet, default: testnet)"
    echo "  -h, --help               Show this help"
    echo ""
    echo "Example:"
    echo "  $0 -f factory.testnet -m maker.testnet -t taker.testnet"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--factory)
            FACTORY_ACCOUNT="$2"
            shift 2
            ;;
        -m|--maker)
            MAKER_ACCOUNT="$2"
            shift 2
            ;;
        -t|--taker)
            TAKER_ACCOUNT="$2"
            shift 2
            ;;
        -a|--amount)
            AMOUNT="$2"
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

# Validate required parameters
if [ -z "$FACTORY_ACCOUNT" ] || [ -z "$MAKER_ACCOUNT" ] || [ -z "$TAKER_ACCOUNT" ]; then
    echo -e "${RED}Error: Factory, maker, and taker accounts are required${NC}"
    show_help
    exit 1
fi

echo -e "${GREEN}🧪 Testing NEAR Escrow System${NC}"
echo -e "${YELLOW}Factory: $FACTORY_ACCOUNT${NC}"
echo -e "${YELLOW}Maker: $MAKER_ACCOUNT${NC}"
echo -e "${YELLOW}Taker: $TAKER_ACCOUNT${NC}"
echo -e "${YELLOW}Amount: $AMOUNT yoctoNEAR${NC}"
echo ""

# Generate test data
SECRET=$(openssl rand -hex 16)
HASHLOCK=$(echo -n "$SECRET" | openssl dgst -sha256 -hex | cut -d' ' -f2)
ORDER_HASH=$(openssl rand -hex 16)

echo -e "${GREEN}🔐 Generated test data:${NC}"
echo "Secret: $SECRET"
echo "Hashlock: $HASHLOCK"
echo "Order Hash: $ORDER_HASH"
echo ""

# Create source escrow (for EVM→NEAR swap test)
echo -e "${GREEN}📦 Creating source escrow...${NC}"
IMMUTABLES='{
    "order_hash": "'$ORDER_HASH'",
    "hashlock": "'$HASHLOCK'",
    "maker": "'$MAKER_ACCOUNT'",
    "taker": "'$TAKER_ACCOUNT'",
    "token": null,
    "amount": "'$AMOUNT'",
    "safety_deposit": "100000000000000000000000",
    "timelocks": {
        "deployed_at": 0,
        "withdrawal_period": 3600,
        "cancellation_period": 7200,
        "rescue_delay": 86400
    }
}'

# Calculate required deposit (amount + safety_deposit + creation_fee)
REQUIRED_DEPOSIT="1200000000000000000000000" # 1.2 NEAR

near contract call-function as-transaction $FACTORY_ACCOUNT create_src_escrow \
    json-args '{"immutables": '$IMMUTABLES'}' \
    prepaid-gas 300.0Tgas \
    attached-deposit $REQUIRED_DEPOSIT \
    sign-as $MAKER_ACCOUNT \
    network-config $NETWORK \
    sign-with-keychain \
    send

echo ""
echo -e "${GREEN}🔍 Getting escrow address...${NC}"
ESCROW_ACCOUNT=$(near contract call-function as-read-only $FACTORY_ACCOUNT get_escrow_for_order \
    json-args '{"order_hash": "'$ORDER_HASH'"}' \
    network-config $NETWORK \
    now | grep -o '"[^"]*"' | tr -d '"')

if [ -n "$ESCROW_ACCOUNT" ]; then
    echo "Escrow created at: $ESCROW_ACCOUNT"
    
    echo ""
    echo -e "${GREEN}💰 Testing withdrawal with secret...${NC}"
    near contract call-function as-transaction $ESCROW_ACCOUNT withdraw \
        json-args '{"secret": "'$SECRET'"}' \
        prepaid-gas 100.0Tgas \
        attached-deposit 0 \
        sign-as $MAKER_ACCOUNT \
        network-config $NETWORK \
        sign-with-keychain \
        send
    
    echo ""
    echo -e "${GREEN}🔍 Checking escrow state...${NC}"
    near contract call-function as-read-only $ESCROW_ACCOUNT get_state \
        json-args '{}' \
        network-config $NETWORK \
        now
    
    echo ""
    echo -e "${GREEN}🔐 Checking revealed secret...${NC}"
    near contract call-function as-read-only $ESCROW_ACCOUNT get_revealed_secret \
        json-args '{}' \
        network-config $NETWORK \
        now
        
else
    echo -e "${RED}❌ Failed to create escrow${NC}"
fi

echo ""
echo -e "${GREEN}✅ Test completed!${NC}" 