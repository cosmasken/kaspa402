import { EnrichedUTXO, UTXOManagerConfig } from '../types.js';
import { UTXOCache } from './UTXOCache.js';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import * as http from 'http';

/**
 * Raw UTXO data from Kaspa API
 */
interface RawUTXO {
    outpoint: {
        transactionId: string;
        index: number;
    };
    utxoEntry: {
        amount: string;
        scriptPublicKey: {
            version: number;
            scriptPublicKey: string;
        };
        blockDaaScore: string;
        isCoinbase: boolean;
    };
}

/**
 * Block DAG info from Kaspa API
 */
interface BlockDAGInfo {
    virtualDaaScore: string;
}

/**
 * UTXOFetcher handles fetching and enriching UTXO data from the Kaspa API.
 * 
 * It integrates with UTXOCache to minimize API calls and enriches raw UTXO
 * data with metadata needed for intelligent selection.
 */
export class UTXOFetcher {
    private axiosClient: AxiosInstance;
    private inFlight: Map<string, Promise<EnrichedUTXO[]>> = new Map();

    constructor(
        private cache: UTXOCache,
        private config: UTXOManagerConfig
    ) {
        // Create axios instance with IPv4 preference and timeouts
        this.axiosClient = axios.create({
            httpAgent: new http.Agent({ family: 4 }),
            httpsAgent: new https.Agent({ family: 4 }),
            timeout: 10000
        });
    }

    /**
     * Gets the API URL for the specified network
     */
    private getApiUrl(network: 'mainnet' | 'testnet'): string {
        return network === 'mainnet'
            ? 'https://api.kaspa.org'
            : 'https://api-tn10.kaspa.org';
    }

    /**
     * Fetches UTXOs for an address with caching and enrichment
     * 
     * @param address Kaspa address
     * @param network Network type
     * @param forceRefresh Skip cache and fetch fresh data
     * @returns Array of enriched UTXOs
     */
    async fetchUTXOs(
        address: string,
        network: 'mainnet' | 'testnet',
        forceRefresh: boolean = false
    ): Promise<EnrichedUTXO[]> {
        const cacheKey = `${address}-${network}`;

        // Check cache first unless force refresh
        if (!forceRefresh) {
            const cached = this.cache.get(address, network);
            if (cached) {
                console.log(`[UTXO Fetcher] Cache hit for ${address}`);
                return cached;
            }
        }

        // Check if fetch already in progress
        if (this.inFlight.has(cacheKey)) {
            console.log(`[UTXO Fetcher] Fetch in progress for ${address}, waiting...`);
            return await this.inFlight.get(cacheKey)!;
        }

        // Start new fetch
        console.log(`[UTXO Fetcher] Fetching UTXOs for ${address}`);

        const fetchPromise = this._doFetch(address, network);
        this.inFlight.set(cacheKey, fetchPromise);

        try {
            const result = await fetchPromise;
            return result;
        } finally {
            // Clean up in-flight tracking
            this.inFlight.delete(cacheKey);
        }
    }

    /**
     * Internal fetch implementation
     */
    private async _doFetch(
        address: string,
        network: 'mainnet' | 'testnet'
    ): Promise<EnrichedUTXO[]> {
        // Fetch current DAA score for age calculations
        const currentDAA = await this.getCurrentDAA(network);

        // Fetch UTXOs with retry logic
        const rawUTXOs = await this.fetchWithRetry(address, network);

        // Enrich each UTXO with metadata
        const enrichedUTXOs = rawUTXOs.map(utxo =>
            this.enrichUTXO(utxo, currentDAA)
        );

        // Cache the results
        this.cache.set(address, network, enrichedUTXOs);

        console.log(`[UTXO Fetcher] Found ${enrichedUTXOs.length} UTXOs`);

        return enrichedUTXOs;
    }

    /**
     * Fetches UTXOs with exponential backoff retry logic
     */
    private async fetchWithRetry(
        address: string,
        network: 'mainnet' | 'testnet',
        maxRetries: number = 3
    ): Promise<RawUTXO[]> {
        const apiUrl = this.getApiUrl(network);
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const response = await this.axiosClient.get<RawUTXO[]>(
                    `${apiUrl}/addresses/${address}/utxos`
                );

                if (!response.data || !Array.isArray(response.data)) {
                    throw new Error('Invalid UTXO response format');
                }

                // Filter out invalid UTXOs
                const validUTXOs = response.data.filter(utxo =>
                    utxo.outpoint?.transactionId &&
                    utxo.outpoint?.index !== undefined &&
                    utxo.utxoEntry?.amount
                );

                return validUTXOs;
            } catch (error) {
                lastError = error as Error;

                if (attempt < maxRetries - 1) {
                    const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
                    console.log(`[UTXO Fetcher] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw new Error(`Failed to fetch UTXOs after ${maxRetries} attempts: ${lastError?.message}`);
    }

    /**
     * Fetches the current DAA score from the network
     * 
     * @param network Network type
     * @returns Current DAA score as string
     */
    async getCurrentDAA(network: 'mainnet' | 'testnet'): Promise<string> {
        const apiUrl = this.getApiUrl(network);

        try {
            const response = await this.axiosClient.get<BlockDAGInfo>(
                `${apiUrl}/info/blockdag`
            );

            return response.data.virtualDaaScore;
        } catch (error) {
            console.warn('[UTXO Fetcher] Failed to fetch current DAA, using 0:', error);
            return '0';
        }
    }

    /**
     * Enriches a raw UTXO with metadata for selection algorithms
     * 
     * @param utxo Raw UTXO from API
     * @param currentDAA Current network DAA score
     * @returns Enriched UTXO with metadata
     */
    enrichUTXO(utxo: RawUTXO, currentDAA: string): EnrichedUTXO {
        const utxoDAA = BigInt(utxo.utxoEntry.blockDaaScore);
        const currentDAABigInt = BigInt(currentDAA);

        // Calculate age in blocks (DAA score difference)
        const ageInBlocks = Number(currentDAABigInt - utxoDAA);

        // Consider UTXO fresh if less than minimum age
        const isFresh = ageInBlocks < this.config.minUtxoAgeBlocks;

        // Estimate mass contribution (constant per input)
        const estimatedMassContribution = 200; // BYTES_PER_INPUT

        return {
            ...utxo,
            metadata: {
                fetchedAt: Date.now(),
                ageInBlocks,
                isFresh,
                estimatedMassContribution
            }
        };
    }

    /**
     * Invalidates cache for an address (call after spending UTXOs)
     * 
     * @param address Kaspa address
     * @param network Network type
     */
    invalidateCache(address: string, network: 'mainnet' | 'testnet'): void {
        this.cache.invalidate(address, network);
    }

    /**
     * Clears all cached UTXO data
     */
    clearCache(): void {
        this.cache.clear();
    }
}
