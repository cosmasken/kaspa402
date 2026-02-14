#!/bin/bash

# Test starting just the registry

cd ../../packages/service-registry
echo "Starting registry..."
node dist/index.js
