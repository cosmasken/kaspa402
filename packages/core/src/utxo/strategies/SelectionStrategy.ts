import { EnrichedUTXO, SelectionResult } from '../../types.js';

/**
 * Base interface for UTXO selection strategies.
 * 
 * Different strategies optimize for different criteria:
 * - Age-based: Prioritizes older UTXOs to avoid freshness issues
 * - Amount-based: Prefers single large UTXOs to minimize transaction size
 * - Hybrid: Balances multiple factors for optimal selection
 */
export interface SelectionStrategy {
    /**
     * Strategy name for logging and metrics
     */
    name: string;

    /**
     * Selects UTXOs to satisfy the target amount
     * 
     * @param utxos Available UTXOs to select from
     * @param targetAmount Amount needed in sompi
     * @param maxInputs Maximum number of inputs allowed
     * @param maxMass Maximum transaction mass allowed
     * @returns Selection result or null if selection fails
     */
    select(
        utxos: EnrichedUTXO[],
        targetAmount: bigint,
        maxInputs: number,
        maxMass: number
    ): SelectionResult | null;
}

/**
 * Base class providing common selection utilities
 */
export abstract class BaseSelectionStrategy implements SelectionStrategy {
    abstract name: string;

    abstract select(
        utxos: EnrichedUTXO[],
        targetAmount: bigint,
        maxInputs: number,
        maxMass: number
    ): SelectionResult | null;

    /**
     * Greedy selection algorithm - selects UTXOs until target is met
     * 
     * @param sortedUTXOs UTXOs sorted by strategy preference
     * @param targetAmount Target amount in sompi
     * @param maxInputs Maximum inputs allowed
     * @param maxMass Maximum mass allowed
     * @returns Selection result or null if impossible
     */
    protected greedySelect(
        sortedUTXOs: EnrichedUTXO[],
        targetAmount: bigint,
        maxInputs: number,
        maxMass: number
    ): SelectionResult | null {
        const selected: EnrichedUTXO[] = [];
        let totalAmount = 0n;
        let estimatedMass = 100; // Base overhead
        const warnings: string[] = [];

        for (const utxo of sortedUTXOs) {
            // Check if we've reached limits
            if (selected.length >= maxInputs) {
                warnings.push(`Reached max inputs limit (${maxInputs})`);
                break;
            }

            // Check mass limit
            const newMass = estimatedMass + utxo.metadata.estimatedMassContribution + 50; // +50 for output
            if (newMass > maxMass) {
                warnings.push(`Would exceed mass limit (${newMass} > ${maxMass})`);
                break;
            }

            // Add UTXO
            selected.push(utxo);
            totalAmount += BigInt(utxo.utxoEntry.amount);
            estimatedMass = newMass;

            // Check if we have enough
            if (totalAmount >= targetAmount) {
                // Add warning if using fresh UTXOs
                const freshCount = selected.filter(u => u.metadata.isFresh).length;
                if (freshCount > 0) {
                    warnings.push(`Using ${freshCount} fresh UTXO(s) - may cause issues`);
                }

                return {
                    utxos: selected,
                    totalAmount,
                    estimatedMass,
                    strategy: this.name,
                    warnings
                };
            }
        }

        // Could not satisfy amount
        return null;
    }

    /**
     * Builds a selection result from a single UTXO
     * 
     * @param utxo The UTXO to use
     * @param targetAmount Target amount
     * @returns Selection result
     */
    protected buildResult(utxo: EnrichedUTXO, targetAmount: bigint): SelectionResult {
        const warnings: string[] = [];

        if (utxo.metadata.isFresh) {
            warnings.push('Using fresh UTXO - may cause issues');
        }

        return {
            utxos: [utxo],
            totalAmount: BigInt(utxo.utxoEntry.amount),
            estimatedMass: 100 + utxo.metadata.estimatedMassContribution + 50, // overhead + input + output
            strategy: this.name,
            warnings
        };
    }

    /**
     * Validates that UTXOs array is not empty
     * 
     * @param utxos UTXOs to validate
     * @returns True if valid
     */
    protected validateUTXOs(utxos: EnrichedUTXO[]): boolean {
        return utxos && utxos.length > 0;
    }

    /**
     * Calculates total available amount from UTXOs
     * 
     * @param utxos UTXOs to sum
     * @returns Total amount in sompi
     */
    protected getTotalAmount(utxos: EnrichedUTXO[]): bigint {
        return utxos.reduce((sum, utxo) => sum + BigInt(utxo.utxoEntry.amount), 0n);
    }
}
