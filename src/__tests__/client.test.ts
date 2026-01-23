import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppsFunClient } from '../client';
import {
  AppsFunError,
  UnauthorizedError,
  TokenNotFoundError,
} from '../types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AppsFunClient', () => {
  let client: AppsFunClient;

  beforeEach(() => {
    client = new AppsFunClient({
      apiUrl: 'https://test.apps.fun',
      cluster: 'devnet',
    });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should use default API URL if not provided', () => {
      const defaultClient = new AppsFunClient({ cluster: 'devnet' });
      expect(defaultClient).toBeDefined();
    });

    it('should accept custom API URL', () => {
      const customClient = new AppsFunClient({
        apiUrl: 'https://custom.api.com',
        cluster: 'devnet',
      });
      expect(customClient).toBeDefined();
    });
  });

  describe('getQuote', () => {
    it('should fetch quote with correct parameters', async () => {
      const mockQuote = {
        solAmount: 1.5,
        tokenAmount: 1000000,
        pricePerToken: 0.0000015,
        priceImpact: 0.5,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockQuote,
      });

      const result = await client.getQuote({
        mintAddress: 'So11111111111111111111111111111111111111112',
        amount: 1,
        inputMode: 'sol',
        side: 'buy',
      });

      expect(result).toEqual(mockQuote);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('/api/v1/trades/quote');
      expect(calledUrl).toContain('mintAddress=So11111111111111111111111111111111111111112');
      expect(calledUrl).toContain('amount=1');
      expect(calledUrl).toContain('inputMode=sol');
      expect(calledUrl).toContain('side=buy');
    });

    it('should throw AppsFunError on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid mint address' }),
      });

      await expect(
        client.getQuote({
          mintAddress: 'invalid',
          amount: 1,
          inputMode: 'sol',
          side: 'buy',
        })
      ).rejects.toThrow(AppsFunError);
    });
  });

  describe('prepareTrade', () => {
    const authToken = 'test-auth-token';

    it('should prepare trade with correct headers and body', async () => {
      const mockResponse = {
        transaction: 'base64-encoded-tx',
        estimatedTokens: 1000000,
        estimatedSol: 1.5,
        estimatedPrice: 0.0000015,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.prepareTrade(
        {
          mintAddress: 'So11111111111111111111111111111111111111112',
          amount: 1,
          inputMode: 'sol',
          side: 'buy',
          walletAddress: '11111111111111111111111111111111',
          slippageBps: 500,
        },
        authToken
      );

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.apps.fun/api/v1/trades/prepare',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
        })
      );
    });

    it('should throw UnauthorizedError on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      });

      await expect(
        client.prepareTrade(
          {
            mintAddress: 'So11111111111111111111111111111111111111112',
            amount: 1,
            inputMode: 'sol',
            side: 'buy',
            walletAddress: '11111111111111111111111111111111',
          },
          authToken
        )
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('submitTrade', () => {
    const authToken = 'test-auth-token';

    it('should submit trade with correct body', async () => {
      const mockResponse = {
        success: true,
        signature: 'tx-signature-123',
        trade: {
          id: '1',
          signature: 'tx-signature-123',
          side: 'buy' as const,
          amount_tokens: 1000000,
          amount_sol: 1.5,
          price_per_token: 0.0000015,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.submitTrade(
        {
          signedTransaction: 'signed-tx-base64',
          tokenMint: 'So11111111111111111111111111111111111111112',
          side: 'buy',
          solAmount: 1.5,
          tokenAmount: 1000000,
          pricePerToken: 0.0000015,
          walletAddress: '11111111111111111111111111111111',
        },
        authToken
      );

      expect(result).toEqual(mockResponse);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.tokenId).toBe('So11111111111111111111111111111111111111112');
      expect(callBody.signedTransaction).toBe('signed-tx-base64');
    });
  });

  describe('getEarnings', () => {
    const authToken = 'test-auth-token';

    it('should fetch earnings with auth header', async () => {
      const mockEarnings = {
        totalClaimable: 0.5,
        totalClaimed: 1.2,
        byToken: [
          {
            tokenMint: 'So11111111111111111111111111111111111111112',
            tokenSymbol: 'TEST',
            appName: 'Test App',
            claimable: 0.5,
            claimed: 1.2,
            role: 'owner',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockEarnings,
      });

      const result = await client.getEarnings(authToken);

      expect(result).toEqual(mockEarnings);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.apps.fun/api/v1/earnings',
        expect.objectContaining({
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        })
      );
    });

    it('should throw UnauthorizedError on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      });

      await expect(client.getEarnings(authToken)).rejects.toThrow(
        UnauthorizedError
      );
    });
  });

  describe('getMarketData', () => {
    it('should fetch market data', async () => {
      const mockMarket = {
        price: 0.0000015,
        priceUsd: 0.00025,
        marketCap: 1500,
        marketCapUsd: 250000,
        volume24h: 100,
        volume24hUsd: 16500,
        priceChange24h: 5.2,
        bondingProgress: 45,
        totalFees: 1.5,
        source: 'meteora' as const,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMarket,
      });

      const result = await client.getMarketData(
        'So11111111111111111111111111111111111111112'
      );

      expect(result).toEqual(mockMarket);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.apps.fun/api/v1/tokens/So11111111111111111111111111111111111111112/market'
      );
    });

    it('should throw TokenNotFoundError on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Token not found' }),
      });

      await expect(
        client.getMarketData('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
      ).rejects.toThrow(TokenNotFoundError);
    });
  });

  describe('prepareTokenLaunch', () => {
    const authToken = 'test-auth-token';

    it('should prepare token launch with correct body', async () => {
      const mockResponse = {
        tokenId: 'pool-address',
        mintAddress: 'mint-address',
        transaction: 'tx-base64',
        mintKeypair: 'keypair-base64',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.prepareTokenLaunch(
        {
          appId: 123,
          name: 'Test Token',
          symbol: 'TEST',
          description: 'A test token',
          imageUrl: 'https://example.com/logo.png',
          creatorWallet: '11111111111111111111111111111111',
          supply: 1_000_000_000,
        },
        authToken
      );

      expect(result).toEqual(mockResponse);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.appId).toBe(123);
      expect(callBody.name).toBe('Test Token');
      expect(callBody.symbol).toBe('TEST');
      expect(callBody.supply).toBe(1_000_000_000);
    });
  });

  describe('prepareBurn', () => {
    const authToken = 'test-auth-token';

    it('should prepare burn transaction', async () => {
      const mockResponse = {
        transaction: 'burn-tx-base64',
        burnAmount: '1000000000',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.prepareBurn(
        {
          tokenMint: 'So11111111111111111111111111111111111111112',
          amount: '1000000000',
          walletAddress: '11111111111111111111111111111111',
        },
        authToken
      );

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.apps.fun/api/v1/tokens/burn/prepare',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
        })
      );
    });
  });

  describe('submitBurn', () => {
    const authToken = 'test-auth-token';

    it('should submit burn transaction', async () => {
      const mockResponse = {
        success: true,
        signature: 'burn-tx-signature',
        burnedAmount: '1000000000',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.submitBurn(
        {
          signedTransaction: 'signed-burn-tx',
          tokenMint: 'So11111111111111111111111111111111111111112',
          amount: '1000000000',
          walletAddress: '11111111111111111111111111111111',
        },
        authToken
      );

      expect(result).toEqual(mockResponse);
    });
  });

  describe('helper methods', () => {
    describe('hasMinBalance', () => {
      it('should return true when balance is sufficient', async () => {
        // Mock getTokenBalance
        const mockBalance = BigInt(2_000_000_000);
        vi.spyOn(client, 'getTokenBalance').mockResolvedValue(mockBalance);

        const result = await client.hasMinBalance(
          'So11111111111111111111111111111111111111112',
          '11111111111111111111111111111111',
          BigInt(1_000_000_000)
        );

        expect(result).toBe(true);
      });

      it('should return false when balance is insufficient', async () => {
        const mockBalance = BigInt(500_000_000);
        vi.spyOn(client, 'getTokenBalance').mockResolvedValue(mockBalance);

        const result = await client.hasMinBalance(
          'So11111111111111111111111111111111111111112',
          '11111111111111111111111111111111',
          BigInt(1_000_000_000)
        );

        expect(result).toBe(false);
      });
    });

    describe('getTokenPrice', () => {
      it('should return price from market data', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            price: 0.0000015,
            priceUsd: null,
            marketCap: 1500,
            marketCapUsd: null,
            volume24h: 100,
            volume24hUsd: null,
            priceChange24h: null,
            bondingProgress: 45,
            totalFees: 1.5,
            source: 'meteora',
          }),
        });

        const price = await client.getTokenPrice(
          'So11111111111111111111111111111111111111112'
        );

        expect(price).toBe(0.0000015);
      });
    });

    describe('getAppByToken', () => {
      it('should return app info when found', async () => {
        // First call: get token with app_id
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            token: { app_id: 123 },
          }),
        });

        // Second call: get app by id
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            app: {
              id: 123,
              name: 'Test App',
              description: 'A test app',
              url: 'https://test.app',
              status: 'active',
            },
          }),
        });

        const app = await client.getAppByToken(
          'So11111111111111111111111111111111111111112'
        );

        expect(app).toBeDefined();
        expect(app?.id).toBe(123);
        expect(app?.name).toBe('Test App');
      });

      it('should return null when token not found', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
        });

        const app = await client.getAppByToken(
          'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
        );

        expect(app).toBeNull();
      });
    });
  });
});
