import { UTXO, KaspaTransaction } from './types.js';

/**
 * Kaspa REST API Client for TN-10
 * Uses REST endpoints instead of JSON-RPC
 */
export class KaspaRPC {
    private baseUrl: string;

    constructor(rpcUrl: string) {
        this.baseUrl = rpcUrl.replace(/\/$/, ''); // Remove trailing slash
    }

    /**
     * Get UTXOs for an address using REST API
     */
    async getUtxosByAddress(address: string): Promise<UTXO[]> {
        try {
            const response = await fetch(`${this.baseUrl}/addresses/${address}/utxos`);

            if (!response.ok) {
                throw new Error(`REST request failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json() as any;

            if (!data || !Array.isArray(data)) {
                return [];
            }

            return data.map((utxo: any) => ({
                txid: utxo.outpoint.transactionId,
                vout: utxo.outpoint.index,
                amount: utxo.utxoEntry.amount,
                scriptPubKey: utxo.utxoEntry.scriptPublicKey.script
            }));
        } catch (error) {
            console.error(`[Kaspa RPC] Error fetching UTXOs for ${address}:`, error);
            throw error;
        }
    }

    /**
     * Get balance for an address using REST API
     */
    async getAddressBalance(address: string): Promise<{ balance: string }> {
        try {
            const response = await fetch(`${this.baseUrl}/addresses/${address}/balance`);

            if (!response.ok) {
                throw new Error(`REST request failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json() as any;

            if (!data || typeof data.balance === 'undefined') {
                throw new Error('Invalid balance response format');
            }

            return {
                balance: String(data.balance)
            };
        } catch (error) {
            console.error(`[Kaspa RPC] Error fetching balance for ${address}:`, error);
            throw error;
        }
    }

    /**
     * Get transaction by ID using REST API
     */
    async getTransaction(txid: string): Promise<KaspaTransaction | null> {
        try {
            const response = await fetch(`${this.baseUrl}/transactions/${txid}`);

            if (!response.ok) {
                if (response.status === 404) {
                    return null; // Transaction not found
                }
                throw new Error(`REST request failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json() as any;

            if (!data) {
                return null;
            }

            return {
                txid: data.transaction_id || txid,
                version: data.version || 0,
                inputs: data.inputs || [],
                outputs: data.outputs || [],
                lockTime: data.lock_time || 0,
                subnetworkId: data.subnetwork_id || '',
                is_accepted: data.is_accepted || false
            };
        } catch (error) {
            console.error(`[Kaspa RPC] Error fetching transaction ${txid}:`, error);
            throw error;
        }
    }

    /**
     * Submit a transaction using REST API
     */
    async submitTransaction(tx: any): Promise<string> {
        try {
            const response = await fetch(`${this.baseUrl}/transactions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    transaction: tx,
                    allowOrphan: false
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`REST request failed: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const data = await response.json() as any;

            if (!data || !data.transactionId) {
                throw new Error('No transaction ID returned from submitTransaction');
            }

            return data.transactionId;
        } catch (error) {
            console.error(`[Kaspa RPC] Error submitting transaction:`, error);
            throw error;
        }
    }

    /**
     * Get network info using REST API
     */
    async getInfo(): Promise<any> {
        try {
            const response = await fetch(`${this.baseUrl}/info/network`);

            if (!response.ok) {
                throw new Error(`REST request failed: ${response.status} ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`[Kaspa RPC] Error fetching network info:`, error);
            throw error;
        }
    }

    /**
     * Get block DAG info using REST API
     */
    async getBlockDagInfo(): Promise<any> {
        try {
            const response = await fetch(`${this.baseUrl}/info/blockdag`);

            if (!response.ok) {
                throw new Error(`REST request failed: ${response.status} ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`[Kaspa RPC] Error fetching block DAG info:`, error);
            throw error;
        }
    }
}
