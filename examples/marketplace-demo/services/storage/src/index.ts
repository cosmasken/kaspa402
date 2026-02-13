/**
 * Storage Service Agent
 * Persists data with usage-based pricing (per KB)
 */

import { ServiceAgent, ServiceAgentConfig } from '@kaspa-agent-pay/service-agent';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { randomBytes } from 'crypto';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

interface StorageInput {
    data: any;
    ttl?: number; // seconds
    metadata?: Record<string, any>;
}

interface StorageOutput {
    success: boolean;
    storageKey: string;
    sizeBytes: number;
    cost: string;
    expiresAt?: string;
}

interface StoredItem {
    data: any;
    metadata?: Record<string, any>;
    storedAt: string;
    expiresAt?: string;
}

class StorageAgent extends ServiceAgent {
    private storagePath: string;
    private cleanupInterval?: NodeJS.Timeout;

    constructor(config: ServiceAgentConfig) {
        super(config);
        this.storagePath = process.env.STORAGE_PATH || './storage-data';
    }

    async initialize(): Promise<void> {
        await super.initialize();

        // Create storage directory if it doesn't exist
        if (!existsSync(this.storagePath)) {
            await mkdir(this.storagePath, { recursive: true });
        }

        // Start cleanup interval for expired items
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredItems().catch(console.error);
        }, 60000); // Every minute
    }

    async stop(): Promise<void> {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        await super.stop();
    }

    protected validateInput(input: any): boolean {
        if (!input || typeof input !== 'object') {
            return false;
        }

        const { data } = input as StorageInput;

        if (data === undefined || data === null) {
            return false;
        }

        return true;
    }

    protected calculateCost(input: StorageInput): string {
        const dataStr = JSON.stringify(input.data);
        const sizeBytes = Buffer.byteLength(dataStr, 'utf8');
        const sizeKB = sizeBytes / 1024;
        const ratePerKB = parseFloat(process.env.PRICE_PER_KB_KAS || '1.0');
        const cost = sizeKB * ratePerKB;
        return cost.toFixed(8);
    }

    protected async processRequest(input: StorageInput): Promise<StorageOutput> {
        // Generate storage key
        const storageKey = `store_${randomBytes(16).toString('hex')}`;

        // Calculate size and cost
        const dataStr = JSON.stringify(input.data);
        const sizeBytes = Buffer.byteLength(dataStr, 'utf8');
        const cost = this.calculateCost(input);

        // Calculate expiration
        let expiresAt: string | undefined;
        if (input.ttl && input.ttl > 0) {
            const expirationDate = new Date(Date.now() + input.ttl * 1000);
            expiresAt = expirationDate.toISOString();
        }

        // Create stored item
        const storedItem: StoredItem = {
            data: input.data,
            metadata: input.metadata,
            storedAt: new Date().toISOString(),
            expiresAt
        };

        // Write to file
        const filePath = join(this.storagePath, `${storageKey}.json`);
        await writeFile(filePath, JSON.stringify(storedItem, null, 2), 'utf8');

        return {
            success: true,
            storageKey,
            sizeBytes,
            cost,
            expiresAt
        };
    }

    /**
     * Retrieve stored data (not part of paid service, but useful for demo)
     */
    async retrieve(storageKey: string): Promise<StoredItem | null> {
        try {
            const filePath = join(this.storagePath, `${storageKey}.json`);

            if (!existsSync(filePath)) {
                return null;
            }

            const content = await readFile(filePath, 'utf8');
            const item: StoredItem = JSON.parse(content);

            // Check if expired
            if (item.expiresAt && new Date(item.expiresAt) < new Date()) {
                await unlink(filePath);
                return null;
            }

            return item;
        } catch (error) {
            console.error('Error retrieving data:', error);
            return null;
        }
    }

    /**
     * Cleanup expired items
     */
    private async cleanupExpiredItems(): Promise<void> {
        try {
            const { readdir } = await import('fs/promises');
            const files = await readdir(this.storagePath);

            for (const file of files) {
                if (!file.endsWith('.json')) continue;

                const filePath = join(this.storagePath, file);
                try {
                    const content = await readFile(filePath, 'utf8');
                    const item: StoredItem = JSON.parse(content);

                    if (item.expiresAt && new Date(item.expiresAt) < new Date()) {
                        await unlink(filePath);
                        console.log(`Cleaned up expired item: ${file}`);
                    }
                } catch (error) {
                    console.error(`Error processing file ${file}:`, error);
                }
            }
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
}

// Start the service
const config: ServiceAgentConfig = {
    name: 'Storage',
    description: 'Persists data with TTL support',
    capabilities: ['data-storage'],
    pricing: {
        type: 'usage-based',
        usageMetric: 'per_kb',
        usageRate: process.env.PRICE_PER_KB_KAS || '1.0'
    },
    port: parseInt(process.env.PORT || '3003'),
    registryUrl: process.env.REGISTRY_URL || 'http://localhost:5000',
    walletPath: process.env.WALLET_PATH || './wallets/storage.json',
    privateKeyWif: process.env.PRIVATE_KEY_WIF,
    network: (process.env.KASPA_NETWORK as any) || 'testnet',
    rpcUrl: process.env.KASPA_RPC_URL || 'https://api-tn10.kaspa.org'
};

const agent = new StorageAgent(config);

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
    console.error('Failed to start Storage agent:', error);
    process.exit(1);
});
