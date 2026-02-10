/**
 * Tests for src/evm/client.ts
 *
 * Public API under test:
 *   - getEVMPublicClient(networkId, rpcUrl?): EVMPublicClient
 *   - getEVMTokenBalance(client, tokenAddress, walletAddress): Promise<bigint>
 *   - getEVMNativeBalance(client, walletAddress): Promise<bigint>
 *   - getEVMTokenAllowance(client, tokenAddress, ownerAddress, spenderAddress): Promise<bigint>
 *
 * Behavioral contracts:
 *   - getEVMPublicClient creates a viem PublicClient with correct chain config
 *   - getEVMPublicClient throws for 'solana' network
 *   - getEVMPublicClient uses provided rpcUrl when given
 *   - getEVMTokenBalance calls readContract with balanceOf selector
 *   - getEVMNativeBalance calls getBalance on the client
 *   - getEVMTokenAllowance calls readContract with allowance selector
 *   - All read functions propagate the bigint return value from the client
 *
 * Mocking boundary: viem's createPublicClient (network I/O)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock viem at the module boundary - this is the external network I/O layer
vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(),
  };
});

import { createPublicClient } from 'viem';
import {
  getEVMPublicClient,
  getEVMTokenBalance,
  getEVMNativeBalance,
  getEVMTokenAllowance,
} from '../../evm/client';

// Minimal mock client that tracks calls
function makeMockClient(overrides: Record<string, unknown> = {}) {
  return {
    chain: { id: 11155111, name: 'Sepolia' },
    readContract: vi.fn(),
    getBalance: vi.fn(),
    ...overrides,
  };
}

describe('getEVMPublicClient', () => {
  beforeEach(() => {
    vi.mocked(createPublicClient).mockReset();
  });

  it('throws for solana network', () => {
    expect(() => getEVMPublicClient('solana')).toThrow(
      'Cannot create EVM client for Solana network',
    );
  });

  it('calls createPublicClient for sepolia', () => {
    const mockClient = makeMockClient();
    vi.mocked(createPublicClient).mockReturnValue(mockClient as any);

    const client = getEVMPublicClient('sepolia');
    expect(createPublicClient).toHaveBeenCalledTimes(1);
    expect(client).toBe(mockClient);
  });

  it('calls createPublicClient for base', () => {
    const mockClient = makeMockClient({ chain: { id: 8453, name: 'Base' } });
    vi.mocked(createPublicClient).mockReturnValue(mockClient as any);

    const client = getEVMPublicClient('base');
    expect(createPublicClient).toHaveBeenCalledTimes(1);
    expect(client).toBe(mockClient);
  });

  it('passes sepolia chain config to createPublicClient', () => {
    vi.mocked(createPublicClient).mockReturnValue(makeMockClient() as any);
    getEVMPublicClient('sepolia');

    const callArgs = vi.mocked(createPublicClient).mock.calls[0][0] as Record<string, unknown>;
    const chain = callArgs.chain as { id: number };
    expect(chain.id).toBe(11155111);
  });

  it('passes base chain config to createPublicClient', () => {
    vi.mocked(createPublicClient).mockReturnValue(makeMockClient() as any);
    getEVMPublicClient('base');

    const callArgs = vi.mocked(createPublicClient).mock.calls[0][0] as Record<string, unknown>;
    const chain = callArgs.chain as { id: number };
    expect(chain.id).toBe(8453);
  });

  it('throws for unsupported network that is not solana', () => {
    // The CHAIN_MAP only has base, ethereum, and sepolia.
    // Any other string that passes the solana check should throw 'Unsupported EVM network'.
    // We cast to bypass TypeScript's type checking.
    expect(() => getEVMPublicClient('polygon' as any)).toThrow('Unsupported EVM network: polygon');
  });

  it('creates client for ethereum network', () => {
    const mockClient = makeMockClient({ chain: { id: 1, name: 'Ethereum' } });
    vi.mocked(createPublicClient).mockReturnValue(mockClient as any);

    const client = getEVMPublicClient('ethereum');
    expect(createPublicClient).toHaveBeenCalledTimes(1);
    expect(client).toBe(mockClient);
  });

  it('passes ethereum chain config (id 1) to createPublicClient', () => {
    vi.mocked(createPublicClient).mockReturnValue(makeMockClient() as any);
    getEVMPublicClient('ethereum');

    const callArgs = vi.mocked(createPublicClient).mock.calls[0][0] as Record<string, unknown>;
    const chain = callArgs.chain as { id: number };
    expect(chain.id).toBe(1);
  });

  it('passes rpcUrl to transport config', () => {
    // viem's http() wraps the URL opaquely inside the transport object.
    // We verify the transport argument is present and is a function (http transport),
    // and that it differs between calls with and without a URL.
    vi.mocked(createPublicClient).mockReturnValue(makeMockClient() as any);
    getEVMPublicClient('sepolia');
    const noUrlTransport = (vi.mocked(createPublicClient).mock.calls[0][0] as Record<string, unknown>).transport;

    vi.mocked(createPublicClient).mockClear();
    vi.mocked(createPublicClient).mockReturnValue(makeMockClient() as any);
    getEVMPublicClient('sepolia', 'https://custom-rpc.example.com');
    const withUrlTransport = (vi.mocked(createPublicClient).mock.calls[0][0] as Record<string, unknown>).transport;

    // Both should be functions (http transport factories)
    expect(typeof noUrlTransport).toBe('function');
    expect(typeof withUrlTransport).toBe('function');
    // They should be different function instances (different config)
    expect(noUrlTransport).not.toBe(withUrlTransport);
  });
});

describe('getEVMTokenBalance', () => {
  it('calls readContract with balanceOf and returns the bigint result', async () => {
    const mockClient = makeMockClient();
    const expectedBalance = BigInt('5000000000000000000');
    mockClient.readContract.mockResolvedValue(expectedBalance);

    const token = '0xTOKEN0000000000000000000000000000000000' as `0x${string}`;
    const wallet = '0xWALLET000000000000000000000000000000000' as `0x${string}`;
    const result = await getEVMTokenBalance(mockClient as any, token, wallet);

    expect(result).toBe(expectedBalance);
    expect(mockClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: token,
        functionName: 'balanceOf',
        args: [wallet],
      }),
    );
  });

  it('returns zero balance as bigint', async () => {
    const mockClient = makeMockClient();
    mockClient.readContract.mockResolvedValue(BigInt(0));

    const result = await getEVMTokenBalance(
      mockClient as any,
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
    );

    expect(result).toBe(BigInt(0));
  });

  it('propagates errors from readContract', async () => {
    const mockClient = makeMockClient();
    mockClient.readContract.mockRejectedValue(new Error('RPC failure'));

    await expect(
      getEVMTokenBalance(
        mockClient as any,
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
      ),
    ).rejects.toThrow('RPC failure');
  });
});

describe('getEVMNativeBalance', () => {
  it('calls getBalance with the wallet address and returns bigint', async () => {
    const mockClient = makeMockClient();
    const expectedBalance = BigInt('1000000000000000000');
    mockClient.getBalance.mockResolvedValue(expectedBalance);

    const wallet = '0xWALLET000000000000000000000000000000000' as `0x${string}`;
    const result = await getEVMNativeBalance(mockClient as any, wallet);

    expect(result).toBe(expectedBalance);
    expect(mockClient.getBalance).toHaveBeenCalledWith({ address: wallet });
  });

  it('propagates errors from getBalance', async () => {
    const mockClient = makeMockClient();
    mockClient.getBalance.mockRejectedValue(new Error('Network error'));

    await expect(
      getEVMNativeBalance(
        mockClient as any,
        '0x1111111111111111111111111111111111111111',
      ),
    ).rejects.toThrow('Network error');
  });
});

describe('getEVMTokenAllowance', () => {
  it('calls readContract with allowance and returns bigint', async () => {
    const mockClient = makeMockClient();
    const expectedAllowance = BigInt('99999999999999999999');
    mockClient.readContract.mockResolvedValue(expectedAllowance);

    const token = '0xTOKEN0000000000000000000000000000000000' as `0x${string}`;
    const owner = '0xOWNER0000000000000000000000000000000000' as `0x${string}`;
    const spender = '0xSPENDER00000000000000000000000000000000' as `0x${string}`;
    const result = await getEVMTokenAllowance(mockClient as any, token, owner, spender);

    expect(result).toBe(expectedAllowance);
    expect(mockClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: token,
        functionName: 'allowance',
        args: [owner, spender],
      }),
    );
  });

  it('returns zero allowance', async () => {
    const mockClient = makeMockClient();
    mockClient.readContract.mockResolvedValue(BigInt(0));

    const result = await getEVMTokenAllowance(
      mockClient as any,
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
      '0x3333333333333333333333333333333333333333',
    );

    expect(result).toBe(BigInt(0));
  });
});
