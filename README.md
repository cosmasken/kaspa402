# Kaspa402 - Kaspathon Entry

**Pay-Per-Request APIs Powered by Kaspa's Millisecond Blockchain**

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Kaspa](https://img.shields.io/badge/Kaspa-Integrated-70C4AA)
![Kaspathon](https://img.shields.io/badge/Kaspathon-2026-orange)

## 🚀 What This Is

Turn Kaspa into the payment layer of the internet. Autonomous agents discover services, negotiate payments, and execute transactions using HTTP 402 Payment Required and Kaspa's instant confirmations.

**Perfect for Kaspathon tracks:**
- **Payments & Commerce**: HTTP 402 payment protocol with instant settlement
- **Real-Time Data**: IoT-style data feeds with per-request pricing  

## ⚡ Quick Demo

Watch autonomous agents execute real-time payments:

[![asciicast](https://asciinema.org/a/kgm0LGQHL5NTZhIW.svg)](https://asciinema.org/a/kgm0LGQHL5NTZhIW)

## 🛠️ Quick Start

```bash
git clone https://github.com/cosmasken/kaspa402
cd kaspa402
pnpm install
pnpm build

# Navigate to demo
cd examples/marketplace-demo

# Start all services
./scripts/start-all.sh

# Run the autonomous payment demo
# (First-time users: the demo will detect insufficient funds and show funding instructions)
pnpm start
```

## 🎬 Service Management

Start all services (registry + 4 specialized agents):

[![asciicast](https://asciinema.org/a/ZgRtgzMe2hycUEHO.svg)](https://asciinema.org/a/ZgRtgzMe2hycUEHO)

Check service status:

[![asciicast](https://asciinema.org/a/blFcmz5odSWfMi8j.svg)](https://asciinema.org/a/blFcmz5odSWfMi8j)

Stop all services:

[![asciicast](https://asciinema.org/a/zXKLOXVOTKO1IADY.svg)](https://asciinema.org/a/zXKLOXVOTKO1IADY)

## 🏗️ Architecture

```
Client → API (402) → Kaspa Payment → Kaspa Network → Verifier → API Response
```

**Key Components:**
- **Agent Client**: Auto-handles 402 responses with Kaspa payments
- **Service Registry**: Decentralized service discovery
- **Payment Verifier**: Cryptographic proof of payment
- **Multiple Pricing Models**: Fixed, usage-based, outcome-based, tiered

## 🎯 Kaspathon Features

- **Millisecond Payments**: Leverages Kaspa's instant block times
- **Autonomous Agents**: No human intervention required
- **Service Composition**: Chain multiple paid services
- **Real-time Settlement**: No waiting for confirmations
- **Open Source**: MIT licensed, ready to fork and extend

## 📦 Packages

| Package | Purpose |
|---------|---------|
| `@kaspa-agent-pay/core` | Kaspa integration & utilities |
| `@kaspa-agent-pay/agent-client` | Smart HTTP client with auto-payments |
| `@kaspa-agent-pay/service-agent` | Paid service implementation |
| `@kaspa-agent-pay/service-registry` | Service discovery |

## 🏆 Why Kaspa?

Unlike other blockchains with multi-minute confirmations, Kaspa enables:
- **True real-time payments** between services
- **Instant settlement** without waiting
- **Practical microtransactions** with minimal fees
- **Trustless verification** with PoW security

Perfect for the **real-time PoW blockchain** that Kaspathon celebrates.

## 📚 Documentation

- [Build Instructions](./BUILD.md)
- [Complete Setup Guide](./GET_STARTED.md)
- [Project Architecture](./PROJECT_TREE.txt)

## 📄 License

MIT - Build, fork, and extend freely for Kaspathon and beyond!
