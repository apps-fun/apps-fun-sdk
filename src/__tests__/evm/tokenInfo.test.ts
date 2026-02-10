/**
 * Tests for src/evm/tokenInfo.ts
 *
 * Public API under test:
 *   - getEVMCanGraduate(client, networkId, tokenAddress): Promise<boolean>
 *   - getEVMPairInfo(client, networkId, tokenAddress): Promise<{ pair, creator }>
 *   - getEVMTokenDecimals(client, tokenAddress): Promise<number>
 *   - getEVMTokenTotalSupply(client, tokenAddress): Promise<bigint>
 *
 * Behavioral contracts:
 *   - getEVMCanGraduate calls readContract on appsFun with APPS_FUN_ABI and 'canGraduate'
 *   - getEVMPairInfo calls readContract on appsFun with APPS_FUN_ABI and 'getPair'
 *   - getEVMPairInfo destructures tuple into { pair, creator }
 *   - getEVMTokenDecimals calls readContract on token address with ERC20_ABI and 'decimals'
 *   - getEVMTokenTotalSupply calls readContract on token address with ERC20_ABI and 'totalSupply'
 *   - AppsFun reads throw for unconfigured networks
 *   - All propagate RPC errors
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../evm/contracts', () => ({
  getEVMContracts: vi.fn(),
}));

import { getEVMContracts } from '../../evm/contracts';
import { APPS_FUN_ABI, ERC20_ABI } from '../../evm/abis';
import {
  getEVMCanGraduate,
  getEVMPairInfo,
  getEVMTokenDecimals,
  getEVMTokenTotalSupply,
} from '../../evm/tokenInfo';

const APPS_FUN_ADDR = '0x6EF2633D87D5DD63ae1eB5518297093039BC33E6' as `0x${string}`;
const TOKEN = '0x1111111111111111111111111111111111111111' as `0x${string}`;
const PAIR_ADDR = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as `0x${string}`;
const CREATOR_ADDR = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as `0x${string}`;

function mockContracts() {
  vi.mocked(getEVMContracts).mockReturnValue({
    appsFun: APPS_FUN_ADDR,
    feeHolder: '0x4fF4974Ae5Bfe5E53aCC35E3Aaad919CD599c98d' as `0x${string}`,
    multiSend: '0x4C045926ac9A0dEf7F2b9ad43A1C230a111FeDCA' as `0x${string}`,
  });
}

function makeMockClient() {
  return {
    readContract: vi.fn(),
  } as any;
}

// --- getEVMCanGraduate ---

describe('getEVMCanGraduate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContracts();
  });

  it('returns true when contract returns true', async () => {
    const client = makeMockClient();
    client.readContract.mockResolvedValue(true);

    const result = await getEVMCanGraduate(client, 'sepolia', TOKEN);
    expect(result).toBe(true);
  });

  it('returns false when contract returns false', async () => {
    const client = makeMockClient();
    client.readContract.mockResolvedValue(false);

    const result = await getEVMCanGraduate(client, 'sepolia', TOKEN);
    expect(result).toBe(false);
  });

  it('throws for unconfigured network', async () => {
    vi.mocked(getEVMContracts).mockReturnValue(null);
    const client = makeMockClient();

    await expect(
      getEVMCanGraduate(client, 'solana', TOKEN)
    ).rejects.toThrow('EVM contracts not configured for network: solana');
  });

  it('passes correct address, abi, functionName, and args to readContract', async () => {
    const client = makeMockClient();
    client.readContract.mockResolvedValue(true);

    await getEVMCanGraduate(client, 'sepolia', TOKEN);

    expect(client.readContract).toHaveBeenCalledWith({
      address: APPS_FUN_ADDR,
      abi: APPS_FUN_ABI,
      functionName: 'canGraduate',
      args: [TOKEN],
    });
  });

  it('propagates RPC errors', async () => {
    const client = makeMockClient();
    client.readContract.mockRejectedValue(new Error('Contract reverted'));

    await expect(
      getEVMCanGraduate(client, 'sepolia', TOKEN)
    ).rejects.toThrow('Contract reverted');
  });
});

// --- getEVMPairInfo ---

describe('getEVMPairInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContracts();
  });

  it('returns pair and creator from tuple result', async () => {
    const client = makeMockClient();
    client.readContract.mockResolvedValue([PAIR_ADDR, CREATOR_ADDR]);

    const result = await getEVMPairInfo(client, 'sepolia', TOKEN);
    expect(result.pair).toBe(PAIR_ADDR);
    expect(result.creator).toBe(CREATOR_ADDR);
  });

  it('passes token address to args', async () => {
    const client = makeMockClient();
    client.readContract.mockResolvedValue([PAIR_ADDR, CREATOR_ADDR]);

    await getEVMPairInfo(client, 'sepolia', TOKEN);

    expect(client.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'getPair',
        args: [TOKEN],
      })
    );
  });

  it('throws for unconfigured network', async () => {
    vi.mocked(getEVMContracts).mockReturnValue(null);
    const client = makeMockClient();

    await expect(
      getEVMPairInfo(client, 'solana', TOKEN)
    ).rejects.toThrow('EVM contracts not configured for network: solana');
  });

  it('uses appsFun contract address', async () => {
    const client = makeMockClient();
    client.readContract.mockResolvedValue([PAIR_ADDR, CREATOR_ADDR]);

    await getEVMPairInfo(client, 'sepolia', TOKEN);

    expect(client.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: APPS_FUN_ADDR,
        abi: APPS_FUN_ABI,
      })
    );
  });

  it('propagates RPC errors', async () => {
    const client = makeMockClient();
    client.readContract.mockRejectedValue(new Error('execution reverted'));

    await expect(
      getEVMPairInfo(client, 'sepolia', TOKEN)
    ).rejects.toThrow('execution reverted');
  });
});

// --- getEVMTokenDecimals ---

describe('getEVMTokenDecimals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns number from readContract', async () => {
    const client = makeMockClient();
    client.readContract.mockResolvedValue(18);

    const result = await getEVMTokenDecimals(client, TOKEN);
    expect(result).toBe(18);
  });

  it('returns 6 for USDC-style tokens', async () => {
    const client = makeMockClient();
    client.readContract.mockResolvedValue(6);

    const result = await getEVMTokenDecimals(client, TOKEN);
    expect(result).toBe(6);
  });

  it('passes token address and ERC20 ABI to readContract', async () => {
    const client = makeMockClient();
    client.readContract.mockResolvedValue(18);

    await getEVMTokenDecimals(client, TOKEN);

    expect(client.readContract).toHaveBeenCalledWith({
      address: TOKEN,
      abi: ERC20_ABI,
      functionName: 'decimals',
      args: [],
    });
  });

  it('propagates errors', async () => {
    const client = makeMockClient();
    client.readContract.mockRejectedValue(new Error('not a contract'));

    await expect(
      getEVMTokenDecimals(client, TOKEN)
    ).rejects.toThrow('not a contract');
  });
});

// --- getEVMTokenTotalSupply ---

describe('getEVMTokenTotalSupply', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns bigint from readContract', async () => {
    const client = makeMockClient();
    client.readContract.mockResolvedValue(1000000000000000000000000n);

    const result = await getEVMTokenTotalSupply(client, TOKEN);
    expect(result).toBe(1000000000000000000000000n);
  });

  it('passes token address and ERC20 ABI to readContract', async () => {
    const client = makeMockClient();
    client.readContract.mockResolvedValue(0n);

    await getEVMTokenTotalSupply(client, TOKEN);

    expect(client.readContract).toHaveBeenCalledWith({
      address: TOKEN,
      abi: ERC20_ABI,
      functionName: 'totalSupply',
      args: [],
    });
  });

  it('returns 0n for tokens with zero supply', async () => {
    const client = makeMockClient();
    client.readContract.mockResolvedValue(0n);

    const result = await getEVMTokenTotalSupply(client, TOKEN);
    expect(result).toBe(0n);
  });

  it('propagates errors', async () => {
    const client = makeMockClient();
    client.readContract.mockRejectedValue(new Error('rpc timeout'));

    await expect(
      getEVMTokenTotalSupply(client, TOKEN)
    ).rejects.toThrow('rpc timeout');
  });
});
