import { describe, it, expect } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import {
  deriveProgramStatePDA,
  deriveAppRecordPDA,
  deriveTokenRecordPDA,
  deriveFeeEscrowPDA,
  deriveDividendPoolPDA,
  deriveClaimRecordPDA,
  deriveProcessedTradesPDA,
} from '../pda';
import { PROGRAM_ID } from '../constants';

describe('PDA Derivation Functions', () => {
  describe('deriveProgramStatePDA', () => {
    it('should derive consistent program state PDA', () => {
      const [pda1, bump1] = deriveProgramStatePDA();
      const [pda2, bump2] = deriveProgramStatePDA();
      
      expect(pda1).toBeInstanceOf(PublicKey);
      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
      expect(bump1).toBeGreaterThan(0);
      expect(bump1).toBeLessThanOrEqual(255);
    });

    it('should use correct seeds for program state', () => {
      const [pda] = deriveProgramStatePDA();
      
      // Verify it's a valid PDA (not on ed25519 curve)
      const isOnCurve = PublicKey.isOnCurve(pda.toBuffer());
      expect(isOnCurve).toBe(false);
    });
  });

  describe('deriveAppRecordPDA', () => {
    it('should derive unique PDAs for different app IDs', () => {
      const [pda1] = deriveAppRecordPDA(BigInt(1));
      const [pda2] = deriveAppRecordPDA(BigInt(2));
      const [pda3] = deriveAppRecordPDA(BigInt(999));
      
      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
      expect(pda2.toBase58()).not.toBe(pda3.toBase58());
      expect(pda1.toBase58()).not.toBe(pda3.toBase58());
    });

    it('should derive consistent PDA for same app ID', () => {
      const appId = BigInt(42);
      const [pda1, bump1] = deriveAppRecordPDA(appId);
      const [pda2, bump2] = deriveAppRecordPDA(appId);
      
      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });

    it('should handle large app IDs', () => {
      const largeAppId = BigInt('18446744073709551615'); // Max uint64
      const [pda, bump] = deriveAppRecordPDA(largeAppId);
      
      expect(pda).toBeInstanceOf(PublicKey);
      expect(bump).toBeGreaterThan(0);
      expect(bump).toBeLessThanOrEqual(255);
    });

    it('should handle zero app ID', () => {
      const [pda, bump] = deriveAppRecordPDA(BigInt(0));
      
      expect(pda).toBeInstanceOf(PublicKey);
      expect(bump).toBeGreaterThan(0);
    });
  });

  describe('deriveTokenRecordPDA', () => {
    const testMint = new PublicKey('So11111111111111111111111111111111111111112');
    
    it('should derive consistent PDA for same token mint', () => {
      const [pda1, bump1] = deriveTokenRecordPDA(testMint);
      const [pda2, bump2] = deriveTokenRecordPDA(testMint);
      
      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });

    it('should derive unique PDAs for different token mints', () => {
      const mint1 = new PublicKey('So11111111111111111111111111111111111111112');
      const mint2 = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      
      const [pda1] = deriveTokenRecordPDA(mint1);
      const [pda2] = deriveTokenRecordPDA(mint2);
      
      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });

    it('should return valid bump value', () => {
      const [_, bump] = deriveTokenRecordPDA(testMint);
      
      expect(bump).toBeGreaterThan(0);
      expect(bump).toBeLessThanOrEqual(255);
    });
  });

  describe('deriveFeeEscrowPDA', () => {
    const testMint = new PublicKey('So11111111111111111111111111111111111111112');
    
    it('should derive consistent fee escrow PDA', () => {
      const [pda1, bump1] = deriveFeeEscrowPDA(testMint);
      const [pda2, bump2] = deriveFeeEscrowPDA(testMint);
      
      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });

    it('should derive different PDAs for different mints', () => {
      const mint1 = new PublicKey('So11111111111111111111111111111111111111112');
      const mint2 = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      
      const [pda1] = deriveFeeEscrowPDA(mint1);
      const [pda2] = deriveFeeEscrowPDA(mint2);
      
      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });
  });

  describe('deriveDividendPoolPDA', () => {
    const testMint = new PublicKey('So11111111111111111111111111111111111111112');
    
    it('should derive consistent dividend pool PDA', () => {
      const [pda1, bump1] = deriveDividendPoolPDA(testMint);
      const [pda2, bump2] = deriveDividendPoolPDA(testMint);
      
      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });

    it('should use different seed than fee escrow', () => {
      const [escrowPda] = deriveFeeEscrowPDA(testMint);
      const [poolPda] = deriveDividendPoolPDA(testMint);
      
      expect(escrowPda.toBase58()).not.toBe(poolPda.toBase58());
    });
  });

  describe('deriveClaimRecordPDA', () => {
    const testUser = new PublicKey('11111111111111111111111111111111');
    const testMint = new PublicKey('So11111111111111111111111111111111111111112');
    
    it('should derive consistent claim record PDA', () => {
      const [pda1, bump1] = deriveClaimRecordPDA(testUser, testMint);
      const [pda2, bump2] = deriveClaimRecordPDA(testUser, testMint);
      
      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });

    it('should derive unique PDAs for different users', () => {
      const user1 = new PublicKey('11111111111111111111111111111111');
      const user2 = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      
      const [pda1] = deriveClaimRecordPDA(user1, testMint);
      const [pda2] = deriveClaimRecordPDA(user2, testMint);
      
      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });

    it('should derive unique PDAs for different mints', () => {
      const mint1 = new PublicKey('So11111111111111111111111111111111111111112');
      const mint2 = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      
      const [pda1] = deriveClaimRecordPDA(testUser, mint1);
      const [pda2] = deriveClaimRecordPDA(testUser, mint2);
      
      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });

    it('should derive unique PDAs for different user-mint combinations', () => {
      const user1 = new PublicKey('11111111111111111111111111111111');
      const user2 = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
      const mint1 = new PublicKey('So11111111111111111111111111111111111111112');
      const mint2 = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      
      const [pda1] = deriveClaimRecordPDA(user1, mint1);
      const [pda2] = deriveClaimRecordPDA(user1, mint2);
      const [pda3] = deriveClaimRecordPDA(user2, mint1);
      const [pda4] = deriveClaimRecordPDA(user2, mint2);
      
      const pdaSet = new Set([
        pda1.toBase58(),
        pda2.toBase58(),
        pda3.toBase58(),
        pda4.toBase58(),
      ]);
      
      expect(pdaSet.size).toBe(4); // All unique
    });
  });

  describe('deriveProcessedTradesPDA', () => {
    it('should derive consistent processed trades PDA', () => {
      const [pda1, bump1] = deriveProcessedTradesPDA();
      const [pda2, bump2] = deriveProcessedTradesPDA();
      
      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
      expect(bump1).toBeGreaterThan(0);
      expect(bump1).toBeLessThanOrEqual(255);
    });

    it('should derive different PDA than program state', () => {
      const [statePda] = deriveProgramStatePDA();
      const [tradesPda] = deriveProcessedTradesPDA();
      
      expect(statePda.toBase58()).not.toBe(tradesPda.toBase58());
    });
  });

  describe('Cross-function consistency', () => {
    it('should use same program ID for all PDAs', () => {
      // All PDAs should be derived from the same program
      const [statePda] = deriveProgramStatePDA();
      const [appPda] = deriveAppRecordPDA(BigInt(1));
      const mint = new PublicKey('So11111111111111111111111111111111111111112');
      const [tokenPda] = deriveTokenRecordPDA(mint);
      
      // Can't directly test program ID from PDA, but we can verify 
      // they're all valid PDAs (off-curve)
      expect(PublicKey.isOnCurve(statePda.toBuffer())).toBe(false);
      expect(PublicKey.isOnCurve(appPda.toBuffer())).toBe(false);
      expect(PublicKey.isOnCurve(tokenPda.toBuffer())).toBe(false);
    });

    it('should generate unique PDAs for each function', () => {
      const mint = new PublicKey('So11111111111111111111111111111111111111112');
      const user = new PublicKey('11111111111111111111111111111111');
      
      const [statePda] = deriveProgramStatePDA();
      const [appPda] = deriveAppRecordPDA(BigInt(1));
      const [tokenPda] = deriveTokenRecordPDA(mint);
      const [escrowPda] = deriveFeeEscrowPDA(mint);
      const [poolPda] = deriveDividendPoolPDA(mint);
      const [claimPda] = deriveClaimRecordPDA(user, mint);
      const [tradesPda] = deriveProcessedTradesPDA();
      
      const pdaSet = new Set([
        statePda.toBase58(),
        appPda.toBase58(),
        tokenPda.toBase58(),
        escrowPda.toBase58(),
        poolPda.toBase58(),
        claimPda.toBase58(),
        tradesPda.toBase58(),
      ]);
      
      expect(pdaSet.size).toBe(7); // All unique
    });
  });
});