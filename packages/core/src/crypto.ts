import { createHash, randomBytes } from 'crypto';
import secp256k1 from 'secp256k1';

/**
 * Kaspa uses secp256k1 for signatures (same as Bitcoin)
 */

// Base58 alphabet
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Base58 decode
 */
function base58Decode(str: string): Buffer {
    const bytes = [0];
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const charIndex = BASE58_ALPHABET.indexOf(char);
        if (charIndex === -1) {
            throw new Error(`Invalid base58 character: ${char}`);
        }

        let carry = charIndex;
        for (let j = 0; j < bytes.length; j++) {
            carry += bytes[j] * 58;
            bytes[j] = carry & 0xff;
            carry >>= 8;
        }

        while (carry > 0) {
            bytes.push(carry & 0xff);
            carry >>= 8;
        }
    }

    // Count leading zeros
    let leadingZeros = 0;
    for (let i = 0; i < str.length && str[i] === '1'; i++) {
        leadingZeros++;
    }

    return Buffer.concat([
        Buffer.alloc(leadingZeros, 0),
        Buffer.from(bytes.reverse())
    ]);
}

/**
 * Base58 encode
 */
function base58Encode(buffer: Buffer): string {
    const bytes = Array.from(buffer);
    const digits = [0];

    for (let i = 0; i < bytes.length; i++) {
        let carry = bytes[i];
        for (let j = 0; j < digits.length; j++) {
            carry += digits[j] << 8;
            digits[j] = carry % 58;
            carry = Math.floor(carry / 58);
        }

        while (carry > 0) {
            digits.push(carry % 58);
            carry = Math.floor(carry / 58);
        }
    }

    // Count leading zeros
    let leadingZeros = 0;
    for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
        leadingZeros++;
    }

    return '1'.repeat(leadingZeros) + digits.reverse().map(d => BASE58_ALPHABET[d]).join('');
}

/**
 * Decode WIF (Wallet Import Format) private key or hex format
 */
export function decodeWIF(wif: string): Buffer {
    // Handle hex format (64 chars = 32 bytes)
    if (/^[0-9a-fA-F]{64}$/.test(wif)) {
        const privateKey = Buffer.from(wif, 'hex');
        if (!secp256k1.privateKeyVerify(privateKey)) {
            throw new Error('Invalid private key');
        }
        return privateKey;
    }

    // WIF format: [version byte][32 bytes private key][checksum (4 bytes)]
    const decoded = base58Decode(wif);

    if (decoded.length !== 37) {
        throw new Error('Invalid WIF format: incorrect length');
    }

    const privateKey = decoded.slice(1, 33);
    const checksum = decoded.slice(33, 37);

    // Verify checksum
    const hash = createHash('sha256').update(createHash('sha256').update(decoded.slice(0, 33)).digest()).digest();
    const expectedChecksum = hash.slice(0, 4);

    if (!checksum.equals(expectedChecksum)) {
        throw new Error('Invalid WIF checksum');
    }

    if (!secp256k1.privateKeyVerify(privateKey)) {
        throw new Error('Invalid private key');
    }

    return privateKey;
}

/**
 * Derive public key from private key
 */
export function getPublicKey(privateKey: Buffer): Buffer {
    return Buffer.from(secp256k1.publicKeyCreate(privateKey));
}

/**
 * Generate Kaspa address from public key
 */
export function publicKeyToAddress(publicKey: Buffer, network: 'mainnet' | 'testnet'): string {
    // Kaspa address format: [prefix]:[version][hash][checksum]

    // Hash the public key (SHA256 + RIPEMD160)
    const sha256Hash = createHash('sha256').update(publicKey).digest();
    const ripemd160Hash = createHash('ripemd160').update(sha256Hash).digest();

    // Create payload: version (0x00) + hash
    const version = Buffer.from([0x00]);
    const payload = Buffer.concat([version, ripemd160Hash]);

    // Calculate checksum (first 4 bytes of double SHA256)
    const checksum = createHash('sha256')
        .update(createHash('sha256').update(payload).digest())
        .digest()
        .slice(0, 4);

    // Combine payload + checksum and encode with base58
    const addressBytes = Buffer.concat([payload, checksum]);
    const addressHash = base58Encode(addressBytes);

    const prefix = network === 'mainnet' ? 'kaspa' : 'kaspatest';
    return `${prefix}:q${addressHash}`;
}

/**
 * Calculate transaction hash for signing
 */
export function calculateTransactionHash(tx: any): Buffer {
    // Serialize transaction for hashing
    const txString = JSON.stringify({
        version: tx.version,
        inputs: tx.inputs.map((input: any) => ({
            previousOutpoint: input.previousOutpoint,
            sequence: input.sequence
        })),
        outputs: tx.outputs,
        lockTime: tx.lockTime,
        subnetworkId: tx.subnetworkId
    });

    // Double SHA256 (Bitcoin/Kaspa standard)
    const hash1 = createHash('sha256').update(txString).digest();
    const hash2 = createHash('sha256').update(hash1).digest();

    return hash2;
}

/**
 * Sign transaction hash with private key
 */
export function signTransactionHash(txHash: Buffer, privateKey: Buffer): Buffer {
    const signature = secp256k1.ecdsaSign(txHash, privateKey);

    // Return DER-encoded signature
    return Buffer.from(signature.signature);
}

/**
 * Create signature script for transaction input
 */
export function createSignatureScript(signature: Buffer, publicKey: Buffer): string {
    // Kaspa signature script format: [signature length][signature][pubkey length][pubkey]
    const sigLength = Buffer.from([signature.length]);
    const pubKeyLength = Buffer.from([publicKey.length]);

    const script = Buffer.concat([
        sigLength,
        signature,
        pubKeyLength,
        publicKey
    ]);

    return script.toString('hex');
}

/**
 * Verify signature
 */
export function verifySignature(
    txHash: Buffer,
    signature: Buffer,
    publicKey: Buffer
): boolean {
    try {
        return secp256k1.ecdsaVerify(signature, txHash, publicKey);
    } catch {
        return false;
    }
}

/**
 * Generate random nonce for payment demands
 */
export function generateNonce(): string {
    return randomBytes(16).toString('hex');
}
