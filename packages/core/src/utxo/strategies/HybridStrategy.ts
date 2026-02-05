import { EnrichedUTXO, SelectionResult, UTXOManagerConfig } from '../../types.js';
import { BaseSelectionStrategy } from './SelectionStrategy.js';

/**
 * Scored UTXO for hybrid selection
 */
interface ScoredUTXO {
    utxo: EnrichedUTXO;
    score: number;
    breakdown: {
        ageScore: number;
        amountScore: number;
        massScore: number;
    };
}

/**
 * HybridStrategy combines age, amount, and mass considerations for optimal selection.
 * 
 * This is the most sophisticated strategy, balancing multiple factors:
 * - Age: Prefers older UTXOs to avoid freshness issues (40% weight)
 * - Amount: Prefers UTXOs that match or exceed target amount (30% weight)
 * - Mass: Prefers UTXOs with lower mass contribution (30% weight)
 * 
 * This strategy provides the best overall performance for most use cases.
 */
export class HybridStrategy extends BaseSelectionStrategy {
    name = 'hybrid';

    // Scoring weights (must sum to 100)
    private readonly AGE_WEIGHT = 40;
    private readonly AMOUNT_WEIGHT = 30;
    private readonly MASS_WEIGHT = 30;

    constructor(private config: UTXOManagerConfig) {
        super();
    }

    /**
     * Selects UTXOs using a composite scoring algorithm
     * 
     * Algorithm:
     * 1. Score each UTXO based on age, amount, and mass
     * 2. Sort by score (highest first)
     * 3. Use greedy selection with scored order
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

        // Score all UTXOs
        const scored = utxos.map(utxo => this.scoreUTXO(utxo, targetAmount));

        // Sort by score (highest first)
        scored.sort((a, b) => b.score - a.score);

        // Extract sorted UTXOs
        const sortedUTXOs = scored.map(s => s.utxo);

        // Use greedy selection with scored order
        return this.greedySelect(sortedUTXOs, targetAmount, maxInputs, maxMass);
    }

    /**
     * Calculates a composite score for a UTXO
     * 
     * @param utxo UTXO to score
     * @param targetAmount Target amount for context
     * @returns Scored UTXO with breakdown
     */
    private scoreUTXO(utxo: EnrichedUTXO, targetAmount: bigint): ScoredUTXO {
        const ageScore = this.calculateAgeScore(utxo);
        const amountScore = this.calculateAmountScore(utxo, targetAmount);
        const massScore = this.calculateMassScore(utxo);

        // Weighted composite score
        const score =
            (ageScore * this.AGE_WEIGHT / 100) +
            (amountScore * this.AMOUNT_WEIGHT / 100) +
            (massScore * this.MASS_WEIGHT / 100);

        return {
            utxo,
            score,
            breakdown: {
                ageScore,
                amountScore,
                massScore
            }
        };
    }

    /**
     * Calculates age score (0-100)
     * 
     * Scoring:
     * - Fresh UTXOs (< minUtxoAgeBlocks): 0 points
     * - Mature UTXOs: Linear scale up to 100 points at 10+ blocks
     * 
     * @param utxo UTXO to score
     * @returns Age score (0-100)
     */
    private calculateAgeScore(utxo: EnrichedUTXO): number {
        const age = utxo.metadata.ageInBlocks;

        // Fresh UTXOs get 0 points
        if (utxo.metadata.isFresh) {
            return 0;
        }

        // Linear scale from minAge to 10 blocks
        const minAge = this.config.minUtxoAgeBlocks;
        const maxAge = 10;

        if (age >= maxAge) {
            return 100;
        }

        // Linear interpolation
        return ((age - minAge) / (maxAge - minAge)) * 100;
    }

    /**
     * Calculates amount score (0-100)
     * 
     * Scoring:
     * - UTXO covers full amount: 100 points
     * - UTXO covers 50%+ of amount: 50-99 points
     * - UTXO covers < 50% of amount: 0-49 points
     * 
     * @param utxo UTXO to score
     * @param targetAmount Target amount
     * @returns Amount score (0-100)
     */
    private calculateAmountScore(utxo: EnrichedUTXO, targetAmount: bigint): number {
        const utxoAmount = BigInt(utxo.utxoEntry.amount);

        // Perfect match or larger gets full points
        if (utxoAmount >= targetAmount) {
            return 100;
        }

        // Calculate percentage of target amount
        const percentage = Number((utxoAmount * 100n) / targetAmount);

        return Math.min(percentage, 99); // Cap at 99 for non-covering amounts
    }

    /**
     * Calculates mass score (0-100)
     * 
     * Scoring:
     * - Lower mass contribution = higher score
     * - Based on estimated mass contribution relative to max
     * 
     * @param utxo UTXO to score
     * @returns Mass score (0-100)
     */
    private calculateMassScore(utxo: EnrichedUTXO): number {
        const mass = utxo.metadata.estimatedMassContribution;
        const maxMass = 300; // Reasonable max for a single input

        // Invert: lower mass = higher score
        const normalized = Math.max(0, Math.min(mass, maxMass)) / maxMass;
        return (1 - normalized) * 100;
    }

    /**
     * Gets detailed scoring information for UTXOs
     * 
     * @param utxos UTXOs to analyze
     * @param targetAmount Target amount for scoring context
     * @returns Array of scored UTXOs with breakdowns
     */
    getDetailedScores(utxos: EnrichedUTXO[], targetAmount: bigint): ScoredUTXO[] {
        return utxos.map(utxo => this.scoreUTXO(utxo, targetAmount));
    }

    /**
     * Explains why a particular UTXO received its score
     * 
     * @param utxo UTXO to explain
     * @param targetAmount Target amount
     * @returns Human-readable explanation
     */
    explainScore(utxo: EnrichedUTXO, targetAmount: bigint): string {
        const scored = this.scoreUTXO(utxo, targetAmount);

        return `
Score: ${scored.score.toFixed(1)}/100
  Age Score: ${scored.breakdown.ageScore.toFixed(1)} (${this.AGE_WEIGHT}% weight)
    - Age: ${utxo.metadata.ageInBlocks} blocks
    - Fresh: ${utxo.metadata.isFresh ? 'Yes' : 'No'}
  Amount Score: ${scored.breakdown.amountScore.toFixed(1)} (${this.AMOUNT_WEIGHT}% weight)
    - Amount: ${utxo.utxoEntry.amount} sompi
    - Coverage: ${((BigInt(utxo.utxoEntry.amount) * 100n) / targetAmount)}%
  Mass Score: ${scored.breakdown.massScore.toFixed(1)} (${this.MASS_WEIGHT}% weight)
    - Estimated Mass: ${utxo.metadata.estimatedMassContribution} bytes
        `.trim();
    }
}
