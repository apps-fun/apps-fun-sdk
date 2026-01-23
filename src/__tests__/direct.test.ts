import { describe, it, expect, vi } from 'vitest';
import { PublicKey, Keypair } from '@solana/web3.js';

// Mock the Meteora SDK to avoid network calls
vi.mock('@meteora-ag/dynamic-bonding-curve-sdk', () => ({
  DynamicBondingCurveClient: {
    create: vi.fn(),
  },
  swapQuote: vi.fn(),
}));

describe('Direct Trading Input Validation', () => {
  describe('buyTokenDirect', () => {
    it('should validate amount is positive', async () => {
      // Import after mocking
      const { buyTokenDirect } = await import('../direct');
      const mockConnection = {} as any;
      const mockWallet = Keypair.generate();
      
      await expect(
        buyTokenDirect(mockConnection, {
          tokenMint: 'So11111111111111111111111111111111111111112',
          amount: -1,
          wallet: mockWallet,
        })
      ).rejects.toThrow('Amount must be positive');
      
      await expect(
        buyTokenDirect(mockConnection, {
          tokenMint: 'So11111111111111111111111111111111111111112',
          amount: 0,
          wallet: mockWallet,
        })
      ).rejects.toThrow('Amount must be positive');
    });

    it('should validate tokenMint is valid', async () => {
      const { buyTokenDirect } = await import('../direct');
      const mockConnection = {} as any;
      const mockWallet = Keypair.generate();
      
      await expect(
        buyTokenDirect(mockConnection, {
          tokenMint: 'invalid-address',
          amount: 0.1,
          wallet: mockWallet,
        })
      ).rejects.toThrow('Invalid token mint address');
    });

    it('should validate slippageBps is within range', async () => {
      const { buyTokenDirect } = await import('../direct');
      const mockConnection = {} as any;
      const mockWallet = Keypair.generate();
      
      await expect(
        buyTokenDirect(mockConnection, {
          tokenMint: 'So11111111111111111111111111111111111111112',
          amount: 0.1,
          wallet: mockWallet,
          slippageBps: -1,
        })
      ).rejects.toThrow('Slippage must be between 0 and 10000 basis points');
      
      await expect(
        buyTokenDirect(mockConnection, {
          tokenMint: 'So11111111111111111111111111111111111111112',
          amount: 0.1,
          wallet: mockWallet,
          slippageBps: 10001,
        })
      ).rejects.toThrow('Slippage must be between 0 and 10000 basis points');
    });
  });

  describe('sellTokenDirect', () => {
    it('should validate amount is positive', async () => {
      const { sellTokenDirect } = await import('../direct');
      const mockConnection = {} as any;
      const mockWallet = Keypair.generate();
      
      await expect(
        sellTokenDirect(mockConnection, {
          tokenMint: 'So11111111111111111111111111111111111111112',
          amount: -100,
          wallet: mockWallet,
        })
      ).rejects.toThrow('Amount must be positive');
    });
  });

  describe('burnTokenDirect', () => {
    it('should validate amount is positive', async () => {
      const { burnTokenDirect } = await import('../direct');
      const mockConnection = {} as any;
      const mockWallet = Keypair.generate();
      
      await expect(
        burnTokenDirect(mockConnection, {
          tokenMint: 'So11111111111111111111111111111111111111112',
          amount: -100,
          wallet: mockWallet,
        })
      ).rejects.toThrow('Amount must be positive');
    });
  });

  describe('verifyAppsFunPool', () => {
    it('should return false with error details on invalid mint', async () => {
      const { verifyAppsFunPool } = await import('../direct');
      const mockConnection = {} as any;
      
      const result = await verifyAppsFunPool(mockConnection, 'invalid-mint');
      expect(result).toBe(false);
    });
  });
});