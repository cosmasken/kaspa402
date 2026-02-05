import { EnrichedUTXO, SelectionResult, UTXOManagerConfig } from '../../types.js';
import { BaseSelectionStrategy } from './SelectionStrategy.js';

/**
 * AgeBasedStrategy prioritizes older UTXOs to avoid transaction mass issues.
 * 
 * This strategy is designed to prevent the specific error we encountered:
 * "transaction storage mass of 494804552 is larger than max allowed size of 100000"
 * 
 * By preferring older UTXOs, we avoid spending freshly created change outputs
 * that can accumulate signature data and exceed mass limits.
 */
export class AgeBasedStrategy extends BaseSelectionStrategy {
    name = 'age-based';

    constructor(private config: UTXOManagerConfig) {
        super();
    }

    /**
     * Selects UTXOs prioritizing age (oldest first)
     * 
     * Algorithm:
     * 1. Filter out fresh UTXOs if possible (< minUtxoAgeBlocks)
     * 2. Sort remaining by age (oldest first)
     * 3. Use greedy selection to meet target amount
     * 4. Fall back to fresh UTXOs only if necessary
     * 
     * @param utxos Available UTXOs
     * @param targetAmount Amount needed in sompi
     * @param maxInputs Maximum inputs allowed
     * @param maxMass Maximum mass allowed
     * @returns Selection result or null if impossible
     */
    select(
        utxos: EnrichedUTXO[],
        targetAmount: bigint,
        maxInputs: number,
        maxMass: number
    ): SelectionResult | null {
        if (!this.validateUTXOs(utxos)) {
            return null;
        }

        // Separate mature and fresh UTXOs
        const matureUTXOs = utxos.filter(u => !u.metadata.isFresh);
        const freshUTXOs = utxos.filter(u => u.metadata.isFresh);

        // Sort mature UTXOs by age (oldest first)
        const sortedMature = [...matureUTXOs].sort((a, b) =>
            b.metadata.ageInBlocks - a.metadata.ageInBlocks
        );

        // Try with mature UTXOs first
        if (sortedMature.length > 0) {
            const result = this.greedySelect(sortedMature, targetAmount, maxInputs, maxMass);
            if (result) {
                return result;
            }
        }

        // If mature UTXOs insufficient, try combining with fresh ones
        if (freshUTXOs.length > 0) {
            // Sort fresh UTXOs by age (oldest fresh first)
            const sortedFresh = [...freshUTXOs].sort((a, b) =>
                b.metadata.ageInBlocks - a.metadata.ageInBlocks
            );

            // Combine mature and fresh, keeping age priority
            const combined = [...sortedMature, ...sortedFresh];

            const result = this.greedySelect(combined, targetAmount, maxInputs, maxMass);
            if (result) {
                result.warnings.push('Had to use fresh UTXOs due to insufficient mature balance');
                return result;
            }
        }

        return null;
    }

    /**
     * Gets statistics about UTXO age distribution
     * 
     * @param utxos UTXOs to analyze
     * @returns Age statistics
     */
    getAgeStats(utxos: EnrichedUTXO[]): {
        matureCount: number;
        freshCount: number;
        oldestAge: number;
        newestAge: number;
        averageAge: number;
    } {
        if (utxos.length === 0) {
            return {
                matureCount: 0,
                freshCount: 0,
                oldestAge: 0,
                newestAge: 0,
                averageAge: 0
            };
        }

        const matureCount = utxos.filter(u => !u.metadata.isFresh).length;
        const freshCount = utxos.length - matureCount;

        const ages = utxos.map(u => u.metadata.ageInBlocks);
        const oldestAge = Math.max(...ages);
        const newestAge = Math.min(...ages);
        const averageAge = ages.reduce((sum, age) => sum + age, 0) / ages.length;

        return {
            matureCount,
            freshCount,
            oldestAge,
            newestAge,
            averageAge
        };
    }
}
