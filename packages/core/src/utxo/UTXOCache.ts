import { EnrichedUTXO } from '../types.js';

/**
 * Cache entry with expiry timestamp
 */
interface CacheEntry {
    utxos: EnrichedUTXO[];
    expiresAt: number;
}

/**
 * UTXOCache provides in-memory caching of UTXO data to reduce API calls.
 * 
 * Caches are keyed by address and network, with configurable TTL.
 * This significantly improves performance when making multiple payments
 * in quick succession.
 */
export class UTXOCache {
    private cache: Map<string, CacheEntry> = new Map();

    constructor(private ttlMs: number = 10000) { }

    /**
     * Generates a cache key from address and network
     * 
     * @param address Kaspa address
     * @param network Network type
     * @returns Cache key string
     */
    private getCacheKey(address: string, network: 'mainnet' | 'testnet'): string {
        return `${network}:${address}`;
    }

    /**
     * Retrieves cached UTXOs if available and not expired
     * 
     * @param address Kaspa address
     * @param network Network type
     * @returns Cached UTXOs or null if not found/expired
     */
    get(address: string, network: 'mainnet' | 'testnet'): EnrichedUTXO[] | null {
        const key = this.getCacheKey(address, network);
        const entry = this.cache.get(key);

        if (!entry) {
            return null;
        }

        // Check if expired
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        return entry.utxos;
    }

    /**
     * Stores UTXOs in cache with expiry
     * 
     * @param address Kaspa address
     * @param network Network type
     * @param utxos UTXOs to cache
     */
    set(address: string, network: 'mainnet' | 'testnet', utxos: EnrichedUTXO[]): void {
        const key = this.getCacheKey(address, network);
        const entry: CacheEntry = {
            utxos,
            expiresAt: Date.now() + this.ttlMs
        };

        this.cache.set(key, entry);
    }

    /**
     * Invalidates cache for a specific address
     * 
     * @param address Kaspa address
     * @param network Network type
     */
    invalidate(address: string, network: 'mainnet' | 'testnet'): void {
        const key = this.getCacheKey(address, network);
        this.cache.delete(key);
    }

    /**
     * Clears all cached entries
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Gets the number of cached entries
     * 
     * @returns Number of cache entries
     */
    size(): number {
        return this.cache.size;
    }

    /**
     * Removes expired entries from cache
     * 
     * @returns Number of entries removed
     */
    cleanup(): number {
        const now = Date.now();
        let removed = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
                removed++;
            }
        }

        return removed;
    }

    /**
     * Checks if cache has valid entry for address
     * 
     * @param address Kaspa address
     * @param network Network type
     * @returns True if valid cache entry exists
     */
    has(address: string, network: 'mainnet' | 'testnet'): boolean {
        return this.get(address, network) !== null;
    }

    /**
     * Gets cache statistics
     * 
     * @returns Cache statistics object
     */
    getStats(): { size: number; expired: number } {
        const now = Date.now();
        let expired = 0;

        for (const entry of this.cache.values()) {
            if (now > entry.expiresAt) {
                expired++;
            }
        }

        return {
            size: this.cache.size,
            expired
        };
    }
}
