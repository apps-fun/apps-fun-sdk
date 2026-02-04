// EVM token gating

import type { NetworkId } from '../types/chain';
import { getEVMPublicClient, getEVMTokenBalance, type EVMPublicClient } from './client';

export interface EVMTokenGateConfig {
  tokenAddress: `0x${string}`;
  minAmount: bigint;
  networkId: NetworkId;
  rpcUrl?: string;
  cacheTtlMs?: number;
}

export interface EVMGateResult {
  allowed: boolean;
  balance: bigint;
  required: bigint;
  message: string;
}

/**
 * Token gating for EVM tokens
 */
export class EVMTokenGate {
  private client: EVMPublicClient;
  private tokenAddress: `0x${string}`;
  private minAmount: bigint;
  private cacheTtlMs: number;
  private cache: Map<string, { result: EVMGateResult; timestamp: number }>;

  constructor(config: EVMTokenGateConfig) {
    if (config.networkId === 'solana') {
      throw new Error('EVMTokenGate cannot be used with Solana network');
    }

    this.client = getEVMPublicClient(config.networkId, config.rpcUrl);
    this.tokenAddress = config.tokenAddress;
    this.minAmount = config.minAmount;
    this.cacheTtlMs = config.cacheTtlMs ?? 30000;
    this.cache = new Map();
  }

  /**
   * Check if a wallet passes the token gate
   */
  async check(walletAddress: string): Promise<EVMGateResult> {
    const cacheKey = walletAddress.toLowerCase();
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      return cached.result;
    }

    const balance = await getEVMTokenBalance(
      this.client,
      this.tokenAddress,
      walletAddress as `0x${string}`
    );

    const allowed = balance >= this.minAmount;
    const result: EVMGateResult = {
      allowed,
      balance,
      required: this.minAmount,
      message: allowed
        ? 'Access granted'
        : `Insufficient balance: have ${balance}, need ${this.minAmount}`,
    };

    this.cache.set(cacheKey, { result, timestamp: Date.now() });
    return result;
  }

  /**
   * Check multiple wallets at once
   */
  async checkBatch(wallets: string[]): Promise<Map<string, EVMGateResult>> {
    const results = new Map<string, EVMGateResult>();
    await Promise.all(
      wallets.map(async (wallet) => {
        const result = await this.check(wallet);
        results.set(wallet, result);
      })
    );
    return results;
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
  clearCacheFor(wallet: string): void {
    this.cache.delete(wallet.toLowerCase());
  }

  /**
   * Update the minimum amount required
   */
  setMinAmount(amount: bigint): void {
    this.minAmount = amount;
  }

  /**
   * Get token gate info
   */
  getTokenInfo(): { tokenAddress: string; minAmount: bigint } {
    return {
      tokenAddress: this.tokenAddress,
      minAmount: this.minAmount,
    };
  }
}
