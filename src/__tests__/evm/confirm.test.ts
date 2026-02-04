/**
 * Tests for src/evm/confirm.ts
 *
 * Public API under test:
 *   - waitForTransaction(publicClient, hash, options?): Promise<TransactionConfirmation>
 *
 * Behavioral contracts:
 *   - Returns typed TransactionConfirmation with hash, status, blockNumber, gasUsed
 *   - Maps receipt status 'success' to 'success'
 *   - Maps any non-'success' receipt status to 'reverted'
 *   - Defaults confirmations to 1 and timeoutMs to 60000
 *   - Passes custom confirmations and timeout to waitForTransactionReceipt
 *   - Returns receipt.transactionHash as hash (not input hash)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { waitForTransaction } from '../../evm/confirm';

const TX_HASH = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`;

function makeReceipt(overrides?: Partial<{
  transactionHash: `0x${string}`;
  status: string;
  blockNumber: bigint;
  gasUsed: bigint;
}>) {
  return {
    transactionHash: overrides?.transactionHash ?? TX_HASH,
    status: overrides?.status ?? 'success',
    blockNumber: overrides?.blockNumber ?? 12345n,
    gasUsed: overrides?.gasUsed ?? 21000n,
  };
}

describe('waitForTransaction', () => {
  let mockPublicClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPublicClient = {
      waitForTransactionReceipt: vi.fn().mockResolvedValue(makeReceipt()),
    };
  });

  it('returns success status for successful receipt', async () => {
    const result = await waitForTransaction(mockPublicClient, TX_HASH);
    expect(result.status).toBe('success');
  });

  it('returns reverted status for non-success receipt', async () => {
    mockPublicClient.waitForTransactionReceipt.mockResolvedValue(
      makeReceipt({ status: 'reverted' })
    );
    const result = await waitForTransaction(mockPublicClient, TX_HASH);
    expect(result.status).toBe('reverted');
  });

  it('returns receipt transactionHash as hash', async () => {
    const receiptHash = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as `0x${string}`;
    mockPublicClient.waitForTransactionReceipt.mockResolvedValue(
      makeReceipt({ transactionHash: receiptHash })
    );
    const result = await waitForTransaction(mockPublicClient, TX_HASH);
    expect(result.hash).toBe(receiptHash);
  });

  it('returns blockNumber from receipt', async () => {
    mockPublicClient.waitForTransactionReceipt.mockResolvedValue(
      makeReceipt({ blockNumber: 99999n })
    );
    const result = await waitForTransaction(mockPublicClient, TX_HASH);
    expect(result.blockNumber).toBe(99999n);
  });

  it('returns gasUsed from receipt', async () => {
    mockPublicClient.waitForTransactionReceipt.mockResolvedValue(
      makeReceipt({ gasUsed: 42000n })
    );
    const result = await waitForTransaction(mockPublicClient, TX_HASH);
    expect(result.gasUsed).toBe(42000n);
  });

  it('passes hash to waitForTransactionReceipt', async () => {
    await waitForTransaction(mockPublicClient, TX_HASH);
    expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ hash: TX_HASH })
    );
  });

  it('defaults confirmations to 1', async () => {
    await waitForTransaction(mockPublicClient, TX_HASH);
    expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ confirmations: 1 })
    );
  });

  it('defaults timeout to 60000', async () => {
    await waitForTransaction(mockPublicClient, TX_HASH);
    expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 60000 })
    );
  });

  it('passes custom confirmations', async () => {
    await waitForTransaction(mockPublicClient, TX_HASH, { confirmations: 5 });
    expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ confirmations: 5 })
    );
  });

  it('passes custom timeout', async () => {
    await waitForTransaction(mockPublicClient, TX_HASH, { timeoutMs: 120000 });
    expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 120000 })
    );
  });

  it('passes both custom confirmations and timeout', async () => {
    await waitForTransaction(mockPublicClient, TX_HASH, {
      confirmations: 3,
      timeoutMs: 30000,
    });
    expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: TX_HASH,
      confirmations: 3,
      timeout: 30000,
    });
  });

  it('propagates errors from waitForTransactionReceipt', async () => {
    mockPublicClient.waitForTransactionReceipt.mockRejectedValue(
      new Error('timeout exceeded')
    );
    await expect(
      waitForTransaction(mockPublicClient, TX_HASH)
    ).rejects.toThrow('timeout exceeded');
  });

  it('maps unknown status values to reverted', async () => {
    mockPublicClient.waitForTransactionReceipt.mockResolvedValue(
      makeReceipt({ status: 'unknown' })
    );
    const result = await waitForTransaction(mockPublicClient, TX_HASH);
    expect(result.status).toBe('reverted');
  });
});
