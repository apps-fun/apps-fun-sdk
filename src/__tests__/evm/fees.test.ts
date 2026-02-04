/**
 * Tests for src/evm/fees.ts
 *
 * Public API under test:
 *   - getEVMCreatorFees(client, networkId, creatorAddress): Promise<bigint>
 *   - claimEVMFees(walletClient, networkId): Promise<{ hash }>
 *   - claimEVMLPFees(walletClient, networkId, tokenAddress): Promise<{ hash }>
 *
 * Behavioral contracts:
 *   - getEVMCreatorFees reads creatorFees from FeeHolder contract
 *   - claimEVMFees calls claimFees on FeeHolder contract
 *   - claimEVMLPFees calls claimLPFees with token address on FeeHolder contract
 *   - All throw for unconfigured networks (solana)
 *   - claimEVMFees and claimEVMLPFees throw for unsupported EVM network if chain not in map
 *   - Fee holder address comes from getEVMContracts
 *
 * Mocking boundary: viem client readContract/writeContract (network I/O)
 */

import { describe, it, expect, vi } from 'vitest';
import { getEVMCreatorFees, claimEVMFees, claimEVMLPFees } from '../../evm/fees';
import type { EVMPublicClient } from '../../evm/client';

const CREATOR_ADDR = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as `0x${string}`;
const TOKEN_ADDR = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as `0x${string}`;
const TX_HASH = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as `0x${string}`;
const ACCOUNT_ADDR = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC' as `0x${string}`;

function makeMockPublicClient() {
  return {
    readContract: vi.fn(),
    chain: { id: 11155111, name: 'Sepolia' },
  } as unknown as EVMPublicClient;
}

function makeMockWalletClient() {
  return {
    writeContract: vi.fn().mockResolvedValue(TX_HASH),
    account: { address: ACCOUNT_ADDR },
  } as any;
}

// ============================================================
// getEVMCreatorFees
// ============================================================

describe('getEVMCreatorFees', () => {
  it('throws for solana network', async () => {
    const client = makeMockPublicClient();
    await expect(
      getEVMCreatorFees(client, 'solana', CREATOR_ADDR),
    ).rejects.toThrow('EVM contracts not configured for network: solana');
  });

  it('calls creatorFees on feeHolder contract with creator address', async () => {
    const client = makeMockPublicClient();
    const expectedFees = BigInt('500000000000000000'); // 0.5 ETH
    (client.readContract as ReturnType<typeof vi.fn>).mockResolvedValue(expectedFees);

    const result = await getEVMCreatorFees(client, 'sepolia', CREATOR_ADDR);

    expect(result).toBe(expectedFees);
    expect(client.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'creatorFees',
        args: [CREATOR_ADDR],
      }),
    );
  });

  it('returns zero fees', async () => {
    const client = makeMockPublicClient();
    (client.readContract as ReturnType<typeof vi.fn>).mockResolvedValue(BigInt(0));

    const result = await getEVMCreatorFees(client, 'sepolia', CREATOR_ADDR);
    expect(result).toBe(BigInt(0));
  });

  it('uses feeHolder address from contracts config', async () => {
    const client = makeMockPublicClient();
    (client.readContract as ReturnType<typeof vi.fn>).mockResolvedValue(BigInt(0));

    await getEVMCreatorFees(client, 'sepolia', CREATOR_ADDR);

    const callArgs = (client.readContract as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // Should be the feeHolder address
    expect(callArgs.address).toBe('0x36618900De93aAB3a9C765d39BC582F74120F403');
  });

  it('propagates RPC errors', async () => {
    const client = makeMockPublicClient();
    (client.readContract as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Contract reverted'),
    );

    await expect(
      getEVMCreatorFees(client, 'sepolia', CREATOR_ADDR),
    ).rejects.toThrow('Contract reverted');
  });
});

// ============================================================
// claimEVMFees
// ============================================================

describe('claimEVMFees', () => {
  it('throws for solana network', async () => {
    const wallet = makeMockWalletClient();
    await expect(claimEVMFees(wallet, 'solana')).rejects.toThrow(
      'EVM contracts not configured',
    );
  });

  it('calls claimFees on feeHolder and returns hash', async () => {
    const wallet = makeMockWalletClient();

    const result = await claimEVMFees(wallet, 'sepolia');

    expect(result.hash).toBe(TX_HASH);
    expect(wallet.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'claimFees',
        args: [],
      }),
    );
  });

  it('uses feeHolder address from contracts config', async () => {
    const wallet = makeMockWalletClient();

    await claimEVMFees(wallet, 'sepolia');

    const callArgs = wallet.writeContract.mock.calls[0][0];
    expect(callArgs.address).toBe('0x36618900De93aAB3a9C765d39BC582F74120F403');
  });

  it('passes account from wallet client', async () => {
    const wallet = makeMockWalletClient();

    await claimEVMFees(wallet, 'sepolia');

    const callArgs = wallet.writeContract.mock.calls[0][0];
    expect(callArgs.account.address).toBe(ACCOUNT_ADDR);
  });

  it('works with base network', async () => {
    const wallet = makeMockWalletClient();

    const result = await claimEVMFees(wallet, 'base');
    expect(result.hash).toBe(TX_HASH);
  });
});

// ============================================================
// claimEVMLPFees
// ============================================================

describe('claimEVMLPFees', () => {
  it('throws for solana network', async () => {
    const wallet = makeMockWalletClient();
    await expect(
      claimEVMLPFees(wallet, 'solana', TOKEN_ADDR),
    ).rejects.toThrow('EVM contracts not configured');
  });

  it('calls claimLPFees with token address and returns hash', async () => {
    const wallet = makeMockWalletClient();

    const result = await claimEVMLPFees(wallet, 'sepolia', TOKEN_ADDR);

    expect(result.hash).toBe(TX_HASH);
    expect(wallet.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'claimLPFees',
        args: [TOKEN_ADDR],
      }),
    );
  });

  it('uses feeHolder address not appsFun address', async () => {
    const wallet = makeMockWalletClient();

    await claimEVMLPFees(wallet, 'sepolia', TOKEN_ADDR);

    const callArgs = wallet.writeContract.mock.calls[0][0];
    // feeHolder, not appsFun
    expect(callArgs.address).toBe('0x36618900De93aAB3a9C765d39BC582F74120F403');
    expect(callArgs.address).not.toBe('0xfFFfffFff91A48384F062D43f1672F217C20aB20');
  });

  it('passes the correct token address in args', async () => {
    const wallet = makeMockWalletClient();
    const specificToken = '0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF' as `0x${string}`;

    await claimEVMLPFees(wallet, 'sepolia', specificToken);

    const callArgs = wallet.writeContract.mock.calls[0][0];
    expect(callArgs.args[0]).toBe(specificToken);
  });
});
