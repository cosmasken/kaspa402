# Kaspa Agent Pay CLI

Command-line interface for testing and interacting with Kaspa Agent Pay.

## Installation

```bash
cd packages/cli
pnpm build
pnpm link --global
```

## Usage

### Test Payment

Make a test payment to a service:

```bash
kaspa-pay test-payment \
  --url http://localhost:3000/api/expensive-compute \
  --key YOUR_PRIVATE_KEY_WIF \
  --network testnet
```

### Check Balance

Check the balance of an address:

```bash
# Using address
kaspa-pay balance --address kaspatest:qr...

# Using private key (derives address)
kaspa-pay balance --key YOUR_PRIVATE_KEY_WIF
```

### Verify Transaction

Verify a transaction on-chain:

```bash
kaspa-pay verify --txid TRANSACTION_ID
```

### View Metrics

Show payment metrics:

```bash
kaspa-pay metrics
```

## Environment Variables

Set these in `.env` or export them:

```bash
export PRIVATE_KEY_WIF=your_private_key
export KASPA_RPC_URL=https://api-testnet.kaspa.org
```

## Examples

```bash
# Full test flow
kaspa-pay balance --key $PRIVATE_KEY_WIF
kaspa-pay test-payment --url http://localhost:3000/api/expensive-compute
kaspa-pay metrics
```
