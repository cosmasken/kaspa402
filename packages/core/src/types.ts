export interface PaymentDemand {
    chain: 'kaspa';
    network: 'mainnet' | 'testnet';
    recipient: string;
    amount: string;
    amount_sompi: string;
    currency: 'KAS';
    description?: string;
    nonce?: string;
    expires_in?: number;
    facilitator_url: string;
    payment_reference?: string;
}

export interface PaymentProof {
    txid: string;
    address: string;
}

export interface PaymentDemandResponse {
    error: string;
    payment: PaymentDemand;
}

export interface TransactionResult {
    txid: string;
    rawTx?: string;
}

export interface KaspaConfig {
    network: 'mainnet' | 'testnet';
    rpcUrl: string;
}

export interface UTXO {
    txid: string;
    vout: number;
    amount: string;
    scriptPubKey: string;
}

export interface AgentWallet {
    mnemonic: string;
    privateKey: string;
    address: string;
    network: 'mainnet' | 'testnet';
}

export interface KaspaTransaction {
    txid: string;
    version: number;
    inputs: any[];
    outputs: Array<{
        amount: string;
        scriptPublicKey: {
            version: number;
            script: string;
        };
    }>;
    lockTime: number;
    subnetworkId: string;
    is_accepted: boolean;
}

// ============================================================================
// UTXO Management Types
// ============================================================================

/**
 * Enriched UTXO with metadata for intelligent selection
 */
export interface EnrichedUTXO {
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
    metadata: {
        fetchedAt: number;
        ageInBlocks: number;
        isFresh: boolean;
        estimatedMassContribution: number;
    };
}

/**
 * Configuration for UTXO management system
 */
export interface UTXOManagerConfig {
    minUtxoAgeBlocks: number;           // Minimum UTXO age to prefer (default: 2)
    maxInputsPerTx: number;             // Maximum inputs per transaction (default: 5)
    consolidationThreshold: number;      // UTXO count to trigger consolidation (default: 10)
    massLimitBuffer: number;            // Safety buffer for mass limit (default: 0.9)
    maxMassBytes: number;               // Maximum transaction mass (default: 100000)
    cacheExpiryMs: number;              // Cache expiry time (default: 10000)
}

/**
 * Transaction mass estimation result
 */
export interface MassEstimate {
    estimatedMass: number;
    maxAllowedMass: number;
    breakdown: {
        inputsMass: number;
        outputsMass: number;
        overheadMass: number;
    };
    isWithinLimit: boolean;
    utilizationPercent: number;
}

/**
 * UTXO selection result
 */
export interface SelectionResult {
    utxos: EnrichedUTXO[];
    totalAmount: bigint;
    estimatedMass: number;
    strategy: string;
    warnings: string[];
}

/**
 * Selected UTXOs with metadata
 */
export interface SelectedUTXOs {
    utxos: EnrichedUTXO[];
    totalAmount: bigint;
    estimatedMass: number;
    strategy: string;
    warnings: string[];
    metadata: {
        selectionTimeMs: number;
        strategiesAttempted: string[];
        freshUtxosUsed: number;
    };
}

/**
 * Wallet health metrics
 */
export interface WalletHealth {
    address: string;
    totalBalance: bigint;
    utxoCount: number;
    fragmentationScore: number;  // 0-100, higher = more fragmented
    oldestUtxoAge: number;
    newestUtxoAge: number;
    averageUtxoAge: number;
    needsConsolidation: boolean;
    estimatedMaxPayment: bigint;  // Max payment possible without mass issues
}

/**
 * UTXO consolidation result
 */
export interface ConsolidationResult {
    success: boolean;
    txid?: string;
    utxosConsolidated: number;
    beforeCount: number;
    afterCount: number;
}

/**
 * UTXO metrics for monitoring
 */
export interface UTXOMetrics {
    // Selection metrics
    selectionAttempts: number;
    selectionSuccesses: number;
    selectionFailures: number;
    averageSelectionTimeMs: number;

    // Mass metrics
    averageTransactionMass: number;
    massLimitRejections: number;
    massUtilizationPercent: number;

    // UTXO health metrics
    averageUtxoAge: number;
    fragmentationScore: number;
    consolidationsPerformed: number;

    // Strategy metrics
    strategyUsage: Record<string, number>;
    freshUtxoUsageCount: number;
}

// ============================================================================
// Custom Error Types
// ============================================================================

/**
 * Error thrown when transaction mass exceeds limits
 */
export class TransactionMassError extends Error {
    constructor(
        message: string,
        public massEstimate: MassEstimate,
        public suggestedActions: string[]
    ) {
        super(message);
        this.name = 'TransactionMassError';
        Object.setPrototypeOf(this, TransactionMassError.prototype);
    }
}

/**
 * Error thrown when insufficient mature UTXOs are available
 */
export class InsufficientMatureUTXOsError extends Error {
    constructor(
        message: string,
        public availableUTXOs: number,
        public matureUTXOs: number,
        public estimatedWaitBlocks: number
    ) {
        super(message);
        this.name = 'InsufficientMatureUTXOsError';
        Object.setPrototypeOf(this, InsufficientMatureUTXOsError.prototype);
    }
}

/**
 * Error thrown when wallet is too fragmented
 */
export class UTXOFragmentationError extends Error {
    constructor(
        message: string,
        public fragmentationScore: number,
        public recommendedAction: 'consolidate' | 'wait'
    ) {
        super(message);
        this.name = 'UTXOFragmentationError';
        Object.setPrototypeOf(this, UTXOFragmentationError.prototype);
    }
}
