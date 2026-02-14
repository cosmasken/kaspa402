#!/bin/bash

# Show all wallet addresses for balance tracking

echo ""
echo "======================================================================"
echo "Agent Wallet Addresses"
echo "======================================================================"
echo ""

show_wallet() {
    local name=$1
    local path=$2
    
    if [ -f "$path" ]; then
        local address=$(jq -r '.address' "$path" 2>/dev/null)
        if [ -n "$address" ] && [ "$address" != "null" ]; then
            echo "  $name:"
            echo "    $address"
            echo "    🔍 https://explorer-tn10.kaspa.org/addresses/$address?page=1"
            echo ""
        fi
    fi
}

echo "Orchestrator (Buyer):"
show_wallet "Orchestrator" "./wallets/orchestrator.json"

echo "Service Providers (Sellers):"
show_wallet "Data Processor" "./services/data-processor/wallets/data-processor.json"
show_wallet "Validator" "./services/validator/wallets/validator.json"
show_wallet "Storage" "./services/storage/wallets/storage.json"
show_wallet "Analyzer" "./services/analyzer/wallets/analyzer.json"

echo "======================================================================"
echo ""
echo "💡 Track balances on Kaspa Explorer:"
echo "   https://explorer-tn10.kaspa.org/"
echo ""
echo "📊 Check service registry:"
echo "   curl http://localhost:5000/registry/services | jq '.services[] | {name, walletAddress, metrics}'"
echo ""
echo "======================================================================"
echo ""
