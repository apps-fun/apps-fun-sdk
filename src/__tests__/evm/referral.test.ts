/**
 * Tests for src/evm/referral.ts
 *
 * Public API under test:
 *   - createReferralFlow(baseConfig, referrerAddress, referralBps): TokenFlowConfig
 *   - getEVMReferralEarnings(client, networkId, referrerAddress, appToken?, fromBlock?): Promise<{ totalETH, paymentCount }>
 *
 * Behavioral contracts:
 *   - createReferralFlow adds a 'send' split for the referrer
 *   - Scales down existing splits proportionally to make room
 *   - Result splits always sum to 10000
 *   - Validates referralBps in range 1-5000
 *   - Validates base config splits sum to 10000
 *   - Does not mutate input config
 *   - getEVMReferralEarnings filters DistributedETH logs by referrer address
 *   - Case-insensitive address matching
 *   - Sums ethAmount and counts payments
 *   - Filters by appToken when provided
 *   - Passes fromBlock to event query
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../evm/events', () => ({
  getDistributedETHLogs: vi.fn().mockResolvedValue([]),
}));

import { getDistributedETHLogs } from '../../evm/events';
import { createReferralFlow, getEVMReferralEarnings } from '../../evm/referral';
import type { TokenFlowConfig, TokenFlowSplit } from '../../evm/tokenFlow';

const TOKEN = '0x1111111111111111111111111111111111111111' as `0x${string}`;
const REFERRER = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as `0x${string}`;
const CREATOR = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as `0x${string}`;

function makeBaseConfig(splits: TokenFlowSplit[] = [{ action: 'burn', bps: 10000 }]): TokenFlowConfig {
  return {
    token: TOKEN,
    network: 'sepolia',
    chargeAmount: 1000n,
    splits,
  };
}

// --- createReferralFlow ---

describe('createReferralFlow', () => {
  it('adds referrer split with correct bps and action', () => {
    const config = makeBaseConfig();
    const result = createReferralFlow(config, REFERRER, 1000);

    const referrerSplit = result.splits.find((s) => s.to === REFERRER);
    expect(referrerSplit).toBeDefined();
    expect(referrerSplit!.action).toBe('send');
    expect(referrerSplit!.bps).toBe(1000);
  });

  it('scales down existing splits proportionally', () => {
    const config = makeBaseConfig([
      { action: 'burn', bps: 5000 },
      { action: 'send', bps: 5000, to: CREATOR },
    ]);
    const result = createReferralFlow(config, REFERRER, 2000);

    // remaining = 8000, each 5000 -> floor(5000*8000/10000) = 4000
    const burnSplit = result.splits.find((s) => s.action === 'burn');
    const creatorSplit = result.splits.find((s) => s.to === CREATOR);
    expect(burnSplit!.bps).toBe(4000);
    expect(creatorSplit!.bps).toBe(4000);
  });

  it('result splits sum to 10000', () => {
    const config = makeBaseConfig([
      { action: 'burn', bps: 3333 },
      { action: 'send', bps: 3334, to: CREATOR },
      { action: 'distribute', bps: 3333 },
    ]);
    const result = createReferralFlow(config, REFERRER, 1500);

    const total = result.splits.reduce((sum, s) => sum + s.bps, 0);
    expect(total).toBe(10000);
  });

  it('throws when referralBps < 1', () => {
    const config = makeBaseConfig();
    expect(() => createReferralFlow(config, REFERRER, 0)).toThrow(
      'referralBps must be between 1 and 5000'
    );
  });

  it('throws when referralBps > 5000', () => {
    const config = makeBaseConfig();
    expect(() => createReferralFlow(config, REFERRER, 5001)).toThrow(
      'referralBps must be between 1 and 5000'
    );
  });

  it('throws when base config splits do not sum to 10000', () => {
    const config = makeBaseConfig([{ action: 'burn', bps: 5000 }]);
    expect(() => createReferralFlow(config, REFERRER, 1000)).toThrow(
      'Base config splits must sum to 10000'
    );
  });

  it('does not mutate input config', () => {
    const config = makeBaseConfig();
    const originalSplits = [...config.splits];
    createReferralFlow(config, REFERRER, 1000);

    expect(config.splits).toEqual(originalSplits);
    expect(config.splits.length).toBe(1);
  });

  it('handles single-split input', () => {
    const config = makeBaseConfig([{ action: 'burn', bps: 10000 }]);
    const result = createReferralFlow(config, REFERRER, 500);

    expect(result.splits.length).toBe(2);
    const total = result.splits.reduce((sum, s) => sum + s.bps, 0);
    expect(total).toBe(10000);
  });

  it('preserves non-split config fields', () => {
    const config = makeBaseConfig();
    config.slippageBps = 100;
    const result = createReferralFlow(config, REFERRER, 1000);

    expect(result.token).toBe(TOKEN);
    expect(result.network).toBe('sepolia');
    expect(result.chargeAmount).toBe(1000n);
    expect(result.slippageBps).toBe(100);
  });

  it('fixes rounding deficit by adding to first split', () => {
    // 3 splits of 3333, 3334, 3333 = 10000
    // referralBps = 1, remaining = 9999
    // floor(3333*9999/10000)=3332, floor(3334*9999/10000)=3333, floor(3333*9999/10000)=3332
    // scaled total = 9997, deficit = 2, added to first
    const config = makeBaseConfig([
      { action: 'burn', bps: 3333 },
      { action: 'send', bps: 3334, to: CREATOR },
      { action: 'distribute', bps: 3333 },
    ]);
    const result = createReferralFlow(config, REFERRER, 1);

    const total = result.splits.reduce((sum, s) => sum + s.bps, 0);
    expect(total).toBe(10000);

    // Verify deficit goes to FIRST split (not last)
    const burnSplit = result.splits[0];
    expect(burnSplit.bps).toBe(3334); // 3332 + 2 deficit
    // Second split should NOT get the deficit
    const sendSplit = result.splits[1];
    expect(sendSplit.bps).toBe(3333);
    // Third split should NOT get the deficit
    const distSplit = result.splits[2];
    expect(distSplit.bps).toBe(3332);
  });

  it('accepts referralBps exactly 5000 (upper boundary)', () => {
    const config = makeBaseConfig();
    const result = createReferralFlow(config, REFERRER, 5000);

    const referrerSplit = result.splits.find(s => s.to === REFERRER);
    expect(referrerSplit!.bps).toBe(5000);
    const total = result.splits.reduce((sum, s) => sum + s.bps, 0);
    expect(total).toBe(10000);
  });

  it('accepts referralBps exactly 1 (lower boundary)', () => {
    const config = makeBaseConfig();
    const result = createReferralFlow(config, REFERRER, 1);

    const referrerSplit = result.splits.find(s => s.to === REFERRER);
    expect(referrerSplit!.bps).toBe(1);
    const total = result.splits.reduce((sum, s) => sum + s.bps, 0);
    expect(total).toBe(10000);
  });

  it('does not add deficit when rounding is exact (deficit === 0)', () => {
    // 2 splits of 5000, 5000 = 10000
    // referralBps = 2000, remaining = 8000
    // floor(5000*8000/10000) = 4000, floor(5000*8000/10000) = 4000
    // scaled total = 8000, deficit = 0
    const config = makeBaseConfig([
      { action: 'burn', bps: 5000 },
      { action: 'send', bps: 5000, to: CREATOR },
    ]);
    const result = createReferralFlow(config, REFERRER, 2000);

    expect(result.splits[0].bps).toBe(4000); // no deficit added
    expect(result.splits[1].bps).toBe(4000);
    expect(result.splits[2].bps).toBe(2000); // referrer
  });

  it('returns specific scaled bps values for each split', () => {
    // 3 splits: 6000, 2000, 2000 = 10000
    // referralBps = 1000, remaining = 9000
    // floor(6000*9000/10000) = 5400
    // floor(2000*9000/10000) = 1800
    // floor(2000*9000/10000) = 1800
    // scaled total = 9000, deficit = 0
    const config = makeBaseConfig([
      { action: 'burn', bps: 6000 },
      { action: 'send', bps: 2000, to: CREATOR },
      { action: 'distribute', bps: 2000 },
    ]);
    const result = createReferralFlow(config, REFERRER, 1000);

    expect(result.splits[0].bps).toBe(5400); // burn
    expect(result.splits[1].bps).toBe(1800); // send
    expect(result.splits[2].bps).toBe(1800); // distribute
    expect(result.splits[3].bps).toBe(1000); // referrer
  });
});

// --- getEVMReferralEarnings ---

describe('getEVMReferralEarnings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters logs by referrer address', async () => {
    const OTHER = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC' as `0x${string}`;
    vi.mocked(getDistributedETHLogs).mockResolvedValue([
      { appToken: TOKEN, distributionId: 1n, user: REFERRER, ethAmount: 100n, blockNumber: 10n, transactionHash: '0x1' as `0x${string}` },
      { appToken: TOKEN, distributionId: 1n, user: OTHER, ethAmount: 200n, blockNumber: 10n, transactionHash: '0x2' as `0x${string}` },
      { appToken: TOKEN, distributionId: 2n, user: REFERRER, ethAmount: 50n, blockNumber: 20n, transactionHash: '0x3' as `0x${string}` },
    ]);

    const result = await getEVMReferralEarnings(
      {} as any, 'sepolia', REFERRER
    );

    expect(result.totalETH).toBe(150n);
    expect(result.paymentCount).toBe(2);
  });

  it('sums ethAmount correctly', async () => {
    vi.mocked(getDistributedETHLogs).mockResolvedValue([
      { appToken: TOKEN, distributionId: 1n, user: REFERRER, ethAmount: 1000000000000000000n, blockNumber: 10n, transactionHash: '0x1' as `0x${string}` },
      { appToken: TOKEN, distributionId: 2n, user: REFERRER, ethAmount: 2000000000000000000n, blockNumber: 20n, transactionHash: '0x2' as `0x${string}` },
    ]);

    const result = await getEVMReferralEarnings(
      {} as any, 'sepolia', REFERRER
    );

    expect(result.totalETH).toBe(3000000000000000000n);
  });

  it('filters by appToken when provided', async () => {
    vi.mocked(getDistributedETHLogs).mockResolvedValue([]);

    await getEVMReferralEarnings(
      {} as any, 'sepolia', REFERRER, TOKEN
    );

    expect(getDistributedETHLogs).toHaveBeenCalledWith(
      expect.anything(),
      'sepolia',
      expect.objectContaining({ appToken: TOKEN })
    );
  });

  it('returns zero when no matching logs', async () => {
    vi.mocked(getDistributedETHLogs).mockResolvedValue([]);

    const result = await getEVMReferralEarnings(
      {} as any, 'sepolia', REFERRER
    );

    expect(result.totalETH).toBe(0n);
    expect(result.paymentCount).toBe(0);
  });

  it('passes fromBlock to query', async () => {
    vi.mocked(getDistributedETHLogs).mockResolvedValue([]);

    await getEVMReferralEarnings(
      {} as any, 'sepolia', REFERRER, undefined, 500n
    );

    expect(getDistributedETHLogs).toHaveBeenCalledWith(
      expect.anything(),
      'sepolia',
      expect.objectContaining({ fromBlock: 500n })
    );
  });

  it('is case-insensitive on address matching', async () => {
    const lowerReferrer = REFERRER.toLowerCase() as `0x${string}`;
    vi.mocked(getDistributedETHLogs).mockResolvedValue([
      { appToken: TOKEN, distributionId: 1n, user: REFERRER, ethAmount: 100n, blockNumber: 10n, transactionHash: '0x1' as `0x${string}` },
    ]);

    const result = await getEVMReferralEarnings(
      {} as any, 'sepolia', lowerReferrer
    );

    expect(result.paymentCount).toBe(1);
    expect(result.totalETH).toBe(100n);
  });

  it('propagates event query errors', async () => {
    vi.mocked(getDistributedETHLogs).mockRejectedValue(new Error('RPC error'));

    await expect(
      getEVMReferralEarnings({} as any, 'sepolia', REFERRER)
    ).rejects.toThrow('RPC error');
  });
});
