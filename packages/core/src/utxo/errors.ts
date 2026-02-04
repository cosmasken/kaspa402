import {
    TransactionMassError,
    InsufficientMatureUTXOsError,
    UTXOFragmentationError,
    MassEstimate
} from '../types.js';

/**
 * Error handling utilities for UTXO management
 */

/**
 * Creates a TransactionMassError with helpful suggestions
 * 
 * @param massEstimate Mass estimate that failed
 * @param inputCount Number of inputs attempted
 * @returns TransactionMassError with suggestions
 */
export function createMassError(
    massEstimate: MassEstimate,
    inputCount: number
): TransactionMassError {
    const suggestions: string[] = [];

    if (inputCount > 3) {
        suggestions.push(`Reduce number of inputs (currently ${inputCount})`);
    }

    suggestions.push('Wait for UTXOs to mature (2+ blocks)');
    suggestions.push('Consolidate fragmented UTXOs');
    suggestions.push('Use larger UTXOs to minimize input count');

    return new TransactionMassError(
        `Transaction mass ${massEstimate.estimatedMass} exceeds limit ${massEstimate.maxAllowedMass * massEstimate.utilizationPercent / 100}`,
        massEstimate,
        suggestions
    );
}

/**
 * Creates an InsufficientMatureUTXOsError with wait time estimate
 * 
 * @param availableUTXOs Total UTXOs available
 * @param matureUTXOs Mature UTXOs available
 * @param newestAge Age of newest UTXO
 * @param minAge Minimum age required
 * @returns InsufficientMatureUTXOsError
 */
export function createMaturityError(
    availableUTXOs: number,
    matureUTXOs: number,
    newestAge: number,
    minAge: number
): InsufficientMatureUTXOsError {
    const blocksToWait = Math.max(0, minAge - newestAge);
    const secondsToWait = blocksToWait * 1; // ~1 second per block on Kaspa

    return new InsufficientMatureUTXOsError(
        `Only ${matureUTXOs} of ${availableUTXOs} UTXOs are mature (need ${minAge}+ blocks old). Wait ~${secondsToWait}s for maturity.`,
        availableUTXOs,
        matureUTXOs,
        blocksToWait
    );
}

/**
 * Creates a UTXOFragmentationError with recommendations
 * 
 * @param fragmentationScore Fragmentation score (0-100)
 * @param utxoCount Number of UTXOs
 * @returns UTXOFragmentationError
 */
export function createFragmentationError(
    fragmentationScore: number,
    utxoCount: number
): UTXOFragmentationError {
    const action: 'consolidate' | 'wait' = fragmentationScore > 60 ? 'consolidate' : 'wait';

    return new UTXOFragmentationError(
        `Wallet is highly fragmented (score: ${fragmentationScore}/100, ${utxoCount} UTXOs). ${action === 'consolidate' ? 'Consolidation recommended' : 'Consider consolidating during idle periods'}.`,
        fragmentationScore,
        action
    );
}

/**
 * Parses Kaspa API error messages to extract useful information
 * 
 * @param error Error from Kaspa API
 * @returns Parsed error information
 */
export function parseKaspaError(error: any): {
    type: 'mass' | 'orphan' | 'insufficient_funds' | 'network' | 'unknown';
    message: string;
    details?: any;
} {
    const errorMessage = error.response?.data?.error || error.message || '';

    if (errorMessage.includes('transaction storage mass') || errorMessage.includes('larger than max allowed size')) {
        return {
            type: 'mass',
            message: 'Transaction exceeds mass limit',
            details: { errorMessage }
        };
    }

    if (errorMessage.includes('orphan')) {
        return {
            type: 'orphan',
            message: 'Transaction rejected as orphan (UTXOs may be stale)',
            details: { errorMessage }
        };
    }

    if (errorMessage.includes('insufficient') || errorMessage.includes('not enough')) {
        return {
            type: 'insufficient_funds',
            message: 'Insufficient funds',
            details: { errorMessage }
        };
    }

    if (errorMessage.includes('WebSocket') || errorMessage.includes('network') || errorMessage.includes('timeout')) {
        return {
            type: 'network',
            message: 'Network connectivity issue',
            details: { errorMessage }
        };
    }

    return {
        type: 'unknown',
        message: errorMessage || 'Unknown error',
        details: { error }
    };
}

/**
 * Determines if an error is retryable
 * 
 * @param error Error to check
 * @returns True if error is retryable
 */
export function isRetryableError(error: any): boolean {
    const parsed = parseKaspaError(error);
    return parsed.type === 'orphan' || parsed.type === 'network';
}

/**
 * Gets suggested wait time before retry based on error type
 * 
 * @param error Error that occurred
 * @returns Suggested wait time in milliseconds
 */
export function getRetryDelay(error: any): number {
    const parsed = parseKaspaError(error);

    switch (parsed.type) {
        case 'mass':
            return 5000; // Wait 5s for UTXOs to mature
        case 'orphan':
            return 2000; // Wait 2s for network state
        case 'network':
            return 3000; // Wait 3s for network recovery
        default:
            return 1000; // Default 1s
    }
}
