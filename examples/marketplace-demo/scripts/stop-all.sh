#!/bin/bash

# Stop all services

echo "Stopping all services..."

# Kill by PID file if it exists
if [ -f logs/pids.txt ]; then
    while read pid; do
        if ps -p $pid > /dev/null 2>&1; then
            echo "  Stopping process $pid and its children..."
            # Kill the process group
            pkill -P $pid 2>/dev/null || true
            kill $pid 2>/dev/null || true
        fi
    done < logs/pids.txt
    rm logs/pids.txt
fi

# Also kill any remaining node processes running our services
echo "  Cleaning up any remaining service processes..."
pkill -f "node dist/index.js" 2>/dev/null || true
pkill -f "pnpm start" 2>/dev/null || true

# Wait a moment for processes to die
sleep 1

# Check if any are still running
REMAINING=$(ps aux | grep -E "node.*dist/index.js" | grep -v grep | wc -l)
if [ $REMAINING -gt 0 ]; then
    echo "  Force killing remaining processes..."
    pkill -9 -f "node dist/index.js" 2>/dev/null || true
fi

echo "All services stopped."
