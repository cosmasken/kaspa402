/**
 * Data Processor Service Agent
 * Transforms and processes data with fixed pricing
 */

import { ServiceAgent, ServiceAgentConfig } from '@kaspa-agent-pay/service-agent';
import dotenv from 'dotenv';

dotenv.config();

interface DataProcessorInput {
    operation: 'transform' | 'enrich' | 'aggregate';
    data: any;
    config?: Record<string, any>;
}

interface DataProcessorOutput {
    success: boolean;
    processedData: any;
    metadata: {
        operation: string;
        processingTimeMs: number;
        recordsProcessed: number;
    };
}

class DataProcessorAgent extends ServiceAgent {
    constructor(config: ServiceAgentConfig) {
        super(config);
    }

    protected validateInput(input: any): boolean {
        if (!input || typeof input !== 'object') {
            return false;
        }

        const { operation, data } = input as DataProcessorInput;

        if (!operation || !['transform', 'enrich', 'aggregate'].includes(operation)) {
            return false;
        }

        if (data === undefined || data === null) {
            return false;
        }

        return true;
    }

    protected async processRequest(input: DataProcessorInput): Promise<DataProcessorOutput> {
        const startTime = Date.now();
        let processedData: any;
        let recordsProcessed = 0;

        switch (input.operation) {
            case 'transform':
                processedData = this.transformData(input.data, input.config);
                recordsProcessed = Array.isArray(input.data) ? input.data.length : 1;
                break;

            case 'enrich':
                processedData = this.enrichData(input.data, input.config);
                recordsProcessed = Array.isArray(input.data) ? input.data.length : 1;
                break;

            case 'aggregate':
                processedData = this.aggregateData(input.data, input.config);
                recordsProcessed = Array.isArray(input.data) ? input.data.length : 0;
                break;

            default:
                throw new Error(`Unknown operation: ${input.operation}`);
        }

        const processingTimeMs = Date.now() - startTime;

        return {
            success: true,
            processedData,
            metadata: {
                operation: input.operation,
                processingTimeMs,
                recordsProcessed
            }
        };
    }

    private transformData(data: any, config?: Record<string, any>): any {
        // Simple transformation: normalize keys to lowercase
        if (Array.isArray(data)) {
            return data.map(item => this.transformObject(item, config));
        }
        return this.transformObject(data, config);
    }

    private transformObject(obj: any, config?: Record<string, any>): any {
        if (typeof obj !== 'object' || obj === null) {
            return obj;
        }

        const transformed: Record<string, any> = {};
        for (const [key, value] of Object.entries(obj)) {
            const newKey = config?.preserveCase ? key : key.toLowerCase();
            transformed[newKey] = value;
        }
        return transformed;
    }

    private enrichData(data: any, config?: Record<string, any>): any {
        // Simple enrichment: add metadata fields
        const enrichment = {
            processedAt: new Date().toISOString(),
            enrichedBy: 'DataProcessorAgent',
            version: '1.0'
        };

        if (Array.isArray(data)) {
            return data.map(item => ({
                ...item,
                ...enrichment
            }));
        }

        return {
            ...data,
            ...enrichment
        };
    }

    private aggregateData(data: any, config?: Record<string, any>): any {
        if (!Array.isArray(data)) {
            return {
                count: 1,
                data: [data]
            };
        }

        // Simple aggregation: count and group by type
        const aggregation: Record<string, any> = {
            totalCount: data.length,
            types: {}
        };

        for (const item of data) {
            const type = typeof item;
            aggregation.types[type] = (aggregation.types[type] || 0) + 1;
        }

        // If data contains objects with numeric values, calculate statistics
        if (data.length > 0 && typeof data[0] === 'object') {
            const numericFields = this.findNumericFields(data[0]);
            if (numericFields.length > 0) {
                aggregation.statistics = {};
                for (const field of numericFields) {
                    const values = data
                        .map(item => item[field])
                        .filter(v => typeof v === 'number');

                    if (values.length > 0) {
                        aggregation.statistics[field] = {
                            sum: values.reduce((a, b) => a + b, 0),
                            avg: values.reduce((a, b) => a + b, 0) / values.length,
                            min: Math.min(...values),
                            max: Math.max(...values)
                        };
                    }
                }
            }
        }

        return aggregation;
    }

    private findNumericFields(obj: any): string[] {
        const fields: string[] = [];
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'number') {
                fields.push(key);
            }
        }
        return fields;
    }
}

// Start the service
const config: ServiceAgentConfig = {
    name: 'Data Processor',
    description: 'Transforms and processes data',
    capabilities: ['data-processing'],
    pricing: {
        type: 'fixed',
        baseAmount: process.env.PRICE_KAS || '10.0'
    },
    port: parseInt(process.env.PORT || '3001'),
    registryUrl: process.env.REGISTRY_URL || 'http://localhost:5000',
    walletPath: process.env.WALLET_PATH || './wallets/data-processor.json',
    privateKeyWif: process.env.PRIVATE_KEY_WIF,
    network: (process.env.KASPA_NETWORK as any) || 'testnet',
    rpcUrl: process.env.KASPA_RPC_URL || 'https://api-tn10.kaspa.org'
};

const agent = new DataProcessorAgent(config);

// Handle graceful shutdown
process.on('SIGINT', async () => {
    await agent.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await agent.stop();
    process.exit(0);
});

// Start the agent
agent.start().catch(error => {
    console.error('Failed to start Data Processor agent:', error);
    process.exit(1);
});
