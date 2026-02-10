/**
 * Tests for src/evm/trading.ts
 *
 * Public API under test:
 *   - getEVMQuote(client, networkId, params): Promise<EVMQuoteResult>
 *   - executeEVMBuy(publicClient, walletClient, networkId, params): Promise<EVMTradeResult>
 *   - executeEVMSell(publicClient, walletClient, networkId, params): Promise<EVMTradeResult>
 *
 * Behavioral contracts:
 *   - getEVMQuote: buy side sends ETH amount to quoteSwapExactETHForTokens, returns token amount
 *   - getEVMQuote: sell side sends token amount to quoteSwapExactTokensForETH, returns ETH amount
 *   - getEVMQuote: pricePerToken = ethAmount / tokenAmount
 *   - executeEVMBuy: gets quote, calculates slippage-adjusted minimum, calls swapExactETHForTokens with ETH value
 *   - executeEVMSell: gets quote, checks allowance, approves if needed, calls swapExactTokensForETH
 *   - All throw for unconfigured networks
 *   - All throw for missing wallet account
 *   - Default slippage is 100 bps (1%)
 *   - Default deadline is ~20 minutes from now
 *   - appsFunAddress override is respected when provided
 *
 * Mocking boundary: viem client readContract/writeContract (network I/O)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseUnits } from 'viem';
import fc from 'fast-check';
import { getEVMQuote, executeEVMBuy, executeEVMSell } from '../../evm/trading';
import type { EVMPublicClient } from '../../evm/client';

const TOKEN_ADDR = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as `0x${string}`;
const ACCOUNT_ADDR = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as `0x${string}`;
const TX_HASH = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as `0x${string}`;

function makeMockPublicClient() {
  return {
    readContract: vi.fn(),
    chain: { id: 11155111, name: 'Sepolia' },
  } as unknown as EVMPublicClient;
}

function makeMockWalletClient(account?: { address: `0x${string}` }) {
  return {
    writeContract: vi.fn().mockResolvedValue(TX_HASH),
    account: account ?? { address: ACCOUNT_ADDR },
  } as any;
}

// ============================================================
// getEVMQuote
// ============================================================

describe('getEVMQuote', () => {
  it('throws for unconfigured network (solana)', async () => {
    const client = makeMockPublicClient();
    await expect(
      getEVMQuote(client, 'solana', { tokenAddress: TOKEN_ADDR, amount: 1, side: 'buy' }),
    ).rejects.toThrow('EVM contracts not configured for network: solana');
  });

  describe('buy side', () => {
    it('calls quoteSwapExactETHForTokens with correct args', async () => {
      const client = makeMockPublicClient();
      const ethAmount = 0.5;
      const expectedTokensRaw = parseUnits('1000', 18);
      (client.readContract as ReturnType<typeof vi.fn>).mockResolvedValue(expectedTokensRaw);

      await getEVMQuote(client, 'sepolia', {
        tokenAddress: TOKEN_ADDR,
        amount: ethAmount,
        side: 'buy',
      });

      expect(client.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'quoteSwapExactETHForTokens',
          args: [parseUnits('0.5', 18), TOKEN_ADDR],
        }),
      );
    });

    it('returns correct tokenAmount and ethAmount', async () => {
      const client = makeMockPublicClient();
      const expectedTokensRaw = parseUnits('2000', 18);
      (client.readContract as ReturnType<typeof vi.fn>).mockResolvedValue(expectedTokensRaw);

      const result = await getEVMQuote(client, 'sepolia', {
        tokenAddress: TOKEN_ADDR,
        amount: 1,
        side: 'buy',
      });

      expect(result.ethAmount).toBe(1);
      expect(result.tokenAmount).toBe(2000);
      expect(result.tokenAmountRaw).toBe(expectedTokensRaw);
      expect(result.ethAmountRaw).toBe(parseUnits('1', 18));
    });

    it('computes pricePerToken as ethAmount / tokenAmount', async () => {
      const client = makeMockPublicClient();
      const tokensRaw = parseUnits('500', 18);
      (client.readContract as ReturnType<typeof vi.fn>).mockResolvedValue(tokensRaw);

      const result = await getEVMQuote(client, 'sepolia', {
        tokenAddress: TOKEN_ADDR,
        amount: 2,
        side: 'buy',
      });

      // pricePerToken = 2 ETH / 500 tokens = 0.004
      expect(result.pricePerToken).toBeCloseTo(0.004, 10);
    });
  });

  describe('sell side', () => {
    it('calls quoteSwapExactTokensForETH with correct args', async () => {
      const client = makeMockPublicClient();
      const ethOutRaw = parseUnits('0.5', 18);
      (client.readContract as ReturnType<typeof vi.fn>).mockResolvedValue(ethOutRaw);

      await getEVMQuote(client, 'sepolia', {
        tokenAddress: TOKEN_ADDR,
        amount: 1000,
        side: 'sell',
      });

      expect(client.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'quoteSwapExactTokensForETH',
          args: [parseUnits('1000', 18), TOKEN_ADDR],
        }),
      );
    });

    it('returns correct tokenAmount and ethAmount', async () => {
      const client = makeMockPublicClient();
      const ethOutRaw = parseUnits('3', 18);
      (client.readContract as ReturnType<typeof vi.fn>).mockResolvedValue(ethOutRaw);

      const result = await getEVMQuote(client, 'sepolia', {
        tokenAddress: TOKEN_ADDR,
        amount: 600,
        side: 'sell',
      });

      expect(result.tokenAmount).toBe(600);
      expect(result.ethAmount).toBe(3);
      expect(result.ethAmountRaw).toBe(ethOutRaw);
      expect(result.tokenAmountRaw).toBe(parseUnits('600', 18));
    });

    it('computes pricePerToken as ethAmount / tokenAmount', async () => {
      const client = makeMockPublicClient();
      const ethOutRaw = parseUnits('1', 18);
      (client.readContract as ReturnType<typeof vi.fn>).mockResolvedValue(ethOutRaw);

      const result = await getEVMQuote(client, 'sepolia', {
        tokenAddress: TOKEN_ADDR,
        amount: 250,
        side: 'sell',
      });

      // pricePerToken = 1 ETH / 250 tokens = 0.004
      expect(result.pricePerToken).toBeCloseTo(0.004, 10);
    });
  });

  it('uses appsFunAddress override when provided', async () => {
    const client = makeMockPublicClient();
    const override = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC' as `0x${string}`;
    (client.readContract as ReturnType<typeof vi.fn>).mockResolvedValue(parseUnits('1', 18));

    await getEVMQuote(client, 'sepolia', {
      tokenAddress: TOKEN_ADDR,
      amount: 1,
      side: 'buy',
      appsFunAddress: override,
    });

    expect(client.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: override }),
    );
  });
});

// ============================================================
// executeEVMBuy
// ============================================================

describe('executeEVMBuy', () => {
  let publicClient: ReturnType<typeof makeMockPublicClient>;
  let walletClient: ReturnType<typeof makeMockWalletClient>;

  beforeEach(() => {
    publicClient = makeMockPublicClient();
    walletClient = makeMockWalletClient();
    // Mock quote response
    (publicClient.readContract as ReturnType<typeof vi.fn>).mockResolvedValue(
      parseUnits('1000', 18),
    );
  });

  it('throws for unconfigured network', async () => {
    await expect(
      executeEVMBuy(publicClient, walletClient, 'solana', {
        tokenAddress: TOKEN_ADDR,
        amount: 1,
        side: 'buy',
      }),
    ).rejects.toThrow('EVM contracts not configured');
  });

  it('throws when wallet has no account', async () => {
    const noAccountWallet = { writeContract: vi.fn(), account: undefined } as any;
    await expect(
      executeEVMBuy(publicClient, noAccountWallet, 'sepolia', {
        tokenAddress: TOKEN_ADDR,
        amount: 1,
        side: 'buy',
      }),
    ).rejects.toThrow('Wallet client has no account');
  });

  it('returns transaction hash from writeContract', async () => {
    const result = await executeEVMBuy(publicClient, walletClient, 'sepolia', {
      tokenAddress: TOKEN_ADDR,
      amount: 1,
      side: 'buy',
    });

    expect(result.hash).toBe(TX_HASH);
  });

  it('calls swapExactETHForTokens with ETH value', async () => {
    await executeEVMBuy(publicClient, walletClient, 'sepolia', {
      tokenAddress: TOKEN_ADDR,
      amount: 1,
      side: 'buy',
    });

    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'swapExactETHForTokens',
        value: parseUnits('1', 18),
      }),
    );
  });

  it('applies default 1% slippage to minimum output', async () => {
    // Quote returns 1000 tokens
    // 1% slippage = 990 minimum
    await executeEVMBuy(publicClient, walletClient, 'sepolia', {
      tokenAddress: TOKEN_ADDR,
      amount: 1,
      side: 'buy',
    });

    const callArgs = walletClient.writeContract.mock.calls[0][0];
    const amountOutMin = callArgs.args[0] as bigint;
    const expectedMin = parseUnits('1000', 18) * BigInt(9900) / BigInt(10000);
    expect(amountOutMin).toBe(expectedMin);
  });

  it('applies custom slippage when provided', async () => {
    await executeEVMBuy(publicClient, walletClient, 'sepolia', {
      tokenAddress: TOKEN_ADDR,
      amount: 1,
      side: 'buy',
      slippageBps: 500, // 5%
    });

    const callArgs = walletClient.writeContract.mock.calls[0][0];
    const amountOutMin = callArgs.args[0] as bigint;
    const expectedMin = parseUnits('1000', 18) * BigInt(9500) / BigInt(10000);
    expect(amountOutMin).toBe(expectedMin);
  });

  it('returns tokenAmount and ethAmount from quote', async () => {
    const result = await executeEVMBuy(publicClient, walletClient, 'sepolia', {
      tokenAddress: TOKEN_ADDR,
      amount: 1,
      side: 'buy',
    });

    expect(result.tokenAmount).toBe(parseUnits('1000', 18));
    expect(result.ethAmount).toBe(parseUnits('1', 18));
  });

  it('passes token address and recipient in correct arg positions', async () => {
    await executeEVMBuy(publicClient, walletClient, 'sepolia', {
      tokenAddress: TOKEN_ADDR,
      amount: 1,
      side: 'buy',
    });

    const callArgs = walletClient.writeContract.mock.calls[0][0];
    // args: [amountOutMin, tokenAddress, to, deadline]
    expect(callArgs.args[1]).toBe(TOKEN_ADDR);
    expect(callArgs.args[2]).toBe(ACCOUNT_ADDR);
  });

  // Property: slippage-adjusted min is always less than or equal to quote output
  it('amountOutMin <= quoted tokenAmount for any valid slippage', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        (slippageBps) => {
          const quoteAmount = BigInt('1000000000000000000000'); // 1000 tokens
          const min = quoteAmount * BigInt(10000 - slippageBps) / BigInt(10000);
          return min <= quoteAmount;
        },
      ),
    );
  });

  it('uses default appsFun address from contracts when no override provided', async () => {
    await executeEVMBuy(publicClient, walletClient, 'sepolia', {
      tokenAddress: TOKEN_ADDR,
      amount: 1,
      side: 'buy',
    });

    const callArgs = walletClient.writeContract.mock.calls[0][0];
    // Must use the appsFun address from getEVMContracts
    expect(callArgs.address).toBe('0xFfFFfFfffF6469850a0619fDFbA72cf4b4efcd3D');
  });

  it('deadline is approximately now + 1200 seconds', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    await executeEVMBuy(publicClient, walletClient, 'sepolia', {
      tokenAddress: TOKEN_ADDR,
      amount: 1,
      side: 'buy',
    });

    const callArgs = walletClient.writeContract.mock.calls[0][0];
    // args: [amountOutMin, tokenAddress, to, deadline]
    const deadline = Number(callArgs.args[3]);
    // deadline should be within a few seconds of nowSec + 1200
    expect(deadline).toBeGreaterThanOrEqual(nowSec + 1200);
    expect(deadline).toBeLessThan(nowSec + 1210);
  });

  it('uses custom deadline when provided', async () => {
    const customDeadline = 1999999999;
    await executeEVMBuy(publicClient, walletClient, 'sepolia', {
      tokenAddress: TOKEN_ADDR,
      amount: 1,
      side: 'buy',
      deadline: customDeadline,
    });

    const callArgs = walletClient.writeContract.mock.calls[0][0];
    expect(Number(callArgs.args[3])).toBe(customDeadline);
  });

  it('uses appsFunAddress override for buy', async () => {
    const override = '0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD' as `0x${string}`;
    await executeEVMBuy(publicClient, walletClient, 'sepolia', {
      tokenAddress: TOKEN_ADDR,
      amount: 1,
      side: 'buy',
      appsFunAddress: override,
    });

    const callArgs = walletClient.writeContract.mock.calls[0][0];
    expect(callArgs.address).toBe(override);
  });
});

// ============================================================
// executeEVMSell
// ============================================================

describe('executeEVMSell', () => {
  let publicClient: ReturnType<typeof makeMockPublicClient>;
  let walletClient: ReturnType<typeof makeMockWalletClient>;

  beforeEach(() => {
    publicClient = makeMockPublicClient();
    walletClient = makeMockWalletClient();
    // Mock quote response (returns ETH out for sell)
    (publicClient.readContract as ReturnType<typeof vi.fn>).mockResolvedValue(
      parseUnits('2', 18), // 2 ETH out
    );
  });

  it('throws for unconfigured network', async () => {
    await expect(
      executeEVMSell(publicClient, walletClient, 'solana', {
        tokenAddress: TOKEN_ADDR,
        amount: 1000,
        side: 'sell',
      }),
    ).rejects.toThrow('EVM contracts not configured');
  });

  it('throws when wallet has no account', async () => {
    const noAccountWallet = { writeContract: vi.fn(), account: undefined } as any;
    await expect(
      executeEVMSell(publicClient, noAccountWallet, 'sepolia', {
        tokenAddress: TOKEN_ADDR,
        amount: 1000,
        side: 'sell',
      }),
    ).rejects.toThrow('Wallet client has no account');
  });

  it('approves max uint256 when allowance is insufficient', async () => {
    // readContract is called for: quote, then allowance
    // First call = quote (returns ETH), second call = allowance (returns 0)
    const readMock = publicClient.readContract as ReturnType<typeof vi.fn>;
    readMock
      .mockResolvedValueOnce(parseUnits('2', 18)) // quote
      .mockResolvedValueOnce(BigInt(0)); // allowance = 0 (insufficient)

    await executeEVMSell(publicClient, walletClient, 'sepolia', {
      tokenAddress: TOKEN_ADDR,
      amount: 1000,
      side: 'sell',
    });

    // First writeContract call = approve, second = swap
    expect(walletClient.writeContract).toHaveBeenCalledTimes(2);

    const approveCall = walletClient.writeContract.mock.calls[0][0];
    expect(approveCall.functionName).toBe('approve');
    expect(approveCall.address).toBe(TOKEN_ADDR);
    // Max uint256
    expect(approveCall.args[1]).toBe(
      BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),
    );
  });

  it('skips approval when allowance is sufficient', async () => {
    const readMock = publicClient.readContract as ReturnType<typeof vi.fn>;
    readMock
      .mockResolvedValueOnce(parseUnits('2', 18)) // quote
      .mockResolvedValueOnce(parseUnits('999999', 18)); // allowance = huge

    await executeEVMSell(publicClient, walletClient, 'sepolia', {
      tokenAddress: TOKEN_ADDR,
      amount: 1000,
      side: 'sell',
    });

    // Only the swap call, no approve
    expect(walletClient.writeContract).toHaveBeenCalledTimes(1);
    expect(walletClient.writeContract.mock.calls[0][0].functionName).toBe(
      'swapExactTokensForETH',
    );
  });

  it('calls swapExactTokensForETH with correct args', async () => {
    const readMock = publicClient.readContract as ReturnType<typeof vi.fn>;
    readMock
      .mockResolvedValueOnce(parseUnits('2', 18)) // quote
      .mockResolvedValueOnce(parseUnits('999999', 18)); // allowance sufficient

    await executeEVMSell(publicClient, walletClient, 'sepolia', {
      tokenAddress: TOKEN_ADDR,
      amount: 1000,
      side: 'sell',
    });

    const swapCall = walletClient.writeContract.mock.calls[0][0];
    expect(swapCall.functionName).toBe('swapExactTokensForETH');
    // args: [tokenAmountRaw, amountOutMin, tokenAddress, to, deadline]
    expect(swapCall.args[0]).toBe(parseUnits('1000', 18)); // token amount
    expect(swapCall.args[2]).toBe(TOKEN_ADDR);
    expect(swapCall.args[3]).toBe(ACCOUNT_ADDR);
  });

  it('applies default 1% slippage to ETH minimum output', async () => {
    const readMock = publicClient.readContract as ReturnType<typeof vi.fn>;
    readMock
      .mockResolvedValueOnce(parseUnits('2', 18)) // quote: 2 ETH
      .mockResolvedValueOnce(parseUnits('999999', 18)); // allowance sufficient

    await executeEVMSell(publicClient, walletClient, 'sepolia', {
      tokenAddress: TOKEN_ADDR,
      amount: 1000,
      side: 'sell',
    });

    const swapCall = walletClient.writeContract.mock.calls[0][0];
    const amountOutMin = swapCall.args[1] as bigint;
    const expectedMin = parseUnits('2', 18) * BigInt(9900) / BigInt(10000);
    expect(amountOutMin).toBe(expectedMin);
  });

  it('returns transaction hash, tokenAmount, ethAmount', async () => {
    const readMock = publicClient.readContract as ReturnType<typeof vi.fn>;
    readMock
      .mockResolvedValueOnce(parseUnits('2', 18))
      .mockResolvedValueOnce(parseUnits('999999', 18));

    const result = await executeEVMSell(publicClient, walletClient, 'sepolia', {
      tokenAddress: TOKEN_ADDR,
      amount: 1000,
      side: 'sell',
    });

    expect(result.hash).toBe(TX_HASH);
    expect(result.tokenAmount).toBe(parseUnits('1000', 18));
    expect(result.ethAmount).toBe(parseUnits('2', 18));
  });

  it('skips approval when allowance exactly equals token amount (boundary)', async () => {
    // This tests the boundary: allowance == tokenAmountRaw should NOT trigger approval
    // The code uses `<`, so exactly equal should skip approval
    const tokenAmountRaw = parseUnits('1000', 18);
    const readMock = publicClient.readContract as ReturnType<typeof vi.fn>;
    readMock
      .mockResolvedValueOnce(parseUnits('2', 18)) // quote
      .mockResolvedValueOnce(tokenAmountRaw); // allowance = exactly the token amount

    await executeEVMSell(publicClient, walletClient, 'sepolia', {
      tokenAddress: TOKEN_ADDR,
      amount: 1000,
      side: 'sell',
    });

    // Only swap call, no approval
    expect(walletClient.writeContract).toHaveBeenCalledTimes(1);
    expect(walletClient.writeContract.mock.calls[0][0].functionName).toBe(
      'swapExactTokensForETH',
    );
  });

  it('triggers approval when allowance is one less than token amount (boundary)', async () => {
    const tokenAmountRaw = parseUnits('1000', 18);
    const readMock = publicClient.readContract as ReturnType<typeof vi.fn>;
    readMock
      .mockResolvedValueOnce(parseUnits('2', 18)) // quote
      .mockResolvedValueOnce(tokenAmountRaw - BigInt(1)); // allowance = one less

    await executeEVMSell(publicClient, walletClient, 'sepolia', {
      tokenAddress: TOKEN_ADDR,
      amount: 1000,
      side: 'sell',
    });

    // Approve + swap = 2 calls
    expect(walletClient.writeContract).toHaveBeenCalledTimes(2);
    expect(walletClient.writeContract.mock.calls[0][0].functionName).toBe('approve');
  });

  it('sell quote call uses sell side', async () => {
    const readMock = publicClient.readContract as ReturnType<typeof vi.fn>;
    readMock
      .mockResolvedValueOnce(parseUnits('2', 18)) // quote
      .mockResolvedValueOnce(parseUnits('999999', 18)); // allowance sufficient

    await executeEVMSell(publicClient, walletClient, 'sepolia', {
      tokenAddress: TOKEN_ADDR,
      amount: 1000,
      side: 'sell',
    });

    // The quote readContract call should use quoteSwapExactTokensForETH (sell side)
    const quoteCall = (publicClient.readContract as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(quoteCall.functionName).toBe('quoteSwapExactTokensForETH');
  });

  it('sell deadline is approximately now + 1200 seconds', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const readMock = publicClient.readContract as ReturnType<typeof vi.fn>;
    readMock
      .mockResolvedValueOnce(parseUnits('2', 18))
      .mockResolvedValueOnce(parseUnits('999999', 18));

    await executeEVMSell(publicClient, walletClient, 'sepolia', {
      tokenAddress: TOKEN_ADDR,
      amount: 1000,
      side: 'sell',
    });

    const swapCall = walletClient.writeContract.mock.calls[0][0];
    // args: [tokenAmountRaw, amountOutMin, tokenAddress, to, deadline]
    const deadline = Number(swapCall.args[4]);
    expect(deadline).toBeGreaterThanOrEqual(nowSec + 1200);
    expect(deadline).toBeLessThan(nowSec + 1210);
  });

  it('uses appsFunAddress override for both allowance check and swap', async () => {
    const override = '0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD' as `0x${string}`;
    const readMock = publicClient.readContract as ReturnType<typeof vi.fn>;
    readMock
      .mockResolvedValueOnce(parseUnits('2', 18)) // quote
      .mockResolvedValueOnce(BigInt(0)); // allowance = 0

    await executeEVMSell(publicClient, walletClient, 'sepolia', {
      tokenAddress: TOKEN_ADDR,
      amount: 1000,
      side: 'sell',
      appsFunAddress: override,
    });

    // Quote call uses override address
    const quoteCall = readMock.mock.calls[0][0] as Record<string, unknown>;
    expect(quoteCall.address).toBe(override);

    // Approve call: spender = override
    const approveCall = walletClient.writeContract.mock.calls[0][0];
    expect(approveCall.args[0]).toBe(override);

    // Swap call uses override address
    const swapCall = walletClient.writeContract.mock.calls[1][0];
    expect(swapCall.address).toBe(override);
  });
});
