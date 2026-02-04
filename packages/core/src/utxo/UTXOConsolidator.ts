import { EnrichedUTXO, ConsolidationResult, UTXOManagerConfig } from '../types.js';
import { UTXOFetcher } from './UTXOFetcher.js';
import { MassEstimator } from './MassEstimator.js';
import { kasToSompi } from '../kaspa-tx.js';

/**
 * UTXOConsolidator manages background UTXO consolidation to prevent fragmentation.
 * 
 * Fragmented wallets (many small UTXOs) can cause issues:
 * - Difficulty creating transactions within mass limits
 * - Higher transaction fees
 * - Slower transaction creation
 * 
 * This class automatically merges small UTXOs into larger ones during idle periods.
 */
export class UTXOConsolidator {
    constructor(
        private config: UTXOManagerConfig,
        private fetcher: UTXOFetcher,
        private estimator: MassEstimator
    ) { }

    /**
     * Checks if a wallet should be consolidated based on fragmentation
     * 
     * @param address Kaspa address
     * @param network Network type
     * @returns True if consolidation is recommended
     */
    async shouldConsolidate(
        address: string,
        network: 'mainnet' | 'testnet'
    ): Promise<boolean> {
        const utxos = await this.fetcher.fetchUTXOs(address, network);

        // Count small UTXOs (< 1 KAS)
        const smallUtxos = utxos.filter(u =>
            BigInt(u.utxoEntry.amount) < kasToSompi('1')
        );

        const shouldConsolidate = smallUtxos.length >= this.config.consolidationThreshold;

        if (shouldConsolidate) {
            console.log(`[UTXO Consolidator] Wallet has ${smallUtxos.length} small UTXOs (threshold: ${this.config.consolidationThreshold})`);
        }

        return shouldConsolidate;
    }

    /**
     * Consolidates fragmented UTXOs into a single larger UTXO
     * 
     * @param address Kaspa address
     * @param privateKey Private key for signing
     * @param network Network type
     * @param createTxFn Function to create and broadcast transaction
     * @returns Consolidation result
     */
    async consolidate(
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
        console.log(`[UTXO Consolidator] Starting consolidation for ${address}`);

        const utxos = await this.fetcher.fetchUTXOs(address, network, true); // Force refresh
        const beforeCount = utxos.length;

        // Select mature, small UTXOs for consolidation
        const candidates = this.selectConsolidationCandidates(utxos);

        if (candidates.length < 2) {
            console.log(`[UTXO Consolidator] Not enough candidates (${candidates.length} < 2)`);
            return {
                success: false,
                utxosConsolidated: 0,
                beforeCount,
                afterCount: beforeCount
            };
        }

        // Calculate total amount
        const totalAmount = candidates.reduce(
            (sum, u) => sum + BigInt(u.utxoEntry.amount),
            0n
        );

        // Estimate fees (will be deducted from total)
        const feeSompi = 10000n; // Base fee
        const amountToSend = totalAmount - feeSompi;

        if (amountToSend <= 0n) {
            console.log(`[UTXO Consolidator] Insufficient amount after fees`);
            return {
                success: false,
                utxosConsolidated: 0,
                beforeCount,
                afterCount: beforeCount
            };
        }

        console.log(`[UTXO Consolidator] Consolidating ${candidates.length} UTXOs`);
        console.log(`[UTXO Consolidator] Total amount: ${totalAmount} sompi`);
        console.log(`[UTXO Consolidator] After fees: ${amountToSend} sompi`);

        try {
            // Create consolidation transaction (send to self)
            const txid = await createTxFn(
                privateKey,
                address,
                amountToSend,
                candidates
            );

            console.log(`[UTXO Consolidator] ✓ Consolidation successful: ${txid}`);

            // Invalidate cache since UTXOs changed
            this.fetcher.invalidateCache(address, network);

            // Calculate new count (removed candidates, added 1 new UTXO)
            const afterCount = beforeCount - candidates.length + 1;

            return {
                success: true,
                txid,
                utxosConsolidated: candidates.length,
                beforeCount,
                afterCount
            };
        } catch (error) {
            console.error(`[UTXO Consolidator] ✗ Consolidation failed:`, error);
            return {
                success: false,
                utxosConsolidated: 0,
                beforeCount,
                afterCount: beforeCount
            };
        }
    }

    /**
     * Selects UTXOs suitable for consolidation
     * 
     * Criteria:
     * - Must be mature (>= 10 blocks old)
     * - Must be small (< 1 KAS)
     * - Limited to maxInputsPerTx
     * - Must fit within mass limits
     * 
     * @param utxos Available UTXOs
     * @returns UTXOs to consolidate
     */
    private selectConsolidationCandidates(utxos: EnrichedUTXO[]): EnrichedUTXO[] {
        // Filter for consolidation candidates
        const candidates = utxos.filter(u => {
            const isMature = u.metadata.ageInBlocks >= 10;
            const isSmall = BigInt(u.utxoEntry.amount) < kasToSompi('1');
            return isMature && isSmall;
        });

        // Sort by age (oldest first for safety)
        candidates.sort((a, b) => b.metadata.ageInBlocks - a.metadata.ageInBlocks);

        // Limit to max inputs
        const limited = candidates.slice(0, this.config.maxInputsPerTx);

        // Verify mass limits
        const massEstimate = this.estimator.estimateMass(limited.length, 1); // 1 output (to self)

        if (!massEstimate.isWithinLimit) {
            console.log(`[UTXO Consolidator] Reducing inputs due to mass limit`);
            // Binary search for max inputs that fit
            let maxInputs = limited.length;
            while (maxInputs > 1) {
                const estimate = this.estimator.estimateMass(maxInputs, 1);
                if (estimate.isWithinLimit) {
                    break;
                }
                maxInputs--;
            }
            return limited.slice(0, maxInputs);
        }

        return limited;
    }

    /**
     * Calculates fragmentation score for a wallet (0-100)
     * 
     * Higher score = more fragmented
     * 
     * @param utxos Wallet UTXOs
     * @returns Fragmentation score
     */
    calculateFragmentationScore(utxos: EnrichedUTXO[]): number {
        if (utxos.length === 0) {
            return 0;
        }

        // Factors that increase fragmentation:
        // 1. High UTXO count
        // 2. Many small UTXOs
        // 3. Uneven distribution

        const utxoCountScore = Math.min(utxos.length / 20, 1) * 40; // Max 40 points

        const smallUtxos = utxos.filter(u =>
            BigInt(u.utxoEntry.amount) < kasToSompi('1')
        );
        const smallUtxoScore = (smallUtxos.length / utxos.length) * 30; // Max 30 points

        // Calculate variance in amounts
        const amounts = utxos.map(u => Number(BigInt(u.utxoEntry.amount) / 1000000n)); // Convert to manageable numbers
        const mean = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
        const variance = amounts.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / amounts.length;
        const stdDev = Math.sqrt(variance);
        const varianceScore = Math.min(stdDev / mean, 1) * 30; // Max 30 points

        return Math.round(utxoCountScore + smallUtxoScore + varianceScore);
    }

    /**
     * Gets consolidation recommendations for a wallet
     * 
     * @param address Kaspa address
     * @param network Network type
     * @returns Consolidation recommendations
     */
    async getConsolidationRecommendations(
        address: string,
        network: 'mainnet' | 'testnet'
    ): Promise<{
        shouldConsolidate: boolean;
        fragmentationScore: number;
        candidateCount: number;
        estimatedSavings: string;
        recommendation: string;
    }> {
        const utxos = await this.fetcher.fetchUTXOs(address, network);
        const fragmentationScore = this.calculateFragmentationScore(utxos);
        const candidates = this.selectConsolidationCandidates(utxos);
        const shouldConsolidate = await this.shouldConsolidate(address, network);

        let recommendation = '';
        if (fragmentationScore < 30) {
            recommendation = 'Wallet is healthy, no consolidation needed';
        } else if (fragmentationScore < 60) {
            recommendation = 'Consider consolidating during idle periods';
        } else {
            recommendation = 'Consolidation strongly recommended to improve transaction reliability';
        }

        // Estimate savings (reduced inputs in future transactions)
        const avgInputsBeforeConsolidation = Math.min(candidates.length, this.config.maxInputsPerTx);
        const avgInputsAfterConsolidation = 1;
        const estimatedSavings = `${avgInputsBeforeConsolidation - avgInputsAfterConsolidation} fewer inputs per transaction`;

        return {
            shouldConsolidate,
            fragmentationScore,
            candidateCount: candidates.length,
            estimatedSavings,
            recommendation
        };
    }
}
