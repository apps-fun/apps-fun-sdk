// Referral flow transformation and earnings tracking

import type { NetworkId } from '../types/chain';
import type { EVMPublicClient } from './client';
import type { TokenFlowConfig } from './tokenFlow';
import { getDistributedETHLogs } from './events';

/**
 * Transform a payment flow to include a referrer split.
 * Proportionally reduces existing splits to make room for the referral bps.
 * Does not mutate the input config.
 */
export function createReferralFlow(
  baseConfig: TokenFlowConfig,
  referrerAddress: `0x${string}`,
  referralBps: number
): TokenFlowConfig {
  if (referralBps < 1 || referralBps > 5000) {
    throw new Error('referralBps must be between 1 and 5000');
  }

  const baseTotalBps = baseConfig.splits.reduce((sum, s) => sum + s.bps, 0);
  if (baseTotalBps !== 10000) {
    throw new Error('Base config splits must sum to 10000');
  }

  const remaining = 10000 - referralBps;
  const scaledSplits = baseConfig.splits.map((split) => ({
    ...split,
    bps: Math.floor((split.bps * remaining) / 10000),
  }));

  // Fix rounding: add remainder to the first split
  const scaledTotal = scaledSplits.reduce((sum, s) => sum + s.bps, 0);
  const deficit = remaining - scaledTotal;
  if (deficit > 0 && scaledSplits.length > 0) {
    scaledSplits[0] = { ...scaledSplits[0], bps: scaledSplits[0].bps + deficit };
  }

  return {
    ...baseConfig,
    splits: [
      ...scaledSplits,
      { action: 'send', bps: referralBps, to: referrerAddress },
    ],
  };
}

/**
 * Query referral earnings from DistributedETH events for a specific address.
 * Filters by referrer address (case-insensitive) and optionally by app token.
 */
export async function getEVMReferralEarnings(
  client: EVMPublicClient,
  networkId: NetworkId,
  referrerAddress: `0x${string}`,
  appToken?: `0x${string}`,
  fromBlock?: bigint
): Promise<{ totalETH: bigint; paymentCount: number }> {
  const logs = await getDistributedETHLogs(client, networkId, {
    appToken,
    fromBlock,
  });

  const referrerKey = referrerAddress.toLowerCase();
  let totalETH = 0n;
  let paymentCount = 0;

  for (const log of logs) {
    if (log.user.toLowerCase() === referrerKey) {
      totalETH += log.ethAmount;
      paymentCount += 1;
    }
  }

  return { totalETH, paymentCount };
}
