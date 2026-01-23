import { describe, it, expect } from 'vitest';
import {
  AppsFunError,
  InsufficientBalanceError,
  TokenNotFoundError,
  UnauthorizedError,
  WalletNotLinkedError,
} from '../types';

describe('Error Classes', () => {
  describe('AppsFunError', () => {
    it('should create error with message, code, and status', () => {
      const error = new AppsFunError('Test error', 'TEST_ERROR', 400);

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('AppsFunError');
    });

    it('should be instanceof Error', () => {
      const error = new AppsFunError('Test', 'TEST');
      expect(error instanceof Error).toBe(true);
      expect(error instanceof AppsFunError).toBe(true);
    });
  });

  describe('InsufficientBalanceError', () => {
    it('should create error with required and available amounts', () => {
      const required = BigInt(1000);
      const available = BigInt(500);
      const error = new InsufficientBalanceError(required, available);

      expect(error.message).toContain('1000');
      expect(error.message).toContain('500');
      expect(error.code).toBe('INSUFFICIENT_BALANCE');
      expect(error.name).toBe('InsufficientBalanceError');
    });

    it('should be instanceof AppsFunError', () => {
      const error = new InsufficientBalanceError(BigInt(100), BigInt(50));
      expect(error instanceof AppsFunError).toBe(true);
    });
  });

  describe('TokenNotFoundError', () => {
    it('should create error with token mint', () => {
      const tokenMint = 'TokenMint111111111111111111111111111111111';
      const error = new TokenNotFoundError(tokenMint);

      expect(error.message).toContain(tokenMint);
      expect(error.code).toBe('TOKEN_NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.name).toBe('TokenNotFoundError');
    });
  });

  describe('UnauthorizedError', () => {
    it('should create error with default message', () => {
      const error = new UnauthorizedError();

      expect(error.message).toBe('Unauthorized');
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.statusCode).toBe(401);
      expect(error.name).toBe('UnauthorizedError');
    });

    it('should create error with custom message', () => {
      const error = new UnauthorizedError('Invalid token');

      expect(error.message).toBe('Invalid token');
    });
  });

  describe('WalletNotLinkedError', () => {
    it('should create error with wallet address', () => {
      const wallet = 'Wallet11111111111111111111111111111111111';
      const error = new WalletNotLinkedError(wallet);

      expect(error.message).toContain(wallet);
      expect(error.code).toBe('WALLET_NOT_LINKED');
      expect(error.statusCode).toBe(403);
      expect(error.name).toBe('WalletNotLinkedError');
    });
  });

  describe('Error inheritance chain', () => {
    it('all errors should be catchable as AppsFunError', () => {
      const errors = [
        new InsufficientBalanceError(BigInt(100), BigInt(50)),
        new TokenNotFoundError('mint'),
        new UnauthorizedError(),
        new WalletNotLinkedError('wallet'),
      ];

      errors.forEach((error) => {
        expect(error instanceof AppsFunError).toBe(true);
        expect(error instanceof Error).toBe(true);
      });
    });
  });
});
