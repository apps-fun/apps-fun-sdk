import { describe, it, expect, beforeAll } from 'vitest';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { TokenGate } from '../../token-gate';
import { AppsFunClient } from '../../client';
import {
  getDevnetConnection,
  checkDevnetConnection,
  TEST_ADDRESSES,
  getTestConfig,
} from './setup';

describe('TokenGate Integration Tests (Devnet)', () => {
  let connection: Connection;
  let isConnected: boolean;

  beforeAll(async () => {
    connection = getDevnetConnection();
    isConnected = await checkDevnetConnection();
  });

  describe('Connection', () => {
    it('should connect to devnet successfully', async () => {
      expect(isConnected).toBe(true);
    });

    it('should get slot number from devnet', async () => {
      if (!isConnected) {
        console.log('SKIPPING: No devnet connection');
        return;
      }

      const slot = await connection.getSlot();
      expect(slot).toBeGreaterThan(0);
      console.log(`Current devnet slot: ${slot}`);
    });
  });

  describe('TokenGate with WSOL', () => {
    const wsolMint = new PublicKey(TEST_ADDRESSES.WSOL_MINT);

    it('should create TokenGate instance', () => {
      const gate = new TokenGate({
        tokenMint: wsolMint,
        minAmount: BigInt(1000000), // 0.001 SOL in lamports
        connection,
      });

      expect(gate).toBeDefined();
    });

    it('should return token info', () => {
      const gate = new TokenGate({
        tokenMint: wsolMint,
        minAmount: BigInt(1000000),
        connection,
        appId: 123,
      });

      const info = gate.getTokenInfo();

      expect(info.mint).toBe(TEST_ADDRESSES.WSOL_MINT);
      expect(info.minAmount).toBe(BigInt(1000000));
      expect(info.appId).toBe(123);
    });

    it('should check balance of random wallet (expect false - no WSOL)', async () => {
      if (!isConnected) {
        console.log('SKIPPING: No devnet connection');
        return;
      }

      const gate = new TokenGate({
        tokenMint: wsolMint,
        minAmount: BigInt(1000000),
        connection,
      });

      // Generate a random wallet that definitely has no WSOL
      const randomWallet = Keypair.generate().publicKey.toBase58();

      const result = await gate.check(randomWallet);

      expect(result.allowed).toBe(false);
      expect(result.balance).toBe(BigInt(0));
      expect(result.required).toBe(BigInt(1000000));
      console.log(`Random wallet ${randomWallet.slice(0, 8)}... balance: ${result.balance}`);
    });

    it('should allow any wallet when minAmount is 0', async () => {
      if (!isConnected) {
        console.log('SKIPPING: No devnet connection');
        return;
      }

      const gate = new TokenGate({
        tokenMint: wsolMint,
        minAmount: BigInt(0), // No minimum
        connection,
      });

      const randomWallet = Keypair.generate().publicKey.toBase58();
      const result = await gate.check(randomWallet);

      // With 0 minimum, even 0 balance should be allowed
      expect(result.allowed).toBe(true);
      expect(result.balance).toBe(BigInt(0));
      expect(result.required).toBe(BigInt(0));
    });

    it('should handle invalid wallet address gracefully', async () => {
      if (!isConnected) {
        console.log('SKIPPING: No devnet connection');
        return;
      }

      const gate = new TokenGate({
        tokenMint: wsolMint,
        minAmount: BigInt(1000000),
        connection,
      });

      // Invalid address should throw
      await expect(gate.check('invalid-address')).rejects.toThrow();
    });
  });

  describe('TokenGate Caching', () => {
    it('should cache balance results', async () => {
      if (!isConnected) {
        console.log('SKIPPING: No devnet connection');
        return;
      }

      const wsolMint = new PublicKey(TEST_ADDRESSES.WSOL_MINT);
      const gate = new TokenGate({
        tokenMint: wsolMint,
        minAmount: BigInt(0),
        connection,
        cacheTtlMs: 30000, // 30 second cache
      });

      const wallet = Keypair.generate().publicKey.toBase58();

      // First call - should make RPC request
      const startTime1 = Date.now();
      await gate.check(wallet);
      const duration1 = Date.now() - startTime1;

      // Second call - should use cache (much faster)
      const startTime2 = Date.now();
      await gate.check(wallet);
      const duration2 = Date.now() - startTime2;

      console.log(`First call: ${duration1}ms, Second call: ${duration2}ms`);

      // Second call should be significantly faster due to cache
      // (allowing some margin for test flakiness)
      expect(duration2).toBeLessThan(duration1);
    });

    it('should clear cache when requested', async () => {
      if (!isConnected) {
        console.log('SKIPPING: No devnet connection');
        return;
      }

      const wsolMint = new PublicKey(TEST_ADDRESSES.WSOL_MINT);
      const gate = new TokenGate({
        tokenMint: wsolMint,
        minAmount: BigInt(0),
        connection,
        cacheTtlMs: 30000,
      });

      const wallet = Keypair.generate().publicKey.toBase58();

      // First call
      await gate.check(wallet);

      // Clear cache
      gate.clearCache();

      // This should make a new RPC call
      const result = await gate.check(wallet);
      expect(result).toBeDefined();
    });
  });

  describe('TokenGate Batch Checking', () => {
    it('should check multiple wallets in batch', async () => {
      if (!isConnected) {
        console.log('SKIPPING: No devnet connection');
        return;
      }

      const wsolMint = new PublicKey(TEST_ADDRESSES.WSOL_MINT);
      const gate = new TokenGate({
        tokenMint: wsolMint,
        minAmount: BigInt(0),
        connection,
      });

      // Generate 5 random wallets
      const wallets = Array.from({ length: 5 }, () =>
        Keypair.generate().publicKey.toBase58()
      );

      const results = await gate.checkBatch(wallets);

      expect(results.size).toBe(5);

      // All random wallets should have 0 balance
      for (const wallet of wallets) {
        const result = results.get(wallet);
        expect(result).toBeDefined();
        expect(result?.balance).toBe(BigInt(0));
        expect(result?.allowed).toBe(true); // minAmount is 0
      }

      console.log(`Batch checked ${results.size} wallets`);
    });
  });

  describe('AppsFunClient TokenGate Creation', () => {
    it('should create TokenGate via client', () => {
      const client = new AppsFunClient({
        cluster: 'devnet',
        apiUrl: 'https://apps.fun',
      });

      const gate = client.createTokenGate({
        tokenMint: new PublicKey(TEST_ADDRESSES.WSOL_MINT),
        minAmount: BigInt(1000000),
      });

      expect(gate).toBeInstanceOf(TokenGate);
    });

    it('should get token balance directly from client', async () => {
      if (!isConnected) {
        console.log('SKIPPING: No devnet connection');
        return;
      }

      const client = new AppsFunClient({
        cluster: 'devnet',
      });

      const randomWallet = Keypair.generate().publicKey;
      const balance = await client.getTokenBalance(
        new PublicKey(TEST_ADDRESSES.WSOL_MINT),
        randomWallet
      );

      expect(balance).toBe(BigInt(0));
    });
  });

  describe('Real Token Test (if available)', () => {
    it('should test with real token if TEST_TOKEN_MINT is set', async () => {
      const config = getTestConfig();

      if (!config.testTokenMint || !config.testWallet) {
        console.log(
          'SKIPPING: Set TEST_TOKEN_MINT and TEST_WALLET env vars for this test'
        );
        return;
      }

      if (!isConnected) {
        console.log('SKIPPING: No devnet connection');
        return;
      }

      const gate = new TokenGate({
        tokenMint: new PublicKey(config.testTokenMint),
        minAmount: BigInt(1),
        connection,
      });

      const result = await gate.check(config.testWallet);

      console.log(`Test wallet ${config.testWallet.slice(0, 8)}...`);
      console.log(`Token: ${config.testTokenMint.slice(0, 8)}...`);
      console.log(`Balance: ${result.balance}`);
      console.log(`Allowed: ${result.allowed}`);

      expect(result).toBeDefined();
      expect(typeof result.balance).toBe('bigint');
    });
  });
});
