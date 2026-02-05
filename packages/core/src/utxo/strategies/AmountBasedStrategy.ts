import { EnrichedUTXO, SelectionResult, UTXOManagerConfig } from '../../types.js';
import { BaseSelectionStrategy } from './SelectionStrategy.js';

/**
 * AmountBasedStrategy prefers single large UTXOs to minimize transaction size.
 * 
 * This strategy optimizes for:
 * - Minimal transaction mass (fewer inputs = smaller transaction)
 * - Lower transaction fees
 * - Faster transaction creation
 * 
 * It's ideal when you have a mix of large and small UTXOs and want to
 * avoid creating complex multi-input transactions.
 */
export class AmountBasedStrategy extends BaseSelectionStrategy {
    name = 'amount-based';

    constructor(private config: UTXOManagerConfig) {
        super();
    }

    /**
     * Selects UTXOs prioritizing amount (largest first)
     * 
     * Algorithm:
     * 1. Sort UTXOs by amount (largest first)
     * 2. Try to find single UTXO that covers target amount
     * 3. If not found, use greedy selection with largest UTXOs first
     * 4. This minimizes the number of inputs needed
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

        // Sort by amount (largest first)
        const sortedByAmount = [...utxos].sort((a, b) => {
            const amountA = BigInt(a.utxoEntry.amount);
            const amountB = BigInt(b.utxoEntry.amount);
            return amountB > amountA ? 1 : amountB < amountA ? -1 : 0;
        });

        // Try to find a single UTXO that covers the amount
        const singleUTXO = sortedByAmount.find(utxo =>
            BigInt(utxo.utxoEntry.amount) >= targetAmount
        );

        if (singleUTXO) {
            // Perfect! Single UTXO covers everything
            return this.buildResult(singleUTXO, targetAmount);
        }

        // No single UTXO works, use greedy selection with largest first
        return this.greedySelect(sortedByAmount, targetAmount, maxInputs, maxMass);
    }

    /**
     * Finds the optimal single UTXO if one exists
     * 
     * @param utxos Available UTXOs
     * @param targetAmount Target amount
     * @returns Single UTXO or null
     */
    findOptimalSingleUTXO(utxos: EnrichedUTXO[], targetAmount: bigint): EnrichedUTXO | null {
        // Find UTXOs that can cover the amount
        const candidates = utxos.filter(utxo =>
            BigInt(utxo.utxoEntry.amount) >= targetAmount
        );

        if (candidates.length === 0) {
            return null;
        }

        // Prefer the smallest UTXO that covers the amount (minimizes change)
        return candidates.reduce((best, current) => {
            const bestAmount = BigInt(best.utxoEntry.amount);
            const currentAmount = BigInt(current.utxoEntry.amount);
            return currentAmount < bestAmount ? current : best;
        });
    }

    /**
     * Gets statistics about UTXO amount distribution
     * 
     * @param utxos UTXOs to analyze
     * @returns Amount statistics
     */
    getAmountStats(utxos: EnrichedUTXO[]): {
        totalAmount: bigint;
        largestAmount: bigint;
        smallestAmount: bigint;
        averageAmount: bigint;
        count: number;
    } {
        if (utxos.length === 0) {
            return {
                totalAmount: 0n,
                largestAmount: 0n,
                smallestAmount: 0n,
                averageAmount: 0n,
                count: 0
            };
        }

        const amounts = utxos.map(u => BigInt(u.utxoEntry.amount));
        const totalAmount = amounts.reduce((sum, amount) => sum + amount, 0n);
        const largestAmount = amounts.reduce((max, amount) => amount > max ? amount : max, 0n);
        const smallestAmount = amounts.reduce((min, amount) => amount < min ? amount : min, amounts[0]);
        const averageAmount = totalAmount / BigInt(amounts.length);

        return {
            totalAmount,
            largestAmount,
            smallestAmount,
            averageAmount,
            count: utxos.length
        };
    }
}
