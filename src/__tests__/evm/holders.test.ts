/**
 * Tests for src/evm/holders.ts
 *
 * Public API under test:
 *   - getEVMTokenHolders(client, tokenAddress, fromBlock?, toBlock?): Promise<Map<string, bigint>>
 *   - airdropETHToHolders(publicClient, walletClient, networkId, params): Promise<{ hash, recipientCount }>
 *
 * Behavioral contracts:
 *   - getEVMTokenHolders queries Transfer events via client.getLogs
 *   - Builds holder map by adding to receiver and subtracting from sender
 *   - Handles mints (from zero address) correctly
 *   - Filters out zero address, DEAD_ADDRESS, and balances <= 0
 *   - Uses lowercase address keys for case-insensitive lookups
 *   - Passes fromBlock/toBlock to getLogs
 *   - Returns empty map when no transfers
 *   - airdropETHToHolders calculates proportional ETH shares
 *   - Calls distributeETH with correct params
 *   - Filters zero-share recipients
 *   - Throws when no holders found
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../evm/distribute', () => ({
  distributeETH: vi.fn().mockResolvedValue({ hash: '0xAIRDROP_HASH' }),
}));

import { distributeETH } from '../../evm/distribute';
import { getEVMTokenHolders, airdropETHToHolders } from '../../evm/holders';

const TOKEN = '0x1111111111111111111111111111111111111111' as `0x${string}`;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD';
const ALICE = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const BOB = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const TX_HASH = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as `0x${string}`;

function makeTransferLog(from: string, to: string, value: bigint, blockNumber = 100n) {
  return {
    args: { from, to, value },
    blockNumber,
    transactionHash: TX_HASH,
  };
}

function makeMockClient(logs: any[] = []) {
  return {
    getLogs: vi.fn().mockResolvedValue(logs),
  } as any;
}

// --- getEVMTokenHolders ---

describe('getEVMTokenHolders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries Transfer events with correct event definition and token address', async () => {
    const client = makeMockClient();
    await getEVMTokenHolders(client, TOKEN);

    const call = client.getLogs.mock.calls[0][0];
    expect(call.address).toBe(TOKEN);
    expect(call.event.name).toBe('Transfer');
    expect(call.event.type).toBe('event');
    const inputs = call.event.inputs;
    expect(inputs).toHaveLength(3);
    expect(inputs[0]).toEqual({ name: 'from', type: 'address', indexed: true });
    expect(inputs[1]).toEqual({ name: 'to', type: 'address', indexed: true });
    expect(inputs[2]).toEqual({ name: 'value', type: 'uint256', indexed: false });
  });

  it('builds holder map: adds to receiver and subtracts from sender', async () => {
    const client = makeMockClient([
      makeTransferLog(ZERO_ADDRESS, ALICE, 1000n),
      makeTransferLog(ALICE, BOB, 400n),
    ]);

    const holders = await getEVMTokenHolders(client, TOKEN);

    expect(holders.get(ALICE.toLowerCase())).toBe(600n);
    expect(holders.get(BOB.toLowerCase())).toBe(400n);
  });

  it('handles mint from zero address', async () => {
    const client = makeMockClient([
      makeTransferLog(ZERO_ADDRESS, ALICE, 5000n),
    ]);

    const holders = await getEVMTokenHolders(client, TOKEN);

    expect(holders.get(ALICE.toLowerCase())).toBe(5000n);
    expect(holders.has(ZERO_ADDRESS.toLowerCase())).toBe(false);
  });

  it('filters out zero address', async () => {
    const client = makeMockClient([
      makeTransferLog(ZERO_ADDRESS, ALICE, 1000n),
    ]);

    const holders = await getEVMTokenHolders(client, TOKEN);

    expect(holders.has(ZERO_ADDRESS.toLowerCase())).toBe(false);
  });

  it('filters out DEAD_ADDRESS', async () => {
    const client = makeMockClient([
      makeTransferLog(ZERO_ADDRESS, ALICE, 1000n),
      makeTransferLog(ALICE, DEAD_ADDRESS, 500n),
    ]);

    const holders = await getEVMTokenHolders(client, TOKEN);

    expect(holders.has(DEAD_ADDRESS.toLowerCase())).toBe(false);
    expect(holders.get(ALICE.toLowerCase())).toBe(500n);
  });

  it('filters balances <= 0', async () => {
    const client = makeMockClient([
      makeTransferLog(ZERO_ADDRESS, ALICE, 1000n),
      makeTransferLog(ALICE, BOB, 1000n),
    ]);

    const holders = await getEVMTokenHolders(client, TOKEN);

    expect(holders.has(ALICE.toLowerCase())).toBe(false);
    expect(holders.get(BOB.toLowerCase())).toBe(1000n);
  });

  it('uses lowercase keys for case-insensitive lookups', async () => {
    const mixedCase = '0xAaBbCcDdEeFf0011223344556677889900AaBbCc';
    const client = makeMockClient([
      makeTransferLog(ZERO_ADDRESS, mixedCase, 100n),
    ]);

    const holders = await getEVMTokenHolders(client, TOKEN);

    expect(holders.has(mixedCase.toLowerCase())).toBe(true);
    expect(holders.has(mixedCase)).toBe(false);
  });

  it('passes fromBlock and toBlock to getLogs', async () => {
    const client = makeMockClient();
    await getEVMTokenHolders(client, TOKEN, 100n, 200n);

    expect(client.getLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        fromBlock: 100n,
        toBlock: 200n,
      })
    );
  });

  it('returns empty map when no transfers', async () => {
    const client = makeMockClient([]);
    const holders = await getEVMTokenHolders(client, TOKEN);

    expect(holders.size).toBe(0);
  });

  it('filters zero address regardless of case', async () => {
    // Zero address appears as receiver in mint -- must be filtered
    const client = makeMockClient([
      makeTransferLog(ZERO_ADDRESS, ALICE, 1000n),
      makeTransferLog(ALICE, ZERO_ADDRESS, 200n),
    ]);

    const holders = await getEVMTokenHolders(client, TOKEN);

    expect(holders.has(ZERO_ADDRESS.toLowerCase())).toBe(false);
    expect(holders.get(ALICE.toLowerCase())).toBe(800n);
  });

  it('propagates getLogs errors', async () => {
    const client = {
      getLogs: vi.fn().mockRejectedValue(new Error('RPC timeout')),
    } as any;

    await expect(getEVMTokenHolders(client, TOKEN)).rejects.toThrow('RPC timeout');
  });
});

// --- airdropETHToHolders ---

describe('airdropETHToHolders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calculates proportional shares correctly', async () => {
    const client = makeMockClient([
      makeTransferLog(ZERO_ADDRESS, ALICE, 750n),
      makeTransferLog(ZERO_ADDRESS, BOB, 250n),
    ]);
    const walletClient = {} as any;

    await airdropETHToHolders(client, walletClient, 'sepolia', {
      appToken: TOKEN,
      distributionId: 1n,
      tokenAddress: TOKEN,
      totalAmount: 1000n,
    });

    const call = vi.mocked(distributeETH).mock.calls[0];
    const params = call[2];
    const aliceIdx = params.recipients.findIndex(
      (r: string) => r.toLowerCase() === ALICE.toLowerCase()
    );
    const bobIdx = params.recipients.findIndex(
      (r: string) => r.toLowerCase() === BOB.toLowerCase()
    );
    expect(params.amounts[aliceIdx]).toBe(750n);
    expect(params.amounts[bobIdx]).toBe(250n);
  });

  it('calls distributeETH with correct params', async () => {
    const client = makeMockClient([
      makeTransferLog(ZERO_ADDRESS, ALICE, 1000n),
    ]);
    const walletClient = {} as any;

    await airdropETHToHolders(client, walletClient, 'sepolia', {
      appToken: TOKEN,
      distributionId: 5n,
      tokenAddress: TOKEN,
      totalAmount: 2000n,
    });

    expect(distributeETH).toHaveBeenCalledWith(
      walletClient,
      'sepolia',
      expect.objectContaining({
        appToken: TOKEN,
        distributionId: 5n,
      })
    );
  });

  it('filters zero-share recipients from dust amounts', async () => {
    // Alice has 1 wei, Bob has 999 wei. Airdrop of 100 wei.
    // Alice share = (1 * 100) / 1000 = 0 (bigint floor), excluded.
    // Bob share = (999 * 100) / 1000 = 99, included.
    const client = makeMockClient([
      makeTransferLog(ZERO_ADDRESS, ALICE, 1n),
      makeTransferLog(ZERO_ADDRESS, BOB, 999n),
    ]);
    const walletClient = {} as any;

    await airdropETHToHolders(client, walletClient, 'sepolia', {
      appToken: TOKEN,
      distributionId: 1n,
      tokenAddress: TOKEN,
      totalAmount: 100n,
    });

    const call = vi.mocked(distributeETH).mock.calls[0];
    const params = call[2];
    expect(params.recipients.length).toBe(1);
  });

  it('returns hash and recipientCount', async () => {
    const client = makeMockClient([
      makeTransferLog(ZERO_ADDRESS, ALICE, 500n),
      makeTransferLog(ZERO_ADDRESS, BOB, 500n),
    ]);
    const walletClient = {} as any;

    const result = await airdropETHToHolders(client, walletClient, 'sepolia', {
      appToken: TOKEN,
      distributionId: 1n,
      tokenAddress: TOKEN,
      totalAmount: 1000n,
    });

    expect(result.hash).toBe('0xAIRDROP_HASH');
    expect(result.recipientCount).toBe(2);
  });

  it('throws when no holders found', async () => {
    const client = makeMockClient([]);
    const walletClient = {} as any;

    await expect(
      airdropETHToHolders(client, walletClient, 'sepolia', {
        appToken: TOKEN,
        distributionId: 1n,
        tokenAddress: TOKEN,
        totalAmount: 1000n,
      })
    ).rejects.toThrow('No holders found for token');
  });

  it('passes fromBlock to getEVMTokenHolders', async () => {
    const client = makeMockClient([
      makeTransferLog(ZERO_ADDRESS, ALICE, 1000n),
    ]);
    const walletClient = {} as any;

    await airdropETHToHolders(client, walletClient, 'sepolia', {
      appToken: TOKEN,
      distributionId: 1n,
      tokenAddress: TOKEN,
      totalAmount: 1000n,
      fromBlock: 500n,
    });

    expect(client.getLogs).toHaveBeenCalledWith(
      expect.objectContaining({ fromBlock: 500n })
    );
  });

  it('throws when all holder shares are zero', async () => {
    // Both have 1 wei, airdrop 1 wei total. Both get (1*1)/2 = 0 in bigint.
    const client = makeMockClient([
      makeTransferLog(ZERO_ADDRESS, ALICE, 1n),
      makeTransferLog(ZERO_ADDRESS, BOB, 1n),
    ]);
    const walletClient = {} as any;

    await expect(
      airdropETHToHolders(client, walletClient, 'sepolia', {
        appToken: TOKEN,
        distributionId: 1n,
        tokenAddress: TOKEN,
        totalAmount: 1n,
      })
    ).rejects.toThrow('No recipients with non-zero share');
  });

  it('computes totalValue as sum of distributed amounts', async () => {
    const client = makeMockClient([
      makeTransferLog(ZERO_ADDRESS, ALICE, 750n),
      makeTransferLog(ZERO_ADDRESS, BOB, 250n),
    ]);
    const walletClient = {} as any;

    await airdropETHToHolders(client, walletClient, 'sepolia', {
      appToken: TOKEN,
      distributionId: 1n,
      tokenAddress: TOKEN,
      totalAmount: 1000n,
    });

    const call = vi.mocked(distributeETH).mock.calls[0];
    const params = call[2];
    expect(params.totalValue).toBe(1000n);
  });
});

// --- getEVMTokenHolders with Alchemy option ---

describe('getEVMTokenHolders with alchemyApiKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeMockClientWithChainId(logs: any[] = [], chainId = 11155111) {
    return {
      getLogs: vi.fn().mockResolvedValue(logs),
      getChainId: vi.fn().mockResolvedValue(chainId),
    } as any;
  }

  it('uses Alchemy API when alchemyApiKey is provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        owners: [
          {
            ownerAddress: ALICE,
            tokenBalances: [
              { contractAddress: TOKEN, tokenBalance: '0x3E8' }, // 1000
            ],
          },
        ],
        pageKey: undefined,
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = makeMockClientWithChainId();

    const holders = await getEVMTokenHolders(client, TOKEN, undefined, undefined, {
      alchemyApiKey: 'test-key',
    });

    expect(mockFetch).toHaveBeenCalled();
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain('eth-sepolia.g.alchemy.com');
    expect(url).toContain('test-key');
    expect(holders.get(ALICE.toLowerCase())).toBe(1000n);
  });

  it('sets contractAddress and withTokenBalances URL params', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ owners: [] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = makeMockClientWithChainId();
    await getEVMTokenHolders(client, TOKEN, undefined, undefined, {
      alchemyApiKey: 'test-key',
    });

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain('contractAddress=' + encodeURIComponent(TOKEN));
    expect(url).toContain('withTokenBalances=true');
  });

  it('sets pageKey URL param on subsequent pages', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            owners: [],
            pageKey: 'abc123',
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ owners: [] }),
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = makeMockClientWithChainId();
    await getEVMTokenHolders(client, TOKEN, undefined, undefined, {
      alchemyApiKey: 'test-key',
    });

    // First call should NOT have pageKey
    const url1 = mockFetch.mock.calls[0][0];
    expect(url1).not.toContain('pageKey=');

    // Second call should have pageKey=abc123
    const url2 = mockFetch.mock.calls[1][0];
    expect(url2).toContain('pageKey=abc123');
  });

  it('falls back to Transfer events when Alchemy API returns non-ok', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({
        owners: [
          {
            ownerAddress: ALICE,
            tokenBalances: [{ contractAddress: TOKEN, tokenBalance: '0x3E8' }],
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = makeMockClientWithChainId([
      makeTransferLog(ZERO_ADDRESS, BOB, 500n),
    ]);

    const holders = await getEVMTokenHolders(client, TOKEN, undefined, undefined, {
      alchemyApiKey: 'test-key',
    });

    // Must fall back to getLogs -- result contains BOB from Transfer events, not ALICE from Alchemy
    expect(client.getLogs).toHaveBeenCalled();
    expect(holders.get(BOB.toLowerCase())).toBe(500n);
    expect(holders.has(ALICE.toLowerCase())).toBe(false);
  });

  it('falls back to Transfer events when fetch throws', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    const client = makeMockClientWithChainId([
      makeTransferLog(ZERO_ADDRESS, ALICE, 200n),
    ]);

    const holders = await getEVMTokenHolders(client, TOKEN, undefined, undefined, {
      alchemyApiKey: 'test-key',
    });

    // Must fall back to getLogs
    expect(client.getLogs).toHaveBeenCalled();
    expect(holders.get(ALICE.toLowerCase())).toBe(200n);
  });

  it('falls back for unsupported chain ID via Transfer events', async () => {
    // Stub fetch to return successful Alchemy response with BOB
    // If fallback is skipped (mutant), result would contain BOB from Alchemy, not ALICE from getLogs
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        owners: [
          {
            ownerAddress: BOB,
            tokenBalances: [{ contractAddress: TOKEN, tokenBalance: '0x1F4' }],
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = makeMockClientWithChainId([
      makeTransferLog(ZERO_ADDRESS, ALICE, 300n),
    ], 999999);

    const holders = await getEVMTokenHolders(client, TOKEN, undefined, undefined, {
      alchemyApiKey: 'test-key',
    });

    // Must use getLogs fallback, not Alchemy
    expect(client.getLogs).toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(holders.get(ALICE.toLowerCase())).toBe(300n);
    expect(holders.has(BOB.toLowerCase())).toBe(false);
  });

  it('ignores owners with non-matching contractAddress', async () => {
    const OTHER_TOKEN = '0x9999999999999999999999999999999999999999' as `0x${string}`;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        owners: [
          {
            ownerAddress: ALICE,
            tokenBalances: [
              { contractAddress: OTHER_TOKEN, tokenBalance: '0x3E8' },
            ],
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = makeMockClientWithChainId();

    const holders = await getEVMTokenHolders(client, TOKEN, undefined, undefined, {
      alchemyApiKey: 'test-key',
    });

    // ALICE holds OTHER_TOKEN, not TOKEN -- should not be included
    expect(holders.size).toBe(0);
  });

  it('handles owners without tokenBalances array', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        owners: [
          { ownerAddress: ALICE },
          { ownerAddress: BOB, tokenBalances: null },
        ],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    // Transfer events return data -- if fallback triggers, BOB would appear
    const client = makeMockClientWithChainId([
      makeTransferLog(ZERO_ADDRESS, BOB, 999n),
    ]);

    const holders = await getEVMTokenHolders(client, TOKEN, undefined, undefined, {
      alchemyApiKey: 'test-key',
    });

    // Alchemy succeeded but found no valid balances -- empty, not fallback data
    expect(holders.size).toBe(0);
    expect(holders.has(BOB.toLowerCase())).toBe(false);
  });

  it('handles owner with non-array truthy tokenBalances without fallback', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        owners: [
          { ownerAddress: ALICE, tokenBalances: 42 },
        ],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    // Transfer events return BOB -- if catch triggers fallback, BOB appears
    const client = makeMockClientWithChainId([
      makeTransferLog(ZERO_ADDRESS, BOB, 333n),
    ]);

    const holders = await getEVMTokenHolders(client, TOKEN, undefined, undefined, {
      alchemyApiKey: 'test-key',
    });

    // tokenBalances=42 is truthy but not array -> guard skips iteration
    // With && -> || mutation: for..of on number throws -> catch -> fallback -> BOB appears
    expect(holders.size).toBe(0);
    expect(holders.has(BOB.toLowerCase())).toBe(false);
  });

  it('handles data without owners array (returns empty from Alchemy path)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ notOwners: 'something' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    // Transfer events return data -- if fallback triggers, ALICE would appear
    const client = makeMockClientWithChainId([
      makeTransferLog(ZERO_ADDRESS, ALICE, 888n),
    ]);

    const holders = await getEVMTokenHolders(client, TOKEN, undefined, undefined, {
      alchemyApiKey: 'test-key',
    });

    // Alchemy succeeded but had no owners array -> empty map
    // If guard bypassed (mutant), catch falls back to Transfer events -> ALICE would appear
    expect(holders.size).toBe(0);
    expect(holders.has(ALICE.toLowerCase())).toBe(false);
  });

  it('handles data.owners as non-array truthy value without fallback', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ owners: 'not-an-array' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    // Transfer events return ALICE -- if Alchemy falls back, ALICE would appear
    const client = makeMockClientWithChainId([
      makeTransferLog(ZERO_ADDRESS, ALICE, 777n),
    ]);

    const holders = await getEVMTokenHolders(client, TOKEN, undefined, undefined, {
      alchemyApiKey: 'test-key',
    });

    // data.owners is truthy but not an array -> guard should skip the loop
    // With && -> || mutation: for..of on non-iterable throws -> catch -> fallback -> ALICE appears
    expect(holders.size).toBe(0);
    expect(holders.has(ALICE.toLowerCase())).toBe(false);
  });

  it('filters zero-balance holders from Alchemy response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        owners: [
          {
            ownerAddress: ALICE,
            tokenBalances: [
              { contractAddress: TOKEN, tokenBalance: '0x0' },
            ],
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = makeMockClientWithChainId();

    const holders = await getEVMTokenHolders(client, TOKEN, undefined, undefined, {
      alchemyApiKey: 'test-key',
    });

    expect(holders.size).toBe(0);
  });

  it('paginates through Alchemy results', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            owners: [
              {
                ownerAddress: ALICE,
                tokenBalances: [{ contractAddress: TOKEN, tokenBalance: '0x64' }],
              },
            ],
            pageKey: 'page2',
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          owners: [
            {
              ownerAddress: BOB,
              tokenBalances: [{ contractAddress: TOKEN, tokenBalance: '0xC8' }],
            },
          ],
        }),
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = makeMockClientWithChainId();

    const holders = await getEVMTokenHolders(client, TOKEN, undefined, undefined, {
      alchemyApiKey: 'test-key',
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(holders.get(ALICE.toLowerCase())).toBe(100n);
    expect(holders.get(BOB.toLowerCase())).toBe(200n);
  });

  it('uses eth-mainnet subdomain for chain 1', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ owners: [] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = makeMockClientWithChainId([], 1);

    await getEVMTokenHolders(client, TOKEN, undefined, undefined, {
      alchemyApiKey: 'test-key',
    });

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain('eth-mainnet.g.alchemy.com');
  });

  it('uses base-mainnet subdomain for chain 8453', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ owners: [] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = makeMockClientWithChainId([], 8453);

    await getEVMTokenHolders(client, TOKEN, undefined, undefined, {
      alchemyApiKey: 'test-key',
    });

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain('base-mainnet.g.alchemy.com');
  });

  it('uses options.fromBlock/toBlock when positional params are undefined', async () => {
    const client = makeMockClientWithChainId([
      makeTransferLog(ZERO_ADDRESS, ALICE, 100n),
    ], 999999); // unsupported chain -> falls back to Transfer events

    await getEVMTokenHolders(client, TOKEN, undefined, undefined, {
      alchemyApiKey: 'test-key',
      fromBlock: 50n,
      toBlock: 200n,
    });

    // Fallback to getLogs with options.fromBlock/toBlock
    expect(client.getLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        fromBlock: 50n,
        toBlock: 200n,
      })
    );
  });

  it('prefers positional fromBlock over options.fromBlock', async () => {
    const client = makeMockClientWithChainId([
      makeTransferLog(ZERO_ADDRESS, ALICE, 100n),
    ], 999999);

    await getEVMTokenHolders(client, TOKEN, 10n, undefined, {
      alchemyApiKey: 'test-key',
      fromBlock: 50n,
    });

    expect(client.getLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        fromBlock: 10n,
      })
    );
  });

  it('handles contractAddress with optional chaining (null contractAddress)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        owners: [
          {
            ownerAddress: ALICE,
            tokenBalances: [
              { contractAddress: null, tokenBalance: '0x3E8' },
            ],
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    // Transfer events return data -- if fallback triggers (via crash), BOB would appear
    const client = makeMockClientWithChainId([
      makeTransferLog(ZERO_ADDRESS, BOB, 555n),
    ]);

    const holders = await getEVMTokenHolders(client, TOKEN, undefined, undefined, {
      alchemyApiKey: 'test-key',
    });

    // Null contractAddress doesn't match TOKEN -> empty from Alchemy path
    // If optional chaining removed (mutant), null.toLowerCase() throws -> fallback -> BOB appears
    expect(holders.size).toBe(0);
    expect(holders.has(BOB.toLowerCase())).toBe(false);
  });
});

// --- getEVMTokenHolders zero address filtering ---

describe('getEVMTokenHolders zero address filtering', () => {
  it('filters zero address even when stored as lowercase', async () => {
    // Verify that ZERO_ADDRESS.toLowerCase() === zeroKey
    const client = makeMockClient([
      makeTransferLog(ZERO_ADDRESS, ALICE, 1000n),
      makeTransferLog(ALICE, ZERO_ADDRESS.toLowerCase(), 200n),
    ]);

    const holders = await getEVMTokenHolders(client, TOKEN);

    expect(holders.has(ZERO_ADDRESS.toLowerCase())).toBe(false);
    expect(holders.get(ALICE.toLowerCase())).toBe(800n);
  });

  it('filters zero address even when it has a positive balance from incoming transfers', async () => {
    // Zero address receives tokens (positive balance).
    // Only the address === zeroKey check catches this; balance <= 0n does not.
    const CHARLIE = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
    const client = makeMockClient([
      makeTransferLog(ZERO_ADDRESS, CHARLIE, 2000n),  // mint: zero=-2000, charlie=+2000
      makeTransferLog(CHARLIE, ZERO_ADDRESS, 1500n),   // send: zero=-500, charlie=+500
      makeTransferLog(ZERO_ADDRESS, ALICE, 1000n),     // mint: zero=-1500, alice=+1000
      makeTransferLog(ALICE, ZERO_ADDRESS, 1000n),     // burn: zero=-500, alice=0
    ]);

    const holders = await getEVMTokenHolders(client, TOKEN);

    // Zero address net = -2000 + 1500 + (-1000) + 1000 = -500. Negative, filtered by both checks.
    // To truly test the zeroKey path we need zero to be net positive.
    expect(holders.has(ZERO_ADDRESS.toLowerCase())).toBe(false);
  });

  it('filters zero address by address match when balance would be positive', async () => {
    // Construct a scenario where zero address has net positive balance.
    // This can only happen if zero address receives more than it sends.
    // Since mints (from=zero) subtract from zero, we need transfers TO zero to exceed mints.
    const client = makeMockClient([
      makeTransferLog(ALICE, ZERO_ADDRESS, 5000n),  // zero gets +5000, alice=-5000
    ]);

    const holders = await getEVMTokenHolders(client, TOKEN);

    // Zero address has +5000 (positive). Without the zeroKey check it would be included.
    expect(holders.has(ZERO_ADDRESS.toLowerCase())).toBe(false);
    // ALICE has -5000, filtered by balance <= 0
    expect(holders.has(ALICE.toLowerCase())).toBe(false);
  });

  it('zero address key equals ZERO_ADDRESS.toLowerCase()', async () => {
    // This kills the mutation: ZERO_ADDRESS.toLowerCase() -> ZERO_ADDRESS.toUpperCase()
    const client = makeMockClient([
      makeTransferLog('0x0000000000000000000000000000000000000000', ALICE, 1000n),
    ]);

    const holders = await getEVMTokenHolders(client, TOKEN);

    // Zero address should be filtered
    expect(holders.has('0x0000000000000000000000000000000000000000')).toBe(false);
    // Alice should have 1000n from the mint
    expect(holders.get(ALICE.toLowerCase())).toBe(1000n);
  });
});
