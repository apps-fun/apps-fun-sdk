// Revenue analytics aggregation over distribution events

import type { NetworkId } from '../types/chain';
import type { EVMPublicClient } from './client';
import { getDistributionLogs, getDistributedETHLogs } from './events';

// --- Types ---

export interface RevenueStats {
  totalDistributions: number;
  totalETHDistributed: bigint;
  totalTokenDistributed: bigint;
  uniqueRecipients: number;
  latestDistributionId: bigint;
}

// --- Functions ---

/**
 * Get aggregated revenue statistics for an app token.
 * Queries on-chain distribution events and computes totals.
 */
export async function getRevenueStats(
  publicClient: EVMPublicClient,
  networkId: NetworkId,
  appToken: `0x${string}`,
  fromBlock?: bigint
): Promise<RevenueStats> {
  const [distributionLogs, payoutLogs] = await Promise.all([
    getDistributionLogs(publicClient, networkId, { appToken, fromBlock }),
    getDistributedETHLogs(publicClient, networkId, { appToken, fromBlock }),
  ]);

  let totalETHDistributed = 0n;
  let totalTokenDistributed = 0n;
  let latestDistributionId = 0n;

  for (const log of distributionLogs) {
    if (log.isETH) {
      totalETHDistributed += log.total;
    } else {
      totalTokenDistributed += log.total;
    }
    if (log.distributionId > latestDistributionId) {
      latestDistributionId = log.distributionId;
    }
  }

  const uniqueRecipients = new Set(payoutLogs.map((l) => l.user)).size;

  return {
    totalDistributions: distributionLogs.length,
    totalETHDistributed,
    totalTokenDistributed,
    uniqueRecipients,
    latestDistributionId,
  };
}
