import { PublicKey } from '@solana/web3.js';
import { PROGRAM_ID, PDA_VERSION } from './constants';

/**
 * Derive the program state PDA
 */
export function deriveProgramStatePDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('state'), Buffer.from([PDA_VERSION])],
    PROGRAM_ID
  );
}

/**
 * Derive an app record PDA from its on-chain ID
 */
export function deriveAppRecordPDA(appId: bigint): [PublicKey, number] {
  const appIdBuffer = Buffer.alloc(8);
  appIdBuffer.writeBigUInt64LE(appId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('app'), Buffer.from([PDA_VERSION]), appIdBuffer],
    PROGRAM_ID
  );
}

/**
 * Derive a token record PDA from the token mint
 */
export function deriveTokenRecordPDA(tokenMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('token'), Buffer.from([PDA_VERSION]), tokenMint.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Derive the fee escrow PDA for a token
 */
export function deriveFeeEscrowPDA(tokenMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), Buffer.from([PDA_VERSION]), tokenMint.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Derive the dividend pool PDA for a token
 */
export function deriveDividendPoolPDA(tokenMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pool'), Buffer.from([PDA_VERSION]), tokenMint.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Derive a user's claim record PDA for a specific token
 */
export function deriveClaimRecordPDA(
  user: PublicKey,
  tokenMint: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('claim'),
      Buffer.from([PDA_VERSION]),
      user.toBuffer(),
      tokenMint.toBuffer(),
    ],
    PROGRAM_ID
  );
}

/**
 * Derive the processed trades buffer PDA
 */
export function deriveProcessedTradesPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('processed_trades'), Buffer.from([PDA_VERSION])],
    PROGRAM_ID
  );
}
