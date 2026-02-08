/**
 * ServiceAgent Base Class
 * Abstract base class for creating service agents that can register with the marketplace
 */

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AgentClient } from '@kaspa-agent-pay/agent-client';
import {
    PaymentDemand,
    PaymentProof,
    PaymentDemandResponse,
    verifyTransaction,
    generateAgentWallet,
    getWalletBalance,
    AgentWallet
} from '@kaspa-agent-pay/core';
import { randomBytes } from 'crypto';

export interface ServiceAgentConfig {
    name: string;
    description: string;
    capabilities: string[];
    pricing: PricingModel;
    port: number;
    registryUrl: string;
    walletPath?: string;
    privateKeyWif?: string;
    network: 'mainnet' | 'testnet';
    rpcUrl: string;
    healthCheckPath?: string;
}

export interface PricingModel {
    type: 'fixed' | 'usage-based' | 'outcome-based' | 'tiered';
    baseAmount?: string;
    tiers?: PricingTier[];
    usageMetric?: string;
    usageRate?: string;
}

export interface PricingTier {
    name: string;
    amount: string;
    features: string[];
}

export interface ServiceMetrics {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTimeMs: number;
    successRate: number;
}

export interface ServiceMetadata {
    id: string;
    name: string;
    description: string;
    endpoint: string;
    capabilities: string[];
    pricing: PricingModel;
    metrics: ServiceMetrics;
    status: 'active' | 'inactive' | 'degraded';
    walletAddress?: string;
    healthCheckEndpoint?: string;
    registeredAt: string;
    lastHeartbeat?: string;
}

/**
 * Abstract base class for service agents
 */
export abstract class ServiceAgent {
    public config: ServiceAgentConfig;
    public server: FastifyInstance;
    public wallet!: AgentWallet;
    protected serviceId?: string;
    protected metrics: ServiceMetrics;
    protected processedResults: Map<string, any> = new Map();

    constructor(config: ServiceAgentConfig) {
        this.config = config;
        this.server = Fastify({
            logger: {
                level: process.env.LOG_LEVEL || 'info'
            }
        });

        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTimeMs: 0,
            successRate: 0
        };
    }

    /**
     * Abstract method to process service requests
     * Must be implemented by concrete service classes
     */
    protected abstract processRequest(input: any): Promise<any>;

    /**
     * Abstract method to validate input
     * Must be implemented by concrete service classes
     */
    protected abstract validateInput(input: any): boolean;

    /**
     * Calculate the cost for a request
     * Can be overridden for usage-based or tiered pricing
     */
    protected calculateCost(input: any): string {
        if (this.config.pricing.type === 'fixed' || this.config.pricing.type === 'outcome-based') {
            return this.config.pricing.baseAmount || '0';
        }

        // Default implementation for usage-based
        if (this.config.pricing.type === 'usage-based' && this.config.pricing.usageRate) {
            const size = JSON.stringify(input).length;
            const sizeKB = size / 1024;
            const rate = parseFloat(this.config.pricing.usageRate);
            return (sizeKB * rate).toFixed(8);
        }

        return this.config.pricing.baseAmount || '0';
    }

    /**
     * Initialize the service agent
     */
    async initialize(): Promise<void> {
        // Generate or load wallet
        this.wallet = await generateAgentWallet(
            this.config.network as 'mainnet' | 'testnet',
            this.config.walletPath,
            this.config.privateKeyWif
        );

        console.log('');
        console.log('='.repeat(60));
        console.log(`${this.config.name} - Service Agent`);
        console.log('='.repeat(60));
        console.log(`Wallet Address: ${this.wallet.address}`);
        console.log(`Network: ${this.wallet.network}`);

        try {
            const balance = await getWalletBalance(this.wallet.address, {
                network: this.config.network as 'mainnet' | 'testnet',
                rpcUrl: this.config.rpcUrl
            });
            console.log(`Balance: ${balance.kas} KAS`);
        } catch (error) {
            console.log(`Balance: Unable to fetch (${error})`);
        }

        console.log('='.repeat(60));
        console.log('');
    }

    /**
     * Start the service agent
     */
    async start(): Promise<void> {
        await this.initialize();

        // Setup routes
        this.setupRoutes();

        // Start server
        await this.server.listen({ port: this.config.port, host: '0.0.0.0' });

        console.log(`${this.config.name} listening on http://0.0.0.0:${this.config.port}`);

        // Register with service registry
        await this.registerService();
    }

    /**
     * Stop the service agent
     */
    async stop(): Promise<void> {
        console.log(`\nShutting down ${this.config.name}...`);

        // Deregister from service registry
        if (this.serviceId) {
            await this.deregisterService();
        }

        // Close server
        await this.server.close();

        console.log(`${this.config.name} stopped`);
    }

    /**
     * Setup HTTP routes
     */
    private setupRoutes(): void {
        // Main service endpoint
        this.server.post('/api/service', async (request, reply) => {
            return this.handleServiceRequest(request, reply);
        });

        // Health check endpoint
        this.server.get('/health', async (request, reply) => {
            return reply.send({
                status: 'healthy',
                service: this.config.name,
                metrics: this.metrics,
                timestamp: new Date().toISOString()
            });
        });

        // Allow subclasses to register custom routes
        this.setupCustomRoutes();
    }

    /**
     * Override this method to register custom routes in subclasses
     */
    protected setupCustomRoutes(): void {
        // Default implementation does nothing
    }

    /**
     * Handle service requests with payment verification
     */
    private async handleServiceRequest(
        request: FastifyRequest,
        reply: FastifyReply
    ): Promise<any> {
        const startTime = Date.now();

        try {
            const input = request.body;

            // Validate input
            if (!this.validateInput(input)) {
                this.metrics.totalRequests++;
                this.metrics.failedRequests++;
                this.updateMetricsStats();

                return reply.code(400).send({
                    success: false,
                    error: 'Invalid input',
                    details: 'Input validation failed. Please check your request format.'
                });
            }

            // Calculate cost
            const cost = this.calculateCost(input);
            const costSompi = BigInt(Math.floor(parseFloat(cost) * 100_000_000));

            // Check for payment proof
            const paymentProofHeader = request.headers['x-payment-proof'] as string;

            if (!paymentProofHeader) {
                // No payment proof - return 402 Payment Required
                const demand: PaymentDemand = {
                    chain: 'kaspa',
                    network: this.config.network as 'mainnet' | 'testnet',
                    recipient: this.wallet.address,
                    amount: cost,
                    amount_sompi: costSompi.toString(),
                    currency: 'KAS',
                    description: `${this.config.name} - ${this.config.description}`,
                    facilitator_url: ''
                };

                const response: PaymentDemandResponse = {
                    error: '',
                    payment: demand
                };

                return reply.code(402).send(response);
            }

            // Verify payment
            let proof: PaymentProof;
            try {
                proof = JSON.parse(paymentProofHeader);
            } catch (error) {
                this.metrics.totalRequests++;
                this.metrics.failedRequests++;
                this.updateMetricsStats();

                return reply.code(400).send({
                    success: false,
                    error: 'Invalid payment proof format',
                    details: 'Payment proof must be valid JSON'
                });
            }

            // Check for replay attacks / retries
            if (this.processedResults.has(proof.txid)) {
                this.server.log.info(`Returning cached result for txid: ${proof.txid}`);
                const cachedResult = this.processedResults.get(proof.txid);
                
                // Re-calculate cost for the response summary
                const cost = this.calculateCost(input);

                return reply.send({
                    ...cachedResult,
                    charged: true, // Already charged
                    cost: cost,    // Include cost in cached response
                    txid: proof.txid,
                    recipientAddress: this.wallet.address,
                    cached: true
                });
            }

            // Verify transaction
            const isValid = await verifyTransaction(
                proof.txid,
                this.wallet.address,
                costSompi,
                this.config.rpcUrl
            );

            if (!isValid) {
                this.metrics.totalRequests++;
                this.metrics.failedRequests++;
                this.updateMetricsStats();

                return reply.code(402).send({
                    success: false,
                    error: 'Payment verification failed',
                    details: 'Transaction not found or amount mismatch'
                });
            }

            // Payment verified - continue to process request below
            // We store the result in the map AFTER processRequest succeeds


            // Process the request
            const result = await this.processRequest(input);

            // For outcome-based pricing, check if we should charge
            const shouldCharge = this.config.pricing.type !== 'outcome-based' || 
                                !!result.success || 
                                !!result.valid;
            
            this.server.log.debug({ 
                pricingType: this.config.pricing.type, 
                resultSuccess: result.success, 
                shouldCharge,
                cost 
            }, 'Service processing result');

            // Update metrics
            this.metrics.totalRequests++;
            if (shouldCharge && result.success !== false) {
                this.metrics.successfulRequests++;
            } else {
                this.metrics.failedRequests++;
            }

            const responseTime = Date.now() - startTime;
            this.updateMetricsStats(responseTime);

            // Report metrics to registry (non-blocking)
            this.updateMetrics(shouldCharge && result.success !== false, responseTime).catch((err: Error) => {
                this.server.log.debug({ err }, 'Failed to update metrics');
            });

            // Return result
            const response = {
                ...result,
                charged: shouldCharge,
                cost: shouldCharge ? cost : '0',
                txid: proof.txid,
                recipientAddress: this.wallet.address
            };

            // Cache result for idempotency (only if successful)
            if (result.success !== false) {
                this.processedResults.set(proof.txid, result);
            }

            return reply.send(response);

        } catch (error) {
            this.metrics.totalRequests++;
            this.metrics.failedRequests++;
            const responseTime = Date.now() - startTime;
            this.updateMetricsStats(responseTime);

            this.server.log.error({ err: error }, 'Error processing request');

            return reply.code(500).send({
                success: false,
                error: 'Internal server error',
                details: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Update metrics statistics
     */
    private updateMetricsStats(responseTime?: number): void {
        if (responseTime !== undefined) {
            const totalTime = this.metrics.averageResponseTimeMs * (this.metrics.totalRequests - 1);
            this.metrics.averageResponseTimeMs = (totalTime + responseTime) / this.metrics.totalRequests;
        }

        this.metrics.successRate = this.metrics.totalRequests > 0
            ? this.metrics.successfulRequests / this.metrics.totalRequests
            : 0;
    }

    /**
     * Register service with the registry
     */
    private async registerService(): Promise<void> {
        try {
            const endpoint = `http://0.0.0.0:${this.config.port}/api/service`;
            const healthCheckEndpoint = this.config.healthCheckPath || `/health`;

            const response = await fetch(`${this.config.registryUrl}/registry/services`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: this.config.name,
                    description: this.config.description,
                    endpoint,
                    capabilities: this.config.capabilities,
                    pricing: this.config.pricing,
                    walletAddress: this.wallet.address,
                    healthCheckEndpoint
                })
            });

            if (!response.ok) {
                throw new Error(`Registration failed: ${response.statusText}`);
            }

            const data = await response.json() as { serviceId: string };
            this.serviceId = data.serviceId;

            console.log(`✓ Registered with service registry (ID: ${this.serviceId})`);
        } catch (error) {
            console.error(`Failed to register with service registry:`, error);
        }
    }

    /**
     * Deregister service from the registry
     */
    private async deregisterService(): Promise<void> {
        try {
            const response = await fetch(
                `${this.config.registryUrl}/registry/services/${this.serviceId}`,
                { method: 'DELETE' }
            );

            if (response.ok) {
                console.log(`✓ Deregistered from service registry`);
            }
        } catch (error) {
            console.error(`Failed to deregister from service registry:`, error);
        }
    }

    /**
     * Update metrics in the registry
     */
    private async updateMetrics(success: boolean, responseTimeMs: number): Promise<void> {
        if (!this.serviceId) return;

        try {
            await fetch(
                `${this.config.registryUrl}/registry/services/${this.serviceId}/metrics`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        success,
                        responseTimeMs
                    })
                }
            );
        } catch (error) {
            // Silently fail - metrics updates are not critical
            this.server.log.debug({ err: error }, 'Failed to update metrics');
        }
    }
}
