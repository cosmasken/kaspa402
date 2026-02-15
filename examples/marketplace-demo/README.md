# AI Agent Marketplace Demo

This demo showcases autonomous agent-to-agent (A2A) service discovery, composition, and payment using the Kaspa blockchain. It demonstrates how AI agents can act as both service providers and consumers in a decentralized marketplace, making economic decisions without human intervention.

## Overview

The demo includes:

- **Service Registry**: Central discovery service for agent capabilities
- **4 Specialized Service Agents**:
  - **Data Processor**: Transforms and processes data (fixed pricing: 0.001 KAS)
  - **Validator**: Validates data against schemas (outcome-based pricing: 0.0005 KAS)
  - **Storage**: Persists data with TTL (usage-based pricing: 0.0001 KAS/KB)
  - **Analyzer**: Performs statistical analysis (tiered pricing: 0.002-0.005 KAS)
- **Orchestrator Agent**: Discovers services, plans workflows, and executes service chains with automatic payments

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Service Registry                             │
│  - Service metadata storage                                      │
│  - Discovery API                                                 │
│  - Health monitoring                                             │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ Register/Discover
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Service    │      │   Service    │      │   Service    │
│   Agent 1    │      │   Agent 2    │      │   Agent 3    │
│ (Processor)  │      │ (Validator)  │      │  (Storage)   │
└──────────────┘      └──────────────┘      └──────────────┘
        ▲                     ▲                     ▲
        │                     │                     │
        │ HTTP 402 + Payment  │                     │
        │                     │                     │
        └─────────────────────┴─────────────────────┘
                              │
                              │
                    ┌─────────▼──────────┐
                    │   Orchestrator     │
                    │      Agent         │
                    │  - Task planning   │
                    │  - Service selection│
                    │  - Payment handling│
                    └────────────────────┘
```

## Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Kaspa testnet funds (get from [faucet](https://faucet.kaspanet.io/))

## Setup

1. **Install dependencies**:
   ```bash
   cd ../../..  # Go to project root
   pnpm install
   ```

2. **Build all packages**:
   ```bash
   pnpm build
   ```

3. **Configure environment** (optional):
   ```bash
   cd examples/marketplace-demo
   cp .env.example .env
   # Edit .env if needed
   ```

## Running the Demo

### Quick Start

1. **Start all services**:
   ```bash
   ./scripts/start-all.sh
   ```

   This will start:
   - Service Registry on port 5000
   - Data Processor on port 3001
   - Validator on port 3002
   - Storage on port 3003
   - Analyzer on port 3004

2. **Check service status**:
   ```bash
   ./scripts/check-services.sh
   ```

3. **Run the demo**:
   ```bash
   pnpm start
   ```

   The demo will:
   - Display your wallet address
   - Show estimated costs for each service
   - Prompt you to fund the wallet if needed
   - Execute the service chain after funding
   - Display detailed results and what was tested

4. **Fund your wallet** (if prompted):
   - Copy the wallet address shown
   - Visit https://faucet.kaspanet.io/
   - Request **0.01 KAS** (covers demo + buffer)
   - Wait ~2 seconds for confirmation
   - Press Enter to continue

5. **Stop all services**:
   ```bash
   ./scripts/stop-all.sh
   ```

### Helper Scripts

```bash
# Display wallet address and funding instructions
./scripts/fund-wallet.sh

# Show all wallet addresses for balance tracking
./scripts/show-wallets.sh

# Check if all services are healthy
./scripts/check-services.sh

# View service registry contents
curl http://localhost:5000/registry/services | jq
```

### Manual Start (for debugging)

Start each service in a separate terminal:

```bash
# Terminal 1: Service Registry
cd packages/service-registry
pnpm start

# Terminal 2: Data Processor
cd examples/marketplace-demo/services/data-processor
pnpm start

# Terminal 3: Validator
cd examples/marketplace-demo/services/validator
pnpm start

# Terminal 4: Storage
cd examples/marketplace-demo/services/storage
pnpm start

# Terminal 5: Analyzer
cd examples/marketplace-demo/services/analyzer
pnpm start

# Terminal 6: Run Demo
cd examples/marketplace-demo
pnpm start
```

## Demo Scenario

The demo executes a **Customer Data Enrichment Pipeline**:

1. **Input**: Customer data with names, emails, purchases, and spending
2. **Service Chain**:
   - **Data Processor**: Normalizes and transforms the data
   - **Validator**: Validates email addresses and required fields
   - **Storage**: Persists the validated data with TTL
   - **Analyzer**: Generates statistical insights

3. **Autonomous Behavior**:
   - Orchestrator discovers available services from the registry
   - Selects best services based on cost, quality, and speed
   - Checks budget before execution
   - Makes payments automatically using HTTP 402 protocol
   - Chains service outputs as inputs to next service
   - Aggregates final results with cost breakdown

## Expected Output

```
======================================================================
AI Agent Marketplace Demo
Autonomous Agent-to-Agent Service Discovery and Payment
======================================================================

[1/5] Initializing orchestrator agent...
=== Your Kaspa Agent Wallet ===
   address   : kaspatest:qra...
   network   : testnet
💡 Fund this address to enable payments!

Checking wallet balance...
Current Balance: 0.00000000 KAS

======================================================================
💰 WALLET FUNDING REQUIRED
======================================================================

This demo will execute a 4-service chain with the following costs:

  1. Data Processor    → 0.00100000 KAS (fixed pricing)
     Transforms and normalizes customer data

  2. Validator         → 0.00050000 KAS (outcome-based)
     Validates email addresses and required fields
     Note: Only charges if validation passes

  3. Storage           → 0.00020000 KAS (usage-based)
     Persists validated data with TTL
     Note: Cost varies by data size (~2KB)

  4. Analyzer          → 0.00200000 KAS (tiered - basic)
     Generates statistical insights

----------------------------------------------------------------------
  Estimated Total      → ~0.00370000 KAS
======================================================================

📍 Your Wallet Address:
   kaspatest:qra65lzsnga9f0ng87ewqswsny77fpna8sdvuwprf776ma6dudjuyju2v5c7w

💵 Recommended Amount: 0.01 KAS (includes buffer)

🌐 Get Testnet Funds:
   https://faucet.kaspanet.io/

⏱️  After funding, wait ~2 seconds for confirmation

======================================================================

Please fund your wallet and press Enter to continue...

✓ Wallet funded! New balance: 0.01000000 KAS

Budget: 0.1 KAS

[2/5] Discovering services...
  Found 1 service(s) for data-processing
  Found 1 service(s) for data-validation
  Found 1 service(s) for data-storage
  Found 1 service(s) for data-analysis

[3/5] Planning service chain...
  Services selected: 4
    - Data Processor (0.00100000 KAS)
    - Validator (0.00050000 KAS)
    - Storage (0.00020000 KAS)
    - Analyzer (0.00200000 KAS)
  Total estimated cost: 0.00370000 KAS

  ✓ Budget check passed

[4/5] Executing service chain...

→ Calling Data Processor...
  ✓ Completed in 2.3s

→ Calling Validator...
  ✓ Completed in 1.8s

→ Calling Storage...
  ✓ Completed in 1.2s

→ Calling Analyzer...
  ✓ Completed in 3.1s

[5/5] Task completed!

======================================================================
Results Summary
======================================================================

Service: Data Processor
  Status: ✓ Success
  Cost: 0.00100000 KAS
  Response Time: 2.30s

Service: Validator
  Status: ✓ Success
  Cost: 0.00050000 KAS
  Response Time: 1.80s

Service: Storage
  Status: ✓ Success
  Cost: 0.00020000 KAS
  Response Time: 1.20s

Service: Analyzer
  Status: ✓ Success
  Cost: 0.00200000 KAS
  Response Time: 3.10s

======================================================================
Total Cost: 0.00370000 KAS
Execution Time: 8.40s
Remaining Budget: 0.09630000 KAS
======================================================================

✓ Demo completed successfully!

======================================================================
What You Just Tested:
======================================================================

✓ Autonomous Service Discovery
  - Orchestrator queried registry without human input
  - Found 4 services matching required capabilities

✓ Cost-Benefit Analysis
  - Selected services based on price, quality, and speed
  - Verified budget before execution

✓ Multiple Pricing Models
  - Fixed: Data Processor (same cost every time)
  - Outcome-based: Validator (only charged on success)
  - Usage-based: Storage (cost varies by data size)
  - Tiered: Analyzer (basic vs advanced options)

✓ HTTP 402 Payment Protocol
  - Each service demanded payment before processing
  - Orchestrator paid automatically with Kaspa
  - All transactions verified on-chain

✓ Service Composition
  - Chained 4 services with data flow
  - Output from each service fed to the next
  - Aggregated final results

✓ Quality Metrics
  - Services tracked success rate and response time
  - Metrics reported back to registry

======================================================================

🔍 Verify Transactions:
   Visit: https://explorer-tn10.kaspa.org/
   Search for the transaction IDs shown above

📊 Check Service Metrics:
   curl http://localhost:5000/registry/services | jq

======================================================================
```

## Verifying Transactions

All payment transactions can be verified on the Kaspa explorer:

- **Testnet**: https://explorer-tn10.kaspa.org/
- Search for transaction IDs shown in the demo output
- Verify payments were sent to service agent wallet addresses

## Troubleshooting

### Services won't start

- Check if ports 3001-3004 and 5000 are available
- Check logs in `logs/` directory
- Ensure all packages are built: `pnpm build` from project root

### Orchestrator fails with "insufficient funds"

- Fund the orchestrator wallet with testnet KAS
- Wait for transaction confirmation (usually 1-2 seconds)
- Check balance: the orchestrator displays it on startup

### Services not registering

- Ensure Service Registry is running on port 5000
- Check registry logs: `logs/registry.log`
- Verify services can reach the registry: `curl http://localhost:5000/health`

### Payment verification fails

- Ensure you're using testnet
- Check RPC URL is accessible: `https://api.kaspa.org`
- Verify transaction was confirmed before retrying

## Configuration

### Environment Variables

Each service can be configured via environment variables:

**Orchestrator** (`.env`):
```env
ORCHESTRATOR_BUDGET_KAS=0.1
ORCHESTRATOR_WALLET_PATH=./wallets/orchestrator.json
REGISTRY_URL=http://localhost:5000
KASPA_NETWORK=testnet
KASPA_RPC_URL=https://api.kaspa.org
```

**Service Agents** (each service has `.env.example`):
```env
PORT=3001
PRICE_KAS=0.001
REGISTRY_URL=http://localhost:5000
WALLET_PATH=./wallets/service.json
KASPA_NETWORK=testnet
KASPA_RPC_URL=https://api.kaspa.org
```

## Key Features Demonstrated

1. **Autonomous Service Discovery**: Orchestrator queries registry without human input
2. **Cost-Benefit Analysis**: Selects services based on price, quality, and speed
3. **Budget Management**: Checks available funds before execution
4. **Automatic Payments**: HTTP 402 protocol with payment proof
5. **Service Composition**: Chains multiple services with data flow
6. **Multiple Pricing Models**:
   - Fixed: Data Processor
   - Outcome-based: Validator (only charges on success)
   - Usage-based: Storage (charges per KB)
   - Tiered: Analyzer (basic vs advanced)
7. **Quality Metrics**: Services track success rate and response time
8. **Graceful Error Handling**: Handles service failures and insufficient funds

## Next Steps

- Modify the demo scenario in `src/index.ts`
- Create new service agents with different capabilities
- Experiment with different pricing models
- Add more complex service chains
- Implement service health monitoring and failover

## License

MIT
