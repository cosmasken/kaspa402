import { KaspaRPC } from './kaspa-rpc.js';
import { KaspaConfig } from './types.js';

/**
 * Wallet balance information
 */
export interface WalletBalance {
    /** Balance in sompi (smallest unit) */
    sompi: bigint;
    /** Balance formatted in KAS */
    kas: string;
    /** Number of UTXOs available */
    utxoCount: number;
}

/**
 * Convert sompi to KAS with proper decimal formatting
 */
function sompiToKas(sompi: bigint): string {
    const kas = Number(sompi) / 100_000_000;
    return kas.toFixed(8);
}

/**
 * Get wallet balance for a given address using the balance endpoint
 * Falls back to UTXO calculation if balance endpoint is unavailable
 * 
 * @param address - Kaspa wallet address
 * @param config - Kaspa network configuration
 * @returns Wallet balance information
 * @throws Error if RPC call fails
 */
export async function getWalletBalance(
    address: string,
    config: KaspaConfig
): Promise<WalletBalance> {
    try {
        const rpc = new KaspaRPC(config.rpcUrl);

        // Always use UTXO calculation for accurate spendable balance
        // The balance endpoint may show stale data that doesn't reflect actual UTXOs
        const utxos = await rpc.getUtxosByAddress(address);

        // Calculate total balance in sompi from actual UTXOs
        let totalSompi = BigInt(0);
        for (const utxo of utxos) {
            totalSompi += BigInt(utxo.amount);
        }

        return {
            sompi: totalSompi,
            kas: sompiToKas(totalSompi),
            utxoCount: utxos.length
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(
            `Failed to get wallet balance for address ${address}: ${errorMessage}`
        );
    }
}
