import { describe, it, expect, vi } from 'vitest';
import { Keypair } from '@solana/web3.js';

// Simple validation test that doesn't need complex mocking
describe('Direct Trading Validation Tests', () => {
  // Import the functions after setting up vi
  const getDirectModule = () => import('../direct');

  describe('Input validation', () => {
    it('should reject zero amount in buyTokenDirect', async () => {
      const { buyTokenDirect } = await getDirectModule();
      const mockConnection = {} as any;
      const wallet = Keypair.generate();

      await expect(
        buyTokenDirect(mockConnection, {
          tokenMint: 'So11111111111111111111111111111111111111112',
          amount: 0,
          wallet,
        })
      ).rejects.toThrow('Amount must be positive');
    });

    it('should reject negative amount in buyTokenDirect', async () => {
      const { buyTokenDirect } = await getDirectModule();
      const mockConnection = {} as any;
      const wallet = Keypair.generate();

      await expect(
        buyTokenDirect(mockConnection, {
          tokenMint: 'So11111111111111111111111111111111111111112',
          amount: -1,
          wallet,
        })
      ).rejects.toThrow('Amount must be positive');
    });

    it('should reject invalid slippage in buyTokenDirect', async () => {
      const { buyTokenDirect } = await getDirectModule();
      const mockConnection = {} as any;
      const wallet = Keypair.generate();

      await expect(
        buyTokenDirect(mockConnection, {
          tokenMint: 'So11111111111111111111111111111111111111112',
          amount: 0.1,
          wallet,
          slippageBps: 10001,
        })
      ).rejects.toThrow('Slippage must be between 0 and 10000 basis points');
    });

    it('should reject negative slippage in buyTokenDirect', async () => {
      const { buyTokenDirect } = await getDirectModule();
      const mockConnection = {} as any;
      const wallet = Keypair.generate();

      await expect(
        buyTokenDirect(mockConnection, {
          tokenMint: 'So11111111111111111111111111111111111111112',
          amount: 0.1,
          wallet,
          slippageBps: -1,
        })
      ).rejects.toThrow('Slippage must be between 0 and 10000 basis points');
    });

    it('should reject negative priority fee in buyTokenDirect', async () => {
      const { buyTokenDirect } = await getDirectModule();
      const mockConnection = {} as any;
      const wallet = Keypair.generate();

      await expect(
        buyTokenDirect(mockConnection, {
          tokenMint: 'So11111111111111111111111111111111111111112',
          amount: 0.1,
          wallet,
          priorityFee: -1,
        })
      ).rejects.toThrow('Priority fee must be non-negative');
    });

    it('should reject invalid token mint in buyTokenDirect', async () => {
      const { buyTokenDirect } = await getDirectModule();
      const mockConnection = {} as any;
      const wallet = Keypair.generate();

      await expect(
        buyTokenDirect(mockConnection, {
          tokenMint: 'invalid!@#',
          amount: 0.1,
          wallet,
        })
      ).rejects.toThrow('Invalid token mint address');
    });

    it('should reject zero amount in sellTokenDirect', async () => {
      const { sellTokenDirect } = await getDirectModule();
      const mockConnection = {} as any;
      const wallet = Keypair.generate();

      await expect(
        sellTokenDirect(mockConnection, {
          tokenMint: 'So11111111111111111111111111111111111111112',
          amount: 0,
          wallet,
        })
      ).rejects.toThrow('Amount must be positive');
    });

    it('should reject negative amount in sellTokenDirect', async () => {
      const { sellTokenDirect } = await getDirectModule();
      const mockConnection = {} as any;
      const wallet = Keypair.generate();

      await expect(
        sellTokenDirect(mockConnection, {
          tokenMint: 'So11111111111111111111111111111111111111112',
          amount: -1,
          wallet,
        })
      ).rejects.toThrow('Amount must be positive');
    });

    it('should reject invalid slippage in sellTokenDirect', async () => {
      const { sellTokenDirect } = await getDirectModule();
      const mockConnection = {} as any;
      const wallet = Keypair.generate();

      await expect(
        sellTokenDirect(mockConnection, {
          tokenMint: 'So11111111111111111111111111111111111111112',
          amount: 1,
          wallet,
          slippageBps: 10001,
        })
      ).rejects.toThrow('Slippage must be between 0 and 10000 basis points');
    });

    it('should reject zero amount in burnTokenDirect', async () => {
      const { burnTokenDirect } = await getDirectModule();
      const mockConnection = {} as any;
      const wallet = Keypair.generate();

      await expect(
        burnTokenDirect(mockConnection, {
          tokenMint: 'So11111111111111111111111111111111111111112',
          amount: 0,
          wallet,
        })
      ).rejects.toThrow('Amount must be positive');
    });

    it('should reject negative amount in burnTokenDirect', async () => {
      const { burnTokenDirect } = await getDirectModule();
      const mockConnection = {} as any;
      const wallet = Keypair.generate();

      await expect(
        burnTokenDirect(mockConnection, {
          tokenMint: 'So11111111111111111111111111111111111111112',
          amount: -1,
          wallet,
        })
      ).rejects.toThrow('Amount must be positive');
    });

    it('should reject invalid token mint in burnTokenDirect', async () => {
      const { burnTokenDirect } = await getDirectModule();
      const mockConnection = {} as any;
      const wallet = Keypair.generate();

      await expect(
        burnTokenDirect(mockConnection, {
          tokenMint: 'invalid!@#',
          amount: 1,
          wallet,
        })
      ).rejects.toThrow('Invalid token mint address');
    });

    it('should reject negative priority fee in burnTokenDirect', async () => {
      const { burnTokenDirect } = await getDirectModule();
      const mockConnection = {} as any;
      const wallet = Keypair.generate();

      await expect(
        burnTokenDirect(mockConnection, {
          tokenMint: 'So11111111111111111111111111111111111111112',
          amount: 1,
          wallet,
          priorityFee: -1,
        })
      ).rejects.toThrow('Priority fee must be non-negative');
    });
  });

  describe('Prepare function validation', () => {
    it('should reject invalid amount in prepareDirectBuy', async () => {
      const { prepareDirectBuy } = await getDirectModule();
      const mockConnection = {} as any;

      await expect(
        prepareDirectBuy(mockConnection, {
          tokenMint: 'So11111111111111111111111111111111111111112',
          amount: 0,
          walletAddress: '11111111111111111111111111111111',
        })
      ).rejects.toThrow('Amount must be positive');
    });

    it('should reject invalid amount in prepareDirectSell', async () => {
      const { prepareDirectSell } = await getDirectModule();
      const mockConnection = {} as any;

      await expect(
        prepareDirectSell(mockConnection, {
          tokenMint: 'So11111111111111111111111111111111111111112',
          amount: -1,
          walletAddress: '11111111111111111111111111111111',
        })
      ).rejects.toThrow('Amount must be positive');
    });

    it('should reject invalid amount in prepareDirectBurn', async () => {
      const { prepareDirectBurn } = await getDirectModule();
      const mockConnection = {} as any;

      await expect(
        prepareDirectBurn(mockConnection, {
          tokenMint: 'So11111111111111111111111111111111111111112',
          amount: 0,
          walletAddress: '11111111111111111111111111111111',
        })
      ).rejects.toThrow('Amount must be positive');
    });
  });
});