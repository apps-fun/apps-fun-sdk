/**
 * Tests for src/evm/portfolio.ts
 *
 * Public API under test:
 *   - getEVMPortfolio(client, networkId, walletAddress, tokens[]): Promise<PortfolioEntry[]>
 *
 * Behavioral contracts:
 *   - Queries balance and decimals for each token
 *   - Queries ETH value via sell quote for tokens with balance > 0
 *   - Skips quote for zero-balance tokens (ethValue = 0)
 *   - Uses Promise.allSettled so one failure does not break others
 *   - Excludes failed tokens from result
 *   - Returns entries in input order (minus failures)
 *   - Returns empty array for empty token list
 *   - Handles quote failures gracefully (ethValue = 0)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../evm/client', () => ({
  getEVMTokenBalance: vi.fn(),
}));

vi.mock('../../evm/tokenInfo', () => ({
  getEVMTokenDecimals: vi.fn(),
}));

vi.mock('../../evm/trading', () => ({
  getEVMQuote: vi.fn(),
}));

import { getEVMTokenBalance } from '../../evm/client';
import { getEVMTokenDecimals } from '../../evm/tokenInfo';
import { getEVMQuote } from '../../evm/trading';
import { getEVMPortfolio } from '../../evm/portfolio';

const WALLET = '0xWALLET00000000000000000000000000000000000' as `0x${string}`;
const TOKEN_A = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as `0x${string}`;
const TOKEN_B = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as `0x${string}`;

describe('getEVMPortfolio', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns balance and ethValue for each token', async () => {
    vi.mocked(getEVMTokenBalance)
      .mockResolvedValueOnce(1000000000000000000n)  // 1 token (18 decimals)
      .mockResolvedValueOnce(2000000000000000000n);  // 2 tokens
    vi.mocked(getEVMTokenDecimals)
      .mockResolvedValue(18);
    vi.mocked(getEVMQuote)
      .mockResolvedValueOnce({ tokenAmount: 1, tokenAmountRaw: 1000000000000000000n, ethAmount: 0.5, ethAmountRaw: 500000000000000000n, pricePerToken: 0.5 })
      .mockResolvedValueOnce({ tokenAmount: 2, tokenAmountRaw: 2000000000000000000n, ethAmount: 1.0, ethAmountRaw: 1000000000000000000n, pricePerToken: 0.5 });

    const result = await getEVMPortfolio({} as any, 'sepolia', WALLET, [TOKEN_A, TOKEN_B]);

    expect(result.length).toBe(2);
    expect(result[0].token).toBe(TOKEN_A);
    expect(result[0].balance).toBe(1000000000000000000n);
    expect(result[0].ethValueFormatted).toBe(0.5);
    expect(result[1].token).toBe(TOKEN_B);
    expect(result[1].ethValueFormatted).toBe(1.0);
  });

  it('formats balance with correct decimals', async () => {
    vi.mocked(getEVMTokenBalance).mockResolvedValue(1000000n); // 1 token with 6 decimals
    vi.mocked(getEVMTokenDecimals).mockResolvedValue(6);
    vi.mocked(getEVMQuote).mockResolvedValue({
      tokenAmount: 1, tokenAmountRaw: 1000000n, ethAmount: 0.1, ethAmountRaw: 100000000000000000n, pricePerToken: 0.1,
    });

    const result = await getEVMPortfolio({} as any, 'sepolia', WALLET, [TOKEN_A]);

    expect(result[0].balanceFormatted).toBe(1);
    expect(result[0].decimals).toBe(6);
  });

  it('skips quote for zero-balance tokens', async () => {
    vi.mocked(getEVMTokenBalance).mockResolvedValue(0n);
    vi.mocked(getEVMTokenDecimals).mockResolvedValue(18);

    const result = await getEVMPortfolio({} as any, 'sepolia', WALLET, [TOKEN_A]);

    expect(getEVMQuote).not.toHaveBeenCalled();
    expect(result[0].ethValue).toBe(0n);
    expect(result[0].ethValueFormatted).toBe(0);
  });

  it('excludes failed tokens from result', async () => {
    vi.mocked(getEVMTokenBalance)
      .mockRejectedValueOnce(new Error('not a contract'))
      .mockResolvedValueOnce(1000000000000000000n);
    vi.mocked(getEVMTokenDecimals).mockResolvedValue(18);
    vi.mocked(getEVMQuote).mockResolvedValue({
      tokenAmount: 1, tokenAmountRaw: 1000000000000000000n, ethAmount: 0.5, ethAmountRaw: 500000000000000000n, pricePerToken: 0.5,
    });

    const result = await getEVMPortfolio({} as any, 'sepolia', WALLET, [TOKEN_A, TOKEN_B]);

    expect(result.length).toBe(1);
    expect(result[0].token).toBe(TOKEN_B);
  });

  it('returns entries in input order', async () => {
    vi.mocked(getEVMTokenBalance)
      .mockResolvedValueOnce(2000000000000000000n)
      .mockResolvedValueOnce(1000000000000000000n);
    vi.mocked(getEVMTokenDecimals).mockResolvedValue(18);
    vi.mocked(getEVMQuote).mockResolvedValue({
      tokenAmount: 1, tokenAmountRaw: 1n, ethAmount: 0.1, ethAmountRaw: 100000000000000000n, pricePerToken: 0.1,
    });

    const result = await getEVMPortfolio({} as any, 'sepolia', WALLET, [TOKEN_A, TOKEN_B]);

    expect(result[0].token).toBe(TOKEN_A);
    expect(result[1].token).toBe(TOKEN_B);
  });

  it('handles single token', async () => {
    vi.mocked(getEVMTokenBalance).mockResolvedValue(500000000000000000n);
    vi.mocked(getEVMTokenDecimals).mockResolvedValue(18);
    vi.mocked(getEVMQuote).mockResolvedValue({
      tokenAmount: 0.5, tokenAmountRaw: 500000000000000000n, ethAmount: 0.25, ethAmountRaw: 250000000000000000n, pricePerToken: 0.5,
    });

    const result = await getEVMPortfolio({} as any, 'sepolia', WALLET, [TOKEN_A]);

    expect(result.length).toBe(1);
    expect(result[0].balanceFormatted).toBe(0.5);
  });

  it('handles empty token list', async () => {
    const result = await getEVMPortfolio({} as any, 'sepolia', WALLET, []);

    expect(result).toEqual([]);
    expect(getEVMTokenBalance).not.toHaveBeenCalled();
  });

  it('sets ethValue to 0 for zero-balance tokens', async () => {
    vi.mocked(getEVMTokenBalance).mockResolvedValue(0n);
    vi.mocked(getEVMTokenDecimals).mockResolvedValue(18);

    const result = await getEVMPortfolio({} as any, 'sepolia', WALLET, [TOKEN_A]);

    expect(result[0].balance).toBe(0n);
    expect(result[0].ethValue).toBe(0n);
    expect(result[0].ethValueFormatted).toBe(0);
    expect(result[0].balanceFormatted).toBe(0);
  });

  it('handles quote failure gracefully with ethValue 0', async () => {
    vi.mocked(getEVMTokenBalance).mockResolvedValue(1000000000000000000n);
    vi.mocked(getEVMTokenDecimals).mockResolvedValue(18);
    vi.mocked(getEVMQuote).mockRejectedValue(new Error('no liquidity'));

    const result = await getEVMPortfolio({} as any, 'sepolia', WALLET, [TOKEN_A]);

    expect(result.length).toBe(1);
    expect(result[0].ethValue).toBe(0n);
    expect(result[0].ethValueFormatted).toBe(0);
    expect(result[0].balanceFormatted).toBe(1);
  });

  it('calls getEVMQuote with sell side and formatted balance', async () => {
    vi.mocked(getEVMTokenBalance).mockResolvedValue(2000000000000000000n);
    vi.mocked(getEVMTokenDecimals).mockResolvedValue(18);
    vi.mocked(getEVMQuote).mockResolvedValue({
      tokenAmount: 2, tokenAmountRaw: 2000000000000000000n, ethAmount: 1, ethAmountRaw: 1000000000000000000n, pricePerToken: 0.5,
    });

    await getEVMPortfolio({} as any, 'sepolia', WALLET, [TOKEN_A]);

    expect(getEVMQuote).toHaveBeenCalledWith(
      expect.anything(),
      'sepolia',
      expect.objectContaining({
        tokenAddress: TOKEN_A,
        amount: 2,
        side: 'sell',
      })
    );
  });
});
