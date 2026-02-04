/**
 * Tests for src/evm/burnAnalytics.ts
 *
 * Public API under test:
 *   - getEVMBurnHistory(client, tokenAddress, fromBlock?, toBlock?): Promise<BurnEvent[]>
 *   - getEVMCirculatingSupply(client, tokenAddress): Promise<CirculatingSupplyStats>
 *
 * Behavioral contracts:
 *   - getEVMBurnHistory queries Transfer events with to=DEAD_ADDRESS
 *   - Maps log fields to BurnEvent correctly
 *   - Sorts by blockNumber ascending
 *   - Passes fromBlock/toBlock to getLogs
 *   - Returns empty array when no burns
 *   - getEVMCirculatingSupply computes circulating = total - burned
 *   - Computes burnPercent correctly
 *   - Returns 0 percent when totalSupply is 0
 *   - Calls totalSupply and balance in parallel
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../evm/client', () => ({
  getEVMTokenBalance: vi.fn(),
}));

vi.mock('../../evm/tokenInfo', () => ({
  getEVMTokenTotalSupply: vi.fn(),
}));

import { getEVMTokenBalance } from '../../evm/client';
import { getEVMTokenTotalSupply } from '../../evm/tokenInfo';
import { getEVMBurnHistory, getEVMCirculatingSupply } from '../../evm/burnAnalytics';

const TOKEN = '0x1111111111111111111111111111111111111111' as `0x${string}`;
const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD';
const ALICE = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const BOB = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const TX1 = '0x1111111111111111111111111111111111111111111111111111111111111111' as `0x${string}`;
const TX2 = '0x2222222222222222222222222222222222222222222222222222222222222222' as `0x${string}`;

function makeBurnLog(from: string, value: bigint, blockNumber: bigint, txHash: `0x${string}` = TX1) {
  return {
    args: { from, to: DEAD_ADDRESS, value },
    blockNumber,
    transactionHash: txHash,
  };
}

// --- getEVMBurnHistory ---

describe('getEVMBurnHistory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries Transfer events with to=DEAD_ADDRESS and correct event definition', async () => {
    const client = {
      getLogs: vi.fn().mockResolvedValue([]),
    } as any;

    await getEVMBurnHistory(client, TOKEN);

    const call = client.getLogs.mock.calls[0][0];
    expect(call.address).toBe(TOKEN);
    expect(call.args.to).toBe(DEAD_ADDRESS);
    expect(call.event.name).toBe('Transfer');
    expect(call.event.type).toBe('event');
    const inputs = call.event.inputs;
    expect(inputs).toHaveLength(3);
    expect(inputs[0]).toEqual({ name: 'from', type: 'address', indexed: true });
    expect(inputs[1]).toEqual({ name: 'to', type: 'address', indexed: true });
    expect(inputs[2]).toEqual({ name: 'value', type: 'uint256', indexed: false });
  });

  it('maps log fields to BurnEvent correctly', async () => {
    const client = {
      getLogs: vi.fn().mockResolvedValue([
        makeBurnLog(ALICE, 500n, 100n, TX1),
      ]),
    } as any;

    const result = await getEVMBurnHistory(client, TOKEN);

    expect(result.length).toBe(1);
    expect(result[0].from).toBe(ALICE);
    expect(result[0].amount).toBe(500n);
    expect(result[0].blockNumber).toBe(100n);
    expect(result[0].transactionHash).toBe(TX1);
  });

  it('sorts by blockNumber ascending', async () => {
    const client = {
      getLogs: vi.fn().mockResolvedValue([
        makeBurnLog(ALICE, 100n, 300n, TX1),
        makeBurnLog(BOB, 200n, 100n, TX2),
        makeBurnLog(ALICE, 50n, 200n, TX1),
      ]),
    } as any;

    const result = await getEVMBurnHistory(client, TOKEN);

    expect(result[0].blockNumber).toBe(100n);
    expect(result[1].blockNumber).toBe(200n);
    expect(result[2].blockNumber).toBe(300n);
  });

  it('passes fromBlock and toBlock to getLogs', async () => {
    const client = {
      getLogs: vi.fn().mockResolvedValue([]),
    } as any;

    await getEVMBurnHistory(client, TOKEN, 50n, 150n);

    expect(client.getLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        fromBlock: 50n,
        toBlock: 150n,
      })
    );
  });

  it('returns empty array when no burns', async () => {
    const client = {
      getLogs: vi.fn().mockResolvedValue([]),
    } as any;

    const result = await getEVMBurnHistory(client, TOKEN);

    expect(result).toEqual([]);
  });

  it('propagates getLogs errors', async () => {
    const client = {
      getLogs: vi.fn().mockRejectedValue(new Error('RPC error')),
    } as any;

    await expect(getEVMBurnHistory(client, TOKEN)).rejects.toThrow('RPC error');
  });

  it('handles multiple burns from same address', async () => {
    const client = {
      getLogs: vi.fn().mockResolvedValue([
        makeBurnLog(ALICE, 100n, 10n, TX1),
        makeBurnLog(ALICE, 200n, 20n, TX2),
      ]),
    } as any;

    const result = await getEVMBurnHistory(client, TOKEN);

    expect(result.length).toBe(2);
    expect(result[0].amount).toBe(100n);
    expect(result[1].amount).toBe(200n);
  });
});

// --- getEVMCirculatingSupply ---

describe('getEVMCirculatingSupply', () => {
  beforeEach(() => vi.clearAllMocks());

  it('computes circulating = total - burned', async () => {
    vi.mocked(getEVMTokenTotalSupply).mockResolvedValue(1000000n);
    vi.mocked(getEVMTokenBalance).mockResolvedValue(250000n);

    const result = await getEVMCirculatingSupply({} as any, TOKEN);

    expect(result.totalSupply).toBe(1000000n);
    expect(result.burned).toBe(250000n);
    expect(result.circulating).toBe(750000n);
  });

  it('computes burnPercent correctly', async () => {
    vi.mocked(getEVMTokenTotalSupply).mockResolvedValue(1000n);
    vi.mocked(getEVMTokenBalance).mockResolvedValue(125n);

    const result = await getEVMCirculatingSupply({} as any, TOKEN);

    expect(result.burnPercent).toBe(12.5);
  });

  it('returns 0 percent when totalSupply is 0', async () => {
    vi.mocked(getEVMTokenTotalSupply).mockResolvedValue(0n);
    vi.mocked(getEVMTokenBalance).mockResolvedValue(0n);

    const result = await getEVMCirculatingSupply({} as any, TOKEN);

    expect(result.burnPercent).toBe(0);
    expect(result.circulating).toBe(0n);
  });

  it('calls totalSupply and balance for DEAD_ADDRESS', async () => {
    vi.mocked(getEVMTokenTotalSupply).mockResolvedValue(1000n);
    vi.mocked(getEVMTokenBalance).mockResolvedValue(0n);

    await getEVMCirculatingSupply({} as any, TOKEN);

    expect(getEVMTokenTotalSupply).toHaveBeenCalledWith(expect.anything(), TOKEN);
    expect(getEVMTokenBalance).toHaveBeenCalledWith(
      expect.anything(),
      TOKEN,
      DEAD_ADDRESS
    );
  });

  it('returns 100 percent when all tokens burned', async () => {
    vi.mocked(getEVMTokenTotalSupply).mockResolvedValue(1000n);
    vi.mocked(getEVMTokenBalance).mockResolvedValue(1000n);

    const result = await getEVMCirculatingSupply({} as any, TOKEN);

    expect(result.burnPercent).toBe(100);
    expect(result.circulating).toBe(0n);
  });

  it('propagates errors', async () => {
    vi.mocked(getEVMTokenTotalSupply).mockRejectedValue(new Error('RPC down'));

    await expect(
      getEVMCirculatingSupply({} as any, TOKEN)
    ).rejects.toThrow('RPC down');
  });
});
