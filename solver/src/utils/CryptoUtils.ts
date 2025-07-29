import { createHash, randomBytes } from 'crypto';

/**
 * Cryptographic utilities for atomic swaps
 * 
 * Provides functions for creating secrets, hashlocks, and verifying
 * cryptographic proofs in cross-chain atomic swaps.
 */
export class CryptoUtils {
  /**
   * Generate a random secret for atomic swap
   */
  static generateSecret(length: number = 32): string {
    const secretBytes = randomBytes(length);
    return secretBytes.toString('hex');
  }

  /**
   * Create SHA-256 hashlock from secret (compatible with EVM contracts)
   */
  static createHashlock(secret: string): string {
    const secretBytes = Buffer.isBuffer(secret) ? secret : Buffer.from(secret, 'hex');
    const hash = createHash('sha256').update(secretBytes).digest();
    return '0x' + hash.toString('hex');
  }

  /**
   * Verify secret matches hashlock
   */
  static verifySecret(secret: string, hashlock: string): boolean {
    const computedHashlock = this.createHashlock(secret);
    return computedHashlock.toLowerCase() === hashlock.toLowerCase();
  }

  /**
   * Create keccak256 hash (for Ethereum compatibility)
   */
  static keccak256(data: string | Buffer): string {
    // Note: For production, you'd want to use a proper keccak256 implementation
    // For simplicity, using SHA-256 here but in production use @ethersproject/keccak256
    const hash = createHash('sha256').update(data).digest();
    return '0x' + hash.toString('hex');
  }

  /**
   * Generate order hash from order parameters
   */
  static generateOrderHash(
    maker: string,
    taker: string,
    makerAsset: string,
    takerAsset: string,
    makerAmount: string,
    takerAmount: string,
    salt: string
  ): string {
    const orderData = {
      maker,
      taker,
      makerAsset,
      takerAsset,
      makerAmount,
      takerAmount,
      salt
    };
    
    const orderString = JSON.stringify(orderData);
    return this.keccak256(orderString);
  }

  /**
   * Generate salt for order uniqueness
   */
  static generateSalt(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Convert hex string to bytes32 format
   */
  static toBytes32(hex: string): string {
    if (hex.startsWith('0x')) {
      hex = hex.slice(2);
    }
    
    // Pad to 64 characters (32 bytes)
    return '0x' + hex.padStart(64, '0');
  }

  /**
   * Convert string to hex
   */
  static stringToHex(str: string): string {
    return '0x' + Buffer.from(str, 'utf8').toString('hex');
  }

  /**
   * Convert hex to string
   */
  static hexToString(hex: string): string {
    if (hex.startsWith('0x')) {
      hex = hex.slice(2);
    }
    return Buffer.from(hex, 'hex').toString('utf8');
  }

  /**
   * Generate deterministic secret from seed
   */
  static generateDeterministicSecret(seed: string): string {
    const hash = createHash('sha256').update(seed).digest();
    return hash.toString('hex');
  }

  /**
   * Create NEAR-compatible hashlock (hex string without 0x prefix)
   */
  static createNearHashlock(secret: string): string {
    const hashlock = this.createHashlock(secret);
    return hashlock.startsWith('0x') ? hashlock.slice(2) : hashlock;
  }

  /**
   * Validate hashlock format
   */
  static isValidHashlock(hashlock: string): boolean {
    const cleanHash = hashlock.startsWith('0x') ? hashlock.slice(2) : hashlock;
    return /^[a-fA-F0-9]{64}$/.test(cleanHash);
  }

  /**
   * Validate secret format
   */
  static isValidSecret(secret: string): boolean {
    return /^[a-fA-F0-9]+$/.test(secret) && secret.length >= 32;
  }

  /**
   * Create time-locked hash (includes timestamp)
   */
  static createTimeLockedHash(secret: string, timestamp: number): string {
    const data = secret + timestamp.toString();
    return this.createHashlock(data);
  }

  /**
   * Generate secure random timestamp
   */
  static generateSecureTimestamp(): number {
    const now = Date.now();
    const randomOffset = randomBytes(4).readUInt32BE(0) % (60 * 1000); // Random offset up to 1 minute
    return now + randomOffset;
  }

  /**
   * Create multi-signature hash
   */
  static createMultiSigHash(data: string[], privateKeys: string[]): string {
    // Simplified multi-sig hash creation
    const combinedData = data.join('');
    const combinedKeys = privateKeys.join('');
    const combined = combinedData + combinedKeys;
    return this.createHashlock(combined);
  }

  /**
   * Verify hash chain (for complex atomic swaps)
   */
  static verifyHashChain(secrets: string[], hashlocks: string[]): boolean {
    if (secrets.length !== hashlocks.length) {
      return false;
    }

    for (let i = 0; i < secrets.length; i++) {
      if (!this.verifySecret(secrets[i], hashlocks[i])) {
        return false;
      }
    }

    return true;
  }
}