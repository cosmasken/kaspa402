import { describe, it, expect, beforeEach } from 'vitest';
import { HybridStrategy } from '../HybridStrategy.js';
import { EnrichedUTXO, UTXOManagerConfig } from '../../../types.js';

describe('HybridStrategy', () => {
    let strategy: HybridStrategy;
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
        strategy = new HybridStrategy(config);
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
        it('should balance age and amount considerations', () => {
            const utxos = [
                createUTXO('50000000', 1),    // Fresh, small
                createUTXO('150000000', 3),   // Mature, covers amount
                createUTXO('80000000', 10)    // Very mature, medium
            ];

            const result = strategy.select(utxos, 150000000n, 5, 90000);

            expect(result).not.toBeNull();
            // Should prefer the mature UTXO that covers the amount
            expect(result!.utxos[0].utxoEntry.amount).toBe('150000000');
        });

        it('should penalize fresh UTXOs', () => {
            const utxos = [
                createUTXO('200000000', 1),   // Fresh but large
                createUTXO('150000000', 5)    // Mature, covers amount
            ];

            const result = strategy.select(utxos, 150000000n, 5, 90000);

            expect(result).not.toBeNull();
            // Should prefer mature UTXO despite being smaller
            expect(result!.utxos[0].utxoEntry.amount).toBe('150000000');
        });

        it('should prefer single UTXO when it has good score', () => {
            const utxos = [
                createUTXO('50000000', 10),
                createUTXO('50000000', 10),
                createUTXO('150000000', 5)    // Covers amount, mature
            ];

            const result = strategy.select(utxos, 150000000n, 5, 90000);

            expect(result).not.toBeNull();
            expect(result!.utxos).toHaveLength(1);
        });

        it('should handle mixed quality UTXOs', () => {
            const utxos = [
                createUTXO('30000000', 1),    // Fresh, small - low score
                createUTXO('80000000', 10),   // Mature, medium - good score
                createUTXO('50000000', 5),    // Mature, small - medium score
                createUTXO('40000000', 2)     // Just mature, small - medium score
            ];

            const result = strategy.select(utxos, 100000000n, 5, 90000);

            expect(result).not.toBeNull();
            // Should select best scoring UTXOs first
            expect(result!.utxos[0].metadata.ageInBlocks).toBeGreaterThanOrEqual(2);
        });

        it('should return null if insufficient funds', () => {
            const utxos = [
                createUTXO('50000000', 10),
                createUTXO('30000000', 5)
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
    });

    describe('scoring', () => {
        it('should give high score to old, large UTXOs', () => {
            const utxo = createUTXO('200000000', 10);
            const scores = strategy.getDetailedScores([utxo], 100000000n);

            expect(scores[0].score).toBeGreaterThan(80);
            expect(scores[0].breakdown.ageScore).toBe(100);
            expect(scores[0].breakdown.amountScore).toBe(100);
        });

        it('should give low score to fresh, small UTXOs', () => {
            const utxo = createUTXO('10000000', 1);
            const scores = strategy.getDetailedScores([utxo], 100000000n);

            expect(scores[0].score).toBeLessThan(30);
            expect(scores[0].breakdown.ageScore).toBe(0);
            expect(scores[0].breakdown.amountScore).toBeLessThan(20);
        });

        it('should score age correctly', () => {
            const fresh = createUTXO('100000000', 1);
            const justMature = createUTXO('100000000', 2);
            const mature = createUTXO('100000000', 5);
            const veryMature = createUTXO('100000000', 10);

            const scores = strategy.getDetailedScores(
                [fresh, justMature, mature, veryMature],
                100000000n
            );

            expect(scores[0].breakdown.ageScore).toBe(0);
            expect(scores[1].breakdown.ageScore).toBeGreaterThan(0);
            expect(scores[2].breakdown.ageScore).toBeGreaterThan(scores[1].breakdown.ageScore);
            expect(scores[3].breakdown.ageScore).toBe(100);
        });

        it('should score amount correctly', () => {
            const small = createUTXO('25000000', 5);
            const medium = createUTXO('50000000', 5);
            const large = createUTXO('100000000', 5);
            const veryLarge = createUTXO('200000000', 5);

            const scores = strategy.getDetailedScores(
                [small, medium, large, veryLarge],
                100000000n
            );

            expect(scores[0].breakdown.amountScore).toBeLessThan(50);
            expect(scores[1].breakdown.amountScore).toBeCloseTo(50, 0);
            expect(scores[2].breakdown.amountScore).toBe(100);
            expect(scores[3].breakdown.amountScore).toBe(100);
        });

        it('should sort by composite score', () => {
            const utxos = [
                createUTXO('50000000', 1),    // Low score (fresh)
                createUTXO('150000000', 5),   // High score (mature + covers)
                createUTXO('80000000', 10),   // Good score (very mature)
                createUTXO('30000000', 3)     // Medium score
            ];

            const scores = strategy.getDetailedScores(utxos, 100000000n);

            // Should be sorted by score
            for (let i = 0; i < scores.length - 1; i++) {
                expect(scores[i].score).toBeGreaterThanOrEqual(scores[i + 1].score);
            }
        });
    });

    describe('explainScore', () => {
        it('should provide detailed explanation', () => {
            const utxo = createUTXO('150000000', 5);
            const explanation = strategy.explainScore(utxo, 100000000n);

            expect(explanation).toContain('Score:');
            expect(explanation).toContain('Age Score:');
            expect(explanation).toContain('Amount Score:');
            expect(explanation).toContain('Mass Score:');
            expect(explanation).toContain('5 blocks');
            expect(explanation).toContain('150000000 sompi');
        });

        it('should show fresh status', () => {
            const utxo = createUTXO('100000000', 1);
            const explanation = strategy.explainScore(utxo, 100000000n);

            expect(explanation).toContain('Fresh: Yes');
        });

        it('should show coverage percentage', () => {
            const utxo = createUTXO('50000000', 5);
            const explanation = strategy.explainScore(utxo, 100000000n);

            expect(explanation).toContain('Coverage: 50%');
        });
    });

    describe('getDetailedScores', () => {
        it('should return scores for all UTXOs', () => {
            const utxos = [
                createUTXO('100000000', 5),
                createUTXO('200000000', 10),
                createUTXO('50000000', 2)
            ];

            const scores = strategy.getDetailedScores(utxos, 100000000n);

            expect(scores).toHaveLength(3);
            scores.forEach(scored => {
                expect(scored.score).toBeGreaterThanOrEqual(0);
                expect(scored.score).toBeLessThanOrEqual(100);
                expect(scored.breakdown).toBeDefined();
            });
        });

        it('should include breakdown for each score', () => {
            const utxos = [createUTXO('100000000', 5)];
            const scores = strategy.getDetailedScores(utxos, 100000000n);

            expect(scores[0].breakdown.ageScore).toBeDefined();
            expect(scores[0].breakdown.amountScore).toBeDefined();
            expect(scores[0].breakdown.massScore).toBeDefined();
        });
    });
});
