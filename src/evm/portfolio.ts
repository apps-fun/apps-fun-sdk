// Multi-token portfolio view with ETH valuations

import type { NetworkId } from '../types/chain';
import type { EVMPublicClient } from './client';
import { getEVMTokenBalance } from './client';
import { getEVMTokenDecimals } from './tokenInfo';
import { getEVMQuote } from './trading';

export interface PortfolioEntry {
  token: `0x${string}`;
  balance: bigint;
  balanceFormatted: number;
  decimals: number;
  ethValue: bigint;
  ethValueFormatted: number;
}

/**
 * Get portfolio data for multiple tokens: balance, decimals, and ETH value.
 * Uses Promise.allSettled so one failing token does not break the entire query.
 * Failed tokens are excluded from the result. Zero-balance tokens skip the quote call.
 */
export async function getEVMPortfolio(
  client: EVMPublicClient,
  networkId: NetworkId,
  walletAddress: `0x${string}`,
  tokens: `0x${string}`[]
): Promise<PortfolioEntry[]> {
  if (tokens.length === 0) {
    return [];
  }

  // Fetch balance and decimals for each token in parallel
  const settled = await Promise.allSettled(
    tokens.map(async (token) => {
      const [balance, decimals] = await Promise.all([
        getEVMTokenBalance(client, token, walletAddress),
        getEVMTokenDecimals(client, token),
      ]);
      return { token, balance, decimals };
    })
  );

  const entries: PortfolioEntry[] = [];

  for (const result of settled) {
    if (result.status !== 'fulfilled') {
      continue;
    }
    const { token, balance, decimals } = result.value;
    const balanceFormatted = Number(balance) / 10 ** decimals;

    let ethValue = 0n;
    let ethValueFormatted = 0;

    if (balance > 0n) {
      try {
        const quote = await getEVMQuote(client, networkId, {
          tokenAddress: token,
          amount: balanceFormatted,
          side: 'sell',
        });
        ethValue = quote.ethAmountRaw;
        ethValueFormatted = quote.ethAmount;
      } catch {
        // Quote failed (illiquid, no pair, etc.) -- leave ethValue as 0
      }
    }

    entries.push({
      token,
      balance,
      balanceFormatted,
      decimals,
      ethValue,
      ethValueFormatted,
    });
  }

  return entries;
}
