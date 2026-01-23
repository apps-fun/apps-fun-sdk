import { Connection, PublicKey } from '@solana/web3.js';
import { getTokenBalance, getTokenRecord } from './accounts';

export interface TokenGateConfig {
  /** The token mint address to check */
  tokenMint: PublicKey;
  /** Minimum token amount required (in smallest units) */
  minAmount: bigint;
  /** Optional: Custom RPC connection */
  connection?: Connection;
  /** Optional: Custom RPC URL */
  rpcUrl?: string;
  /** Optional: Cache TTL in milliseconds (default: 30000) */
  cacheTtl?: number;
  /** Alias for cacheTtl */
  cacheTtlMs?: number;
  /** Optional: App ID for reference */
  appId?: number;
}

export interface GateResult {
  /** Whether the wallet passes the gate */
  allowed: boolean;
  /** The wallet's token balance */
  balance: bigint;
  /** The required minimum amount */
  required: bigint;
  /** Human-readable message */
  message: string;
}

interface CacheEntry {
  balance: bigint;
  timestamp: number;
}

/**
 * Token gating utility for apps.fun tokens
 *
 * @example
 * ```ts
 * const gate = new TokenGate({
 *   tokenMint: new PublicKey('...'),
 *   minAmount: BigInt(1000000), // 1 token with 6 decimals
 * });
 *
 * const result = await gate.check(walletAddress);
 * if (result.allowed) {
 *   // Grant access
 * }
 * ```
 */
export class TokenGate {
  private connection: Connection;
  private tokenMint: PublicKey;
  private minAmount: bigint;
  private cacheTtl: number;
  private appId?: number;
  private cache: Map<string, CacheEntry> = new Map();

  constructor(config: TokenGateConfig) {
    this.tokenMint = config.tokenMint;
    this.minAmount = config.minAmount;
    this.cacheTtl = config.cacheTtlMs ?? config.cacheTtl ?? 30000;
    this.appId = config.appId;

    if (config.connection) {
      this.connection = config.connection;
    } else {
      const rpcUrl =
        config.rpcUrl ||
        process.env.SOLANA_RPC_URL ||
        'https://api.mainnet-beta.solana.com';
      this.connection = new Connection(rpcUrl, 'confirmed');
    }
  }

  /**
   * Check if a wallet passes the token gate
   */
  async check(wallet: PublicKey | string): Promise<GateResult> {
    const walletPubkey =
      typeof wallet === 'string' ? new PublicKey(wallet) : wallet;
    const walletKey = walletPubkey.toBase58();

    // Check cache
    const cached = this.cache.get(walletKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
      return this.buildResult(cached.balance);
    }

    // Fetch balance
    const balance = await getTokenBalance(
      this.connection,
      this.tokenMint,
      walletPubkey
    );

    // Update cache
    this.cache.set(walletKey, {
      balance,
      timestamp: Date.now(),
    });

    return this.buildResult(balance);
  }

  /**
   * Check multiple wallets at once
   */
  async checkBatch(
    wallets: (PublicKey | string)[]
  ): Promise<Map<string, GateResult>> {
    const results = new Map<string, GateResult>();

    // Process in parallel with concurrency limit
    const batchSize = 10;
    for (let i = 0; i < wallets.length; i += batchSize) {
      const batch = wallets.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (wallet) => {
          const key =
            typeof wallet === 'string' ? wallet : wallet.toBase58();
          const result = await this.check(wallet);
          return { key, result };
        })
      );

      for (const { key, result } of batchResults) {
        results.set(key, result);
      }
    }

    return results;
  }

  /**
   * Get the configured token gate info (synchronous)
   */
  getTokenInfo(): {
    mint: string;
    minAmount: bigint;
    appId: number | undefined;
  } {
    return {
      mint: this.tokenMint.toBase58(),
      minAmount: this.minAmount,
      appId: this.appId,
    };
  }

  /**
   * Get on-chain token record data (async)
   */
  async getOnChainTokenRecord(): Promise<{
    mint: PublicKey;
    appId: bigint | null;
    graduated: boolean;
  } | null> {
    const record = await getTokenRecord(this.connection, this.tokenMint);
    if (!record) {
      return {
        mint: this.tokenMint,
        appId: null,
        graduated: false,
      };
    }

    return {
      mint: this.tokenMint,
      appId: record.appId,
      graduated: record.graduated,
    };
  }

  /**
   * Clear the balance cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clear cache for a specific wallet
   */
  clearCacheFor(wallet: PublicKey | string): void {
    const key = typeof wallet === 'string' ? wallet : wallet.toBase58();
    this.cache.delete(key);
  }

  /**
   * Update the minimum amount required
   */
  setMinAmount(amount: bigint): void {
    this.minAmount = amount;
  }

  private buildResult(balance: bigint): GateResult {
    const allowed = balance >= this.minAmount;

    let message: string;
    if (allowed) {
      message = 'Access granted';
    } else if (balance === BigInt(0)) {
      message = 'No tokens found. Purchase tokens to gain access.';
    } else {
      const needed = this.minAmount - balance;
      message = `Insufficient balance. Need ${needed} more tokens.`;
    }

    return {
      allowed,
      balance,
      required: this.minAmount,
      message,
    };
  }
}

/**
 * Create a simple token gate check function
 *
 * @example
 * ```ts
 * const checkAccess = createTokenGate({
 *   tokenMint: new PublicKey('...'),
 *   minAmount: BigInt(1000000),
 * });
 *
 * const hasAccess = await checkAccess(walletAddress);
 * ```
 */
export function createTokenGate(
  config: TokenGateConfig
): (wallet: PublicKey | string) => Promise<boolean> {
  const gate = new TokenGate(config);
  return async (wallet: PublicKey | string) => {
    const result = await gate.check(wallet);
    return result.allowed;
  };
}
