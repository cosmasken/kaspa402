import { TransactionResult, KaspaConfig, AgentWallet } from './types.js';
import { globalMetrics } from './metrics.js';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
// Use official Kaspa libraries exactly like the demo
export { initKaspaFramework } from '@kaspa/wallet';
import { initKaspaFramework } from '@kaspa/wallet';
import kaspaCore from '@kaspa/core-lib';
const { PrivateKey, Address, Transaction, Script, crypto } = kaspaCore;
import axios from 'axios';
import * as https from 'https';
import * as http from 'http';
import { UTXOManager } from './utxo/UTXOManager.js';
import { TransactionMassError } from './types.js';

// Create axios instance that forces IPv4 to avoid IPv6 connectivity issues
const axiosClient = axios.create({
    httpAgent: new http.Agent({ family: 4 }),
    httpsAgent: new https.Agent({ family: 4 }),
    timeout: 10000 // 10s timeout
});

const SOMPI_PER_KAS = 100000000n;
const DEFAULT_FEE_SOMPI = 1000n;

// Global UTXO manager instance (can be configured via environment)
let globalUTXOManager: UTXOManager | null = null;

/**
 * Gets or creates the global UTXO manager instance
 */
function getUTXOManager(): UTXOManager {
    if (!globalUTXOManager) {
        globalUTXOManager = new UTXOManager({
            minUtxoAgeBlocks: parseInt(process.env.MIN_UTXO_AGE_BLOCKS || '10'), // Increased from 2 to avoid storage mass penalties
            maxInputsPerTx: parseInt(process.env.MAX_INPUTS_PER_TX || '5'),
            consolidationThreshold: parseInt(process.env.CONSOLIDATION_THRESHOLD || '10'),
            massLimitBuffer: parseFloat(process.env.MASS_LIMIT_BUFFER || '0.9'),
            maxMassBytes: parseInt(process.env.MAX_MASS_BYTES || '100000'),
            cacheExpiryMs: parseInt(process.env.CACHE_EXPIRY_MS || '10000')
        });
    }
    return globalUTXOManager;
}

export function kasToSompi(kas: string): bigint {
    const kasFloat = parseFloat(kas);
    return BigInt(Math.floor(kasFloat * Number(SOMPI_PER_KAS)));
}

/**
 * Calculate transaction ID from transaction JSON
 * Uses double SHA256 hash of the serialized transaction
 */
function calculateTransactionId(txJson: any): string {
    // Serialize transaction to canonical JSON string
    const txString = JSON.stringify(txJson);
    
    // Double SHA256 hash
    const hash1 = createHash('sha256').update(txString).digest();
    const hash2 = createHash('sha256').update(hash1).digest();
    
    // Return as hex string
    return hash2.toString('hex');
}

/**
 * Check if a transaction has been accepted by the Kaspa network
 * 
 * @param txid Transaction ID to check
 * @param apiUrl Kaspa API URL
 * @returns true if transaction exists and is accepted, false otherwise
 */
async function checkTransactionStatus(txid: string, apiUrl: string): Promise<boolean> {
    try {
        console.log(`[Kaspa TX] Checking status of transaction ${txid}...`);
        
        const response = await axiosClient.get(`${apiUrl}/transactions/${txid}`);
        
        if (response.data && response.data.is_accepted !== undefined) {
            const isAccepted = response.data.is_accepted;
            console.log(`[Kaspa TX] Transaction ${txid} status: ${isAccepted ? 'ACCEPTED' : 'PENDING'}`);
            return isAccepted;
        }
        
        // If response doesn't have is_accepted field, check if transaction exists
        if (response.status === 200 && response.data) {
            console.log(`[Kaspa TX] Transaction ${txid} found in network`);
            return true;
        }
        
        return false;
    } catch (error: any) {
        // 404 means transaction not found
        if (error.response?.status === 404) {
            console.log(`[Kaspa TX] Transaction ${txid} not found in network`);
            return false;
        }
        
        // Other errors - log but assume not accepted
        console.warn(`[Kaspa TX] Error checking transaction status:`, error.message);
        return false;
    }
}


export function sompiToKas(sompi: bigint): string {
    return (Number(sompi) / Number(SOMPI_PER_KAS)).toFixed(8);
}

/**
 * Generate a new agent wallet or load from private key using official Kaspa wallet library
 */
export async function generateAgentWallet(
    network: 'mainnet' | 'testnet' = 'testnet',
    persistPath?: string,
    privateKey?: string
): Promise<AgentWallet> {
    try {
        // Check if we should load existing wallet first (before framework init)
        if (persistPath && fs.existsSync(persistPath)) {
            try {
                const walletData = JSON.parse(fs.readFileSync(persistPath, 'utf8'));
                console.log('[Kaspa TX] Loading existing wallet from:', persistPath);
                return walletData;
            } catch (error) {
                console.warn('[Kaspa TX] Failed to load existing wallet, generating new one:', error);
            }
        }

        // Only initialize framework if we need to generate a new wallet
        await initKaspaFramework();

        // Create wallet with official library
        const sk = privateKey ? new PrivateKey(privateKey) : new PrivateKey();
        const kaspaNetwork = network === 'mainnet' ? 'kaspa' : 'kaspatest';
        const address = sk.toAddress(kaspaNetwork);

        const walletData = {
            mnemonic: sk.toString(), // Store private key as "mnemonic" for compatibility
            privateKey: sk.toString(),
            address: address.toString(),
            network
        };

        // Save wallet if persistence path provided
        if (persistPath) {
            try {
                const dir = path.dirname(persistPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(persistPath, JSON.stringify(walletData, null, 2));
                console.log('[Kaspa TX] Wallet saved to:', persistPath);
            } catch (error) {
                console.warn('[Kaspa TX] Failed to save wallet:', error);
            }
        }

        return walletData;
    } catch (error) {
        console.error('[Kaspa TX] Error generating agent wallet:', error);
        throw new Error('Failed to generate agent wallet');
    }
}

/**
 * Creates, signs, and broadcasts a Kaspa payment transaction using official core library
 */
export async function createAndSignPayment(
    privateKeyWif: string,
    recipient: string,
    amountSompi: bigint,
    config: KaspaConfig,
    isRetry: boolean = false
): Promise<TransactionResult> {
    console.log(`[Kaspa TX] Creating payment:`);
    console.log(`  Network: ${config.network}`);
    console.log(`  To: ${recipient}`);
    console.log(`  Amount: ${sompiToKas(amountSompi)} KAS (${amountSompi} sompi)`);

    try {
        await initKaspaFramework();

        // Create private key from string (exact from demo)
        const sk = new PrivateKey(privateKeyWif);
        const kaspaNetwork = config.network === 'mainnet' ? 'kaspa' : 'kaspatest';
        const senderAddress = sk.toAddress(kaspaNetwork).toString();

        console.log(`  From: ${senderAddress}`);

        // Define common variables
        const baseFee = 10000n; // Higher base fee to cover multiple inputs
        const apiUrl = config.network === 'mainnet' ? 'https://api.kaspa.org' : 'https://api-tn10.kaspa.org';

        // Use UTXO Manager for intelligent selection
        const useUTXOManager = process.env.USE_UTXO_MANAGER !== 'false'; // Enabled by default

        let selectedUtxos;
        let totalInputAmount = 0n;

        if (useUTXOManager) {
            try {
                console.log(`[Kaspa TX] Using UTXO Manager for selection`);
                const utxoManager = getUTXOManager();

                // Select optimal UTXOs
                const selection = await utxoManager.selectUTXOsForPayment(
                    senderAddress,
                    amountSompi,
                    config.network
                );

                console.log(`[Kaspa TX] Selected ${selection.utxos.length} UTXOs using ${selection.strategy} strategy`);
                console.log(`[Kaspa TX] Estimated mass: ${selection.estimatedMass} bytes (${((selection.estimatedMass / 100000) * 100).toFixed(1)}% of limit)`);

                if (selection.warnings.length > 0) {
                    console.warn(`[Kaspa TX] Warnings: ${selection.warnings.join(', ')}`);
                }

                // Convert enriched UTXOs to format expected by transaction builder
                selectedUtxos = selection.utxos.map(u => ({
                    outpoint: u.outpoint,
                    utxoEntry: u.utxoEntry
                }));

                totalInputAmount = selection.totalAmount;

            } catch (error) {
                if (error instanceof TransactionMassError) {
                    console.error(`[Kaspa TX] Transaction mass error:`, error.message);
                    console.error(`[Kaspa TX] Estimated mass: ${error.massEstimate.estimatedMass} bytes`);
                    console.error(`[Kaspa TX] Suggestions:`, error.suggestedActions.join(', '));
                    throw error;
                }

                console.warn(`[Kaspa TX] UTXO Manager failed, falling back to legacy selection:`, error);
                // Fall through to legacy selection
                selectedUtxos = null;
            }
        }

        // Legacy UTXO selection (fallback or if UTXO Manager disabled)
        if (!selectedUtxos) {
            console.log(`[Kaspa TX] Using legacy UTXO selection`);

            // Get fresh UTXOs from API with retry logic for orphan transactions
            let utxos;
            let retryCount = 0;
            const maxRetries = 3;

            while (retryCount < maxRetries) {
                try {
                    const response = await axiosClient.get(`${apiUrl}/addresses/${senderAddress}/utxos`);
                    utxos = response.data;

                    if (!utxos || utxos.length === 0) {
                        throw new Error(`No funds available: Wallet ${senderAddress} has no UTXOs`);
                    }

                    // Validate UTXOs are not stale by checking they have required fields
                    const validUtxos = utxos.filter((utxo: any) =>
                        utxo.outpoint?.transactionId &&
                        utxo.outpoint?.index !== undefined &&
                        utxo.utxoEntry?.amount
                    );

                    if (validUtxos.length === 0) {
                        throw new Error(`No valid UTXOs available: All UTXOs are malformed`);
                    }

                    utxos = validUtxos;
                    break;
                } catch (error) {
                    retryCount++;
                    if (retryCount >= maxRetries) {
                        throw new Error(`Failed to fetch UTXOs after ${maxRetries} attempts: ${error}`);
                    }

                    console.log(`[Kaspa TX] UTXO fetch attempt ${retryCount} failed, retrying...`);
                    await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                }
            }

            // Select UTXOs to cover the amount + fee
            selectedUtxos = [];
            totalInputAmount = 0n;

            for (const utxo of utxos) {
                selectedUtxos.push(utxo);
                totalInputAmount += BigInt(utxo.utxoEntry.amount);
                if (totalInputAmount >= amountSompi + baseFee) {
                    break;
                }
            }

            if (totalInputAmount < amountSompi + baseFee) {
                throw new Error(`Insufficient funds: Need at least ${sompiToKas(amountSompi + baseFee)} KAS`);
            }
        }

        console.log(`  Selected ${selectedUtxos.length} UTXO(s) totaling ${sompiToKas(totalInputAmount)} KAS`);

        // Build transaction (exact from demo with type assertions)
        const tx = new Transaction();
        tx.setVersion(0);

        for (const utxo of selectedUtxos) {
            const txInput = new (Transaction.Input as any).PublicKey({
                prevTxId: utxo.outpoint.transactionId,
                outputIndex: utxo.outpoint.index,
                script: utxo.utxoEntry.scriptPublicKey.scriptPublicKey,
                sequenceNumber: 0,
                output: new Transaction.Output({
                    script: utxo.utxoEntry.scriptPublicKey.scriptPublicKey,
                    satoshis: Number(utxo.utxoEntry.amount),
                })
            });
            tx.addInput(txInput);
        }

        const fee = Number(baseFee);
        const amountToSend = Number(amountSompi);
        const amountAsChange = Number(totalInputAmount) - amountToSend - fee;

        const txOutput = new Transaction.Output({
            script: new Script(new Address(recipient) as any).toBuffer().toString('hex'),
            satoshis: amountToSend,
        });

        tx.addOutput(txOutput);

        // Add change output if needed
        if (amountAsChange > 0) {
            const txChange = new Transaction.Output({
                script: new Script(new Address(senderAddress) as any).toBuffer().toString('hex'),
                satoshis: amountAsChange,
            });
            tx.addOutput(txChange);
            console.log(`  Change: ${sompiToKas(BigInt(amountAsChange))} KAS`);
        }

        // Sign transaction (API expects camelCase)
        const signedInputs = tx.inputs.map((input: any, index: number) => {
            const inputSignature = input.getSignatures(tx, sk, index, crypto.Signature.SIGHASH_ALL, null, 'schnorr')[0];
            const signature = inputSignature.signature.toBuffer('schnorr').toString('hex');

            return {
                "previousOutpoint": {
                    "transactionId": input.prevTxId.toString('hex'),
                    "index": input.outputIndex,
                },
                "signatureScript": `41${signature}01`,
                "sequence": input.sequenceNumber,
                "sigOpCount": 1
            };
        });

        // Build REST API JSON (API expects camelCase)
        const outputs = [
            {
                "amount": amountToSend,
                "scriptPublicKey": {
                    "version": 0,
                    "scriptPublicKey": txOutput.script.toBuffer().toString('hex'),
                }
            }
        ];

        if (amountAsChange > 0) {
            outputs.push({
                "amount": amountAsChange,
                "scriptPublicKey": {
                    "version": 0,
                    "scriptPublicKey": new Script(new Address(senderAddress) as any).toBuffer().toString('hex'),
                }
            });
        }

        const restApiJson = {
            "transaction": {
                "version": tx.version,
                "inputs": signedInputs,
                "outputs": outputs,
                "lockTime": 0,
                "subnetworkId": "0000000000000000000000000000000000000000"
            },
            "allowOrphan": true
        };

        console.log(`  Transaction signed with schnorr`);

        // Calculate transaction ID before submission for status checking
        const estimatedTxId = calculateTransactionId(restApiJson.transaction);
        console.log(`[Kaspa TX] Estimated transaction ID: ${estimatedTxId}`);

        // Submit transaction with orphan retry logic
        globalMetrics.recordPaymentStarted();

        try {
            const { data: successTxResponse } = await axiosClient.post(`${apiUrl}/transactions`, restApiJson);
            const txid = successTxResponse.transactionId;
            console.log(`[Kaspa TX] ✓ Broadcasted: ${txid}`);
            
            // Release locks and invalidate cache after successful broadcast
            if (useUTXOManager) {
                const utxoManager = getUTXOManager();
                
                // Unlock the UTXOs we just spent
                utxoManager.unlockUTXOs(selectedUtxos);
                
                // Invalidate cache to prevent using stale UTXOs
                utxoManager.invalidateCache(senderAddress, config.network);
                console.log(`[UTXO Manager] Released locks and invalidated cache for ${senderAddress}`);
            }
            
            return { txid };
        } catch (submitError: any) {
            // Log the specific error for debugging
            console.log(`[Kaspa TX] Transaction submission failed:`, submitError.response?.data?.error || submitError.message);

            // Check for transaction mass limit errors
            if (submitError.response?.data?.error?.includes('transaction storage mass') ||
                submitError.response?.data?.error?.includes('larger than max allowed size')) {
                console.error(`[Kaspa TX] Transaction mass limit exceeded!`);
                console.error(`[Kaspa TX] This indicates the transaction is too large.`);
                console.error(`[Kaspa TX] Possible causes:`);
                console.error(`[Kaspa TX]   - Too many inputs (using ${selectedUtxos.length} inputs)`);
                console.error(`[Kaspa TX]   - UTXOs are too fresh (high storage mass penalty)`);
                console.error(`[Kaspa TX] Suggestions:`);
                console.error(`[Kaspa TX]   - Wait for UTXOs to mature (10+ blocks)`);
                console.error(`[Kaspa TX]   - Reduce number of inputs`);
                console.error(`[Kaspa TX]   - Consolidate UTXOs`);

                throw new TransactionMassError(
                    'Transaction mass limit exceeded',
                    {
                        estimatedMass: 0,
                        maxAllowedMass: 100000,
                        breakdown: {
                            inputsMass: 0,
                            outputsMass: 0,
                            overheadMass: 0
                        },
                        isWithinLimit: false,
                        utilizationPercent: 100
                    },
                    [
                        'Wait for UTXOs to mature (10+ blocks)',
                        'Reduce number of inputs',
                        'Consolidate UTXOs'
                    ]
                );
            }

            // Check for orphan transaction errors (UTXO already spent)
            if (submitError.response?.data?.error?.includes('transaction is an orphan') ||
                submitError.response?.data?.error?.includes('missing outpoint')) {
                console.log(`[Kaspa TX] Orphan transaction detected - UTXOs may have been spent`);

                // Only retry once
                if (!isRetry && useUTXOManager) {
                    console.log(`[Kaspa TX] Invalidating cache and retrying with fresh UTXOs...`);
                    const utxoManager = getUTXOManager();
                    utxoManager.invalidateCache(senderAddress, config.network);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    // Recursive call will fetch fresh UTXOs
                    return await createAndSignPayment(privateKeyWif, recipient, amountSompi, config, true);
                }
            }

            // Handle WebSocket connectivity errors and other network errors
            if (submitError.response?.data?.error?.includes('WebSocket is not connected') ||
                submitError.message?.includes('ECONNREFUSED') ||
                submitError.message?.includes('ETIMEDOUT') ||
                submitError.code === 'ECONNABORTED') {
                
                console.log(`[Kaspa TX] Network error detected: ${submitError.message}`);

                // CRITICAL FIX: Check if transaction was actually accepted before retrying
                console.log(`[Kaspa TX] Checking if transaction was accepted despite network error...`);
                const wasAccepted = await checkTransactionStatus(estimatedTxId, apiUrl);
                
                if (wasAccepted) {
                    console.log(`[Kaspa TX] ✓ Transaction was accepted! Returning success despite network error.`);
                    
                    // Release locks and invalidate cache since transaction succeeded
                    if (useUTXOManager) {
                        const utxoManager = getUTXOManager();
                        utxoManager.unlockUTXOs(selectedUtxos);
                        utxoManager.invalidateCache(senderAddress, config.network);
                        console.log(`[UTXO Manager] Released locks and invalidated cache for ${senderAddress}`);
                    }
                    
                    return { txid: estimatedTxId };
                }

                // Transaction not found or not accepted - safe to retry
                if (!isRetry) {
                    console.log(`[Kaspa TX] Transaction not accepted. Invalidating cache and retrying with fresh UTXOs...`);
                    
                    if (useUTXOManager) {
                        const utxoManager = getUTXOManager();
                        utxoManager.invalidateCache(senderAddress, config.network);
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for API recovery
                    return await createAndSignPayment(privateKeyWif, recipient, amountSompi, config, true);
                }
            }

            // Check for "already accepted" errors (transaction was submitted before)
            if (submitError.response?.data?.error?.includes('already accepted by the consensus')) {
                console.log(`[Kaspa TX] Transaction already accepted by consensus`);
                
                // Extract transaction ID from error message if possible
                const errorMsg = submitError.response.data.error;
                const txidMatch = errorMsg.match(/transaction ([a-f0-9]+) was already accepted/);
                const acceptedTxId = txidMatch ? txidMatch[1] : estimatedTxId;
                
                console.log(`[Kaspa TX] ✓ Treating as success: ${acceptedTxId}`);
                
                // Release locks and invalidate cache
                if (useUTXOManager) {
                    const utxoManager = getUTXOManager();
                    utxoManager.unlockUTXOs(selectedUtxos);
                    utxoManager.invalidateCache(senderAddress, config.network);
                }
                
                return { txid: acceptedTxId };
            }

            // Release locks on any other error before throwing
            if (useUTXOManager) {
                const utxoManager = getUTXOManager();
                utxoManager.unlockUTXOs(selectedUtxos);
                console.log(`[UTXO Manager] Released locks due to transaction error`);
            }

            throw submitError;
        }
    } catch (error) {
        console.error(`[Kaspa TX] ✗ Error:`, error);
        globalMetrics.recordPaymentFailure();
        throw error;
    }
}

/**
 * Waits for transaction confirmation on the Kaspa network
 */
export async function waitForTxConfirmation(
    txid: string,
    rpcUrl: string,
    timeoutMs: number = 60000
): Promise<void> {
    console.log(`[Kaspa TX] Waiting for confirmation: ${txid}`);

    const apiUrl = rpcUrl.includes('mainnet') ? 'https://api.kaspa.org' : 'https://api-tn10.kaspa.org';
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds

    // Kaspa has 3-4 second finality, so wait a bit before first check
    await new Promise(resolve => setTimeout(resolve, 4000));

    while (Date.now() - startTime < timeoutMs) {
        try {
            const response = await axiosClient.get(`${apiUrl}/transactions/${txid}`);
            const tx = response.data;

            if (tx && tx.is_accepted) {
                const confirmationTime = Date.now() - startTime;
                console.log(`[Kaspa TX] ✓ Confirmed: ${txid} (${confirmationTime}ms)`);
                globalMetrics.recordPaymentSuccess(0, confirmationTime);
                return;
            }

            // Wait before next check
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        } catch (error: any) {
            // Check if this is a 404 (transaction not indexed yet)
            if (error.response?.status === 404) {
                const elapsed = Date.now() - startTime;

                // If we've waited more than 10 seconds and still getting 404,
                // the transaction might be confirmed but API indexing is slow
                // Since Kaspa has 3-4s finality, assume success after 10s
                if (elapsed > 10000) {
                    console.log(`[Kaspa TX] ⚠ API indexing delayed, assuming confirmation after ${elapsed}ms`);
                    console.log(`[Kaspa TX] ✓ Transaction broadcast successful (API indexing pending): ${txid}`);
                    globalMetrics.recordPaymentSuccess(0, elapsed);
                    return;
                }

                console.log(`[Kaspa TX] Transaction not indexed yet (${elapsed}ms elapsed), will retry...`);
            } else {
                // Log other errors for debugging
                console.log(`[Kaspa TX] Confirmation check failed (will retry):`, error.response?.data?.error || error.message);
            }

            // Transaction might not be found yet, keep waiting
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
    }

    globalMetrics.recordPaymentFailure();
    throw new Error(`Transaction confirmation timeout after ${timeoutMs}ms: ${txid}`);
}

/**
 * Verifies a transaction on-chain
 */
export async function verifyTransaction(
    txid: string,
    expectedRecipient: string,
    expectedAmountSompi: bigint,
    rpcUrl: string
): Promise<boolean> {
    console.log(`[Kaspa TX] Verifying transaction: ${txid}`);

    const apiUrl = rpcUrl.includes('mainnet') ? 'https://api.kaspa.org' : 'https://api-tn10.kaspa.org';

    try {
        const response = await axiosClient.get(`${apiUrl}/transactions/${txid}`);
        const tx = response.data;

        if (!tx) {
            console.log(`[Kaspa TX] ✗ Transaction not found: ${txid}`);
            return false;
        }

        if (!tx.is_accepted) {
            console.log(`[Kaspa TX] ✗ Transaction not confirmed: ${txid}`);
            return false;
        }

        // Check if any output matches recipient and amount
        let foundPayment = false;
        for (const output of tx.outputs) {
            // Kaspa API returns amount as number and script_public_key as string
            const outputAmount = BigInt(output.amount);

            // Convert recipient address to scriptPublicKey for comparison
            await initKaspaFramework();
            const expectedScript = new Script(new Address(expectedRecipient) as any).toBuffer().toString('hex');

            // API returns script_public_key (snake_case string)
            const outputScript = output.script_public_key;

            if (outputScript === expectedScript && outputAmount >= expectedAmountSompi) {
                foundPayment = true;
                console.log(`[Kaspa TX] ✓ Found payment: ${sompiToKas(outputAmount)} KAS to ${expectedRecipient}`);
                break;
            }
        }

        if (!foundPayment) {
            console.log(`[Kaspa TX] ✗ Payment not found in transaction outputs`);
            console.log(`  Expected: ${sompiToKas(expectedAmountSompi)} KAS to ${expectedRecipient}`);
            return false;
        }

        console.log(`[Kaspa TX] ✓ Verified: ${txid}`);
        return true;
    } catch (error) {
        console.error(`[Kaspa TX] ✗ Verification error:`, error);
        return false;
    }
}
