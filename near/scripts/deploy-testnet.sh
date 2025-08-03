#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values for CrossFusion testnet deployment
NETWORK="testnet"
FACTORY_ACCOUNT="crossfusion-factory.testnet"
ESCROW_TEMPLATE_ACCOUNT="crossfusion-escrow-template.testnet"
SOLVER_ACCOUNT="crossfusion-solver.testnet"
CREATION_FEE="100000000000000000000000" # 0.1 NEAR
TREASURY=""

# Help function
show_help() {
    echo -e "${BLUE}CrossFusion NEAR Contract Deployment Script (Unified)${NC}"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -f, --factory ACCOUNT     Factory account ID (default: crossfusion-factory.testnet)"
    echo "  -e, --escrow ACCOUNT      Escrow template account ID (default: crossfusion-escrow-template.testnet)"
    echo "  -s, --solver ACCOUNT      Solver account ID (default: crossfusion-solver.testnet)"  
    echo "  -c, --creation-fee FEE    Creation fee in yoctoNEAR (default: 0.1 NEAR)"
    echo "  -t, --treasury ACCOUNT    Treasury account for fees (optional)"
    echo "  -h, --help               Show this help"
    echo ""
    echo "Example:"
    echo "  $0 -f my-factory.testnet -e my-escrow-template.testnet -s my-solver.testnet -t my-treasury.testnet"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--factory)
            FACTORY_ACCOUNT="$2"
            shift 2
            ;;
        -e|--escrow)
            ESCROW_TEMPLATE_ACCOUNT="$2"
            shift 2
            ;;
        -s|--solver)
            SOLVER_ACCOUNT="$2"
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

echo -e "${GREEN}🚀 Deploying CrossFusion NEAR Contracts (Unified Architecture)${NC}"
echo -e "${YELLOW}Network: $NETWORK${NC}"
echo -e "${YELLOW}Factory Account: $FACTORY_ACCOUNT${NC}"
echo -e "${YELLOW}Escrow Template: $ESCROW_TEMPLATE_ACCOUNT${NC}"
echo -e "${YELLOW}Solver Account: $SOLVER_ACCOUNT${NC}"
echo -e "${YELLOW}Creation Fee: $CREATION_FEE yoctoNEAR${NC}"
echo -e "${YELLOW}Treasury: ${TREASURY:-"None"}${NC}"
echo ""

# Check if near CLI is installed
if ! command -v near &> /dev/null; then
    echo -e "${RED}❌ NEAR CLI not found. Please install it:${NC}"
    echo "npm install -g near-cli-rs@latest"
    exit 1
fi

# Build contracts first
echo -e "${GREEN}🔨 Building contracts...${NC}"
./build.sh

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Contract build failed${NC}"
    exit 1
fi

# Check if factory account exists, if not, create it
echo -e "${GREEN}👤 Checking factory account...${NC}"
if ! near account view-account-summary $FACTORY_ACCOUNT network-config $NETWORK > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️ Factory account $FACTORY_ACCOUNT does not exist${NC}"
    echo -e "${BLUE}Please create the account first:${NC}"
    echo "near account create-account fund-myself $FACTORY_ACCOUNT '10 NEAR' autogenerate-new-keypair save-to-keychain network-config $NETWORK sign-with-keychain send"
    exit 1
fi

# Check if escrow template account exists, if not, create it
echo -e "${GREEN}👤 Checking escrow template account...${NC}"
if ! near account view-account-summary $ESCROW_TEMPLATE_ACCOUNT network-config $NETWORK > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️ Escrow template account $ESCROW_TEMPLATE_ACCOUNT does not exist${NC}"
    echo -e "${BLUE}Please create the account first:${NC}"
    echo "near account create-account fund-myself $ESCROW_TEMPLATE_ACCOUNT '5 NEAR' autogenerate-new-keypair save-to-keychain network-config $NETWORK sign-with-keychain send"
    exit 1
fi

# Deploy escrow template contract first
echo -e "${GREEN}📦 Deploying Escrow Template contract...${NC}"
near contract deploy $ESCROW_TEMPLATE_ACCOUNT \
    use-file target/near/escrow.wasm \
    without-init-call \
    network-config $NETWORK \
    sign-with-keychain \
    send

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Escrow template deployment failed${NC}"
    exit 1
fi

# Deploy factory contract
echo -e "${GREEN}📦 Deploying Factory contract...${NC}"
if [ -n "$TREASURY" ]; then
    INIT_ARGS='{"owner": "'$FACTORY_ACCOUNT'", "creation_fee": "'$CREATION_FEE'", "treasury": "'$TREASURY'", "escrow_template": "'$ESCROW_TEMPLATE_ACCOUNT'"}'
else
    INIT_ARGS='{"owner": "'$FACTORY_ACCOUNT'", "creation_fee": "'$CREATION_FEE'", "treasury": null, "escrow_template": "'$ESCROW_TEMPLATE_ACCOUNT'"}'
fi

near contract deploy $FACTORY_ACCOUNT \
    use-file target/near/factory.wasm \
    with-init-call new json-args "$INIT_ARGS" \
    prepaid-gas 100.0Tgas \
    attached-deposit 0 \
    network-config $NETWORK \
    sign-with-keychain \
    send

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Factory deployment failed${NC}"
    exit 1
fi

# Test factory contract
echo -e "${GREEN}🧪 Testing factory contract...${NC}"
near contract call-function as-read-only $FACTORY_ACCOUNT get_owner \
    json-args '{}' \
    network-config $NETWORK

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Factory contract is working correctly${NC}"
else
    echo -e "${YELLOW}⚠️ Factory contract test failed, but deployment might still be successful${NC}"
fi

# Test escrow template reference
echo -e "${GREEN}🧪 Testing escrow template reference...${NC}"
near contract call-function as-read-only $FACTORY_ACCOUNT get_escrow_template \
    json-args '{}' \
    network-config $NETWORK

# Save deployment information
DEPLOYMENT_INFO=$(cat << EOF
{
  "network": "$NETWORK",
  "factory_account": "$FACTORY_ACCOUNT",
  "escrow_template_account": "$ESCROW_TEMPLATE_ACCOUNT",
  "solver_account": "$SOLVER_ACCOUNT", 
  "creation_fee": "$CREATION_FEE",
  "treasury": "${TREASURY:-null}",
  "deployment_time": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "contracts": {
    "factory": {
      "account_id": "$FACTORY_ACCOUNT",
      "wasm_file": "target/near/factory.wasm"
    },
    "escrow_template": {
      "account_id": "$ESCROW_TEMPLATE_ACCOUNT", 
      "wasm_file": "target/near/escrow.wasm"
    }
  },
  "architecture": "unified"
}
EOF
)

# Create deployments directory if it doesn't exist
mkdir -p deployments

# Save deployment info
DEPLOYMENT_FILE="deployments/near-testnet-$(date +%Y%m%d-%H%M%S).json"
echo "$DEPLOYMENT_INFO" > "$DEPLOYMENT_FILE"

echo ""
echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo -e "${GREEN}Factory contract deployed to: $FACTORY_ACCOUNT${NC}"
echo -e "${GREEN}Escrow template deployed to: $ESCROW_TEMPLATE_ACCOUNT${NC}"
echo -e "${GREEN}Deployment info saved to: $DEPLOYMENT_FILE${NC}"
echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo "1. Update solver configuration:"
echo -e "   ${BLUE}NEAR_ESCROW_FACTORY=$FACTORY_ACCOUNT${NC}"
echo -e "   ${BLUE}NEAR_ESCROW_TEMPLATE=$ESCROW_TEMPLATE_ACCOUNT${NC}"
echo "2. Fund the solver account with NEAR tokens"
echo "3. Test escrow creation:"
echo -e "   ${BLUE}./scripts/test-escrow-creation.sh${NC}"
echo "4. Update EVM contracts with NEAR factory address"
echo ""
echo -e "${BLUE}🔗 Factory Explorer: https://explorer.testnet.near.org/accounts/$FACTORY_ACCOUNT${NC}"
echo -e "${BLUE}🔗 Template Explorer: https://explorer.testnet.near.org/accounts/$ESCROW_TEMPLATE_ACCOUNT${NC}"
echo -e "${BLUE}📋 View factory: near contract call-function as-read-only $FACTORY_ACCOUNT get_owner json-args '{}' network-config testnet${NC}"

echo ""
echo -e "${GREEN}🌉 CrossFusion NEAR contracts are ready for cross-chain swaps!${NC}"
echo ""
echo -e "${YELLOW}🛠️ Configuration Status:${NC}"
echo "✅ Factory deployed and initialized"
echo "✅ Escrow template deployed"  
echo "✅ Template reference set in factory"
echo "🔄 Ready to create escrows via initialize_escrow() method"