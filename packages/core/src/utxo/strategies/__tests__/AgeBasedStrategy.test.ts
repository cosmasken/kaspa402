import { describe, it, expect, beforeEach } from 'vitest';
import { AgeBasedStrategy } from '../AgeBasedStrategy.js';
import { EnrichedUTXO, UTXOManagerConfig } from '../../../types.js';

describe('AgeBasedStrategy', () => {
    let strategy: AgeBasedStrategy;
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
        strategy = new AgeBasedStrategy(config);
    });

    const createUTXO = (amount: string, ageInBlocks: number): EnrichedUTXO => ({
        outpoint: {
            transactionId: `tx_${amount}_${ageInBlocks}`,
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
        it('should prioritize older UTXOs', () => {
            const utxos = [
                createUTXO('100000000', 1),  // Fresh
                createUTXO('100000000', 5),  // Mature
                createUTXO('100000000', 10), // Oldest
                createUTXO('100000000', 3)   // Mature
            ];

            const result = strategy.select(utxos, 150000000n, 5, 90000);

            expect(result).not.toBeNull();
            expect(result!.utxos).toHaveLength(2);
            // Should select oldest first (10 blocks, then 5 blocks)
            expect(result!.utxos[0].metadata.ageInBlocks).toBe(10);
            expect(result!.utxos[1].metadata.ageInBlocks).toBe(5);
        });

        it('should avoid fresh UTXOs when possible', () => {
            const utxos = [
                createUTXO('50000000', 1),   // Fresh
                createUTXO('100000000', 5),  // Mature
                createUTXO('100000000', 10)  // Mature
            ];

            const result = strategy.select(utxos, 150000000n, 5, 90000);

            expect(result).not.toBeNull();
            expect(result!.utxos).toHaveLength(2);
            // Should not use fresh UTXO
            expect(result!.utxos.every(u => !u.metadata.isFresh)).toBe(true);
        });

        it('should use fresh UTXOs if necessary', () => {
            const utxos = [
                createUTXO('50000000', 1),   // Fresh
                createUTXO('100000000', 5)   // Mature (not enough alone)
            ];

            const result = strategy.select(utxos, 120000000n, 5, 90000);

            expect(result).not.toBeNull();
            expect(result!.utxos).toHaveLength(2);
            expect(result!.warnings).toContain('Had to use fresh UTXOs due to insufficient mature balance');
        });

        it('should return null if insufficient funds', () => {
            const utxos = [
                createUTXO('50000000', 5),
                createUTXO('50000000', 10)
            ];

            const result = strategy.select(utxos, 200000000n, 5, 90000);

            expect(result).toBeNull();
        });

        it('should respect max inputs limit', () => {
            const utxos = [
                createUTXO('10000000', 10),
                createUTXO('10000000', 9),
                createUTXO('10000000', 8),
                createUTXO('10000000', 7),
                createUTXO('10000000', 6),
                createUTXO('10000000', 5)
            ];

            const result = strategy.select(utxos, 50000000n, 3, 90000);

            expect(result).not.toBeNull();
            expect(result!.utxos.length).toBeLessThanOrEqual(3);
        });

        it('should respect mass limit', () => {
            const utxos = [
                createUTXO('10000000', 10),
                createUTXO('10000000', 9),
                createUTXO('10000000', 8)
            ];

            // Very low mass limit
            const result = strategy.select(utxos, 25000000n, 5, 500);

            expect(result).not.toBeNull();
            expect(result!.estimatedMass).toBeLessThanOrEqual(500);
        });

        it('should handle empty UTXO array', () => {
            const result = strategy.select([], 100000000n, 5, 90000);

            expect(result).toBeNull();
        });

        it('should handle all fresh UTXOs', () => {
            const utxos = [
                createUTXO('100000000', 0),
                createUTXO('100000000', 1)
            ];

            const result = strategy.select(utxos, 150000000n, 5, 90000);

            expect(result).not.toBeNull();
            expect(result!.warnings.some(w => w.includes('fresh'))).toBe(true);
        });

        it('should select exact amount when possible', () => {
            const utxos = [
                createUTXO('100000000', 10),
                createUTXO('50000000', 5)
            ];

            const result = strategy.select(utxos, 100000000n, 5, 90000);

            expect(result).not.toBeNull();
            expect(result!.utxos).toHaveLength(1);
            expect(result!.totalAmount).toBe(100000000n);
        });
    });

    describe('getAgeStats', () => {
        it('should calculate age statistics correctly', () => {
            const utxos = [
                createUTXO('100000000', 1),  // Fresh
                createUTXO('100000000', 5),  // Mature
                createUTXO('100000000', 10), // Mature
                createUTXO('100000000', 3)   // Mature
            ];

            const stats = strategy.getAgeStats(utxos);

            expect(stats.matureCount).toBe(3);
            expect(stats.freshCount).toBe(1);
            expect(stats.oldestAge).toBe(10);
            expect(stats.newestAge).toBe(1);
            expect(stats.averageAge).toBeCloseTo(4.75, 2);
        });

        it('should handle empty array', () => {
            const stats = strategy.getAgeStats([]);

            expect(stats.matureCount).toBe(0);
            expect(stats.freshCount).toBe(0);
            expect(stats.oldestAge).toBe(0);
            expect(stats.newestAge).toBe(0);
            expect(stats.averageAge).toBe(0);
        });

        it('should handle all mature UTXOs', () => {
            const utxos = [
                createUTXO('100000000', 5),
                createUTXO('100000000', 10)
            ];

            const stats = strategy.getAgeStats(utxos);

            expect(stats.matureCount).toBe(2);
            expect(stats.freshCount).toBe(0);
        });

        it('should handle all fresh UTXOs', () => {
            const utxos = [
                createUTXO('100000000', 0),
                createUTXO('100000000', 1)
            ];

            const stats = strategy.getAgeStats(utxos);

            expect(stats.matureCount).toBe(0);
            expect(stats.freshCount).toBe(2);
        });
    });
});
