/**
 * Orchestrator Agent
 * Discovers and composes multiple paid services to complete complex tasks
 */

import { AgentClient } from '@kaspa-agent-pay/agent-client';
import { logger } from './ui/logger.js';
import { ServiceCallTracker } from './ui/progress.js';
import { formatKAS } from './ui/formatters.js';

export interface ServiceMetadata {
    id: string;
    name: string;
    description: string;
    endpoint: string;
    capabilities: string[];
    pricing: PricingModel;
    metrics: ServiceMetrics;
    status: 'active' | 'inactive' | 'degraded';
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

export interface SubTask {
    id: string;
    capability: string;
    input: any;
    dependsOn?: string[];
    maxCost?: string;
}

export interface SelectedService {
    serviceId: string;
    serviceName: string;
    endpoint: string;
    pricing: PricingModel;
    input: any;
    subtaskId: string;
}

export interface ServicePlan {
    services: SelectedService[];
    totalCost: bigint;
    estimatedTime: number;
}

export interface ServiceUsage {
    serviceId: string;
    serviceName: string;
    cost: string;
    success: boolean;
    responseTimeMs: number;
    output?: any;
    error?: string;
    txid?: string;
    recipientAddress?: string;
}

export interface TaskResult {
    success: boolean;
    output: any;
    servicesUsed: ServiceUsage[];
    totalCost: string;
    executionTimeMs: number;
}

export interface OrchestratorConfig {
    registryUrl: string;
    budget: string; // KAS
    agentClient: AgentClient;
}

export class OrchestratorAgent {
    private config: OrchestratorConfig;
    private serviceCache: Map<string, ServiceMetadata[]> = new Map();
    private cacheExpiry: number = 60000; // 1 minute
    private lastCacheUpdate: number = 0;

    constructor(config: OrchestratorConfig) {
        this.config = config;
    }

    /**
     * Discover services by capability
     */
    async discoverServices(capability: string, minSuccessRate?: number): Promise<ServiceMetadata[]> {
        // Check cache
        const now = Date.now();
        if (this.serviceCache.has(capability) && (now - this.lastCacheUpdate) < this.cacheExpiry) {
            const cached = this.serviceCache.get(capability)!;
            if (minSuccessRate !== undefined) {
                return cached.filter(s => s.metrics.successRate >= minSuccessRate);
            }
            return cached;
        }

        // Query registry with retry logic
        const maxRetries = 3;
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                let url = `${this.config.registryUrl}/registry/services/search?capability=${encodeURIComponent(capability)}`;
                if (minSuccessRate !== undefined) {
                    url += `&minSuccessRate=${minSuccessRate}`;
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

                const response = await fetch(url, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`Registry query failed: ${response.statusText}`);
                }

                const data = await response.json() as { services?: ServiceMetadata[] };
                const services = data.services || [];

                // Update cache
                this.serviceCache.set(capability, services);
                this.lastCacheUpdate = now;

                return services;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                if (attempt < maxRetries) {
                    logger.debug(`Discovery attempt ${attempt} failed, retrying... (${lastError.message})`);
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
                }
            }
        }

        // All retries failed - check if we have cached data
        if (this.serviceCache.has(capability)) {
            logger.warn(`Using stale cached data for ${capability} after discovery failure`);
            const cached = this.serviceCache.get(capability)!;
            if (minSuccessRate !== undefined) {
                return cached.filter(s => s.metrics.successRate >= minSuccessRate);
            }
            return cached;
        }

        logger.error(`Failed to discover services for capability ${capability} after ${maxRetries} attempts:`, lastError);
        return [];
    }

    /**
     * Select the best service based on cost and quality
     */
    selectBestService(services: ServiceMetadata[], subtask: SubTask): SelectedService | null {
        if (services.length === 0) {
            return null;
        }

        // Filter by status
        const activeServices = services.filter(s => s.status === 'active');
        if (activeServices.length === 0) {
            return null;
        }

        // Score services based on cost and quality
        const scored = activeServices.map(service => {
            const cost = this.estimateServiceCost(service, subtask.input);
            const costScore = 1 / (1 + parseFloat(cost)); // Lower cost = higher score
            const qualityScore = service.metrics.successRate;
            const responseScore = 1 / (1 + service.metrics.averageResponseTimeMs / 1000); // Faster = higher score

            // Weighted score: 40% cost, 40% quality, 20% speed
            const totalScore = (costScore * 0.4) + (qualityScore * 0.4) + (responseScore * 0.2);

            return {
                service,
                cost,
                score: totalScore
            };
        });

        // Sort by score (highest first)
        scored.sort((a, b) => b.score - a.score);

        const best = scored[0];

        return {
            serviceId: best.service.id,
            serviceName: best.service.name,
            endpoint: best.service.endpoint,
            pricing: best.service.pricing,
            input: subtask.input,
            subtaskId: subtask.id
        };
    }

    /**
     * Estimate the cost of calling a service
     */
    private estimateServiceCost(service: ServiceMetadata, input: any): string {
        const pricing = service.pricing;

        if (pricing.type === 'fixed' || pricing.type === 'outcome-based') {
            return pricing.baseAmount || '0';
        }

        if (pricing.type === 'usage-based' && pricing.usageRate) {
            const size = JSON.stringify(input).length;
            const sizeKB = size / 1024;
            const rate = parseFloat(pricing.usageRate);
            return (sizeKB * rate).toFixed(8);
        }

        if (pricing.type === 'tiered' && pricing.tiers && pricing.tiers.length > 0) {
            // Use the first tier as default estimate
            return pricing.tiers[0].amount;
        }

        return pricing.baseAmount || '0';
    }

    /**
     * Plan services for a list of subtasks with error handling
     */
    async planServices(subtasks: SubTask[]): Promise<ServicePlan> {
        const plan: ServicePlan = {
            services: [],
            totalCost: BigInt(0),
            estimatedTime: 0
        };

        for (const subtask of subtasks) {
            try {
                // Don't filter by success rate for new services (they have 0% success rate initially)
                const services = await this.discoverServices(subtask.capability);

                if (services.length === 0) {
                    throw new Error(`No services found for capability: ${subtask.capability}`);
                }

                const selected = this.selectBestService(services, subtask);

                if (!selected) {
                    throw new Error(`Failed to select service for capability: ${subtask.capability}`);
                }

                plan.services.push(selected);

                const cost = this.estimateServiceCost(
                    services.find(s => s.id === selected.serviceId)!,
                    subtask.input
                );
                plan.totalCost += BigInt(Math.floor(parseFloat(cost) * 100_000_000));

                // Estimate time based on service metrics
                const service = services.find(s => s.id === selected.serviceId)!;
                plan.estimatedTime += service.metrics.averageResponseTimeMs || 1000;
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                logger.error(`Error planning subtask ${subtask.id}: ${errorMsg}`);
                throw new Error(`Service planning failed: ${errorMsg}`);
            }
        }

        // Pre-flight wallet health check
        logger.debug('Checking wallet health before execution...');
        
        try {
            const balance = await this.config.agentClient.checkBalance();
            
            // Check if wallet has enough total balance
            const totalCostKAS = Number(plan.totalCost) / 100_000_000;
            if (parseFloat(balance.kas) < totalCostKAS) {
                throw new Error(
                    `Insufficient balance: Have ${balance.kas} KAS, need ${totalCostKAS.toFixed(8)} KAS`
                );
            }
            
            // Check UTXO count and fragmentation
            if (balance.utxoCount === 0) {
                throw new Error('No UTXOs available - wallet needs funding');
            }
            
            if (balance.utxoCount > 20) {
                logger.warn(`Wallet has ${balance.utxoCount} UTXOs - consider consolidation`);
            }
            
            logger.debug(`Wallet health check passed: ${balance.kas} KAS, ${balance.utxoCount} UTXOs`);
            
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error(`Wallet health check failed: ${errorMsg}`);
            throw new Error(`Cannot execute service chain: ${errorMsg}`);
        }

        return plan;
    }

    /**
     * Execute a service chain with error handling and timeouts
     */
    async executeServiceChain(plan: ServicePlan): Promise<ServiceUsage[]> {
        const results: ServiceUsage[] = [];
        let previousOutput: any = null;

        for (const service of plan.services) {
            const startTime = Date.now();
            const maxRetries = 2;
            let lastError: Error | null = null;
            const tracker = new ServiceCallTracker();

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    // Merge previous output with service input
                    let input;
                    if (previousOutput !== null && service.input && typeof service.input === 'object') {
                        // If service input has a 'data' field, replace it with previous output
                        if ('data' in service.input) {
                            input = { ...service.input, data: previousOutput };
                        } else {
                            // Otherwise use previous output directly
                            input = previousOutput;
                        }
                    } else {
                        input = previousOutput !== null ? previousOutput : service.input;
                    }

                    if (attempt > 1) {
                        tracker.updateRetry(attempt, maxRetries);
                    } else {
                        logger.blank();
                        tracker.start(service.serviceName);
                    }

                    // Set timeout for service call (120 seconds for testnet stability)
                    const timeoutPromise = new Promise<never>((_, reject) => {
                        setTimeout(() => reject(new Error('Service call timeout (120s)')), 120000);
                    });

                    const requestPromise = this.config.agentClient.paidRequest(
                        service.endpoint,
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(input)
                        }
                    );

                    const response = await Promise.race([requestPromise, timeoutPromise]);
                    const responseTime = Date.now() - startTime;

                    if (!response.ok) {
                        // Check if it's a service unavailable error
                        if (response.status === 503) {
                            throw new Error('Service temporarily unavailable');
                        }
                        throw new Error(`Service returned ${response.status}: ${response.statusText}`);
                    }

                    const result = await response.json() as any;
                    previousOutput = result.processedData || result.data || result;

                    results.push({
                        serviceId: service.serviceId,
                        serviceName: service.serviceName,
                        cost: result.cost || '0',
                        success: true,
                        responseTimeMs: responseTime,
                        output: result,
                        txid: result.txid,
                        recipientAddress: result.recipientAddress
                    });

                    tracker.succeed(result.cost ? formatKAS(result.cost) : undefined, responseTime);
                    break; // Success, exit retry loop

                } catch (error) {
                    lastError = error instanceof Error ? error : new Error(String(error));

                    if (attempt < maxRetries) {
                        tracker.warn(`Attempt ${attempt} failed: ${lastError.message}`);
                        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retry
                        tracker.start(service.serviceName);
                    } else {
                        // All retries exhausted
                        const responseTime = Date.now() - startTime;

                        results.push({
                            serviceId: service.serviceId,
                            serviceName: service.serviceName,
                            cost: '0',
                            success: false,
                            responseTimeMs: responseTime,
                            error: lastError.message
                        });

                        tracker.fail(lastError.message);

                        // Return partial results instead of throwing
                        logger.blank();
                        logger.warn('Service chain interrupted. Returning partial results.');
                        return results;
                    }
                }
            }
        }

        return results;
    }

    /**
     * Check if budget is sufficient for a plan
     */
    checkBudget(plan: ServicePlan): boolean {
        const budgetSompi = BigInt(Math.floor(parseFloat(this.config.budget) * 100_000_000));
        return plan.totalCost <= budgetSompi;
    }

    /**
     * Get budget in KAS
     */
    getBudgetKAS(): string {
        return this.config.budget;
    }

    /**
     * Get remaining budget after costs
     */
    getRemainingBudget(totalCostKAS: string): string {
        const budget = parseFloat(this.config.budget);
        const spent = parseFloat(totalCostKAS);
        return (budget - spent).toFixed(8);
    }

    /**
     * Get service wallet address from registry
     */
    private async getServiceWalletAddress(serviceId: string): Promise<string | undefined> {
        try {
            const response = await fetch(`${this.config.registryUrl}/registry/services/${serviceId}`);
            if (!response.ok) {
                return undefined;
            }
            const service = await response.json() as ServiceMetadata & { walletAddress?: string };
            return service.walletAddress;
        } catch (error) {
            logger.debug(`Failed to fetch wallet address for service ${serviceId}`);
            return undefined;
        }
    }
}
