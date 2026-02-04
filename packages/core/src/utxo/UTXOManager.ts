import {
    EnrichedUTXO,
    SelectedUTXOs,
    WalletHealth,
    ConsolidationResult,
    UTXOManagerConfig
} from '../types.js';
import { UTXOFetcher } from './UTXOFetcher.js';
import { UTXOSelector } from './UTXOSelector.js';
import { MassEstimator } from './MassEstimator.js';
import { UTXOConsolidator } from './UTXOConsolidator.js';
import { UTXOCache } from './UTXOCache.js';
import { kasToSompi, sompiToKas } from '../kaspa-tx.js';

/**
 * UTXO lock for preventing concurrent selection
 */
interface UTXOLock {
    utxoId: string;
    lockedAt: number;
    expiresAt: number;
    reason: 'payment' | 'consolidation';
}

/**
 * Default configuration for UTXO management
 */
export const DEFAULT_UTXO_CONFIG: UTXOManagerConfig = {
    minUtxoAgeBlocks: 10, // Increased from 2 to avoid storage mass penalties on fresh UTXOs
    maxInputsPerTx: 5,
    consolidationThreshold: 10,
    massLimitBuffer: 0.9,
    maxMassBytes: 100000,
    cacheExpiryMs: 10000
};

/**
 * UTXOManager is the main coordinator for all UTXO management operations.
 * 
 * It provides a high-level API for:
 * - Selecting optimal UTXOs for payments
 * - Checking wallet health
 * - Triggering consolidation
 * - Managing UTXO metadata
 * 
 * This is the primary interface that transaction builders should use.
 */
export class UTXOManager {
    private fetcher: UTXOFetcher;
    private selector: UTXOSelector;
    private estimator: MassEstimator;
    private consolidator: UTXOConsolidator;
    private cache: UTXOCache;
    private locks: Map<string, UTXOLock> = new Map();

    constructor(config: Partial<UTXOManagerConfig> = {}) {
        // Merge with defaults
        const fullConfig: UTXOManagerConfig = {
            ...DEFAULT_UTXO_CONFIG,
            ...config
        };

        // Validate configuration
        this.validateConfig(fullConfig);

        // Initialize components
        this.cache = new UTXOCache(fullConfig.cacheExpiryMs);
        this.fetcher = new UTXOFetcher(this.cache, fullConfig);
        this.selector = new UTXOSelector(fullConfig);
        this.estimator = new MassEstimator(fullConfig);
        this.consolidator = new UTXOConsolidator(fullConfig, this.fetcher, this.estimator);

        console.log('[UTXO Manager] Initialized with config:', fullConfig);
    }

    /**
     * Selects optimal UTXOs for a payment
     * 
     * This is the main method for transaction builders to use.
     * 
     * @param address Kaspa address
     * @param amountSompi Amount needed in sompi
     * @param network Network type
     * @returns Selected UTXOs with metadata
     */
    async selectUTXOsForPayment(
        address: string,
        amountSompi: bigint,
        network: 'mainnet' | 'testnet'
    ): Promise<SelectedUTXOs> {
        console.log(`[UTXO Manager] Selecting UTXOs for payment of ${sompiToKas(amountSompi)} KAS`);
        
        // Clean up expired locks first
        this.cleanupExpiredLocks();

        // Fetch available UTXOs
        const utxos = await this.fetcher.fetchUTXOs(address, network);

        if (utxos.length === 0) {
            throw new Error(`No UTXOs available for address ${address}`);
        }

        // Filter out locked UTXOs
        const available = utxos.filter(u => !this.isLocked(u));

        console.log(`[UTXO Manager] Found ${utxos.length} UTXOs, ${available.length} available (${utxos.length - available.length} locked)`);

        if (available.length === 0) {
            throw new Error('All UTXOs are currently locked for pending transactions');
        }

        // Calculate max inputs based on mass limits
        const maxInputs = this.estimator.calculateMaxInputs(2); // 2 outputs (recipient + change)
        const maxMass = this.estimator.estimateMass(maxInputs, 2).maxAllowedMass * 0.9;

        // Select optimal UTXOs from available ones
        const selected = await this.selector.selectOptimal(
            available,
            amountSompi,
            maxInputs,
            maxMass
        );

        console.log(`[UTXO Manager] Selected ${selected.utxos.length} UTXOs using ${selected.strategy} strategy`);

        // Lock selected UTXOs
        for (const utxo of selected.utxos) {
            this.lockUTXO(utxo, 60000, 'payment');
        }

        return selected;
    }

    /**
     * Consolidates fragmented UTXOs if needed
     * 
     * @param address Kaspa address
     * @param privateKey Private key for signing
     * @param network Network type
     * @param createTxFn Function to create and broadcast transaction
     * @returns Consolidation result
     */
    async consolidateIfNeeded(
        address: string,
        privateKey: string,
        network: 'mainnet' | 'testnet',
        createTxFn: (
            privateKey: string,
            recipient: string,
            amount: bigint,
            utxos: EnrichedUTXO[]
        ) => Promise<string>
    ): Promise<ConsolidationResult> {
        const shouldConsolidate = await this.consolidator.shouldConsolidate(address, network);

        if (!shouldConsolidate) {
            console.log('[UTXO Manager] Consolidation not needed');
            const utxos = await this.fetcher.fetchUTXOs(address, network);
            return {
                success: false,
                utxosConsolidated: 0,
                beforeCount: utxos.length,
                afterCount: utxos.length
            };
        }

        console.log('[UTXO Manager] Starting consolidation...');
        return await this.consolidator.consolidate(address, privateKey, network, createTxFn);
    }

    /**
     * Gets comprehensive wallet health metrics
     * 
     * @param address Kaspa address
     * @param network Network type
     * @returns Wallet health metrics
     */
    async getWalletHealth(
        address: string,
        network: 'mainnet' | 'testnet'
    ): Promise<WalletHealth> {
        const utxos = await this.fetcher.fetchUTXOs(address, network);

        if (utxos.length === 0) {
            return {
                address,
                totalBalance: 0n,
                utxoCount: 0,
                fragmentationScore: 0,
                oldestUtxoAge: 0,
                newestUtxoAge: 0,
                averageUtxoAge: 0,
                needsConsolidation: false,
                estimatedMaxPayment: 0n
            };
        }

        // Calculate total balance
        const totalBalance = utxos.reduce(
            (sum, u) => sum + BigInt(u.utxoEntry.amount),
            0n
        );

        // Calculate age statistics
        const ages = utxos.map(u => u.metadata.ageInBlocks);
        const oldestUtxoAge = Math.max(...ages);
        const newestUtxoAge = Math.min(...ages);
        const averageUtxoAge = ages.reduce((sum, age) => sum + age, 0) / ages.length;

        // Calculate fragmentation
        const fragmentationScore = this.consolidator.calculateFragmentationScore(utxos);
        const needsConsolidation = await this.consolidator.shouldConsolidate(address, network);

        // Estimate max payment (largest UTXOs up to max inputs)
        const maxInputs = this.estimator.calculateMaxInputs(2);
        const sortedByAmount = [...utxos].sort((a, b) => {
            const amountA = BigInt(a.utxoEntry.amount);
            const amountB = BigInt(b.utxoEntry.amount);
            return amountB > amountA ? 1 : -1;
        });

        const estimatedMaxPayment = sortedByAmount
            .slice(0, maxInputs)
            .reduce((sum, u) => sum + BigInt(u.utxoEntry.amount), 0n);

        return {
            address,
            totalBalance,
            utxoCount: utxos.length,
            fragmentationScore,
            oldestUtxoAge,
            newestUtxoAge,
            averageUtxoAge,
            needsConsolidation,
            estimatedMaxPayment
        };
    }

    /**
     * Waits for UTXOs to mature before proceeding
     * 
     * @param address Kaspa address
     * @param network Network type
     * @param minAge Minimum age required
     * @param timeoutMs Maximum wait time
     * @returns True if UTXOs matured, false if timeout
     */
    async waitForUTXOMaturity(
        address: string,
        network: 'mainnet' | 'testnet',
        minAge: number = 2,
        timeoutMs: number = 30000
    ): Promise<boolean> {
        const startTime = Date.now();
        const pollInterval = 2000; // 2 seconds

        console.log(`[UTXO Manager] Waiting for UTXOs to mature (min age: ${minAge} blocks)...`);

        while (Date.now() - startTime < timeoutMs) {
            const utxos = await this.fetcher.fetchUTXOs(address, network, true); // Force refresh
            const matureUtxos = utxos.filter(u => u.metadata.ageInBlocks >= minAge);

            if (matureUtxos.length > 0) {
                console.log(`[UTXO Manager] ✓ Found ${matureUtxos.length} mature UTXOs`);
                return true;
            }

            const elapsed = Date.now() - startTime;
            const remaining = timeoutMs - elapsed;
            console.log(`[UTXO Manager] No mature UTXOs yet, waiting... (${Math.round(remaining / 1000)}s remaining)`);

            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        console.log(`[UTXO Manager] ✗ Timeout waiting for UTXO maturity`);
        return false;
    }

    /**
     * Invalidates cache for an address (call after spending UTXOs)
     * 
     * @param address Kaspa address
     * @param network Network type
     */
    invalidateCache(address: string, network: 'mainnet' | 'testnet'): void {
        this.fetcher.invalidateCache(address, network);
    }

    /**
     * Clears all cached data
     */
    clearCache(): void {
        this.fetcher.clearCache();
    }

    /**
     * Lock a UTXO to prevent concurrent selection
     * 
     * @param utxo UTXO to lock
     * @param ttlMs Time-to-live in milliseconds (default: 60s)
     * @param reason Reason for locking
     */
    lockUTXO(utxo: EnrichedUTXO, ttlMs: number = 60000, reason: 'payment' | 'consolidation' = 'payment'): void {
        const utxoId = `${utxo.outpoint.transactionId}:${utxo.outpoint.index}`;
        const now = Date.now();

        this.locks.set(utxoId, {
            utxoId,
            lockedAt: now,
            expiresAt: now + ttlMs,
            reason
        });

        console.log(`[UTXO Manager] Locked UTXO ${utxoId} for ${reason} (expires in ${ttlMs}ms)`);
    }

    /**
     * Unlock a UTXO after transaction completion
     * 
     * @param utxo UTXO to unlock
     */
    unlockUTXO(utxo: EnrichedUTXO): void {
        const utxoId = `${utxo.outpoint.transactionId}:${utxo.outpoint.index}`;
        const wasLocked = this.locks.delete(utxoId);
        
        if (wasLocked) {
            console.log(`[UTXO Manager] Unlocked UTXO ${utxoId}`);
        }
    }

    /**
     * Unlock multiple UTXOs at once
     * 
     * @param utxos UTXOs to unlock
     */
    unlockUTXOs(utxos: EnrichedUTXO[]): void {
        for (const utxo of utxos) {
            this.unlockUTXO(utxo);
        }
    }

    /**
     * Check if a UTXO is currently locked
     * 
     * @param utxo UTXO to check
     * @returns true if locked, false otherwise
     */
    isLocked(utxo: EnrichedUTXO): boolean {
        const utxoId = `${utxo.outpoint.transactionId}:${utxo.outpoint.index}`;
        const lock = this.locks.get(utxoId);

        if (!lock) return false;

        // Auto-expire stale locks
        if (Date.now() > lock.expiresAt) {
            this.locks.delete(utxoId);
            return false;
        }

        return true;
    }

    /**
     * Clean up expired locks
     */
    cleanupExpiredLocks(): void {
        const now = Date.now();
        let cleaned = 0;

        for (const [utxoId, lock] of this.locks.entries()) {
            if (now > lock.expiresAt) {
                this.locks.delete(utxoId);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`[UTXO Manager] Auto-expired ${cleaned} stale lock(s)`);
        }
    }

    /**
     * Validates configuration values
     * 
     * @param config Configuration to validate
     * @throws Error if configuration is invalid
     */
    private validateConfig(config: UTXOManagerConfig): void {
        if (config.minUtxoAgeBlocks < 0) {
            throw new Error('minUtxoAgeBlocks must be >= 0');
        }

        if (config.maxInputsPerTx < 1) {
            throw new Error('maxInputsPerTx must be >= 1');
        }

        if (config.consolidationThreshold < 2) {
            throw new Error('consolidationThreshold must be >= 2');
        }

        if (config.massLimitBuffer <= 0 || config.massLimitBuffer > 1) {
            throw new Error('massLimitBuffer must be between 0 and 1');
        }

        if (config.maxMassBytes <= 0) {
            throw new Error('maxMassBytes must be > 0');
        }

        if (config.cacheExpiryMs < 0) {
            throw new Error('cacheExpiryMs must be >= 0');
        }
    }

    /**
     * Gets current configuration
     * 
     * @returns Current configuration
     */
    getConfig(): UTXOManagerConfig {
        return {
            minUtxoAgeBlocks: DEFAULT_UTXO_CONFIG.minUtxoAgeBlocks,
            maxInputsPerTx: DEFAULT_UTXO_CONFIG.maxInputsPerTx,
            consolidationThreshold: DEFAULT_UTXO_CONFIG.consolidationThreshold,
            massLimitBuffer: DEFAULT_UTXO_CONFIG.massLimitBuffer,
            maxMassBytes: DEFAULT_UTXO_CONFIG.maxMassBytes,
            cacheExpiryMs: DEFAULT_UTXO_CONFIG.cacheExpiryMs
        };
    }
}
