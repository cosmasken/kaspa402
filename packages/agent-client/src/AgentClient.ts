import {
    PaymentDemand,
    PaymentProof,
    PaymentDemandResponse,
    createAndSignPayment,
    waitForTxConfirmation,
    generateAgentWallet,
    KaspaConfig,
    getWalletBalance,
    WalletBalance,
    AgentWallet
} from '@kaspa-agent-pay/core';
import * as readline from 'readline';

export interface AgentClientConfig extends KaspaConfig {
    paymentTimeoutMs?: number;
    walletPersistPath?: string; // Optional path to persist wallet
    privateKeyWif?: string; // Optional existing private key
    interTransactionDelayMs?: number; // Delay between transactions to allow UTXO maturity (default: 5000ms for testnet, 0 for mainnet)
}

export class AgentClient {
    private config: AgentClientConfig & { privateKeyWif: string };
    public readonly agentAddress: string;

    /**
     * Creates a new AgentClient with an auto-generated wallet
     * 
     * The wallet can be persisted to avoid regeneration on each run.
     * If no persistence path is provided, a new wallet is generated each time.
     * 
     * @param config - Network configuration including RPC URL and network type
     * @param wallet - The initialized agent wallet
     */
    constructor(config: AgentClientConfig, wallet: AgentWallet) {
        this.agentAddress = wallet.address;

        // Set default inter-transaction delay: 15s for testnet (to allow UTXO maturity), 0 for mainnet
        const defaultDelay = config.network === 'testnet' ? 15000 : 0;

        this.config = {
            ...config,
            privateKeyWif: wallet.privateKey,
            paymentTimeoutMs: config.paymentTimeoutMs || 60000,
            interTransactionDelayMs: config.interTransactionDelayMs ?? defaultDelay
        };
    }

    /**
     * Static factory method to initialize an AgentClient with an async wallet generation
     */
    public static async init(config: AgentClientConfig): Promise<AgentClient> {
        // Generate or load wallet with optional persistence and optional private key
        const wallet = await generateAgentWallet(
            config.network,
            config.walletPersistPath,
            config.privateKeyWif
        );

        console.log('=== Your Kaspa Agent Wallet ===');
        console.log('   privateKey:', wallet.privateKey);
        console.log('   address   :', wallet.address);
        console.log('   network   :', wallet.network);
        console.log('💡 Fund this address to enable payments!');

        return new AgentClient(config, wallet);
    }

    /**
     * Check the current balance of the agent's wallet
     * 
     * This method queries the Kaspa network to get the current balance.
     * It uses the balance endpoint if available, falling back to UTXO calculation.
     * 
     * @returns Wallet balance information including sompi, KAS, and UTXO count
     * @throws Error if balance check fails
     */
    async checkBalance(): Promise<WalletBalance> {
        try {
            const balance = await getWalletBalance(this.agentAddress, {
                network: this.config.network,
                rpcUrl: this.config.rpcUrl
            });
            return balance;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(
                `Failed to check balance for agent wallet ${this.agentAddress}: ${errorMessage}`
            );
        }
    }

    /**
     * Wait for user to fund the wallet with an interactive prompt
     * 
     * This method displays the wallet address and faucet link (for testnet),
     * then waits for the user to press Enter after funding the wallet.
     * After confirmation, it re-checks the balance to verify funding.
     * 
     * Use interactive=false for automated environments where user input is not available.
     * 
     * @param interactive - If false, skips the prompt and just checks balance once
     * @returns The current wallet balance after funding
     */
    async waitForFunding(interactive: boolean = true): Promise<WalletBalance> {
        const balance = await this.checkBalance();

        if (!interactive) {
            return balance;
        }

        const faucetUrl = this.config.network === 'testnet'
            ? 'https://faucet.kaspanet.io/'
            : null;

        console.log('\n=== Wallet Funding Required ===');
        console.log(`Address: ${this.agentAddress}`);
        console.log(`Current Balance: ${balance.kas} KAS`);

        if (faucetUrl) {
            console.log(`\n💰 Get testnet funds from: ${faucetUrl}`);
        }

        console.log('\nPlease fund your wallet and press Enter to continue...');

        // Wait for user input
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        await new Promise<void>((resolve) => {
            rl.question('', () => {
                rl.close();
                resolve();
            });
        });

        // Re-check balance after user confirmation
        console.log('\nRechecking balance...');
        const newBalance = await this.checkBalance();
        console.log(`New Balance: ${newBalance.kas} KAS`);

        return newBalance;
    }

    /**
     * Make an HTTP request that automatically handles 402 Payment Required responses
     *
     * This is the main method for making paid requests. The flow is:
     * 1. Make initial request
     * 2. If 402 response, check balance (unless skipBalanceCheck=true)
     * 3. Create and broadcast payment transaction
     * 4. Wait for transaction confirmation
     * 5. Retry request with payment proof
     *
     * Balance checking helps provide clear error messages before attempting payment.
     * Set skipBalanceCheck=true to skip the pre-flight balance check (not recommended).
     *
     * @param url - The URL to request
     * @param options - Fetch options (method, headers, body, etc.)
     * @param skipBalanceCheck - Skip pre-flight balance check (default: false)
     * @returns The response from the service after payment
     * @throws Error if payment fails or balance is insufficient
     */
    async paidRequest(
        url: string,
        options: RequestInit = {},
        skipBalanceCheck: boolean = false
    ): Promise<Response> {
        console.log(`[Agent] Requesting: ${url}`);

        let response = await fetch(url, options);

        if (response.status !== 402) {
            console.log(`[Agent] ✓ Request succeeded without payment (${response.status})`);
            return response;
        }

        console.log(`[Agent] 402 Payment Required - processing payment...`);

        const data = await response.json() as PaymentDemandResponse;
        const demand: PaymentDemand = data.payment;

        if (!demand?.recipient || !demand?.amount_sompi) {
            throw new Error('Invalid payment demand from server');
        }

        console.log(`[Agent] Payment demand: ${demand.amount} KAS to ${demand.recipient}`);
        if (demand.description) {
            console.log(`[Agent] Description: ${demand.description}`);
        }

        const amountSompi = BigInt(demand.amount_sompi);

        // Pre-flight balance check to provide clear error messages
        // This helps users understand funding issues before attempting payment
        if (!skipBalanceCheck) {
            try {
                const balance = await this.checkBalance();

                // Check for zero balance
                if (balance.sompi === BigInt(0)) {
                    console.log(`[Agent] ❌ Wallet has no balance. Required: ${demand.amount} KAS.`);
                    await this.promptForFunding(demand.amount);
                }
                // Check for insufficient balance
                else if (balance.sompi < amountSompi) {
                    const requiredAdditional = Number(amountSompi - balance.sompi) / 100_000_000;
                    console.log(`[Agent] ❌ Insufficient funds: Wallet has ${balance.kas} KAS, but ${demand.amount} KAS required.`);
                    console.log(`[Agent] 💡 Need to add at least ${requiredAdditional.toFixed(8)} KAS.`);
                    
                    await this.promptForFunding(demand.amount);
                } else {
                    console.log(`[Agent] Balance check passed: ${balance.kas} KAS available`);
                }
            } catch (error) {
                // Re-throw insufficient funds errors with clear messages
                if (error instanceof Error && error.message.includes('Insufficient funds')) {
                    // Extract the required amount from the error message
                    const match = error.message.match(/Required: ([\d.]+) KAS/);
                    if (match) {
                        await this.promptForFunding(match[1]);
                    }
                    throw error;
                }
                // For other errors (network issues, etc.), warn but continue
                console.warn(`[Agent] Balance check failed, proceeding anyway: ${error}`);
            }
        }

        const { txid } = await createAndSignPayment(
            this.config.privateKeyWif,
            demand.recipient,
            amountSompi,
            {
                network: this.config.network,
                rpcUrl: this.config.rpcUrl
            }
        );

        console.log(`[Agent] Payment sent: ${demand.amount} KAS → tx: ${txid}`);

        await waitForTxConfirmation(
            txid,
            this.config.rpcUrl,
            this.config.paymentTimeoutMs
        );

        const proof: PaymentProof = {
            txid,
            address: demand.recipient
        };

        console.log(`[Agent] Retrying request with payment proof...`);

        const retryOpts: RequestInit = {
            ...options,
            headers: {
                ...options.headers,
                'X-Payment-Proof': JSON.stringify(proof)
            }
        };

        const retryResponse = await fetch(url, retryOpts);

        if (!retryResponse.ok) {
            // For outcome-based payments, a failure might mean the service didn't accept the payment
            // due to unsuccessful outcome, which is expected behavior
            const responseBody = await retryResponse.text();
            let errorDetails = responseBody;
            
            try {
                // Try to parse as JSON for more structured error info
                const errorJson = JSON.parse(responseBody);
                if (errorJson.charged === false) {
                    console.log(`[Agent] ✓ Request completed - payment not charged due to unsuccessful outcome`);
                    // Return the response even if not OK, as this may be expected for outcome-based payments
                    return new Response(responseBody, {
                        status: retryResponse.status,
                        headers: retryResponse.headers
                    });
                }
            } catch (e) {
                // Not JSON, use as-is
            }
            
            throw new Error(
                `Payment accepted but request failed: ${retryResponse.status} ${retryResponse.statusText}. Details: ${errorDetails}`
            );
        }

        console.log(`[Agent] ✓ Request completed successfully after payment`);
        
        // Add inter-transaction delay to allow UTXOs to mature
        if (this.config.interTransactionDelayMs && this.config.interTransactionDelayMs > 0) {
            console.log(`[Agent] Waiting ${this.config.interTransactionDelayMs}ms before next transaction...`);
            await new Promise(resolve => setTimeout(resolve, this.config.interTransactionDelayMs));
        }
        
        return retryResponse;
    }

    /**
     * Prompt user to fund wallet with required amount
     * 
     * @param requiredAmountKas - The required amount in KAS
     */
    private async promptForFunding(requiredAmountKas: string): Promise<void> {
        console.log('\n[Agent] 💰 Wallet funding required!');
        console.log(`[Agent]   Required amount: ${requiredAmountKas} KAS`);
        console.log(`[Agent]   Your address: ${this.agentAddress}`);
        console.log(`[Agent]   Network: ${this.config.network}`);
        
        if (this.config.network === 'testnet') {
            console.log(`[Agent]   Get testnet KAS: https://faucet.kaspanet.io/`);
        }
        
        console.log(`[Agent]   Press Enter when funded...`);
        
        await new Promise<void>((resolve) => {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.once('data', () => {
                process.stdin.setRawMode(false);
                resolve();
            });
        });
        
        // Wait a bit for the transaction to be processed
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check balance again after funding
        const newBalance = await this.checkBalance();
        console.log(`[Agent] ✓ New balance: ${newBalance.kas} KAS`);
    }
}
