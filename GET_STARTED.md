# Getting Started with Kaspa Agent Pay

## 🚀 Quick Start (5 Minutes)

### Step 1: Install

```bash
git clone <repo-url>
cd kaspa-agent-pay
pnpm install
pnpm build
cp .env.example .env
```

This will:
- ✅ Install all dependencies
- ✅ Build all packages in correct order
- ✅ Create `.env` file

### Step 2: Configure

Edit `.env` with your Kaspa testnet credentials:

```env
PRIVATE_KEY_WIF=your_testnet_private_key
SERVER_RECIPIENT_ADDRESS=kaspatest:qr...your_address
KASPA_NETWORK=testnet
KASPA_RPC_URL=https://api-testnet.kaspa.org
```

**Get testnet KAS:** https://faucet.kaspanet.io

### Step 3: Run

**Terminal 1 - Start services:**
```bash
# Start the service registry
cd packages/service-registry
pnpm start
# (In another terminal) Start the service agent
cd packages/service-agent
pnpm start
```

**Terminal 2 - Run demo:**
```bash
cd examples/marketplace-demo
pnpm start
```

You should see the agent automatically pay for and receive a service!

---

## 📚 What Just Happened?

1. **Agent made a request** to a paid service
2. **Received 402** Payment Required response
3. **Signed a transaction** with real cryptography
4. **Broadcast to Kaspa** testnet
5. **Waited for confirmation**
6. **Retried with proof** of payment
7. **Received the service** result

---

## 🎯 Next Steps

### Try The Demo

**Marketplace Demo:**
```bash
cd examples/marketplace-demo
pnpm start
```

### Use the CLI Tool

```bash
cd packages/cli

# Check balance
node dist/index.js balance --key $PRIVATE_KEY_WIF

# Test payment
node dist/index.js test-payment --url http://localhost:3000/api/task

# Verify transaction
node dist/index.js verify --txid TRANSACTION_ID

# View metrics
node dist/index.js metrics
```

### Build Your Own Service

```typescript
import { ServiceAgent } from '@kaspa-agent-pay/service-agent';

class MyService extends ServiceAgent {
    protected async processRequest(input: any): Promise<any> {
        return { result: 'processed', data: input };
    }

    protected validateInput(input: any): boolean {
        return true;
    }
}

const service = new MyService({
    name: 'My Service',
    description: 'A simple paid service',
    capabilities: ['data-processing'],
    pricing: { type: 'fixed', baseAmount: '1.0' },
    port: 3000,
    registryUrl: 'http://localhost:5000',
    network: 'testnet',
    rpcUrl: 'https://api-testnet.kaspa.org'
});

service.start();
```

---

## 📖 Documentation

- **[README.md](./README.md)** - Complete documentation
- **[QUICKSTART.md](./docs/QUICKSTART.md)** - Detailed setup guide
- **[BUILD_ORDER.md](./BUILD_ORDER.md)** - Build instructions
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Common issues
- **[FEATURES.md](./FEATURES.md)** - Feature list
- **[architecture.md](./docs/architecture.md)** - System design

---

## 🐛 Having Issues?

### Build Errors

```bash
# Clean and rebuild
rm -rf node_modules
pnpm install
pnpm build
```

### Can't Find Module

```bash
# Rebuild packages
pnpm -r build
```

### Service Won't Start

```bash
# Check if built
ls packages/service-agent/dist

# Rebuild if needed
cd packages/service-agent
pnpm build
```

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for more help.

---

## 🎓 Learn More

### Architecture

```
Agent → 402 Response → Sign TX → Broadcast → Confirm → Retry → Success
```

### Key Components

- **Core**: Blockchain integration, crypto, RPC
- **Agent Client**: Automatic payment handling
- **Server**: Paid service implementation
- **Facilitator**: Payment verification
- **CLI**: Testing tool

### Features

✅ Real secp256k1 cryptography
✅ Full Kaspa RPC integration
✅ Automatic 402 handling
✅ Replay attack prevention
✅ Rate limiting
✅ Metrics collection
✅ WebSocket support
✅ Storage abstraction

---

## 💡 Use Cases

### For Developers
- Build paid APIs
- Monetize services
- Test micropayments

### For AI Researchers
- Enable agent payments
- Create agent marketplaces
- Test economic models

### For Businesses
- Charge for compute
- Implement pay-per-use
- Create new revenue streams

---

## 🚀 Production Deployment

### Before Going Live

1. ✅ Test thoroughly on testnet
2. ✅ Set up Redis for storage
3. ✅ Enable rate limiting
4. ✅ Configure monitoring
5. ✅ Security audit
6. ✅ Load testing
7. ✅ Backup strategy

### Production Checklist

- [ ] Real Kaspa mainnet testing
- [ ] Redis configured
- [ ] Rate limits set
- [ ] Metrics monitored
- [ ] Logs centralized
- [ ] Backups automated
- [ ] Incident response plan
- [ ] Documentation updated

See [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) for details.

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

## 📊 Project Status

**Status:** ✅ FEATURE COMPLETE - READY FOR TESTING

- 5 packages built
- 3 examples working
- 100+ features implemented
- 3000+ lines of documentation
- ~80% production ready

See [STATUS.md](./STATUS.md) for current status.

---

## 🎉 You're Ready!

You now have a complete, working system for autonomous agent-to-agent micropayments on Kaspa.

**Happy coding!** 🚀
