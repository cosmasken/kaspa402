/**
 * Kaspa address utilities for scriptPublicKey generation
 * Based on kaspa-js bech32 implementation
 */

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const CHECKSUM_LENGTH = 8;

const CHARSET_MAP: Record<string, number> = {};
for (let i = 0; i < CHARSET.length; i++) CHARSET_MAP[CHARSET[i]] = i;

const GENERATOR = [
  0x98f2bc8e61n,
  0x79b76d99e2n,
  0xf33e5fb3c4n,
  0xae2eabe2a8n,
  0x1e4f43e470n,
] as const;

function prefixToUint5Array(prefix: string): number[] {
  const arr = new Array(prefix.length);
  for (let i = 0; i < prefix.length; i++) arr[i] = prefix.charCodeAt(i) & 31;
  return arr;
}

function ints(bytes: ArrayLike<number>): number[] {
  const out = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] as number;
  return out;
}

function polyMod(values: number[]): bigint {
  let checksum = 1n;
  for (const value of values) {
    const v = BigInt(value);
    const topBits = checksum >> 35n;
    checksum = ((checksum & 0x07ffffffffn) << 5n) ^ v;
    for (let i = 0; i < GENERATOR.length; i++) {
      if (((topBits >> BigInt(i)) & 1n) === 1n) {
        checksum ^= GENERATOR[i];
      }
    }
  }
  return checksum ^ 1n;
}

function verifyChecksum(prefix: string, payload5: ArrayLike<number>): boolean {
  const prefixLower5 = prefixToUint5Array(prefix);
  const payloadInts = ints(payload5);
  const dataToVerify = [...prefixLower5, 0, ...payloadInts];
  return polyMod(dataToVerify) === 0n;
}

function decodeFromBase32(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const idx = CHARSET_MAP[c];
    if (idx === undefined)
      throw new Error(`invalid character not part of charset: ${c}`);
    out[i] = idx;
  }
  return out;
}

type ConversionType = { fromBits: number; toBits: number; pad: boolean };
const fiveToEightBits: ConversionType = { fromBits: 5, toBits: 8, pad: false };

function convertBits(
  data: Uint8Array,
  { fromBits, toBits, pad }: ConversionType,
): Uint8Array {
  const regrouped: number[] = [];
  let nextByte = 0;
  let filledBits = 0;

  for (let b of data) {
    b = (b << (8 - fromBits)) & 0xff;

    let remainingFrom = fromBits;
    while (remainingFrom > 0) {
      const remainingTo = toBits - filledBits;
      const toExtract =
        remainingFrom < remainingTo ? remainingFrom : remainingTo;

      nextByte = ((nextByte << toExtract) | (b >> (8 - toExtract))) & 0xff;
      b = (b << toExtract) & 0xff;

      remainingFrom -= toExtract;
      filledBits += toExtract;

      if (filledBits === toBits) {
        regrouped.push(nextByte);
        nextByte = 0;
        filledBits = 0;
      }
    }
  }

  if (pad && filledBits > 0) {
    nextByte = (nextByte << (toBits - filledBits)) & 0xff;
    regrouped.push(nextByte);
    nextByte = 0;
    filledBits = 0;
  }

  return new Uint8Array(regrouped);
}

export interface DecodedKaspa {
  prefix: string;
  version: number;
  payload: Uint8Array;
}

export function decodeKaspa(encoded: string): DecodedKaspa {
  if (encoded.length < CHECKSUM_LENGTH + 2) {
    throw new Error(`invalid bech32 string length ${encoded.length}`);
  }

  const lower = encoded.toLowerCase();
  const upper = encoded.toUpperCase();
  if (encoded !== lower && encoded !== upper) {
    throw new Error("string not all lowercase or all uppercase");
  }
  encoded = lower;

  const colon = encoded.lastIndexOf(":");
  if (colon < 1 || colon + CHECKSUM_LENGTH + 1 > encoded.length) {
    throw new Error("invalid index of ':'");
  }

  const prefix = encoded.slice(0, colon);
  const dataPart = encoded.slice(colon + 1);
  if (dataPart.length < CHECKSUM_LENGTH) throw new Error("data too short");

  const decoded5 = decodeFromBase32(dataPart);

  if (!verifyChecksum(prefix, decoded5)) {
    throw new Error("checksum failed");
  }

  const words5 = decoded5.slice(0, decoded5.length - CHECKSUM_LENGTH);
  const converted = convertBits(words5, fiveToEightBits);
  if (converted.length < 1) throw new Error("Missing version/data");

  const version = converted[0]!;
  const payload = converted.slice(1);

  return { prefix, version, payload };
}

/**
 * Kaspa address utilities using proper WASM functions
 * This is a simplified version that works with the current setup
 */

/**
 * Convert Kaspa address to scriptPublicKey hex using proper format
 * Based on Kaspa's actual script format (not Bitcoin P2PKH)
 */
export function addressToScriptPublicKey(address: string): string {
    try {
        // Decode the address to get the payload
        const decoded = decodeKaspa(address);
        
        // For Kaspa, use the payload directly as the script
        // Kaspa uses a different script format than Bitcoin
        // The payload from the address IS the scriptPublicKey
        return Buffer.from(decoded.payload).toString('hex');
    } catch (error) {
        throw new Error(`Failed to convert address to scriptPublicKey: ${error}`);
    }
}
