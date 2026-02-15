# Getting Started with Kaspa402

## 🚀 Quick Start (5 Minutes)

### Step 1: Install

```bash
git clone https://github.com/cosmasken/kaspa402.git
cd kaspa402
pnpm install
pnpm build
```

This will:
- ✅ Install all dependencies
- ✅ Build all packages in correct order
- ✅ Set up the project structure

### Step 2: Run the Demo

```bash
cd examples/marketplace-demo

# Start all services (registry + 4 agents)
./scripts/start-all.sh
```

[![asciicast](https://asciinema.org/a/ZgRtgzMe2hycUEHO.svg)](https://asciinema.org/a/ZgRtgzMe2hycUEHO)

```bash
# Run the autonomous payment demo
pnpm start
```

[![asciicast](https://asciinema.org/a/kgm0LGQHL5NTZhIW.svg)](https://asciinema.org/a/kgm0LGQHL5NTZhIW)

**First-time users:** The demo automatically detects if funding is needed and shows:
- Your wallet address to fund
- Exact amount needed (~50 KAS recommended)
- Link to testnet faucet: https://faucet.kaspanet.io/

### Step 3: Watch the Magic

You'll see autonomous agents:
1. **Discover services** automatically
2. **Negotiate payments** via HTTP 402
3. **Execute Kaspa transactions** in real-time
4. **Chain multiple services** together
5. **Complete in seconds** with instant settlement

---

## 🎯 What Just Happened?

The demo showcases a **Customer Data Enrichment Pipeline** where agents:

1. **Data Processor** → Transforms customer data (1 KAS)
2. **Validator** → Validates email addresses (5 KAS, outcome-based)
3. **Analyzer** → Generates statistical insights (20 KAS, tiered pricing)

All payments happen **autonomously** using Kaspa's millisecond blockchain!

---

## 🔧 Service Management

### Check Services
```bash
./scripts/check-services.sh
```

[![asciicast](https://asciinema.org/a/blFcmz5odSWfMi8j.svg)](https://asciinema.org/a/blFcmz5odSWfMi8j)

### Stop Services
```bash
./scripts/stop-all.sh
```

[![asciicast](https://asciinema.org/a/zXKLOXVOTKO1IADY.svg)](https://asciinema.org/a/zXKLOXVOTKO1IADY)

### View Logs
```bash
tail -f logs/registry.log
tail -f logs/data-processor.log
```

---

## 🏗️ Architecture Overview

```
Client → API (402) → Kaspa Payment → Kaspa Network → Verifier → API Response
```

**Key Components:**
- **Agent Client**: Auto-handles 402 responses with Kaspa payments
- **Service Registry**: Decentralized service discovery
- **Payment Verifier**: Cryptographic proof of payment
- **Multiple Pricing Models**: Fixed, usage-based, outcome-based, tiered

---

## 🛠️ Build Your Own Service

Create a new paid service:

```typescript
import { ServiceAgent } from '@kaspa-agent-pay/service-agent';

class MyService extends ServiceAgent {
    protected async processRequest(input: any): Promise<any> {
        // Your service logic here
        return { result: 'processed', data: input };
    }

    protected validateInput(input: any): boolean {
        return input && typeof input === 'object';
    }
}

const service = new MyService({
    name: 'My Custom Service',
    description: 'A specialized paid service',
    capabilities: ['custom-processing'],
    pricing: { type: 'fixed', baseAmount: '2.0' },
    port: 3005,
    registryUrl: 'http://localhost:5000',
    network: 'testnet'
});

service.start();
```

---

## 📦 Package Structure

| Package | Purpose |
|---------|---------|
| `@kaspa-agent-pay/core` | Kaspa integration & utilities |
| `@kaspa-agent-pay/agent-client` | Smart HTTP client with auto-payments |
| `@kaspa-agent-pay/service-agent` | Paid service implementation |
| `@kaspa-agent-pay/service-registry` | Service discovery |
| `@kaspa-agent-pay/cli` | Command-line tools |

---

## 🐛 Troubleshooting

### Services won't start
```bash
# Check if ports are in use
lsof -i :5000,:3001,:3002,:3003,:3004

# Kill existing processes
./scripts/stop-all.sh
```

### Demo fails with insufficient funds
The demo automatically detects this and provides funding instructions. Simply:
1. Copy the displayed wallet address
2. Get testnet KAS from https://faucet.kaspanet.io/
3. Wait ~2 seconds for confirmation
4. Demo continues automatically

### Build errors
```bash
# Clean and rebuild
pnpm clean
pnpm install
pnpm build
```

---

## 🎯 Next Steps

### Explore the Code
- **Core UTXO Management**: `packages/core/src/utxo/`
- **Agent Implementation**: `packages/agent-client/src/AgentClient.ts`
- **Service Framework**: `packages/service-agent/src/ServiceAgent.ts`
- **Demo Orchestrator**: `examples/marketplace-demo/src/orchestrator.ts`

### Extend the Demo
- Add new service types
- Implement custom pricing models
- Create service chains
- Build a frontend dashboard

### Deploy to Production
- Switch to Kaspa mainnet
- Set up monitoring
- Implement rate limiting
- Add authentication

---

## 🏆 Why Kaspa?

Unlike other blockchains with multi-minute confirmations, Kaspa enables:
- **Millisecond payments** between services
- **Instant settlement** without waiting
- **Practical microtransactions** with minimal fees
- **Trustless verification** with PoW security

Perfect for **real-time agent-to-agent commerce**!

---

## 📚 Documentation

- [Build Instructions](./BUILD.md)
- [Project Architecture](./PROJECT_TREE.txt)
- [Complete README](./README.md)

---
