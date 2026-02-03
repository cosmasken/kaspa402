import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getWalletBalance, WalletBalance } from './kaspa-balance.js';
import { KaspaConfig } from './types.js';

// Mock the KaspaRPC class
vi.mock('./kaspa-rpc.js', () => {
    return {
        KaspaRPC: vi.fn().mockImplementation(() => ({
            getAddressBalance: vi.fn(),
            getUtxosByAddress: vi.fn()
        }))
    };
});

describe('kaspa-balance', () => {
    const mockConfig: KaspaConfig = {
        network: 'testnet',
        rpcUrl: 'https://api.kaspa.org'
    };

    const testAddress = 'kaspatest:qz7ulu4c25dh7fzec9zjyrmlhnkzrg4wmf89q7gzr3gfrsj3uz6xjceef60sd';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getWalletBalance', () => {
        it('should return balance using balance endpoint', async () => {
            const { KaspaRPC } = await import('./kaspa-rpc.js');
            const mockRpc = new KaspaRPC(mockConfig.rpcUrl);

            vi.mocked(mockRpc.getAddressBalance).mockResolvedValue({
                balance: '500000000' // 5 KAS in sompi
            });

            const balance = await getWalletBalance(testAddress, mockConfig);

            expect(balance.sompi).toBe(BigInt('500000000'));
            expect(balance.kas).toBe('5.00000000');
            expect(mockRpc.getAddressBalance).toHaveBeenCalledWith(testAddress);
        });

        it('should fallback to UTXO calculation if balance endpoint fails', async () => {
            const { KaspaRPC } = await import('./kaspa-rpc.js');
            const mockRpc = new KaspaRPC(mockConfig.rpcUrl);

            vi.mocked(mockRpc.getAddressBalance).mockRejectedValue(
                new Error('Balance endpoint not available')
            );

            vi.mocked(mockRpc.getUtxosByAddress).mockResolvedValue([
                {
                    txid: 'tx1',
                    vout: 0,
                    amount: '100000000', // 1 KAS
                    scriptPubKey: 'script1'
                },
                {
                    txid: 'tx2',
                    vout: 1,
                    amount: '200000000', // 2 KAS
                    scriptPubKey: 'script2'
                }
            ]);

            const balance = await getWalletBalance(testAddress, mockConfig);

            expect(balance.sompi).toBe(BigInt('300000000')); // 3 KAS total
            expect(balance.kas).toBe('3.00000000');
            expect(balance.utxoCount).toBe(2);
            expect(mockRpc.getUtxosByAddress).toHaveBeenCalledWith(testAddress);
        });

        it('should handle zero balance', async () => {
            const { KaspaRPC } = await import('./kaspa-rpc.js');
            const mockRpc = new KaspaRPC(mockConfig.rpcUrl);

            vi.mocked(mockRpc.getAddressBalance).mockResolvedValue({
                balance: '0'
            });

            const balance = await getWalletBalance(testAddress, mockConfig);

            expect(balance.sompi).toBe(BigInt('0'));
            expect(balance.kas).toBe('0.00000000');
        });

        it('should handle large balances correctly', async () => {
            const { KaspaRPC } = await import('./kaspa-rpc.js');
            const mockRpc = new KaspaRPC(mockConfig.rpcUrl);

            vi.mocked(mockRpc.getAddressBalance).mockResolvedValue({
                balance: '123456789012345' // Large balance
            });

            const balance = await getWalletBalance(testAddress, mockConfig);

            expect(balance.sompi).toBe(BigInt('123456789012345'));
            expect(balance.kas).toBe('1234567.89012345');
        });

        it('should calculate balance from multiple UTXOs correctly', async () => {
            const { KaspaRPC } = await import('./kaspa-rpc.js');
            const mockRpc = new KaspaRPC(mockConfig.rpcUrl);

            vi.mocked(mockRpc.getAddressBalance).mockRejectedValue(
                new Error('Not available')
            );

            vi.mocked(mockRpc.getUtxosByAddress).mockResolvedValue([
                { txid: 'tx1', vout: 0, amount: '50000000', scriptPubKey: 's1' },
                { txid: 'tx2', vout: 0, amount: '75000000', scriptPubKey: 's2' },
                { txid: 'tx3', vout: 0, amount: '125000000', scriptPubKey: 's3' }
            ]);

            const balance = await getWalletBalance(testAddress, mockConfig);

            expect(balance.sompi).toBe(BigInt('250000000')); // 2.5 KAS
            expect(balance.kas).toBe('2.50000000');
            expect(balance.utxoCount).toBe(3);
        });

        it('should handle empty UTXO list', async () => {
            const { KaspaRPC } = await import('./kaspa-rpc.js');
            const mockRpc = new KaspaRPC(mockConfig.rpcUrl);

            vi.mocked(mockRpc.getAddressBalance).mockRejectedValue(
                new Error('Not available')
            );

            vi.mocked(mockRpc.getUtxosByAddress).mockResolvedValue([]);

            const balance = await getWalletBalance(testAddress, mockConfig);

            expect(balance.sompi).toBe(BigInt('0'));
            expect(balance.kas).toBe('0.00000000');
            expect(balance.utxoCount).toBe(0);
        });

        it('should throw error when both balance and UTXO endpoints fail', async () => {
            const { KaspaRPC } = await import('./kaspa-rpc.js');
            const mockRpc = new KaspaRPC(mockConfig.rpcUrl);

            vi.mocked(mockRpc.getAddressBalance).mockRejectedValue(
                new Error('Balance endpoint failed')
            );

            vi.mocked(mockRpc.getUtxosByAddress).mockRejectedValue(
                new Error('UTXO endpoint failed')
            );

            await expect(getWalletBalance(testAddress, mockConfig)).rejects.toThrow(
                'Failed to get wallet balance'
            );
        });

        it('should format KAS with 8 decimal places', async () => {
            const { KaspaRPC } = await import('./kaspa-rpc.js');
            const mockRpc = new KaspaRPC(mockConfig.rpcUrl);

            vi.mocked(mockRpc.getAddressBalance).mockResolvedValue({
                balance: '12345678' // 0.12345678 KAS
            });

            const balance = await getWalletBalance(testAddress, mockConfig);

            expect(balance.kas).toBe('0.12345678');
        });
    });
});
