import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  getAppRecord,
  getTokenRecord,
  getFeeEscrow,
  getTokenBalance,
  AppRecord,
  TokenRecord,
  FeeEscrow,
} from '../accounts';

// Mock the Connection class
vi.mock('@solana/web3.js', async () => {
  const actual = await vi.importActual('@solana/web3.js');
  return {
    ...actual,
    Connection: vi.fn(),
  };
});

// Mock the SPL Token functions
vi.mock('@solana/spl-token', () => ({
  getAssociatedTokenAddressSync: vi.fn(),
}));

describe('Account Parsing Functions', () => {
  let mockConnection: any;

  beforeEach(() => {
    mockConnection = {
      getAccountInfo: vi.fn(),
    };
    vi.clearAllMocks();
  });

  describe('getAppRecord', () => {
    it('should parse app record correctly', async () => {
      const appId = BigInt(123);
      const mockData = Buffer.alloc(130); // Increased to accommodate all fields
      
      // Write discriminator (8 bytes)
      mockData.writeUInt32LE(0x12345678, 0);
      mockData.writeUInt32LE(0x9ABCDEF0, 4);
      
      // Write data at offset 8
      mockData[8] = 250; // bump
      mockData.writeBigUInt64LE(appId, 9); // appId
      
      // Write app URL hash (32 bytes)
      for (let i = 0; i < 32; i++) {
        mockData[17 + i] = i;
      }
      
      // Write creator pubkey (32 bytes)
      const creatorBytes = new PublicKey('11111111111111111111111111111111').toBuffer();
      creatorBytes.copy(mockData, 49);
      
      // Write verified owner (32 bytes) - set some non-zero bytes
      const verifiedOwnerBytes = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v').toBuffer();
      verifiedOwnerBytes.copy(mockData, 50);
      
      // Write remaining fields
      mockData.writeUInt16LE(500, 118); // dividendSplitBps
      mockData.writeBigUInt64LE(BigInt(1000000), 120); // totalTokens
      mockData[129] = 0; // isSuspended = false

      mockConnection.getAccountInfo.mockResolvedValue({
        data: mockData,
        executable: false,
        lamports: 1000000,
        owner: new PublicKey('11111111111111111111111111111111'),
      });

      const result = await getAppRecord(mockConnection, appId);

      expect(result).toBeTruthy();
      expect(result?.appId).toBe(appId);
      expect(result?.bump).toBe(250);
      expect(result?.dividendSplitBps).toBe(500);
      expect(result?.totalTokens).toBe(BigInt(1000000));
      expect(result?.isSuspended).toBe(false);
      expect(result?.creator).toBeInstanceOf(PublicKey);
      expect(result?.verifiedOwner).toBeInstanceOf(PublicKey);
    });

    it('should return null if account does not exist', async () => {
      mockConnection.getAccountInfo.mockResolvedValue(null);

      const result = await getAppRecord(mockConnection, BigInt(999));

      expect(result).toBeNull();
      expect(mockConnection.getAccountInfo).toHaveBeenCalled();
    });

    it('should handle app with no verified owner', async () => {
      const appId = BigInt(456);
      const mockData = Buffer.alloc(130);
      
      // Set up basic structure
      mockData.writeUInt32LE(0x12345678, 0);
      mockData[8] = 250; // bump
      mockData.writeBigUInt64LE(appId, 9);
      
      // Leave verified owner bytes as zeros (offset 50-82)
      for (let i = 50; i < 82; i++) {
        mockData[i] = 0;
      }

      mockConnection.getAccountInfo.mockResolvedValue({
        data: mockData,
        executable: false,
        lamports: 1000000,
        owner: new PublicKey('11111111111111111111111111111111'),
      });

      const result = await getAppRecord(mockConnection, appId);

      expect(result?.verifiedOwner).toBeNull();
    });
  });

  describe('getTokenRecord', () => {
    it('should parse token record correctly', async () => {
      const tokenMint = new PublicKey('So11111111111111111111111111111111111111112');
      const mockData = Buffer.alloc(84); // Increased size to accommodate all fields
      
      // Write discriminator
      mockData.writeUInt32LE(0xAABBCCDD, 0);
      mockData.writeUInt32LE(0xEEFF0011, 4);
      
      // Write data at offset 8
      mockData[8] = 251; // bump
      mockData.writeBigUInt64LE(BigInt(789), 9); // appId
      
      // Write token mint (32 bytes)
      tokenMint.toBuffer().copy(mockData, 17);
      
      // Write graduated flag and timestamp
      mockData[49] = 1; // graduated = true
      mockData[50] = 1; // has graduation timestamp
      mockData.writeBigInt64LE(BigInt(1234567890), 51); // graduatedAt
      
      // Write totalVolume (128-bit)
      mockData.writeBigUInt64LE(BigInt(1000), 59); // low 64 bits
      mockData.writeBigUInt64LE(BigInt(2), 67); // high 64 bits
      
      // Write totalTrades
      mockData.writeBigUInt64LE(BigInt(500), 75);

      mockConnection.getAccountInfo.mockResolvedValue({
        data: mockData,
        executable: false,
        lamports: 1000000,
        owner: new PublicKey('11111111111111111111111111111111'),
      });

      const result = await getTokenRecord(mockConnection, tokenMint);

      expect(result).toBeTruthy();
      expect(result?.appId).toBe(BigInt(789));
      expect(result?.tokenMint.toBase58()).toBe(tokenMint.toBase58());
      expect(result?.graduated).toBe(true);
      expect(result?.graduatedAt).toBe(BigInt(1234567890));
      expect(result?.totalTrades).toBe(BigInt(500));
      expect(result?.bump).toBe(251);
    });

    it('should handle non-graduated token', async () => {
      const tokenMint = new PublicKey('So11111111111111111111111111111111111111112');
      const mockData = Buffer.alloc(84); // Increased size
      
      // Set graduated flag to false
      mockData[49] = 0; // graduated = false
      mockData[50] = 0; // no graduation timestamp

      mockConnection.getAccountInfo.mockResolvedValue({
        data: mockData,
        executable: false,
        lamports: 1000000,
        owner: new PublicKey('11111111111111111111111111111111'),
      });

      const result = await getTokenRecord(mockConnection, tokenMint);

      expect(result?.graduated).toBe(false);
      expect(result?.graduatedAt).toBeNull();
    });

    it('should return null if token record does not exist', async () => {
      mockConnection.getAccountInfo.mockResolvedValue(null);

      const result = await getTokenRecord(
        mockConnection,
        new PublicKey('So11111111111111111111111111111111111111112')
      );

      expect(result).toBeNull();
    });
  });

  describe('getFeeEscrow', () => {
    it('should parse fee escrow correctly', async () => {
      const tokenMint = new PublicKey('So11111111111111111111111111111111111111112');
      const mockData = Buffer.alloc(81);
      
      // Write discriminator
      mockData.writeUInt32LE(0x11223344, 0);
      mockData.writeUInt32LE(0x55667788, 4);
      
      // Write token mint (32 bytes) at offset 8
      tokenMint.toBuffer().copy(mockData, 8);
      
      // Write accumulatedFees (128-bit) at offset 40
      // The implementation reads high bits first (offset+32), then low bits (offset+40)
      mockData.writeBigUInt64LE(BigInt(10), 40); // high 64 bits (read first in impl)
      mockData.writeBigUInt64LE(BigInt(5000), 48); // low 64 bits
      
      // Write claimedFees (128-bit) at offset 56
      mockData.writeBigUInt64LE(BigInt(5), 56); // high 64 bits (read first in impl)
      mockData.writeBigUInt64LE(BigInt(2000), 64); // low 64 bits
      
      // Write lastDistribution at offset 72
      mockData.writeBigInt64LE(BigInt(1640000000), 72);
      
      // Write bump at offset 80
      mockData[80] = 252;

      mockConnection.getAccountInfo.mockResolvedValue({
        data: mockData,
        executable: false,
        lamports: 1000000,
        owner: new PublicKey('11111111111111111111111111111111'),
      });

      const result = await getFeeEscrow(mockConnection, tokenMint);

      expect(result).toBeTruthy();
      expect(result?.tokenMint.toBase58()).toBe(tokenMint.toBase58());
      expect(result?.lastDistribution).toBe(BigInt(1640000000));
      expect(result?.bump).toBe(252);
      // Check 128-bit values are calculated correctly
      expect(result?.accumulatedFees).toBe(
        BigInt(5000) + BigInt(10) * BigInt(2) ** BigInt(64)
      );
      expect(result?.claimedFees).toBe(
        BigInt(2000) + BigInt(5) * BigInt(2) ** BigInt(64)
      );
    });

    it('should return null if fee escrow does not exist', async () => {
      mockConnection.getAccountInfo.mockResolvedValue(null);

      const result = await getFeeEscrow(
        mockConnection,
        new PublicKey('So11111111111111111111111111111111111111112')
      );

      expect(result).toBeNull();
    });

    it('should handle zero fees correctly', async () => {
      const tokenMint = new PublicKey('So11111111111111111111111111111111111111112');
      const mockData = Buffer.alloc(81);
      
      // Set all fees to zero
      mockData.writeBigUInt64LE(BigInt(0), 40);
      mockData.writeBigUInt64LE(BigInt(0), 48);
      mockData.writeBigUInt64LE(BigInt(0), 56);
      mockData.writeBigUInt64LE(BigInt(0), 64);
      
      tokenMint.toBuffer().copy(mockData, 8);
      mockData[80] = 250;

      mockConnection.getAccountInfo.mockResolvedValue({
        data: mockData,
        executable: false,
        lamports: 1000000,
        owner: new PublicKey('11111111111111111111111111111111'),
      });

      const result = await getFeeEscrow(mockConnection, tokenMint);

      expect(result?.accumulatedFees).toBe(BigInt(0));
      expect(result?.claimedFees).toBe(BigInt(0));
    });
  });

  describe('getTokenBalance', () => {
    it('should return token balance for existing account', async () => {
      const tokenMint = new PublicKey('So11111111111111111111111111111111111111112');
      const wallet = new PublicKey('11111111111111111111111111111111');
      
      const mockData = Buffer.alloc(165);
      // SPL Token account structure: amount is at offset 64 (8 bytes)
      mockData.writeBigUInt64LE(BigInt(1000000000), 64);

      mockConnection.getAccountInfo.mockResolvedValue({
        data: mockData,
        executable: false,
        lamports: 2039280,
        owner: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      });

      const balance = await getTokenBalance(mockConnection, tokenMint, wallet);

      expect(balance).toBe(BigInt(1000000000));
    });

    it('should return zero for non-existent account', async () => {
      mockConnection.getAccountInfo.mockResolvedValue(null);

      const balance = await getTokenBalance(
        mockConnection,
        new PublicKey('So11111111111111111111111111111111111111112'),
        new PublicKey('11111111111111111111111111111111')
      );

      expect(balance).toBe(BigInt(0));
    });

    it('should return zero on error', async () => {
      mockConnection.getAccountInfo.mockRejectedValue(new Error('Network error'));

      const balance = await getTokenBalance(
        mockConnection,
        new PublicKey('So11111111111111111111111111111111111111112'),
        new PublicKey('11111111111111111111111111111111')
      );

      expect(balance).toBe(BigInt(0));
    });

    it('should handle maximum balance correctly', async () => {
      const mockData = Buffer.alloc(165);
      // Max uint64 value
      mockData.writeBigUInt64LE(BigInt('18446744073709551615'), 64);

      mockConnection.getAccountInfo.mockResolvedValue({
        data: mockData,
        executable: false,
        lamports: 2039280,
        owner: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      });

      const balance = await getTokenBalance(
        mockConnection,
        new PublicKey('So11111111111111111111111111111111111111112'),
        new PublicKey('11111111111111111111111111111111')
      );

      expect(balance).toBe(BigInt('18446744073709551615'));
    });
  });
});