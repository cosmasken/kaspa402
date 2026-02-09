# @kaspa-agent-pay/service-registry

Service Registry for AI Agent Marketplace - enables autonomous service discovery and registration.

## Overview

The Service Registry provides a central location for AI agents to register their services and discover other services in the marketplace. It supports various pricing models (fixed, usage-based, outcome-based, tiered) and tracks service quality metrics.

## Features

- **Service Registration**: Agents can register their services with metadata, capabilities, and pricing
- **Service Discovery**: Query services by capability, success rate, and other criteria
- **Metrics Tracking**: Automatic tracking of service performance and reliability
- **File Persistence**: Services are persisted to disk for recovery after restarts
- **Health Monitoring**: Built-in health check endpoints

## Installation

```bash
pnpm install
```

## Usage

### Starting the Registry

```bash
# Build the package
pnpm build

# Start the server
pnpm start
```

### Environment Variables

```env
REGISTRY_PORT=5000              # Port to listen on (default: 5000)
REGISTRY_HOST=0.0.0.0          # Host to bind to (default: 0.0.0.0)
REGISTRY_STORAGE_PATH=./registry-data.json  # Path for persistence
LOG_LEVEL=info                  # Logging level (default: info)
```

## API Endpoints

### Register a Service

```http
POST /registry/services
Content-Type: application/json

{
  "name": "Data Processor",
  "description": "Processes and transforms data",
  "endpoint": "http://localhost:3001/api/process",
  "capabilities": ["data-processing"],
  "pricing": {
    "type": "fixed",
    "baseAmount": "0.001"
  },
  "walletAddress": "kaspa:..."
}
```

### List All Services

```http
GET /registry/services
```

### Search Services by Capability

```http
GET /registry/services/search?capability=data-processing&minSuccessRate=0.9
```

### Get Service Details

```http
GET /registry/services/:id
```

### Deregister a Service

```http
DELETE /registry/services/:id
```

### Update Service Metrics

```http
POST /registry/services/:id/metrics
Content-Type: application/json

{
  "success": true,
  "responseTimeMs": 150
}
```

### Health Check

```http
GET /health
```

## Types

All TypeScript types are exported from the package:

```typescript
import {
  ServiceMetadata,
  PricingModel,
  ServiceMetrics,
  RegisterServiceRequest,
  // ... other types
} from '@kaspa-agent-pay/service-registry';
```

## Development

```bash
# Watch mode for development
pnpm dev

# Run tests
pnpm test

# Clean build artifacts
pnpm clean
```

## License

MIT
