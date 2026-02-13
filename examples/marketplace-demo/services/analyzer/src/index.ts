/**
 * Analysis Service Agent
 * Performs data analysis with tiered pricing
 */

import { ServiceAgent, ServiceAgentConfig } from '@kaspa-agent-pay/service-agent';
import dotenv from 'dotenv';

dotenv.config();

interface AnalyzerInput {
    data: number[] | Record<string, any>[];
    analysisType: 'statistics' | 'trends' | 'anomalies' | 'predictions';
    tier: 'basic' | 'advanced';
}

interface AnalyzerOutput {
    success: boolean;
    insights: {
        summary: string;
        metrics: Record<string, number>;
        confidence: number;
    };
    tier: string;
    cost: string;
}

class AnalyzerAgent extends ServiceAgent {
    constructor(config: ServiceAgentConfig) {
        super(config);
    }

    protected validateInput(input: any): boolean {
        if (!input || typeof input !== 'object') {
            return false;
        }

        const { data, analysisType, tier } = input as AnalyzerInput;

        if (!data || !Array.isArray(data)) {
            return false;
        }

        if (!analysisType || !['statistics', 'trends', 'anomalies', 'predictions'].includes(analysisType)) {
            return false;
        }

        if (!tier || !['basic', 'advanced'].includes(tier)) {
            return false;
        }

        return true;
    }

    protected calculateCost(input: AnalyzerInput): string {
        const tier = input.tier || 'basic';
        if (tier === 'basic') {
            return process.env.BASIC_PRICE_KAS || '20.0';
        } else {
            return process.env.ADVANCED_PRICE_KAS || '50.0';
        }
    }

    protected async processRequest(input: AnalyzerInput): Promise<AnalyzerOutput> {
        const cost = this.calculateCost(input);
        let insights;

        switch (input.analysisType) {
            case 'statistics':
                insights = this.analyzeStatistics(input.data, input.tier);
                break;

            case 'trends':
                insights = this.analyzeTrends(input.data, input.tier);
                break;

            case 'anomalies':
                insights = this.detectAnomalies(input.data, input.tier);
                break;

            case 'predictions':
                insights = this.makePredictions(input.data, input.tier);
                break;

            default:
                throw new Error(`Unknown analysis type: ${input.analysisType}`);
        }

        return {
            success: true,
            insights,
            tier: input.tier,
            cost
        };
    }

    private analyzeStatistics(
        data: number[] | Record<string, any>[],
        tier: 'basic' | 'advanced'
    ): { summary: string; metrics: Record<string, number>; confidence: number } {
        const numbers = this.extractNumbers(data);

        if (numbers.length === 0) {
            return {
                summary: 'No numeric data available for analysis',
                metrics: {},
                confidence: 0
            };
        }

        const metrics: Record<string, number> = {
            count: numbers.length,
            sum: numbers.reduce((a, b) => a + b, 0),
            mean: numbers.reduce((a, b) => a + b, 0) / numbers.length,
            min: Math.min(...numbers),
            max: Math.max(...numbers)
        };

        if (tier === 'advanced') {
            // Calculate standard deviation
            const mean = metrics.mean;
            const variance = numbers.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / numbers.length;
            metrics.stdDev = Math.sqrt(variance);

            // Calculate median
            const sorted = [...numbers].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            metrics.median = sorted.length % 2 === 0
                ? (sorted[mid - 1] + sorted[mid]) / 2
                : sorted[mid];

            // Calculate quartiles
            const q1Index = Math.floor(sorted.length * 0.25);
            const q3Index = Math.floor(sorted.length * 0.75);
            metrics.q1 = sorted[q1Index];
            metrics.q3 = sorted[q3Index];
            metrics.iqr = metrics.q3 - metrics.q1;
        }

        const summary = tier === 'basic'
            ? `Basic statistics: ${numbers.length} values, mean ${metrics.mean.toFixed(2)}, range ${metrics.min}-${metrics.max}`
            : `Advanced statistics: mean ${metrics.mean.toFixed(2)}, median ${metrics.median?.toFixed(2)}, stdDev ${metrics.stdDev?.toFixed(2)}`;

        return {
            summary,
            metrics,
            confidence: tier === 'basic' ? 0.85 : 0.95
        };
    }

    private analyzeTrends(
        data: number[] | Record<string, any>[],
        tier: 'basic' | 'advanced'
    ): { summary: string; metrics: Record<string, number>; confidence: number } {
        const numbers = this.extractNumbers(data);

        if (numbers.length < 2) {
            return {
                summary: 'Insufficient data for trend analysis',
                metrics: {},
                confidence: 0
            };
        }

        const metrics: Record<string, number> = {};

        // Calculate simple trend (difference between first and last)
        metrics.firstValue = numbers[0];
        metrics.lastValue = numbers[numbers.length - 1];
        metrics.absoluteChange = metrics.lastValue - metrics.firstValue;
        metrics.percentChange = (metrics.absoluteChange / metrics.firstValue) * 100;

        if (tier === 'advanced') {
            // Calculate linear regression
            const n = numbers.length;
            const xValues = Array.from({ length: n }, (_, i) => i);
            const xMean = (n - 1) / 2;
            const yMean = numbers.reduce((a, b) => a + b, 0) / n;

            let numerator = 0;
            let denominator = 0;

            for (let i = 0; i < n; i++) {
                numerator += (xValues[i] - xMean) * (numbers[i] - yMean);
                denominator += Math.pow(xValues[i] - xMean, 2);
            }

            metrics.slope = numerator / denominator;
            metrics.intercept = yMean - metrics.slope * xMean;

            // Calculate R-squared
            const predictions = xValues.map(x => metrics.slope * x + metrics.intercept);
            const ssRes = numbers.reduce((sum, y, i) => sum + Math.pow(y - predictions[i], 2), 0);
            const ssTot = numbers.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
            metrics.rSquared = 1 - (ssRes / ssTot);
        }

        const trendDirection = metrics.absoluteChange > 0 ? 'increasing' : 'decreasing';
        const summary = tier === 'basic'
            ? `Trend: ${trendDirection} by ${Math.abs(metrics.percentChange).toFixed(1)}%`
            : `Linear trend: slope ${metrics.slope?.toFixed(4)}, R² ${metrics.rSquared?.toFixed(3)}`;

        return {
            summary,
            metrics,
            confidence: tier === 'basic' ? 0.75 : 0.88
        };
    }

    private detectAnomalies(
        data: number[] | Record<string, any>[],
        tier: 'basic' | 'advanced'
    ): { summary: string; metrics: Record<string, number>; confidence: number } {
        const numbers = this.extractNumbers(data);

        if (numbers.length < 3) {
            return {
                summary: 'Insufficient data for anomaly detection',
                metrics: {},
                confidence: 0
            };
        }

        const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
        const variance = numbers.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / numbers.length;
        const stdDev = Math.sqrt(variance);

        const threshold = tier === 'basic' ? 2 : 3; // Standard deviations
        const anomalies = numbers.filter(val => Math.abs(val - mean) > threshold * stdDev);

        const metrics: Record<string, number> = {
            totalPoints: numbers.length,
            anomalyCount: anomalies.length,
            anomalyRate: (anomalies.length / numbers.length) * 100,
            threshold: threshold,
            mean: mean,
            stdDev: stdDev
        };

        if (tier === 'advanced' && anomalies.length > 0) {
            metrics.minAnomaly = Math.min(...anomalies);
            metrics.maxAnomaly = Math.max(...anomalies);
            metrics.avgDeviation = anomalies.reduce((sum, val) =>
                sum + Math.abs(val - mean), 0) / anomalies.length;
        }

        const summary = `Detected ${anomalies.length} anomalies (${metrics.anomalyRate.toFixed(1)}% of data) using ${threshold}σ threshold`;

        return {
            summary,
            metrics,
            confidence: tier === 'basic' ? 0.70 : 0.85
        };
    }

    private makePredictions(
        data: number[] | Record<string, any>[],
        tier: 'basic' | 'advanced'
    ): { summary: string; metrics: Record<string, number>; confidence: number } {
        const numbers = this.extractNumbers(data);

        if (numbers.length < 3) {
            return {
                summary: 'Insufficient data for predictions',
                metrics: {},
                confidence: 0
            };
        }

        const metrics: Record<string, number> = {};

        if (tier === 'basic') {
            // Simple moving average prediction
            const windowSize = Math.min(3, numbers.length);
            const recentValues = numbers.slice(-windowSize);
            metrics.nextValue = recentValues.reduce((a, b) => a + b, 0) / windowSize;
            metrics.method = 1; // 1 = moving average
        } else {
            // Linear regression prediction
            const n = numbers.length;
            const xValues = Array.from({ length: n }, (_, i) => i);
            const xMean = (n - 1) / 2;
            const yMean = numbers.reduce((a, b) => a + b, 0) / n;

            let numerator = 0;
            let denominator = 0;

            for (let i = 0; i < n; i++) {
                numerator += (xValues[i] - xMean) * (numbers[i] - yMean);
                denominator += Math.pow(xValues[i] - xMean, 2);
            }

            const slope = numerator / denominator;
            const intercept = yMean - slope * xMean;

            metrics.nextValue = slope * n + intercept;
            metrics.slope = slope;
            metrics.intercept = intercept;
            metrics.method = 2; // 2 = linear regression

            // Predict next 3 values
            metrics.nextValue2 = slope * (n + 1) + intercept;
            metrics.nextValue3 = slope * (n + 2) + intercept;
        }

        const summary = tier === 'basic'
            ? `Predicted next value: ${metrics.nextValue.toFixed(2)} (moving average)`
            : `Predicted next values: ${metrics.nextValue.toFixed(2)}, ${metrics.nextValue2?.toFixed(2)}, ${metrics.nextValue3?.toFixed(2)} (linear regression)`;

        return {
            summary,
            metrics,
            confidence: tier === 'basic' ? 0.65 : 0.78
        };
    }

    private extractNumbers(data: number[] | Record<string, any>[]): number[] {
        if (data.length === 0) return [];

        // If it's already a number array
        if (typeof data[0] === 'number') {
            return data as number[];
        }

        // If it's an array of objects, extract numeric values
        const numbers: number[] = [];
        for (const item of data as Record<string, any>[]) {
            for (const value of Object.values(item)) {
                if (typeof value === 'number') {
                    numbers.push(value);
                }
            }
        }

        return numbers;
    }
}

// Start the service
const config: ServiceAgentConfig = {
    name: 'Analyzer',
    description: 'Performs statistical analysis and insights generation',
    capabilities: ['data-analysis'],
    pricing: {
        type: 'tiered',
        tiers: [
            {
                name: 'basic',
                amount: process.env.BASIC_PRICE_KAS || '20.0',
                features: ['Basic statistics', 'Simple trends']
            },
            {
                name: 'advanced',
                amount: process.env.ADVANCED_PRICE_KAS || '50.0',
                features: ['Advanced statistics', 'Linear regression', 'Anomaly detection', 'Predictions']
            }
        ]
    },
    port: parseInt(process.env.PORT || '3004'),
    registryUrl: process.env.REGISTRY_URL || 'http://localhost:5000',
    walletPath: process.env.WALLET_PATH || './wallets/analyzer.json',
    privateKeyWif: process.env.PRIVATE_KEY_WIF,
    network: (process.env.KASPA_NETWORK as any) || 'testnet',
    rpcUrl: process.env.KASPA_RPC_URL || 'https://api-tn10.kaspa.org'
};

const agent = new AnalyzerAgent(config);

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
    console.error('Failed to start Analyzer agent:', error);
    process.exit(1);
});
