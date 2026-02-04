import { MassEstimate, UTXOManagerConfig, EnrichedUTXO } from '../types.js';

/**
 * MassEstimator calculates transaction mass to prevent exceeding Kaspa's limits.
 * 
 * Kaspa enforces a maximum transaction mass of 100,000 bytes. This class provides
 * accurate estimation before transaction signing to avoid network rejections.
 */
export class MassEstimator {
    // Mass calculation constants based on Kaspa transaction structure
    private readonly BYTES_PER_INPUT = 200;      // Approximate size per input
    private readonly BYTES_PER_OUTPUT = 50;      // Approximate size per output
    private readonly OVERHEAD_BYTES = 100;       // Transaction overhead (version, locktime, etc)
    private readonly SCHNORR_SIG_BYTES = 65;     // Schnorr signature size

    constructor(private config: UTXOManagerConfig) { }

    /**
     * Estimates the total mass of a transaction given input and output counts
     * 
     * @param inputCount Number of transaction inputs
     * @param outputCount Number of transaction outputs
     * @returns Detailed mass estimate with breakdown
     */
    estimateMass(inputCount: number, outputCount: number): MassEstimate {
        // Calculate mass for each component
        const inputsMass = inputCount * this.BYTES_PER_INPUT;
        const outputsMass = outputCount * this.BYTES_PER_OUTPUT;
        const overheadMass = this.OVERHEAD_BYTES;

        // Total estimated mass
        const estimatedMass = inputsMass + outputsMass + overheadMass;

        // Apply safety buffer to max allowed mass
        const maxAllowedMass = this.config.maxMassBytes;
        const effectiveLimit = maxAllowedMass * this.config.massLimitBuffer;

        // Calculate utilization percentage
        const utilizationPercent = (estimatedMass / maxAllowedMass) * 100;

        return {
            estimatedMass,
            maxAllowedMass,
            breakdown: {
                inputsMass,
                outputsMass,
                overheadMass
            },
            isWithinLimit: estimatedMass <= effectiveLimit,
            utilizationPercent
        };
    }

    /**
     * Estimates the mass contribution of a single UTXO when used as input
     * 
     * @param utxo The UTXO to estimate
     * @returns Estimated mass in bytes
     */
    estimateUTXOMass(utxo: EnrichedUTXO): number {
        // Each input contributes:
        // - Previous outpoint reference (36 bytes)
        // - Signature script (65 bytes for Schnorr)
        // - Sequence number (8 bytes)
        // - Additional overhead (~91 bytes)
        return this.BYTES_PER_INPUT;
    }

    /**
     * Calculates the maximum number of inputs that can fit within mass limits
     * 
     * @param outputCount Number of outputs in the transaction
     * @returns Maximum safe input count
     */
    calculateMaxInputs(outputCount: number): number {
        const outputsMass = outputCount * this.BYTES_PER_OUTPUT;
        const overheadMass = this.OVERHEAD_BYTES;
        const effectiveLimit = this.config.maxMassBytes * this.config.massLimitBuffer;

        const availableMassForInputs = effectiveLimit - outputsMass - overheadMass;
        const maxInputs = Math.floor(availableMassForInputs / this.BYTES_PER_INPUT);

        // Cap at configured maximum
        return Math.min(maxInputs, this.config.maxInputsPerTx);
    }

    /**
     * Validates if a transaction with given parameters would be within mass limits
     * 
     * @param inputCount Number of inputs
     * @param outputCount Number of outputs
     * @returns True if within limits, false otherwise
     */
    isWithinMassLimit(inputCount: number, outputCount: number): boolean {
        const estimate = this.estimateMass(inputCount, outputCount);
        return estimate.isWithinLimit;
    }

    /**
     * Gets a human-readable summary of mass estimate
     * 
     * @param estimate The mass estimate to summarize
     * @returns Formatted summary string
     */
    getSummary(estimate: MassEstimate): string {
        const status = estimate.isWithinLimit ? '✓' : '✗';
        return `${status} Mass: ${estimate.estimatedMass}/${estimate.maxAllowedMass} bytes (${estimate.utilizationPercent.toFixed(1)}%)`;
    }
}
