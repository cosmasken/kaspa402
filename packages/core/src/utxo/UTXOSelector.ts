import { EnrichedUTXO, SelectionResult, SelectedUTXOs, UTXOManagerConfig } from '../types.js';
import { SelectionStrategy } from './strategies/SelectionStrategy.js';
import { AgeBasedStrategy } from './strategies/AgeBasedStrategy.js';
import { AmountBasedStrategy } from './strategies/AmountBasedStrategy.js';
import { HybridStrategy } from './strategies/HybridStrategy.js';

/**
 * UTXOSelector coordinates multiple selection strategies with fallback logic.
 * 
 * It tries strategies in order of sophistication:
 * 1. Hybrid (best overall balance)
 * 2. Age-based (safest for avoiding mass issues)
 * 3. Amount-based (fallback for efficiency)
 * 
 * This ensures we always find a valid selection if one exists.
 */
export class UTXOSelector {
    private strategies: SelectionStrategy[];

    constructor(private config: UTXOManagerConfig) {
        // Initialize strategies in priority order
        this.strategies = [
            new HybridStrategy(config),
            new AgeBasedStrategy(config),
            new AmountBasedStrategy(config)
        ];
    }

    /**
     * Selects optimal UTXOs using strategy fallback chain
     * 
     * @param utxos Available UTXOs
     * @param targetAmount Amount needed in sompi
     * @param maxInputs Maximum inputs allowed
     * @param maxMass Maximum mass allowed
     * @returns Selected UTXOs with metadata
     * @throws Error if no strategy can satisfy the requirements
     */
    async selectOptimal(
        utxos: EnrichedUTXO[],
        targetAmount: bigint,
        maxInputs: number,
        maxMass: number
    ): Promise<SelectedUTXOs> {
        const startTime = Date.now();
        const strategiesAttempted: string[] = [];

        console.log(`[UTXO Selector] Selecting UTXOs for ${targetAmount} sompi`);
        console.log(`[UTXO Selector] Available: ${utxos.length} UTXOs, Max inputs: ${maxInputs}, Max mass: ${maxMass}`);

        // Filter out fresh UTXOs to prevent storage mass errors
        const freshUtxos = utxos.filter(u => u.metadata.isFresh);
        const matureUtxos = utxos.filter(u => !u.metadata.isFresh);

        if (freshUtxos.length > 0) {
            const freshAges = freshUtxos.map(u => u.metadata.ageInBlocks).join(', ');
            console.log(`[UTXO Selector] ⚠ Filtered out ${freshUtxos.length} fresh UTXOs (ages: ${freshAges} blocks, min required: ${this.config.minUtxoAgeBlocks})`);
        }

        if (matureUtxos.length > 0) {
            const matureAges = matureUtxos.map(u => u.metadata.ageInBlocks).join(', ');
            console.log(`[UTXO Selector] ✓ Using ${matureUtxos.length} mature UTXOs (ages: ${matureAges} blocks)`);
        }

        if (matureUtxos.length === 0) {
            const allAges = utxos.map(u => u.metadata.ageInBlocks).join(', ');
            throw new Error(
                `All ${utxos.length} UTXOs are too fresh (ages: ${allAges} blocks, min required: ${this.config.minUtxoAgeBlocks}). ` +
                `Wait ~${this.config.minUtxoAgeBlocks} seconds for UTXOs to mature before making another transaction.`
            );
        }

        // Use only mature UTXOs for selection
        const selectableUtxos = matureUtxos;

        // Try each strategy in order
        for (const strategy of this.strategies) {
            strategiesAttempted.push(strategy.name);

            console.log(`[UTXO Selector] Trying ${strategy.name} strategy...`);

            const result = strategy.select(selectableUtxos, targetAmount, maxInputs, maxMass);

            if (result) {
                const selectionTimeMs = Date.now() - startTime;
                const freshUtxosUsed = result.utxos.filter(u => u.metadata.isFresh).length;

                console.log(`[UTXO Selector] ✓ Success with ${strategy.name}`);
                console.log(`[UTXO Selector]   Selected: ${result.utxos.length} UTXOs`);
                console.log(`[UTXO Selector]   Total: ${result.totalAmount} sompi`);
                console.log(`[UTXO Selector]   Mass: ${result.estimatedMass} bytes`);
                console.log(`[UTXO Selector]   Time: ${selectionTimeMs}ms`);

                if (result.warnings.length > 0) {
                    console.log(`[UTXO Selector]   Warnings: ${result.warnings.join(', ')}`);
                }

                return {
                    ...result,
                    metadata: {
                        selectionTimeMs,
                        strategiesAttempted,
                        freshUtxosUsed
                    }
                };
            }

            console.log(`[UTXO Selector] ✗ ${strategy.name} failed`);
        }

        // All strategies failed
        const selectionTimeMs = Date.now() - startTime;

        console.error(`[UTXO Selector] ✗ All strategies failed`);
        console.error(`[UTXO Selector]   Attempted: ${strategiesAttempted.join(', ')}`);
        console.error(`[UTXO Selector]   Available UTXOs: ${selectableUtxos.length} mature (${freshUtxos.length} fresh filtered)`);
        console.error(`[UTXO Selector]   Total available: ${this.getTotalAmount(selectableUtxos)} sompi`);
        console.error(`[UTXO Selector]   Target amount: ${targetAmount} sompi`);

        throw new Error(
            `Failed to select UTXOs: No strategy could satisfy requirements. ` +
            `Available: ${this.getTotalAmount(selectableUtxos)} sompi, ` +
            `Needed: ${targetAmount} sompi, ` +
            `Mature UTXOs: ${selectableUtxos.length}, ` +
            `Strategies tried: ${strategiesAttempted.join(', ')}`
        );
    }

    /**
     * Selects UTXOs using a specific strategy
     * 
     * @param strategyName Name of strategy to use
     * @param utxos Available UTXOs
     * @param targetAmount Amount needed
     * @param maxInputs Maximum inputs
     * @param maxMass Maximum mass
     * @returns Selection result or null
     */
    selectWithStrategy(
        strategyName: string,
        utxos: EnrichedUTXO[],
        targetAmount: bigint,
        maxInputs: number,
        maxMass: number
    ): SelectionResult | null {
        const strategy = this.strategies.find(s => s.name === strategyName);

        if (!strategy) {
            throw new Error(`Unknown strategy: ${strategyName}`);
        }

        return strategy.select(utxos, targetAmount, maxInputs, maxMass);
    }

    /**
     * Gets list of available strategy names
     * 
     * @returns Array of strategy names
     */
    getAvailableStrategies(): string[] {
        return this.strategies.map(s => s.name);
    }

    /**
     * Calculates total amount from UTXOs
     * 
     * @param utxos UTXOs to sum
     * @returns Total amount in sompi
     */
    private getTotalAmount(utxos: EnrichedUTXO[]): bigint {
        return utxos.reduce((sum, utxo) => sum + BigInt(utxo.utxoEntry.amount), 0n);
    }

    /**
     * Validates that selection is possible given constraints
     * 
     * @param utxos Available UTXOs
     * @param targetAmount Target amount
     * @param maxInputs Maximum inputs
     * @returns Validation result with details
     */
    validateSelection(
        utxos: EnrichedUTXO[],
        targetAmount: bigint,
        maxInputs: number
    ): {
        isPossible: boolean;
        reason?: string;
        suggestions?: string[];
    } {
        if (utxos.length === 0) {
            return {
                isPossible: false,
                reason: 'No UTXOs available',
                suggestions: ['Fund the wallet with KAS']
            };
        }

        const totalAvailable = this.getTotalAmount(utxos);

        if (totalAvailable < targetAmount) {
            return {
                isPossible: false,
                reason: `Insufficient funds: ${totalAvailable} < ${targetAmount}`,
                suggestions: [
                    `Need ${targetAmount - totalAvailable} more sompi`,
                    'Fund the wallet or reduce payment amount'
                ]
            };
        }

        // Check if we can reach target with max inputs
        const sortedByAmount = [...utxos].sort((a, b) => {
            const amountA = BigInt(a.utxoEntry.amount);
            const amountB = BigInt(b.utxoEntry.amount);
            return amountB > amountA ? 1 : -1;
        });

        let sum = 0n;
        for (let i = 0; i < Math.min(maxInputs, sortedByAmount.length); i++) {
            sum += BigInt(sortedByAmount[i].utxoEntry.amount);
        }

        if (sum < targetAmount) {
            return {
                isPossible: false,
                reason: `Cannot reach target with ${maxInputs} inputs`,
                suggestions: [
                    `Increase maxInputsPerTx (currently ${maxInputs})`,
                    'Consolidate UTXOs to create larger ones'
                ]
            };
        }

        return { isPossible: true };
    }
}
