#!/bin/bash

# Start all services for the marketplace demo

set -e

echo "======================================================================"
echo "Starting AI Agent Marketplace Demo Services"
echo "======================================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "Error: pnpm is not installed"
    echo "Please install pnpm: npm install -g pnpm"
    exit 1
fi

# Build all packages
echo "${YELLOW}Building packages...${NC}"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/../../.." && pwd )"
cd "$PROJECT_ROOT"

# Install dependencies first
echo "${YELLOW}Installing dependencies...${NC}"
pnpm install
echo ""

# Build all packages
pnpm build
echo ""

# Create logs and wallets directories
mkdir -p "$PROJECT_ROOT/examples/marketplace-demo/logs"
mkdir -p "$PROJECT_ROOT/examples/marketplace-demo/wallets"
mkdir -p "$PROJECT_ROOT/examples/marketplace-demo/services/data-processor/wallets"
mkdir -p "$PROJECT_ROOT/examples/marketplace-demo/services/validator/wallets"
mkdir -p "$PROJECT_ROOT/examples/marketplace-demo/services/storage/wallets"
mkdir -p "$PROJECT_ROOT/examples/marketplace-demo/services/analyzer/wallets"
echo ""

# Start service registry
echo "${GREEN}[1/5] Starting Service Registry...${NC}"
cd "$PROJECT_ROOT/packages/service-registry"
nohup pnpm start > "$PROJECT_ROOT/examples/marketplace-demo/logs/registry.log" 2>&1 &
REGISTRY_PID=$!
echo "  Service Registry started (PID: $REGISTRY_PID)"
echo "  Logs: logs/registry.log"
sleep 3
echo ""

# Start data processor
echo "${GREEN}[2/5] Starting Data Processor Service...${NC}"
cd "$PROJECT_ROOT/examples/marketplace-demo/services/data-processor"
nohup pnpm start > "$PROJECT_ROOT/examples/marketplace-demo/logs/data-processor.log" 2>&1 &
PROCESSOR_PID=$!
echo "  Data Processor started (PID: $PROCESSOR_PID)"
echo "  Logs: logs/data-processor.log"
sleep 3
echo ""

# Start validator
echo "${GREEN}[3/5] Starting Validator Service...${NC}"
cd "$PROJECT_ROOT/examples/marketplace-demo/services/validator"
nohup pnpm start > "$PROJECT_ROOT/examples/marketplace-demo/logs/validator.log" 2>&1 &
VALIDATOR_PID=$!
echo "  Validator started (PID: $VALIDATOR_PID)"
echo "  Logs: logs/validator.log"
sleep 3
echo ""

# Start storage
echo "${GREEN}[4/5] Starting Storage Service...${NC}"
cd "$PROJECT_ROOT/examples/marketplace-demo/services/storage"
nohup pnpm start > "$PROJECT_ROOT/examples/marketplace-demo/logs/storage.log" 2>&1 &
STORAGE_PID=$!
echo "  Storage started (PID: $STORAGE_PID)"
echo "  Logs: logs/storage.log"
sleep 3
echo ""

# Start analyzer
echo "${GREEN}[5/5] Starting Analyzer Service...${NC}"
cd "$PROJECT_ROOT/examples/marketplace-demo/services/analyzer"
nohup pnpm start > "$PROJECT_ROOT/examples/marketplace-demo/logs/analyzer.log" 2>&1 &
ANALYZER_PID=$!
echo "  Analyzer started (PID: $ANALYZER_PID)"
echo "  Logs: logs/analyzer.log"
sleep 3
echo ""

# Save PIDs to file for cleanup
cd "$PROJECT_ROOT/examples/marketplace-demo"
mkdir -p logs
echo "$REGISTRY_PID" > logs/pids.txt
echo "$PROCESSOR_PID" >> logs/pids.txt
echo "$VALIDATOR_PID" >> logs/pids.txt
echo "$STORAGE_PID" >> logs/pids.txt
echo "$ANALYZER_PID" >> logs/pids.txt

echo "======================================================================"
echo "${GREEN}All services started successfully!${NC}"
echo "======================================================================"
echo ""
echo "Service Registry:    http://localhost:5000"
echo "Data Processor:      http://localhost:3001"
echo "Validator:           http://localhost:3002"
echo "Storage:             http://localhost:3003"
echo "Analyzer:            http://localhost:3004"
echo ""
echo "To check service status:"
echo "  ./scripts/check-services.sh"
echo ""
echo "To stop all services:"
echo "  ./scripts/stop-all.sh"
echo ""
echo "To run the demo:"
echo "  pnpm start"
echo ""
