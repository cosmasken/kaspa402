// @ts-nocheck
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { UTXOManager, DEFAULT_UTXO_CONFIG } from '../UTXOManager.js';
import { EnrichedUTXO } from '../../types.js';

// Mock the fetcher since it makes real API calls
jest.mock('../UTXOFetcher.js');

type FetchUTXOsFn = (address: string, network: 'mainnet' | 'testnet', forceRefresh?: boolean) => Promise<EnrichedUTXO[]>;
type ShouldConsolidateFn = (address: string, network: 'mainnet' | 'testnet') => Promise<boolean>;

describe('UTXOManager', () => {
    let manager: UTXOManager;

    beforeEach(() => {
        manager = new UTXOManager();
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
            isFresh: ageInBlocks < 2,
            estimatedMassContribution: 200
        }
    });

    describe('constructor', () => {
        it('should initialize with default config', () => {
            const manager = new UTXOManager();
            expect(manager).toBeDefined();
        });

        it('should accept custom config', () => {
            const customConfig = {
                minUtxoAgeBlocks: 5,
                maxInputsPerTx: 10
            };

            const manager = new UTXOManager(customConfig);
            expect(manager).toBeDefined();
        });

        it('should throw on invalid config', () => {
            expect(() => {
                new UTXOManager({ minUtxoAgeBlocks: -1 });
            }).toThrow('minUtxoAgeBlocks must be >= 0');
        });

        it('should validate maxInputsPerTx', () => {
            expect(() => {
                new UTXOManager({ maxInputsPerTx: 0 });
            }).toThrow('maxInputsPerTx must be >= 1');
        });

        it('should validate massLimitBuffer', () => {
            expect(() => {
                new UTXOManager({ massLimitBuffer: 1.5 });
            }).toThrow('massLimitBuffer must be between 0 and 1');
        });
    });

    describe('selectUTXOsForPayment', () => {
        it('should select UTXOs for payment', async () => {
            const utxos = [
                createUTXO('100000000', 5),
                createUTXO('200000000', 10)
            ];

            // Mock the fetcher
            const mockFetch = jest.fn<FetchUTXOsFn>().mockResolvedValue(utxos);
            (manager as any).fetcher.fetchUTXOs = mockFetch;

            const result = await manager.selectUTXOsForPayment(
                'kaspatest:qq123',
                150000000n,
                'testnet'
            );

            expect(result.utxos.length).toBeGreaterThan(0);
            expect(result.totalAmount).toBeGreaterThanOrEqual(150000000n);
            expect(result.strategy).toBeDefined();
        });

        it('should throw if no UTXOs available', async () => {
            const mockFetch = jest.fn<FetchUTXOsFn>().mockResolvedValue([]);
            (manager as any).fetcher.fetchUTXOs = mockFetch;

            await expect(
                manager.selectUTXOsForPayment('kaspatest:qq123', 100000000n, 'testnet')
            ).rejects.toThrow('No UTXOs available');
        });
    });

    describe('getWalletHealth', () => {
        it('should return health metrics for wallet with UTXOs', async () => {
            const utxos = [
                createUTXO('100000000', 5),
                createUTXO('200000000', 10),
                createUTXO('50000000', 3)
            ];

            const mockFetch = jest.fn().mockResolvedValue(utxos);
            (manager as any).fetcher.fetchUTXOs = mockFetch;

            const mockShouldConsolidate = jest.fn().mockResolvedValue(false);
            (manager as any).consolidator.shouldConsolidate = mockShouldConsolidate;

            const mockCalcFragmentation = jest.fn().mockReturnValue(25);
            (manager as any).consolidator.calculateFragmentationScore = mockCalcFragmentation;

            const health = await manager.getWalletHealth('kaspatest:qq123', 'testnet');

            expect(health.address).toBe('kaspatest:qq123');
            expect(health.totalBalance).toBe(350000000n);
            expect(health.utxoCount).toBe(3);
            expect(health.fragmentationScore).toBe(25);
            expect(health.oldestUtxoAge).toBe(10);
            expect(health.newestUtxoAge).toBe(3);
            expect(health.needsConsolidation).toBe(false);
        });

        it('should return empty health for wallet with no UTXOs', async () => {
            const mockFetch = jest.fn().mockResolvedValue([]);
            (manager as any).fetcher.fetchUTXOs = mockFetch;

            const health = await manager.getWalletHealth('kaspatest:qq123', 'testnet');

            expect(health.totalBalance).toBe(0n);
            expect(health.utxoCount).toBe(0);
            expect(health.fragmentationScore).toBe(0);
        });
    });

    describe('consolidateIfNeeded', () => {
        it('should skip consolidation if not needed', async () => {
            const utxos = [
                createUTXO('500000000', 10),
                createUTXO('500000000', 10)
            ];

            const mockFetch = jest.fn().mockResolvedValue(utxos);
            (manager as any).fetcher.fetchUTXOs = mockFetch;

            const mockShouldConsolidate = jest.fn().mockResolvedValue(false);
            (manager as any).consolidator.shouldConsolidate = mockShouldConsolidate;

            const mockCreateTx = jest.fn();

            const result = await manager.consolidateIfNeeded(
                'kaspatest:qq123',
                'private_key',
                'testnet',
                mockCreateTx
            );

            expect(result.success).toBe(false);
            expect(mockCreateTx).not.toHaveBeenCalled();
        });

        it('should consolidate if needed', async () => {
            const mockShouldConsolidate = jest.fn().mockResolvedValue(true);
            (manager as any).consolidator.shouldConsolidate = mockShouldConsolidate;

            const mockConsolidate = jest.fn().mockResolvedValue({
                success: true,
                txid: 'consolidation_tx',
                utxosConsolidated: 5,
                beforeCount: 15,
                afterCount: 11
            });
            (manager as any).consolidator.consolidate = mockConsolidate;

            const mockCreateTx = jest.fn();

            const result = await manager.consolidateIfNeeded(
                'kaspatest:qq123',
                'private_key',
                'testnet',
                mockCreateTx
            );

            expect(result.success).toBe(true);
            expect(result.txid).toBe('consolidation_tx');
        });
    });

    describe('waitForUTXOMaturity', () => {
        it('should return true when mature UTXOs found', async () => {
            const utxos = [createUTXO('100000000', 5)];

            const mockFetch = jest.fn().mockResolvedValue(utxos);
            (manager as any).fetcher.fetchUTXOs = mockFetch;

            const result = await manager.waitForUTXOMaturity(
                'kaspatest:qq123',
                'testnet',
                2,
                5000
            );

            expect(result).toBe(true);
        });

        it('should return false on timeout', async () => {
            const utxos = [createUTXO('100000000', 1)]; // Fresh

            const mockFetch = jest.fn().mockResolvedValue(utxos);
            (manager as any).fetcher.fetchUTXOs = mockFetch;

            const result = await manager.waitForUTXOMaturity(
                'kaspatest:qq123',
                'testnet',
                10,
                1000 // Short timeout
            );

            expect(result).toBe(false);
        }, 10000);
    });

    describe('cache management', () => {
        it('should invalidate cache for address', () => {
            const mockInvalidate = jest.fn();
            (manager as any).fetcher.invalidateCache = mockInvalidate;

            manager.invalidateCache('kaspatest:qq123', 'testnet');

            expect(mockInvalidate).toHaveBeenCalledWith('kaspatest:qq123', 'testnet');
        });

        it('should clear all cache', () => {
            const mockClear = jest.fn();
            (manager as any).fetcher.clearCache = mockClear;

            manager.clearCache();

            expect(mockClear).toHaveBeenCalled();
        });
    });

    describe('getConfig', () => {
        it('should return current configuration', () => {
            const config = manager.getConfig();

            expect(config).toEqual(DEFAULT_UTXO_CONFIG);
        });
    });
});
