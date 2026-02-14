#!/bin/bash

# Helper script to display wallet address and funding instructions

echo ""
echo "======================================================================"
echo "Fund Orchestrator Wallet"
echo "======================================================================"
echo ""

WALLET_FILE="./wallets/orchestrator.json"

if [ ! -f "$WALLET_FILE" ]; then
    echo "⚠️  Wallet not found. Run 'pnpm start' first to generate a wallet."
    echo ""
    exit 1
fi

# Extract address from wallet file
ADDRESS=$(jq -r '.address' "$WALLET_FILE" 2>/dev/null)

if [ -z "$ADDRESS" ] || [ "$ADDRESS" = "null" ]; then
    echo "⚠️  Could not read wallet address from $WALLET_FILE"
    echo ""
    exit 1
fi

echo "📍 Your Orchestrator Wallet Address:"
echo "   $ADDRESS"
echo ""
echo "💵 Recommended Amount: 100 KAS"
echo "   (Covers demo execution + buffer)"
echo ""
echo "🌐 Get Testnet Funds:"
echo "   https://faucet.kaspanet.io/"
echo ""
echo "📋 Steps:"
echo "   1. Copy the address above"
echo "   2. Visit the faucet URL"
echo "   3. Paste your address"
echo "   4. Request funds"
echo "   5. Wait ~2 seconds for confirmation"
echo "   6. Run 'pnpm start' to execute the demo"
echo ""
echo "======================================================================"
echo ""
