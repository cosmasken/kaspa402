/**
 * Storage abstraction for payment tracking
 * Uses in-memory storage for development and production
 */

export interface PaymentStorage {
    markAsProcessed(txid: string): Promise<void>;
    isProcessed(txid: string): Promise<boolean>;
    storeNonce(nonce: string, expiresIn: number): Promise<void>;
    hasNonce(nonce: string): Promise<boolean>;
    close(): Promise<void>;
}

/**
 * In-memory storage (for development and production)
 */
export class MemoryStorage implements PaymentStorage {
    private processedPayments = new Set<string>();
    private nonces = new Map<string, number>(); // nonce -> expiry timestamp

    async markAsProcessed(txid: string): Promise<void> {
        this.processedPayments.add(txid);
    }

    async isProcessed(txid: string): Promise<boolean> {
        return this.processedPayments.has(txid);
    }

    async storeNonce(nonce: string, expiresIn: number): Promise<void> {
        const expiryTime = Date.now() + expiresIn * 1000;
        this.nonces.set(nonce, expiryTime);

        // Clean up expired nonces periodically
        this.cleanupExpiredNonces();
    }

    async hasNonce(nonce: string): Promise<boolean> {
        const expiryTime = this.nonces.get(nonce);
        if (!expiryTime) return false;

        // Check if expired
        if (Date.now() > expiryTime) {
            this.nonces.delete(nonce);
            return false;
        }

        return true;
    }

    private cleanupExpiredNonces(): void {
        const now = Date.now();
        for (const [nonce, expiryTime] of this.nonces.entries()) {
            if (now > expiryTime) {
                this.nonces.delete(nonce);
            }
        }
    }

    async close(): Promise<void> {
        this.processedPayments.clear();
        this.nonces.clear();
    }
}

/**
 * Factory function to create storage
 */
export function createStorage(): PaymentStorage {
    return new MemoryStorage();
}
