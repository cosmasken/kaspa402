import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UTXOFetcher } from '../UTXOFetcher.js';
import { UTXOCache } from '../UTXOCache.js';
import { UTXOManagerConfig } from '../../types.js';
import axios from 'axios';

// Mock axios
vi.mock('axios');
const mockedAxios = axios as any;

describe('UTXOFetcher', () => {
    let fetcher: UTXOFetcher;
    let cache: UTXOCache;
    let config: UTXOManagerConfig;
    let mockAxiosInstance: any;

    beforeEach(() => {
        config = {
            minUtxoAgeBlocks: 2,
            maxInputsPerTx: 5,
            consolidationThreshold: 10,
            massLimitBuffer: 0.9,
            maxMassBytes: 100000,
            cacheExpiryMs: 10000
        };

        cache = new UTXOCache(config.cacheExpiryMs);

        // Mock axios instance
        mockAxiosInstance = {
            get: vi.fn()
        };

        mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

        fetcher = new UTXOFetcher(cache, config);
    });

    describe('fetchUTXOs', () => {
        const mockRawUTXOs = [
            {
                outpoint: {
                    transactionId: 'tx1',
                    index: 0
                },
                utxoEntry: {
                    amount: '100000000',
                    scriptPublicKey: {
                        version: 0,
                        scriptPublicKey: 'script1'
                    },
                    blockDaaScore: '1000',
                    isCoinbase: false
                }
            },
            {
                outpoint: {
                    transactionId: 'tx2',
                    index: 1
                },
                utxoEntry: {
                    amount: '200000000',
                    scriptPublicKey: {
                        version: 0,
                        scriptPublicKey: 'script2'
                    },
                    blockDaaScore: '1005',
                    isCoinbase: false
                }
            }
        ];

        const mockBlockDAGInfo = {
            virtualDaaScore: '1010'
        };

        it('should fetch and enrich UTXOs', async () => {
            mockAxiosInstance.get
                .mockResolvedValueOnce({ data: mockBlockDAGInfo })
                .mockResolvedValueOnce({ data: mockRawUTXOs });

            const address = 'kaspatest:qq1234567890';
            const result = await fetcher.fetchUTXOs(address, 'testnet');

            expect(result).toHaveLength(2);
            expect(result[0].metadata.ageInBlocks).toBe(10); // 1010 - 1000
            expect(result[1].metadata.ageInBlocks).toBe(5);  // 1010 - 1005
            expect(result[0].metadata.isFresh).toBe(false);
            expect(result[1].metadata.isFresh).toBe(false);
        });

        it('should mark fresh UTXOs correctly', async () => {
            const freshUTXOs = [{
                ...mockRawUTXOs[0],
                utxoEntry: {
                    ...mockRawUTXOs[0].utxoEntry,
                    blockDaaScore: '1009' // Only 1 block old
                }
            }];

            mockAxiosInstance.get
                .mockResolvedValueOnce({ data: mockBlockDAGInfo })
                .mockResolvedValueOnce({ data: freshUTXOs });

            const result = await fetcher.fetchUTXOs('kaspatest:qq1234567890', 'testnet');

            expect(result[0].metadata.ageInBlocks).toBe(1);
            expect(result[0].metadata.isFresh).toBe(true);
        });

        it('should use cache on subsequent calls', async () => {
            mockAxiosInstance.get
                .mockResolvedValueOnce({ data: mockBlockDAGInfo })
                .mockResolvedValueOnce({ data: mockRawUTXOs });

            const address = 'kaspatest:qq1234567890';

            // First call - should fetch
            await fetcher.fetchUTXOs(address, 'testnet');
            expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);

            // Second call - should use cache
            await fetcher.fetchUTXOs(address, 'testnet');
            expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2); // No additional calls
        });

        it('should bypass cache with forceRefresh', async () => {
            mockAxiosInstance.get
                .mockResolvedValue({ data: mockBlockDAGInfo })
                .mockResolvedValue({ data: mockRawUTXOs });

            const address = 'kaspatest:qq1234567890';

            await fetcher.fetchUTXOs(address, 'testnet');
            const firstCallCount = mockAxiosInstance.get.mock.calls.length;

            await fetcher.fetchUTXOs(address, 'testnet', true);
            expect(mockAxiosInstance.get.mock.calls.length).toBeGreaterThan(firstCallCount);
        });

        it('should filter out invalid UTXOs', async () => {
            const mixedUTXOs = [
                mockRawUTXOs[0],
                { outpoint: { transactionId: null, index: 0 } }, // Invalid
                mockRawUTXOs[1],
                { outpoint: { transactionId: 'tx3' } } // Missing index
            ];

            mockAxiosInstance.get
                .mockResolvedValueOnce({ data: mockBlockDAGInfo })
                .mockResolvedValueOnce({ data: mixedUTXOs });

            const result = await fetcher.fetchUTXOs('kaspatest:qq1234567890', 'testnet');

            expect(result).toHaveLength(2); // Only valid UTXOs
        });

        it('should retry on failure', async () => {
            mockAxiosInstance.get
                .mockResolvedValueOnce({ data: mockBlockDAGInfo })
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce({ data: mockRawUTXOs });

            const result = await fetcher.fetchUTXOs('kaspatest:qq1234567890', 'testnet');

            expect(result).toHaveLength(2);
            expect(mockAxiosInstance.get).toHaveBeenCalledTimes(3); // DAA + failed + success
        });

        it('should throw after max retries', async () => {
            mockAxiosInstance.get
                .mockResolvedValueOnce({ data: mockBlockDAGInfo })
                .mockRejectedValue(new Error('Network error'));

            await expect(
                fetcher.fetchUTXOs('kaspatest:qq1234567890', 'testnet')
            ).rejects.toThrow('Failed to fetch UTXOs after 3 attempts');
        });
    });

    describe('getCurrentDAA', () => {
        it('should fetch current DAA score', async () => {
            const mockBlockDAGInfo = { virtualDaaScore: '12345' };
            mockAxiosInstance.get.mockResolvedValue({ data: mockBlockDAGInfo });

            const daa = await fetcher.getCurrentDAA('testnet');

            expect(daa).toBe('12345');
            expect(mockAxiosInstance.get).toHaveBeenCalledWith(
                expect.stringContaining('/info/blockdag')
            );
        });

        it('should return 0 on error', async () => {
            mockAxiosInstance.get.mockRejectedValue(new Error('API error'));

            const daa = await fetcher.getCurrentDAA('testnet');

            expect(daa).toBe('0');
        });

        it('should use correct API URL for mainnet', async () => {
            mockAxiosInstance.get.mockResolvedValue({ data: { virtualDaaScore: '1000' } });

            await fetcher.getCurrentDAA('mainnet');

            expect(mockAxiosInstance.get).toHaveBeenCalledWith(
                expect.stringContaining('api.kaspa.org')
            );
        });

        it('should use correct API URL for testnet', async () => {
            mockAxiosInstance.get.mockResolvedValue({ data: { virtualDaaScore: '1000' } });

            await fetcher.getCurrentDAA('testnet');

            expect(mockAxiosInstance.get).toHaveBeenCalledWith(
                expect.stringContaining('api-tn10.kaspa.org')
            );
        });
    });

    describe('enrichUTXO', () => {
        it('should calculate age correctly', () => {
            const rawUTXO = {
                outpoint: { transactionId: 'tx1', index: 0 },
                utxoEntry: {
                    amount: '100000000',
                    scriptPublicKey: { version: 0, scriptPublicKey: 'script1' },
                    blockDaaScore: '1000',
                    isCoinbase: false
                }
            };

            const enriched = fetcher.enrichUTXO(rawUTXO, '1010');

            expect(enriched.metadata.ageInBlocks).toBe(10);
        });

        it('should mark UTXO as fresh when age < minUtxoAgeBlocks', () => {
            const rawUTXO = {
                outpoint: { transactionId: 'tx1', index: 0 },
                utxoEntry: {
                    amount: '100000000',
                    scriptPublicKey: { version: 0, scriptPublicKey: 'script1' },
                    blockDaaScore: '1009',
                    isCoinbase: false
                }
            };

            const enriched = fetcher.enrichUTXO(rawUTXO, '1010');

            expect(enriched.metadata.isFresh).toBe(true);
        });

        it('should mark UTXO as not fresh when age >= minUtxoAgeBlocks', () => {
            const rawUTXO = {
                outpoint: { transactionId: 'tx1', index: 0 },
                utxoEntry: {
                    amount: '100000000',
                    scriptPublicKey: { version: 0, scriptPublicKey: 'script1' },
                    blockDaaScore: '1000',
                    isCoinbase: false
                }
            };

            const enriched = fetcher.enrichUTXO(rawUTXO, '1010');

            expect(enriched.metadata.isFresh).toBe(false);
        });

        it('should set estimated mass contribution', () => {
            const rawUTXO = {
                outpoint: { transactionId: 'tx1', index: 0 },
                utxoEntry: {
                    amount: '100000000',
                    scriptPublicKey: { version: 0, scriptPublicKey: 'script1' },
                    blockDaaScore: '1000',
                    isCoinbase: false
                }
            };

            const enriched = fetcher.enrichUTXO(rawUTXO, '1010');

            expect(enriched.metadata.estimatedMassContribution).toBe(200);
        });
    });

    describe('cache management', () => {
        it('should invalidate cache for address', async () => {
            const mockBlockDAGInfo = { virtualDaaScore: '1010' };
            const mockUTXOs = [{
                outpoint: { transactionId: 'tx1', index: 0 },
                utxoEntry: {
                    amount: '100000000',
                    scriptPublicKey: { version: 0, scriptPublicKey: 'script1' },
                    blockDaaScore: '1000',
                    isCoinbase: false
                }
            }];

            mockAxiosInstance.get
                .mockResolvedValue({ data: mockBlockDAGInfo })
                .mockResolvedValue({ data: mockUTXOs });

            const address = 'kaspatest:qq1234567890';

            await fetcher.fetchUTXOs(address, 'testnet');
            expect(cache.has(address, 'testnet')).toBe(true);

            fetcher.invalidateCache(address, 'testnet');
            expect(cache.has(address, 'testnet')).toBe(false);
        });

        it('should clear all cache', async () => {
            const mockBlockDAGInfo = { virtualDaaScore: '1010' };
            const mockUTXOs = [{
                outpoint: { transactionId: 'tx1', index: 0 },
                utxoEntry: {
                    amount: '100000000',
                    scriptPublicKey: { version: 0, scriptPublicKey: 'script1' },
                    blockDaaScore: '1000',
                    isCoinbase: false
                }
            }];

            mockAxiosInstance.get
                .mockResolvedValue({ data: mockBlockDAGInfo })
                .mockResolvedValue({ data: mockUTXOs });

            await fetcher.fetchUTXOs('kaspatest:qq1111111111', 'testnet');
            await fetcher.fetchUTXOs('kaspatest:qq2222222222', 'testnet');

            expect(cache.size()).toBe(2);

            fetcher.clearCache();
            expect(cache.size()).toBe(0);
        });
    });
});
