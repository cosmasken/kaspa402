import { describe, it, expect, beforeEach } from 'vitest';
import { UTXOSelector } from '../UTXOSelector.js';
import { EnrichedUTXO, UTXOManagerConfig } from '../../types.js';

describe('UTXOSelector', () => {
    let selector: UTXOSelector;
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
        selector = new UTXOSelector(config);
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

    describe('selectOptimal', () => {
        it('should select UTXOs successfully', async () => {
            const utxos = [
                createUTXO('100000000', 5),
                createUTXO('200000000', 10)
            ];

            const result = await selector.selectOptimal(utxos, 150000000n, 5, 90000);

            expect(result.utxos.length).toBeGreaterThan(0);
            expect(result.totalAmount).toBeGreaterThanOrEqual(150000000n);
            expect(result.strategy).toBeDefined();
            expect(result.metadata.selectionTimeMs).toBeGreaterThanOrEqual(0);
        });

        it('should try multiple strategies', async () => {
            const utxos = [
                createUTXO('50000000', 5),
                createUTXO('80000000', 10)
            ];

            const result = await selector.selectOptimal(utxos, 100000000n, 5, 90000);

            expect(result).toBeDefined();
            expect(result.metadata.strategiesAttempted.length).toBeGreaterThan(0);
        });

        it('should include metadata in result', async () => {
            const utxos = [
                createUTXO('200000000', 5)
            ];

            const result = await selector.selectOptimal(utxos, 100000000n, 5, 90000);

            expect(result.metadata).toBeDefined();
            expect(result.metadata.selectionTimeMs).toBeGreaterThanOrEqual(0);
            expect(result.metadata.strategiesAttempted).toBeInstanceOf(Array);
            expect(result.metadata.freshUtxosUsed).toBeGreaterThanOrEqual(0);
        });

        it('should track fresh UTXO usage', async () => {
            const utxos = [
                createUTXO('100000000', 1),  // Fresh
                createUTXO('50000000', 5)    // Mature
            ];

            const result = await selector.selectOptimal(utxos, 120000000n, 5, 90000);

            expect(result.metadata.freshUtxosUsed).toBeGreaterThan(0);
        });

        it('should throw error if selection impossible', async () => {
            const utxos = [
                createUTXO('50000000', 5)
            ];

            await expect(
                selector.selectOptimal(utxos, 200000000n, 5, 90000)
            ).rejects.toThrow('Failed to select UTXOs');
        });

        it('should handle empty UTXO array', async () => {
            await expect(
                selector.selectOptimal([], 100000000n, 5, 90000)
            ).rejects.toThrow();
        });

        it('should respect max inputs', async () => {
            const utxos = [
                createUTXO('10000000', 5),
                createUTXO('10000000', 5),
                createUTXO('10000000', 5),
                createUTXO('10000000', 5),
                createUTXO('10000000', 5),
                createUTXO('10000000', 5)
            ];

            const result = await selector.selectOptimal(utxos, 50000000n, 3, 90000);

            expect(result.utxos.length).toBeLessThanOrEqual(3);
        });

        it('should respect mass limit', async () => {
            const utxos = [
                createUTXO('10000000', 5),
                createUTXO('10000000', 5),
                createUTXO('10000000', 5)
            ];

            const result = await selector.selectOptimal(utxos, 25000000n, 5, 500);

            expect(result.estimatedMass).toBeLessThanOrEqual(500);
        });
    });

    describe('selectWithStrategy', () => {
        it('should use specified strategy', () => {
            const utxos = [
                createUTXO('100000000', 5),
                createUTXO('200000000', 10)
            ];

            const result = selector.selectWithStrategy(
                'age-based',
                utxos,
                150000000n,
                5,
                90000
            );

            expect(result).not.toBeNull();
            expect(result!.strategy).toBe('age-based');
        });

        it('should throw error for unknown strategy', () => {
            const utxos = [createUTXO('100000000', 5)];

            expect(() => {
                selector.selectWithStrategy(
                    'unknown-strategy',
                    utxos,
                    100000000n,
                    5,
                    90000
                );
            }).toThrow('Unknown strategy');
        });

        it('should return null if strategy fails', () => {
            const utxos = [createUTXO('50000000', 5)];

            const result = selector.selectWithStrategy(
                'hybrid',
                utxos,
                200000000n,
                5,
                90000
            );

            expect(result).toBeNull();
        });
    });

    describe('getAvailableStrategies', () => {
        it('should return list of strategies', () => {
            const strategies = selector.getAvailableStrategies();

            expect(strategies).toContain('hybrid');
            expect(strategies).toContain('age-based');
            expect(strategies).toContain('amount-based');
            expect(strategies.length).toBe(3);
        });
    });

    describe('validateSelection', () => {
        it('should validate possible selection', () => {
            const utxos = [
                createUTXO('100000000', 5),
                createUTXO('100000000', 5)
            ];

            const validation = selector.validateSelection(utxos, 150000000n, 5);

            expect(validation.isPossible).toBe(true);
            expect(validation.reason).toBeUndefined();
        });

        it('should detect empty UTXO array', () => {
            const validation = selector.validateSelection([], 100000000n, 5);

            expect(validation.isPossible).toBe(false);
            expect(validation.reason).toContain('No UTXOs available');
            expect(validation.suggestions).toBeDefined();
        });

        it('should detect insufficient funds', () => {
            const utxos = [createUTXO('50000000', 5)];

            const validation = selector.validateSelection(utxos, 200000000n, 5);

            expect(validation.isPossible).toBe(false);
            expect(validation.reason).toContain('Insufficient funds');
            expect(validation.suggestions).toBeDefined();
        });

        it('should detect max inputs constraint', () => {
            const utxos = [
                createUTXO('10000000', 5),
                createUTXO('10000000', 5),
                createUTXO('10000000', 5)
            ];

            const validation = selector.validateSelection(utxos, 50000000n, 2);

            expect(validation.isPossible).toBe(false);
            expect(validation.reason).toContain('Cannot reach target');
            expect(validation.suggestions).toBeDefined();
        });

        it('should provide helpful suggestions', () => {
            const utxos = [createUTXO('50000000', 5)];

            const validation = selector.validateSelection(utxos, 200000000n, 5);

            expect(validation.suggestions).toBeDefined();
            expect(validation.suggestions!.length).toBeGreaterThan(0);
        });
    });
});
