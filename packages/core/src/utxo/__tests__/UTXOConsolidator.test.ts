// @ts-nocheck
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { UTXOConsolidator } from '../UTXOConsolidator.js';
import { UTXOFetcher } from '../UTXOFetcher.js';
import { MassEstimator } from '../MassEstimator.js';
import { UTXOCache } from '../UTXOCache.js';
import { EnrichedUTXO, UTXOManagerConfig } from '../../types.js';

type CreateTxFn = (privateKey: string, recipient: string, amount: bigint, utxos: EnrichedUTXO[]) => Promise<string>;

describe('UTXOConsolidator', () => {
    let consolidator: UTXOConsolidator;
    let fetcher: UTXOFetcher;
    let estimator: MassEstimator;
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

        const cache = new UTXOCache(config.cacheExpiryMs);
        fetcher = new UTXOFetcher(cache, config);
        estimator = new MassEstimator(config);
        consolidator = new UTXOConsolidator(config, fetcher, estimator);
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

    describe('shouldConsolidate', () => {
        it('should return true when many small UTXOs exist', async () => {
            const utxos = Array(15).fill(null).map((_, i) =>
                createUTXO('50000000', 10 + i) // 0.5 KAS each
            );

            jest.spyOn(fetcher, 'fetchUTXOs').mockResolvedValue(utxos);

            const result = await consolidator.shouldConsolidate('kaspatest:qq123', 'testnet');

            expect(result).toBe(true);
        });

        it('should return false when few small UTXOs exist', async () => {
            const utxos = [
                createUTXO('50000000', 10),
                createUTXO('50000000', 10),
                createUTXO('200000000', 10) // 2 KAS (not small)
            ];

            jest.spyOn(fetcher, 'fetchUTXOs').mockResolvedValue(utxos);

            const result = await consolidator.shouldConsolidate('kaspatest:qq123', 'testnet');

            expect(result).toBe(false);
        });

        it('should only count UTXOs below 1 KAS as small', async () => {
            const utxos = [
                ...Array(5).fill(null).map((_, i) => createUTXO('50000000', 10 + i)),
                ...Array(10).fill(null).map((_, i) => createUTXO('150000000', 10 + i)) // 1.5 KAS (not small)
            ];

            jest.spyOn(fetcher, 'fetchUTXOs').mockResolvedValue(utxos);

            const result = await consolidator.shouldConsolidate('kaspatest:qq123', 'testnet');

            expect(result).toBe(false); // Only 5 small UTXOs
        });
    });

    describe('consolidate', () => {
        it('should consolidate multiple small UTXOs', async () => {
            const utxos = Array(12).fill(null).map((_, i) =>
                createUTXO('50000000', 15 + i)
            );

            jest.spyOn(fetcher, 'fetchUTXOs').mockResolvedValue(utxos);
            jest.spyOn(fetcher, 'invalidateCache').mockImplementation(() => { });

            const mockCreateTx = jest.fn<CreateTxFn>().mockResolvedValue('consolidation_txid');

            const result = await consolidator.consolidate(
                'kaspatest:qq123',
                'private_key',
                'testnet',
                mockCreateTx
            );

            expect(result.success).toBe(true);
            expect(result.txid).toBe('consolidation_txid');
            expect(result.utxosConsolidated).toBeGreaterThan(0);
            expect(result.utxosConsolidated).toBeLessThanOrEqual(config.maxInputsPerTx);
            expect(result.afterCount).toBeLessThan(result.beforeCount);
        });

        it('should not consolidate if insufficient candidates', async () => {
            const utxos = [createUTXO('50000000', 15)]; // Only 1 UTXO

            jest.spyOn(fetcher, 'fetchUTXOs').mockResolvedValue(utxos);

            const mockCreateTx = jest.fn<CreateTxFn>();

            const result = await consolidator.consolidate(
                'kaspatest:qq123',
                'private_key',
                'testnet',
                mockCreateTx
            );

            expect(result.success).toBe(false);
            expect(result.utxosConsolidated).toBe(0);
            expect(mockCreateTx).not.toHaveBeenCalled();
        });

        it('should only select mature UTXOs', async () => {
            const utxos = [
                ...Array(5).fill(null).map((_, i) => createUTXO('50000000', 5 + i)), // Not mature enough
                ...Array(5).fill(null).map((_, i) => createUTXO('50000000', 15 + i)) // Mature
            ];

            jest.spyOn(fetcher, 'fetchUTXOs').mockResolvedValue(utxos);

            const mockCreateTx = jest.fn<CreateTxFn>().mockResolvedValue('txid');

            await consolidator.consolidate(
                'kaspatest:qq123',
                'private_key',
                'testnet',
                mockCreateTx
            );

            // Should only consolidate the 5 mature UTXOs
            expect(mockCreateTx).toHaveBeenCalled();
            const consolidatedUtxos = mockCreateTx.mock.calls[0][3];
            expect(consolidatedUtxos.every((u: EnrichedUTXO) => u.metadata.ageInBlocks >= 10)).toBe(true);
        });

        it('should handle transaction creation failure', async () => {
            const utxos = Array(12).fill(null).map((_, i) =>
                createUTXO('50000000', 15 + i)
            );

            jest.spyOn(fetcher, 'fetchUTXOs').mockResolvedValue(utxos);

            const mockCreateTx = jest.fn<CreateTxFn>().mockRejectedValue(new Error('TX failed'));

            const result = await consolidator.consolidate(
                'kaspatest:qq123',
                'private_key',
                'testnet',
                mockCreateTx
            );

            expect(result.success).toBe(false);
            expect(result.utxosConsolidated).toBe(0);
        });

        it('should invalidate cache after successful consolidation', async () => {
            const utxos = Array(12).fill(null).map((_, i) =>
                createUTXO('50000000', 15 + i)
            );

            jest.spyOn(fetcher, 'fetchUTXOs').mockResolvedValue(utxos);
            const invalidateSpy = jest.spyOn(fetcher, 'invalidateCache').mockImplementation(() => { });

            const mockCreateTx = jest.fn<CreateTxFn>().mockResolvedValue('txid');

            await consolidator.consolidate(
                'kaspatest:qq123',
                'private_key',
                'testnet',
                mockCreateTx
            );

            expect(invalidateSpy).toHaveBeenCalledWith('kaspatest:qq123', 'testnet');
        });
    });

    describe('calculateFragmentationScore', () => {
        it('should return 0 for empty array', () => {
            const score = consolidator.calculateFragmentationScore([]);
            expect(score).toBe(0);
        });

        it('should return low score for few large UTXOs', () => {
            const utxos = [
                createUTXO('500000000', 10),
                createUTXO('500000000', 10)
            ];

            const score = consolidator.calculateFragmentationScore(utxos);
            expect(score).toBeLessThan(30);
        });

        it('should return high score for many small UTXOs', () => {
            const utxos = Array(25).fill(null).map((_, i) =>
                createUTXO('10000000', 10 + i)
            );

            const score = consolidator.calculateFragmentationScore(utxos);
            expect(score).toBeGreaterThan(60);
        });

        it('should return medium score for mixed UTXOs', () => {
            const utxos = [
                ...Array(5).fill(null).map(() => createUTXO('50000000', 10)),
                ...Array(3).fill(null).map(() => createUTXO('200000000', 10))
            ];

            const score = consolidator.calculateFragmentationScore(utxos);
            expect(score).toBeGreaterThan(20);
            expect(score).toBeLessThan(70);
        });
    });

    describe('getConsolidationRecommendations', () => {
        it('should provide recommendations for healthy wallet', async () => {
            const utxos = [
                createUTXO('500000000', 10),
                createUTXO('500000000', 10)
            ];

            jest.spyOn(fetcher, 'fetchUTXOs').mockResolvedValue(utxos);

            const recommendations = await consolidator.getConsolidationRecommendations(
                'kaspatest:qq123',
                'testnet'
            );

            expect(recommendations.shouldConsolidate).toBe(false);
            expect(recommendations.fragmentationScore).toBeLessThan(30);
            expect(recommendations.recommendation).toContain('healthy');
        });

        it('should provide recommendations for fragmented wallet', async () => {
            const utxos = Array(20).fill(null).map((_, i) =>
                createUTXO('30000000', 15 + i)
            );

            jest.spyOn(fetcher, 'fetchUTXOs').mockResolvedValue(utxos);

            const recommendations = await consolidator.getConsolidationRecommendations(
                'kaspatest:qq123',
                'testnet'
            );

            expect(recommendations.shouldConsolidate).toBe(true);
            expect(recommendations.fragmentationScore).toBeGreaterThan(60);
            expect(recommendations.recommendation).toContain('strongly recommended');
            expect(recommendations.candidateCount).toBeGreaterThan(0);
        });

        it('should estimate savings from consolidation', async () => {
            const utxos = Array(15).fill(null).map((_, i) =>
                createUTXO('50000000', 15 + i)
            );

            jest.spyOn(fetcher, 'fetchUTXOs').mockResolvedValue(utxos);

            const recommendations = await consolidator.getConsolidationRecommendations(
                'kaspatest:qq123',
                'testnet'
            );

            expect(recommendations.estimatedSavings).toContain('fewer inputs');
        });
    });
});
