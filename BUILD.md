# Build Instructions - Kaspa402

## 🎯 The Problem We're Solving

Current API monetization requires complex subscriptions, has settlement delays, and can't handle micropayments economically. We solve this with **HTTP 402 Payment Required + Kaspa's millisecond blockchain**.

## 💡 What You'll Build

A system where autonomous agents discover services, negotiate payments via HTTP 402, and execute Kaspa transactions in real-time - no human intervention required.

## Prerequisites

- **Node.js** 18+ 
- **pnpm** (recommended) or npm
- **Git**
- **Testnet KAS** (auto-detected and guided during demo)

## Quick Build

```bash
# Clone repository
git clone https://github.com/cosmasken/kaspa402
cd kaspa402

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

## Demo Setup

```bash
# Navigate to demo
cd examples/marketplace-demo

# Copy environment file (optional - demo works with defaults)
cp .env.example .env
```

## Running the Demo

### 1. Start Services

```bash
# Start all services (registry + 4 agents)
./scripts/start-all.sh
```

[![asciicast](https://asciinema.org/a/ZgRtgzMe2hycUEHO.svg)](https://asciinema.org/a/ZgRtgzMe2hycUEHO)

This starts:
- Service Registry (port 5000)
- Data Processor (port 3001) 
- Validator (port 3002)
- Storage (port 3003)
- Analyzer (port 3004)

### 2. Verify Services

```bash
# Check all services are running
./scripts/check-services.sh
```

[![asciicast](https://asciinema.org/a/blFcmz5odSWfMi8j.svg)](https://asciinema.org/a/blFcmz5odSWfMi8j)

### 3. Run Demo

```bash
# Execute autonomous payment demo
pnpm start
```

[![asciicast](https://asciinema.org/a/kgm0LGQHL5NTZhIW.svg)](https://asciinema.org/a/kgm0LGQHL5NTZhIW)

**First-time users:** The demo automatically detects if your wallet needs funding and will display:
- Your wallet address to fund
- Exact amount needed (~50 KAS recommended)
- Link to testnet faucet: https://faucet.kaspanet.io/
- Real-time balance checking

After funding, the demo continues automatically and shows agents:
- Discovering services autonomously
- Negotiating payments via HTTP 402
- Executing Kaspa transactions in real-time
- Chaining multiple services together

### 4. Stop Services

```bash
# Clean shutdown
./scripts/stop-all.sh
```

[![asciicast](https://asciinema.org/a/zXKLOXVOTKO1IADY.svg)](https://asciinema.org/a/zXKLOXVOTKO1IADY)

## 🏗️ How It Works

```
1. Client → API Request
2. API → 402 Payment Required (with Kaspa address)
3. Client → Kaspa Payment (millisecond confirmation)
4. API → Verifies payment & responds with data
```

```
kaspa402/
├── packages/
│   ├── core/              # Kaspa integration
│   ├── agent-client/      # Smart HTTP client
│   ├── service-agent/     # Service implementation
│   └── service-registry/  # Service discovery
└── examples/
    └── marketplace-demo/  # Full demo
        ├── services/      # 4 specialized agents
        └── scripts/       # Management scripts
```

## Key Features Demonstrated

- **HTTP 402 Payment Required** protocol
- **Autonomous service discovery**
- **Real-time Kaspa payments** (millisecond confirmations)
- **Service composition** (chaining multiple APIs)
- **Cryptographic payment verification**
- **Multiple pricing models**

## Troubleshooting

### Services won't start
```bash
# Check if ports are in use
lsof -i :5000,:3001,:3002,:3003,:3004

# Kill existing processes
./scripts/stop-all.sh
```

### Demo fails with insufficient funds
The demo automatically detects insufficient funds and provides:
- Your exact wallet address to fund
- Required amount (~50 KAS recommended)
- Direct link to testnet faucet
- Real-time balance monitoring

Simply follow the on-screen instructions - no manual configuration needed!

### Build errors
```bash
# Clean and rebuild
pnpm clean
pnpm install
pnpm build
```

## Development

### Adding New Services

1. Create service in `examples/marketplace-demo/services/`
2. Implement `ServiceAgent` interface
3. Add to `start-all.sh` script
4. Register with service registry

### Custom Pricing Models

Extend the pricing system in `packages/service-agent/src/pricing/`:
- Fixed pricing
- Usage-based
- Outcome-based  
- Tiered pricing

## Kaspathon Integration

This project demonstrates:
- **Payments & Commerce**: Instant settlement via HTTP 402
- **Real-Time Data**: Per-request API monetization
- **Gaming & Interactive**: Transaction-driven interactions

Perfect for showcasing Kaspa's millisecond block times and real-time capabilities.

## License

MIT - Open source and ready for Kaspathon submissions!
