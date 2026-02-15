import { describe, it, expect, beforeEach } from 'vitest';
import { AmountBasedStrategy } from '../AmountBasedStrategy.js';
import { EnrichedUTXO, UTXOManagerConfig } from '../../../types.js';

describe('AmountBasedStrategy', () => {
    let strategy: AmountBasedStrategy;
    let config: UTXOManagerConfig;

    beforeEach(() => {
        config = {
            minUtxoAgeBlocks: 2,
            maxInputsPerTx: 5,
            consolidationThreshold: 10,
            massLimitBuffer: 0.9,
            maxMassBytes: 100000,
            cacheExpiryMs: 10000
        };
        strategy = new AmountBasedStrategy(config);
    });

    const createUTXO = (amount: string, ageInBlocks: number): EnrichedUTXO => ({
        outpoint: {
            transactionId: `tx_${amount}`,
            index: 0
        },
        utxoEntry: {
            amount,
            scriptPublicKey: {
                version: 0,
                scriptPublicKey: 'script'
            },
            blockDaaScore: '1000',
            isCoinbase: false
        },
        metadata: {
            fetchedAt: Date.now(),
            ageInBlocks,
            isFresh: ageInBlocks < config.minUtxoAgeBlocks,
            estimatedMassContribution: 200
        }
    });

    describe('select', () => {
        it('should prefer single large UTXO when available', () => {
            const utxos = [
                createUTXO('50000000', 5),
                createUTXO('200000000', 10),  // This should be selected
                createUTXO('30000000', 3)
            ];

            const result = strategy.select(utxos, 150000000n, 5, 90000);

            expect(result).not.toBeNull();
            expect(result!.utxos).toHaveLength(1);
            expect(result!.utxos[0].utxoEntry.amount).toBe('200000000');
        });

        it('should use multiple UTXOs if no single one covers amount', () => {
            const utxos = [
                createUTXO('100000000', 5),
                createUTXO('80000000', 10),
                createUTXO('50000000', 3)
            ];

            const result = strategy.select(utxos, 150000000n, 5, 90000);

            expect(result).not.toBeNull();
            expect(result!.utxos.length).toBeGreaterThan(1);
            // Should select largest first
            expect(result!.utxos[0].utxoEntry.amount).toBe('100000000');
        });

        it('should minimize number of inputs', () => {
            const utxos = [
                createUTXO('10000000', 5),
                createUTXO('10000000', 5),
                createUTXO('10000000', 5),
                createUTXO('90000000', 5)   // Should prefer this
            ];

            const result = strategy.select(utxos, 90000000n, 5, 90000);

            expect(result).not.toBeNull();
            expect(result!.utxos).toHaveLength(1);
        });

        it('should return null if insufficient funds', () => {
            const utxos = [
                createUTXO('50000000', 5),
                createUTXO('30000000', 10)
            ];

            const result = strategy.select(utxos, 200000000n, 5, 90000);

            expect(result).toBeNull();
        });

        it('should respect max inputs limit', () => {
            const utxos = [
                createUTXO('10000000', 5),
                createUTXO('10000000', 5),
                createUTXO('10000000', 5),
                createUTXO('10000000', 5),
                createUTXO('10000000', 5),
                createUTXO('10000000', 5)
            ];

            const result = strategy.select(utxos, 50000000n, 3, 90000);

            expect(result).not.toBeNull();
            expect(result!.utxos.length).toBeLessThanOrEqual(3);
        });

        it('should respect mass limit', () => {
            const utxos = [
                createUTXO('10000000', 5),
                createUTXO('10000000', 5),
                createUTXO('10000000', 5)
            ];

            const result = strategy.select(utxos, 25000000n, 5, 500);

            expect(result).not.toBeNull();
            expect(result!.estimatedMass).toBeLessThanOrEqual(500);
        });

        it('should handle empty UTXO array', () => {
            const result = strategy.select([], 100000000n, 5, 90000);

            expect(result).toBeNull();
        });

        it('should sort by amount correctly', () => {
            const utxos = [
                createUTXO('30000000', 5),
                createUTXO('100000000', 5),
                createUTXO('50000000', 5)
            ];

            const result = strategy.select(utxos, 120000000n, 5, 90000);

            expect(result).not.toBeNull();
            // Should select largest first (100M, then 50M)
            expect(result!.utxos[0].utxoEntry.amount).toBe('100000000');
            expect(result!.utxos[1].utxoEntry.amount).toBe('50000000');
        });
    });

    describe('findOptimalSingleUTXO', () => {
        it('should find smallest UTXO that covers amount', () => {
            const utxos = [
                createUTXO('200000000', 5),
                createUTXO('150000000', 5),  // This is optimal
                createUTXO('300000000', 5)
            ];

            const result = strategy.findOptimalSingleUTXO(utxos, 150000000n);

            expect(result).not.toBeNull();
            expect(result!.utxoEntry.amount).toBe('150000000');
        });

        it('should return null if no single UTXO covers amount', () => {
            const utxos = [
                createUTXO('50000000', 5),
                createUTXO('80000000', 5)
            ];

            const result = strategy.findOptimalSingleUTXO(utxos, 150000000n);

            expect(result).toBeNull();
        });

        it('should prefer exact match', () => {
            const utxos = [
                createUTXO('100000000', 5),  // Exact match
                createUTXO('150000000', 5),
                createUTXO('200000000', 5)
            ];

            const result = strategy.findOptimalSingleUTXO(utxos, 100000000n);

            expect(result).not.toBeNull();
            expect(result!.utxoEntry.amount).toBe('100000000');
        });
    });

    describe('getAmountStats', () => {
        it('should calculate amount statistics correctly', () => {
            const utxos = [
                createUTXO('100000000', 5),
                createUTXO('200000000', 5),
                createUTXO('50000000', 5)
            ];

            const stats = strategy.getAmountStats(utxos);

            expect(stats.totalAmount).toBe(350000000n);
            expect(stats.largestAmount).toBe(200000000n);
            expect(stats.smallestAmount).toBe(50000000n);
            expect(stats.averageAmount).toBe(116666666n);
            expect(stats.count).toBe(3);
        });

        it('should handle empty array', () => {
            const stats = strategy.getAmountStats([]);

            expect(stats.totalAmount).toBe(0n);
            expect(stats.largestAmount).toBe(0n);
            expect(stats.smallestAmount).toBe(0n);
            expect(stats.averageAmount).toBe(0n);
            expect(stats.count).toBe(0);
        });

        it('should handle single UTXO', () => {
            const utxos = [createUTXO('100000000', 5)];

            const stats = strategy.getAmountStats(utxos);

            expect(stats.totalAmount).toBe(100000000n);
            expect(stats.largestAmount).toBe(100000000n);
            expect(stats.smallestAmount).toBe(100000000n);
            expect(stats.averageAmount).toBe(100000000n);
            expect(stats.count).toBe(1);
        });
    });
});
