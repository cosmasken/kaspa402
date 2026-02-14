#!/bin/bash

# Check status of all services

echo "======================================================================"
echo "Service Status Check"
echo "======================================================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

check_service() {
    local name=$1
    local url=$2
    
    if curl -s -f "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $name is running ($url)"
        return 0
    else
        echo -e "${RED}✗${NC} $name is not responding ($url)"
        return 1
    fi
}

check_service "Service Registry" "http://localhost:5000/health"
check_service "Data Processor" "http://localhost:3001/health"
check_service "Validator" "http://localhost:3002/health"
check_service "Storage" "http://localhost:3003/health"
check_service "Analyzer" "http://localhost:3004/health"

# echo ""
# echo "Registered Services:"
# curl -s http://localhost:5000/registry/services | jq '.services[] | {name, capabilities, status}' 2>/dev/null || echo "Could not fetch registered services"
# echo ""
