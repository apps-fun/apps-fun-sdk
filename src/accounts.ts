import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import {
  deriveAppRecordPDA,
  deriveTokenRecordPDA,
  deriveFeeEscrowPDA,
} from './pda';

export interface AppRecord {
  appId: bigint;
  appUrlHash: Uint8Array;
  creator: PublicKey;
  verifiedOwner: PublicKey | null;
  dividendSplitBps: number;
  totalTokens: bigint;
  isSuspended: boolean;
  bump: number;
}

export interface TokenRecord {
  appId: bigint;
  tokenMint: PublicKey;
  graduated: boolean;
  graduatedAt: bigint | null;
  totalVolume: bigint;
  totalTrades: bigint;
  bump: number;
}

export interface FeeEscrow {
  tokenMint: PublicKey;
  accumulatedFees: bigint;
  claimedFees: bigint;
  lastDistribution: bigint;
  bump: number;
}

/**
 * Fetch an app record from the chain
 */
export async function getAppRecord(
  connection: Connection,
  appId: bigint
): Promise<AppRecord | null> {
  const [appPDA] = deriveAppRecordPDA(appId);
  const accountInfo = await connection.getAccountInfo(appPDA);

  if (!accountInfo) return null;

  const data = accountInfo.data;
  const offset = 8; // Skip discriminator

  const verifiedOwnerBytes = data.slice(offset + 42, offset + 74);
  const hasVerifiedOwner = verifiedOwnerBytes.some((b) => b !== 0);

  return {
    appId: data.readBigUInt64LE(offset + 1),
    appUrlHash: data.slice(offset + 9, offset + 41),
    creator: new PublicKey(data.slice(offset + 41, offset + 73)),
    verifiedOwner: hasVerifiedOwner ? new PublicKey(verifiedOwnerBytes) : null,
    dividendSplitBps: data.readUInt16LE(offset + 110),
    totalTokens: data.readBigUInt64LE(offset + 112),
    isSuspended: data[offset + 121] === 1,
    bump: data[offset],
  };
}

/**
 * Fetch a token record from the chain
 */
export async function getTokenRecord(
  connection: Connection,
  tokenMint: PublicKey
): Promise<TokenRecord | null> {
  const [tokenPDA] = deriveTokenRecordPDA(tokenMint);
  const accountInfo = await connection.getAccountInfo(tokenPDA);

  if (!accountInfo) return null;

  const data = accountInfo.data;
  const offset = 8;

  return {
    appId: data.readBigUInt64LE(offset + 1),
    tokenMint: new PublicKey(data.slice(offset + 9, offset + 41)),
    graduated: data[offset + 41] === 1,
    graduatedAt: data[offset + 42] === 1 ? data.readBigInt64LE(offset + 43) : null,
    totalVolume:
      BigInt(data.readBigUInt64LE(offset + 51).toString()) * BigInt(2) ** BigInt(64) +
      data.readBigUInt64LE(offset + 59),
    totalTrades: data.readBigUInt64LE(offset + 67),
    bump: data[offset],
  };
}

/**
 * Fetch the fee escrow for a token
 */
export async function getFeeEscrow(
  connection: Connection,
  tokenMint: PublicKey
): Promise<FeeEscrow | null> {
  const [escrowPDA] = deriveFeeEscrowPDA(tokenMint);
  const accountInfo = await connection.getAccountInfo(escrowPDA);

  if (!accountInfo) return null;

  const data = accountInfo.data;
  const offset = 8;

  return {
    tokenMint: new PublicKey(data.slice(offset, offset + 32)),
    accumulatedFees:
      BigInt(data.readBigUInt64LE(offset + 32).toString()) * BigInt(2) ** BigInt(64) +
      data.readBigUInt64LE(offset + 40),
    claimedFees:
      BigInt(data.readBigUInt64LE(offset + 48).toString()) * BigInt(2) ** BigInt(64) +
      data.readBigUInt64LE(offset + 56),
    lastDistribution: data.readBigInt64LE(offset + 64),
    bump: data[offset + 72],
  };
}

/**
 * Get the token balance for a wallet
 */
export async function getTokenBalance(
  connection: Connection,
  tokenMint: PublicKey,
  wallet: PublicKey
): Promise<bigint> {
  const ata = getAssociatedTokenAddressSync(tokenMint, wallet);

  try {
    const accountInfo = await connection.getAccountInfo(ata);
    if (!accountInfo) return BigInt(0);

    // SPL Token account data: amount is at offset 64, 8 bytes
    const amount = accountInfo.data.readBigUInt64LE(64);
    return amount;
  } catch {
    return BigInt(0);
  }
}
