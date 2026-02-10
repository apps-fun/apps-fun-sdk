/**
 * Tests for src/evm/analytics.ts
 *
 * Public API under test:
 *   - getRevenueStats(publicClient, networkId, appToken, fromBlock?): Promise<RevenueStats>
 *
 * Behavioral contracts:
 *   - Queries getDistributionLogs and getDistributedETHLogs in parallel
 *   - Sums totalETHDistributed from logs where isETH=true
 *   - Sums totalTokenDistributed from logs where isETH=false
 *   - Counts totalDistributions as distribution log count
 *   - Counts uniqueRecipients using Set of user addresses from payout logs
 *   - Finds latestDistributionId as max distributionId from distribution logs
 *   - Returns zeros/0n for empty logs
 *   - Passes fromBlock through to both queries
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../evm/events', () => ({
  getDistributionLogs: vi.fn(),
  getDistributedETHLogs: vi.fn(),
}));

import { getDistributionLogs, getDistributedETHLogs } from '../../evm/events';
import { getRevenueStats } from '../../evm/analytics';

const APP_TOKEN = '0x1111111111111111111111111111111111111111' as `0x${string}`;
const PAY_TOKEN = '0x2222222222222222222222222222222222222222' as `0x${string}`;
const USER_A = '0x3333333333333333333333333333333333333333' as `0x${string}`;
const USER_B = '0x4444444444444444444444444444444444444444' as `0x${string}`;
const TX_HASH = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`;

const mockPublicClient = {} as any;

function makeDistLog(overrides: {
  isETH: boolean;
  total: bigint;
  distributionId: bigint;
}) {
  return {
    appToken: APP_TOKEN,
    distributionId: overrides.distributionId,
    token: overrides.isETH ? null : PAY_TOKEN,
    total: overrides.total,
    isETH: overrides.isETH,
    blockNumber: 100n,
    transactionHash: TX_HASH,
  };
}

function makePayoutLog(user: `0x${string}`, ethAmount: bigint) {
  return {
    appToken: APP_TOKEN,
    distributionId: 1n,
    user,
    ethAmount,
    blockNumber: 100n,
    transactionHash: TX_HASH,
  };
}

describe('getRevenueStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDistributionLogs).mockResolvedValue([]);
    vi.mocked(getDistributedETHLogs).mockResolvedValue([]);
  });

  it('returns zeros for empty logs', async () => {
    const stats = await getRevenueStats(mockPublicClient, 'sepolia', APP_TOKEN);
    expect(stats.totalDistributions).toBe(0);
    expect(stats.totalETHDistributed).toBe(0n);
    expect(stats.totalTokenDistributed).toBe(0n);
    expect(stats.uniqueRecipients).toBe(0);
    expect(stats.latestDistributionId).toBe(0n);
  });

  it('sums ETH distributions into totalETHDistributed', async () => {
    vi.mocked(getDistributionLogs).mockResolvedValue([
      makeDistLog({ isETH: true, total: 1000n, distributionId: 1n }),
      makeDistLog({ isETH: true, total: 2000n, distributionId: 2n }),
    ]);

    const stats = await getRevenueStats(mockPublicClient, 'sepolia', APP_TOKEN);
    expect(stats.totalETHDistributed).toBe(3000n);
  });

  it('sums token distributions into totalTokenDistributed', async () => {
    vi.mocked(getDistributionLogs).mockResolvedValue([
      makeDistLog({ isETH: false, total: 500n, distributionId: 1n }),
      makeDistLog({ isETH: false, total: 700n, distributionId: 2n }),
    ]);

    const stats = await getRevenueStats(mockPublicClient, 'sepolia', APP_TOKEN);
    expect(stats.totalTokenDistributed).toBe(1200n);
  });

  it('separates ETH and token totals correctly', async () => {
    vi.mocked(getDistributionLogs).mockResolvedValue([
      makeDistLog({ isETH: true, total: 1000n, distributionId: 1n }),
      makeDistLog({ isETH: false, total: 500n, distributionId: 2n }),
      makeDistLog({ isETH: true, total: 3000n, distributionId: 3n }),
    ]);

    const stats = await getRevenueStats(mockPublicClient, 'sepolia', APP_TOKEN);
    expect(stats.totalETHDistributed).toBe(4000n);
    expect(stats.totalTokenDistributed).toBe(500n);
  });

  it('counts totalDistributions as number of distribution logs', async () => {
    vi.mocked(getDistributionLogs).mockResolvedValue([
      makeDistLog({ isETH: true, total: 100n, distributionId: 1n }),
      makeDistLog({ isETH: false, total: 200n, distributionId: 2n }),
      makeDistLog({ isETH: true, total: 300n, distributionId: 3n }),
    ]);

    const stats = await getRevenueStats(mockPublicClient, 'sepolia', APP_TOKEN);
    expect(stats.totalDistributions).toBe(3);
  });

  it('counts unique recipients from payout logs', async () => {
    vi.mocked(getDistributedETHLogs).mockResolvedValue([
      makePayoutLog(USER_A, 100n),
      makePayoutLog(USER_B, 200n),
    ]);

    const stats = await getRevenueStats(mockPublicClient, 'sepolia', APP_TOKEN);
    expect(stats.uniqueRecipients).toBe(2);
  });

  it('deduplicates overlapping recipients', async () => {
    vi.mocked(getDistributedETHLogs).mockResolvedValue([
      makePayoutLog(USER_A, 100n),
      makePayoutLog(USER_A, 200n),
      makePayoutLog(USER_B, 300n),
    ]);

    const stats = await getRevenueStats(mockPublicClient, 'sepolia', APP_TOKEN);
    expect(stats.uniqueRecipients).toBe(2);
  });

  it('finds latestDistributionId as max across logs', async () => {
    vi.mocked(getDistributionLogs).mockResolvedValue([
      makeDistLog({ isETH: true, total: 100n, distributionId: 5n }),
      makeDistLog({ isETH: false, total: 200n, distributionId: 12n }),
      makeDistLog({ isETH: true, total: 300n, distributionId: 3n }),
    ]);

    const stats = await getRevenueStats(mockPublicClient, 'sepolia', APP_TOKEN);
    expect(stats.latestDistributionId).toBe(12n);
  });

  it('returns 0n for latestDistributionId when no logs', async () => {
    const stats = await getRevenueStats(mockPublicClient, 'sepolia', APP_TOKEN);
    expect(stats.latestDistributionId).toBe(0n);
  });

  it('passes appToken to both event queries', async () => {
    await getRevenueStats(mockPublicClient, 'sepolia', APP_TOKEN);

    expect(getDistributionLogs).toHaveBeenCalledWith(
      mockPublicClient, 'sepolia', expect.objectContaining({ appToken: APP_TOKEN })
    );
    expect(getDistributedETHLogs).toHaveBeenCalledWith(
      mockPublicClient, 'sepolia', expect.objectContaining({ appToken: APP_TOKEN })
    );
  });

  it('passes fromBlock to both event queries when provided', async () => {
    await getRevenueStats(mockPublicClient, 'sepolia', APP_TOKEN, 500n);

    expect(getDistributionLogs).toHaveBeenCalledWith(
      mockPublicClient, 'sepolia', expect.objectContaining({ fromBlock: 500n })
    );
    expect(getDistributedETHLogs).toHaveBeenCalledWith(
      mockPublicClient, 'sepolia', expect.objectContaining({ fromBlock: 500n })
    );
  });

  it('does not pass fromBlock when not provided', async () => {
    await getRevenueStats(mockPublicClient, 'sepolia', APP_TOKEN);

    expect(getDistributionLogs).toHaveBeenCalledWith(
      mockPublicClient, 'sepolia', expect.objectContaining({ fromBlock: undefined })
    );
  });

  it('handles single distribution log correctly', async () => {
    vi.mocked(getDistributionLogs).mockResolvedValue([
      makeDistLog({ isETH: true, total: 42n, distributionId: 7n }),
    ]);
    vi.mocked(getDistributedETHLogs).mockResolvedValue([
      makePayoutLog(USER_A, 42n),
    ]);

    const stats = await getRevenueStats(mockPublicClient, 'sepolia', APP_TOKEN);
    expect(stats.totalDistributions).toBe(1);
    expect(stats.totalETHDistributed).toBe(42n);
    expect(stats.totalTokenDistributed).toBe(0n);
    expect(stats.uniqueRecipients).toBe(1);
    expect(stats.latestDistributionId).toBe(7n);
  });
});
