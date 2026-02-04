/**
 * Tests for src/evm/tokenGate.ts
 *
 * Public API under test:
 *   - new EVMTokenGate(config): constructs gate
 *   - gate.check(walletAddress): Promise<EVMGateResult>
 *   - gate.checkBatch(wallets): Promise<Map<string, EVMGateResult>>
 *   - gate.clearCache(): void
 *   - gate.clearCacheFor(wallet): void
 *   - gate.setMinAmount(amount): void
 *   - gate.getTokenInfo(): { tokenAddress, minAmount }
 *
 * Behavioral contracts:
 *   - Constructor throws for 'solana' network
 *   - check returns { allowed: true } when balance >= minAmount
 *   - check returns { allowed: false } when balance < minAmount
 *   - check returns correct balance and required values
 *   - check caches results for cacheTtlMs duration
 *   - check uses lowercase wallet address as cache key
 *   - clearCache removes all cached results
 *   - clearCacheFor removes cache for specific wallet (case insensitive)
 *   - setMinAmount changes threshold; subsequent checks use new threshold
 *   - getTokenInfo returns current config
 *   - checkBatch returns results for all wallets
 *
 * Mocking boundary: viem createPublicClient + readContract (network I/O)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock viem to prevent real network calls
vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...actual,
    createPublicClient: vi.fn().mockReturnValue({
      readContract: vi.fn(),
      chain: { id: 11155111, name: 'Sepolia' },
    }),
  };
});

import { createPublicClient } from 'viem';
import { EVMTokenGate } from '../../evm/tokenGate';

const TOKEN_ADDR = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as `0x${string}`;
const WALLET_A = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const WALLET_B = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';

function getMockReadContract() {
  const mockClient = vi.mocked(createPublicClient).mock.results[0]?.value;
  return mockClient?.readContract as ReturnType<typeof vi.fn>;
}

describe('EVMTokenGate constructor', () => {
  beforeEach(() => {
    vi.mocked(createPublicClient).mockReturnValue({
      readContract: vi.fn(),
      chain: { id: 11155111, name: 'Sepolia' },
    } as any);
  });

  it('throws for solana network', () => {
    expect(
      () =>
        new EVMTokenGate({
          tokenAddress: TOKEN_ADDR,
          minAmount: BigInt(100),
          networkId: 'solana',
        }),
    ).toThrow('EVMTokenGate cannot be used with Solana network');
  });

  it('creates gate for sepolia', () => {
    const gate = new EVMTokenGate({
      tokenAddress: TOKEN_ADDR,
      minAmount: BigInt(100),
      networkId: 'sepolia',
    });
    expect(gate.getTokenInfo().tokenAddress).toBe(TOKEN_ADDR);
  });

  it('creates gate for base', () => {
    const gate = new EVMTokenGate({
      tokenAddress: TOKEN_ADDR,
      minAmount: BigInt(100),
      networkId: 'base',
    });
    expect(gate.getTokenInfo().minAmount).toBe(BigInt(100));
  });
});

describe('EVMTokenGate.check', () => {
  let gate: EVMTokenGate;
  let readContract: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    readContract = vi.fn();
    vi.mocked(createPublicClient).mockReturnValue({
      readContract,
      chain: { id: 11155111, name: 'Sepolia' },
    } as any);

    gate = new EVMTokenGate({
      tokenAddress: TOKEN_ADDR,
      minAmount: BigInt(1000),
      networkId: 'sepolia',
      cacheTtlMs: 5000,
    });
  });

  it('returns allowed=true when balance >= minAmount', async () => {
    readContract.mockResolvedValue(BigInt(1000));

    const result = await gate.check(WALLET_A);

    expect(result.allowed).toBe(true);
    expect(result.balance).toBe(BigInt(1000));
    expect(result.required).toBe(BigInt(1000));
  });

  it('returns allowed=true when balance exceeds minAmount', async () => {
    readContract.mockResolvedValue(BigInt(9999));

    const result = await gate.check(WALLET_A);

    expect(result.allowed).toBe(true);
    expect(result.balance).toBe(BigInt(9999));
  });

  it('returns allowed=false when balance < minAmount', async () => {
    readContract.mockResolvedValue(BigInt(999));

    const result = await gate.check(WALLET_A);

    expect(result.allowed).toBe(false);
    expect(result.balance).toBe(BigInt(999));
    expect(result.required).toBe(BigInt(1000));
  });

  it('returns allowed=false when balance is zero', async () => {
    readContract.mockResolvedValue(BigInt(0));

    const result = await gate.check(WALLET_A);

    expect(result.allowed).toBe(false);
    expect(result.balance).toBe(BigInt(0));
  });

  it('message indicates access granted when allowed', async () => {
    readContract.mockResolvedValue(BigInt(1000));

    const result = await gate.check(WALLET_A);
    expect(result.message).toBe('Access granted');
  });

  it('message indicates insufficient balance when denied', async () => {
    readContract.mockResolvedValue(BigInt(500));

    const result = await gate.check(WALLET_A);
    expect(result.message).toContain('Insufficient balance');
    expect(result.message).toContain('500');
    expect(result.message).toContain('1000');
  });

  // --- Caching ---

  it('returns cached result on second call within TTL', async () => {
    readContract.mockResolvedValue(BigInt(1000));

    await gate.check(WALLET_A);
    await gate.check(WALLET_A);

    // readContract should only be called once due to caching
    expect(readContract).toHaveBeenCalledTimes(1);
  });

  it('cache key is case-insensitive', async () => {
    readContract.mockResolvedValue(BigInt(1000));

    await gate.check(WALLET_A);
    await gate.check(WALLET_A.toLowerCase());

    expect(readContract).toHaveBeenCalledTimes(1);
  });

  it('does not cache across different wallets', async () => {
    readContract.mockResolvedValue(BigInt(1000));

    await gate.check(WALLET_A);
    await gate.check(WALLET_B);

    expect(readContract).toHaveBeenCalledTimes(2);
  });

  it('refreshes cache after TTL expires', async () => {
    vi.useFakeTimers();

    readContract.mockResolvedValue(BigInt(1000));
    await gate.check(WALLET_A);

    // Advance past TTL
    vi.advanceTimersByTime(6000);

    readContract.mockResolvedValue(BigInt(2000));
    const result = await gate.check(WALLET_A);

    expect(readContract).toHaveBeenCalledTimes(2);
    expect(result.balance).toBe(BigInt(2000));

    vi.useRealTimers();
  });

  it('uses cache at exactly TTL-1 ms (boundary: still valid)', async () => {
    vi.useFakeTimers();

    readContract.mockResolvedValue(BigInt(1000));
    await gate.check(WALLET_A);

    // Advance to exactly TTL - 1 ms (should still use cache)
    vi.advanceTimersByTime(4999);

    await gate.check(WALLET_A);
    expect(readContract).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('re-fetches at exactly TTL ms (boundary: expired)', async () => {
    vi.useFakeTimers();

    readContract.mockResolvedValue(BigInt(1000));
    await gate.check(WALLET_A);

    // Advance to exactly TTL (should expire and re-fetch)
    vi.advanceTimersByTime(5000);

    readContract.mockResolvedValue(BigInt(2000));
    const result = await gate.check(WALLET_A);
    expect(readContract).toHaveBeenCalledTimes(2);
    expect(result.balance).toBe(BigInt(2000));

    vi.useRealTimers();
  });
});

describe('EVMTokenGate.clearCache', () => {
  let gate: EVMTokenGate;
  let readContract: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    readContract = vi.fn().mockResolvedValue(BigInt(1000));
    vi.mocked(createPublicClient).mockReturnValue({
      readContract,
      chain: { id: 11155111, name: 'Sepolia' },
    } as any);

    gate = new EVMTokenGate({
      tokenAddress: TOKEN_ADDR,
      minAmount: BigInt(1000),
      networkId: 'sepolia',
    });
  });

  it('forces re-fetch after clearCache', async () => {
    await gate.check(WALLET_A);
    gate.clearCache();
    await gate.check(WALLET_A);

    expect(readContract).toHaveBeenCalledTimes(2);
  });
});

describe('EVMTokenGate.clearCacheFor', () => {
  let gate: EVMTokenGate;
  let readContract: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    readContract = vi.fn().mockResolvedValue(BigInt(1000));
    vi.mocked(createPublicClient).mockReturnValue({
      readContract,
      chain: { id: 11155111, name: 'Sepolia' },
    } as any);

    gate = new EVMTokenGate({
      tokenAddress: TOKEN_ADDR,
      minAmount: BigInt(1000),
      networkId: 'sepolia',
    });
  });

  it('clears cache for specific wallet only', async () => {
    await gate.check(WALLET_A);
    await gate.check(WALLET_B);

    gate.clearCacheFor(WALLET_A);

    await gate.check(WALLET_A); // should re-fetch
    await gate.check(WALLET_B); // should use cache

    // 2 initial + 1 re-fetch for WALLET_A = 3
    expect(readContract).toHaveBeenCalledTimes(3);
  });

  it('clearCacheFor is case-insensitive', async () => {
    await gate.check(WALLET_A);
    gate.clearCacheFor(WALLET_A.toUpperCase());
    await gate.check(WALLET_A);

    expect(readContract).toHaveBeenCalledTimes(2);
  });
});

describe('EVMTokenGate.setMinAmount', () => {
  let gate: EVMTokenGate;
  let readContract: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    readContract = vi.fn().mockResolvedValue(BigInt(500));
    vi.mocked(createPublicClient).mockReturnValue({
      readContract,
      chain: { id: 11155111, name: 'Sepolia' },
    } as any);

    gate = new EVMTokenGate({
      tokenAddress: TOKEN_ADDR,
      minAmount: BigInt(1000),
      networkId: 'sepolia',
    });
  });

  it('updates the threshold for future checks', async () => {
    // Balance is 500, min is 1000 -> denied
    const before = await gate.check(WALLET_A);
    expect(before.allowed).toBe(false);

    // Lower threshold to 500 -> allowed
    gate.setMinAmount(BigInt(500));
    gate.clearCache();
    const after = await gate.check(WALLET_A);
    expect(after.allowed).toBe(true);
    expect(after.required).toBe(BigInt(500));
  });

  it('getTokenInfo reflects new minAmount', () => {
    gate.setMinAmount(BigInt(42));
    expect(gate.getTokenInfo().minAmount).toBe(BigInt(42));
  });
});

describe('EVMTokenGate.getTokenInfo', () => {
  it('returns tokenAddress and minAmount from config', () => {
    vi.mocked(createPublicClient).mockReturnValue({
      readContract: vi.fn(),
      chain: { id: 11155111, name: 'Sepolia' },
    } as any);

    const gate = new EVMTokenGate({
      tokenAddress: TOKEN_ADDR,
      minAmount: BigInt(777),
      networkId: 'sepolia',
    });

    const info = gate.getTokenInfo();
    expect(info.tokenAddress).toBe(TOKEN_ADDR);
    expect(info.minAmount).toBe(BigInt(777));
  });
});

describe('EVMTokenGate.checkBatch', () => {
  let gate: EVMTokenGate;
  let readContract: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    readContract = vi.fn();
    vi.mocked(createPublicClient).mockReturnValue({
      readContract,
      chain: { id: 11155111, name: 'Sepolia' },
    } as any);

    gate = new EVMTokenGate({
      tokenAddress: TOKEN_ADDR,
      minAmount: BigInt(100),
      networkId: 'sepolia',
    });
  });

  it('returns results for all wallets in the batch', async () => {
    readContract
      .mockResolvedValueOnce(BigInt(200)) // WALLET_A: allowed
      .mockResolvedValueOnce(BigInt(50)); // WALLET_B: denied

    const results = await gate.checkBatch([WALLET_A, WALLET_B]);

    expect(results.size).toBe(2);
    expect(results.get(WALLET_A)!.allowed).toBe(true);
    expect(results.get(WALLET_B)!.allowed).toBe(false);
  });

  it('returns empty map for empty input', async () => {
    const results = await gate.checkBatch([]);
    expect(results.size).toBe(0);
    expect(readContract).not.toHaveBeenCalled();
  });

  it('populates cache for individual checks', async () => {
    readContract.mockResolvedValue(BigInt(200));

    await gate.checkBatch([WALLET_A]);
    await gate.check(WALLET_A); // should hit cache

    expect(readContract).toHaveBeenCalledTimes(1);
  });
});
