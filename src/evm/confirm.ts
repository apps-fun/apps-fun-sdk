// Transaction confirmation utilities

import type { EVMPublicClient } from './client';

// --- Types ---

export interface TransactionConfirmation {
  hash: `0x${string}`;
  status: 'success' | 'reverted';
  blockNumber: bigint;
  gasUsed: bigint;
}

export interface WaitOptions {
  confirmations?: number;
  timeoutMs?: number;
}

// --- Functions ---

/**
 * Wait for a transaction to be confirmed and return typed result.
 */
export async function waitForTransaction(
  publicClient: EVMPublicClient,
  hash: `0x${string}`,
  options?: WaitOptions
): Promise<TransactionConfirmation> {
  const confirmations = options?.confirmations ?? 1;
  const timeoutMs = options?.timeoutMs ?? 60000;

  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations,
    timeout: timeoutMs,
  });

  return {
    hash: receipt.transactionHash,
    status: receipt.status === 'success' ? 'success' : 'reverted',
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
  };
}
