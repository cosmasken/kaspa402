import { describe, it, expect, beforeEach } from 'vitest';
import { UTXOCache } from '../UTXOCache.js';
import { EnrichedUTXO } from '../../types.js';

describe('UTXOCache', () => {
    let cache: UTXOCache;
    let mockUTXOs: EnrichedUTXO[];

    beforeEach(() => {
        cache = new UTXOCache(1000); // 1 second TTL for testing

        mockUTXOs = [
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
                },
                metadata: {
                    fetchedAt: Date.now(),
                    ageInBlocks: 5,
                    isFresh: false,
                    estimatedMassContribution: 200
                }
            }
        ];
    });

    describe('set and get', () => {
        it('should store and retrieve UTXOs', () => {
            const address = 'kaspatest:qq1234567890';
            cache.set(address, 'testnet', mockUTXOs);

            const retrieved = cache.get(address, 'testnet');
            expect(retrieved).toEqual(mockUTXOs);
        });

        it('should return null for non-existent cache entry', () => {
            const retrieved = cache.get('kaspatest:nonexistent', 'testnet');
            expect(retrieved).toBeNull();
        });

        it('should differentiate between networks', () => {
            const address = 'kaspa:qq1234567890';
            cache.set(address, 'mainnet', mockUTXOs);

            const mainnetResult = cache.get(address, 'mainnet');
            const testnetResult = cache.get(address, 'testnet');

            expect(mainnetResult).toEqual(mockUTXOs);
            expect(testnetResult).toBeNull();
        });

        it('should differentiate between addresses', () => {
            const address1 = 'kaspatest:qq1111111111';
            const address2 = 'kaspatest:qq2222222222';

            cache.set(address1, 'testnet', mockUTXOs);

            expect(cache.get(address1, 'testnet')).toEqual(mockUTXOs);
            expect(cache.get(address2, 'testnet')).toBeNull();
        });
    });

    describe('expiry', () => {
        it('should return null for expired entries', async () => {
            const address = 'kaspatest:qq1234567890';
            const shortCache = new UTXOCache(100); // 100ms TTL

            shortCache.set(address, 'testnet', mockUTXOs);

            // Should be available immediately
            expect(shortCache.get(address, 'testnet')).toEqual(mockUTXOs);

            // Wait for expiry
            await new Promise(resolve => setTimeout(resolve, 150));

            // Should be expired
            expect(shortCache.get(address, 'testnet')).toBeNull();
        });

        it('should remove expired entry on get', async () => {
            const address = 'kaspatest:qq1234567890';
            const shortCache = new UTXOCache(100);

            shortCache.set(address, 'testnet', mockUTXOs);
            expect(shortCache.size()).toBe(1);

            await new Promise(resolve => setTimeout(resolve, 150));

            shortCache.get(address, 'testnet');
            expect(shortCache.size()).toBe(0);
        });
    });

    describe('invalidate', () => {
        it('should remove specific cache entry', () => {
            const address = 'kaspatest:qq1234567890';
            cache.set(address, 'testnet', mockUTXOs);

            expect(cache.get(address, 'testnet')).toEqual(mockUTXOs);

            cache.invalidate(address, 'testnet');

            expect(cache.get(address, 'testnet')).toBeNull();
        });

        it('should not affect other entries', () => {
            const address1 = 'kaspatest:qq1111111111';
            const address2 = 'kaspatest:qq2222222222';

            cache.set(address1, 'testnet', mockUTXOs);
            cache.set(address2, 'testnet', mockUTXOs);

            cache.invalidate(address1, 'testnet');

            expect(cache.get(address1, 'testnet')).toBeNull();
            expect(cache.get(address2, 'testnet')).toEqual(mockUTXOs);
        });
    });

    describe('clear', () => {
        it('should remove all cache entries', () => {
            cache.set('kaspatest:qq1111111111', 'testnet', mockUTXOs);
            cache.set('kaspatest:qq2222222222', 'testnet', mockUTXOs);
            cache.set('kaspa:qq3333333333', 'mainnet', mockUTXOs);

            expect(cache.size()).toBe(3);

            cache.clear();

            expect(cache.size()).toBe(0);
        });
    });

    describe('size', () => {
        it('should return correct cache size', () => {
            expect(cache.size()).toBe(0);

            cache.set('kaspatest:qq1111111111', 'testnet', mockUTXOs);
            expect(cache.size()).toBe(1);

            cache.set('kaspatest:qq2222222222', 'testnet', mockUTXOs);
            expect(cache.size()).toBe(2);

            cache.clear();
            expect(cache.size()).toBe(0);
        });
    });

    describe('cleanup', () => {
        it('should remove expired entries', async () => {
            const shortCache = new UTXOCache(100);

            shortCache.set('kaspatest:qq1111111111', 'testnet', mockUTXOs);
            shortCache.set('kaspatest:qq2222222222', 'testnet', mockUTXOs);

            expect(shortCache.size()).toBe(2);

            await new Promise(resolve => setTimeout(resolve, 150));

            const removed = shortCache.cleanup();

            expect(removed).toBe(2);
            expect(shortCache.size()).toBe(0);
        });

        it('should not remove valid entries', async () => {
            cache.set('kaspatest:qq1111111111', 'testnet', mockUTXOs);

            const removed = cache.cleanup();

            expect(removed).toBe(0);
            expect(cache.size()).toBe(1);
        });

        it('should handle mixed expired and valid entries', async () => {
            const mixedCache = new UTXOCache(200);

            mixedCache.set('kaspatest:qq1111111111', 'testnet', mockUTXOs);

            await new Promise(resolve => setTimeout(resolve, 100));

            mixedCache.set('kaspatest:qq2222222222', 'testnet', mockUTXOs);

            await new Promise(resolve => setTimeout(resolve, 150));

            const removed = mixedCache.cleanup();

            expect(removed).toBe(1);
            expect(mixedCache.size()).toBe(1);
        });
    });

    describe('has', () => {
        it('should return true for valid cache entry', () => {
            const address = 'kaspatest:qq1234567890';
            cache.set(address, 'testnet', mockUTXOs);

            expect(cache.has(address, 'testnet')).toBe(true);
        });

        it('should return false for non-existent entry', () => {
            expect(cache.has('kaspatest:nonexistent', 'testnet')).toBe(false);
        });

        it('should return false for expired entry', async () => {
            const address = 'kaspatest:qq1234567890';
            const shortCache = new UTXOCache(100);

            shortCache.set(address, 'testnet', mockUTXOs);
            expect(shortCache.has(address, 'testnet')).toBe(true);

            await new Promise(resolve => setTimeout(resolve, 150));

            expect(shortCache.has(address, 'testnet')).toBe(false);
        });
    });

    describe('getStats', () => {
        it('should return correct statistics', async () => {
            const shortCache = new UTXOCache(100);

            shortCache.set('kaspatest:qq1111111111', 'testnet', mockUTXOs);
            shortCache.set('kaspatest:qq2222222222', 'testnet', mockUTXOs);

            let stats = shortCache.getStats();
            expect(stats.size).toBe(2);
            expect(stats.expired).toBe(0);

            await new Promise(resolve => setTimeout(resolve, 150));

            stats = shortCache.getStats();
            expect(stats.size).toBe(2);
            expect(stats.expired).toBe(2);
        });
    });
});
