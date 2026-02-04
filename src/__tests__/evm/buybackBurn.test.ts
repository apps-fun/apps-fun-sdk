/**
 * Tests for src/evm/buybackBurn.ts
 *
 * Public API under test:
 *   - buybackAndBurn(publicClient, walletClient, networkId, params): Promise<BuybackBurnResult>
 *
 * Behavioral contracts:
 *   - Calls executeEVMBuy first with the given params
 *   - Calls burnERC20 second with the tokenAmount from the buy result
 *   - Returns both hashes, tokensBurned from buy, ethSpent from buy
 *   - Error from executeEVMBuy propagates (burnERC20 not called)
 *   - Error from burnERC20 propagates
 *   - Passes slippageBps through to executeEVMBuy
 *   - Does not pass slippageBps when not provided
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../evm/trading', () => ({
  executeEVMBuy: vi.fn(),
}));

vi.mock('../../evm/tokenOps', () => ({
  burnERC20: vi.fn(),
}));

import { executeEVMBuy } from '../../evm/trading';
import { burnERC20 } from '../../evm/tokenOps';
import { buybackAndBurn } from '../../evm/buybackBurn';

const TOKEN = '0x1111111111111111111111111111111111111111' as `0x${string}`;
const BUY_HASH = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`;
const BURN_HASH = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as `0x${string}`;

const mockPublicClient = {} as any;
const mockWalletClient = {
  account: { address: '0x5555555555555555555555555555555555555555' },
  writeContract: vi.fn(),
} as any;

function mockBuyResult(overrides?: Partial<{
  hash: `0x${string}`;
  tokenAmount: bigint;
  ethAmount: bigint;
}>) {
  return {
    hash: overrides?.hash ?? BUY_HASH,
    tokenAmount: overrides?.tokenAmount ?? 5000n,
    ethAmount: overrides?.ethAmount ?? 1000n,
  };
}

describe('buybackAndBurn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(executeEVMBuy).mockResolvedValue(mockBuyResult());
    vi.mocked(burnERC20).mockResolvedValue({ hash: BURN_HASH });
  });

  it('calls executeEVMBuy with correct params', async () => {
    await buybackAndBurn(mockPublicClient, mockWalletClient, 'sepolia', {
      tokenAddress: TOKEN,
      ethAmount: 0.5,
    });

    expect(executeEVMBuy).toHaveBeenCalledWith(
      mockPublicClient,
      mockWalletClient,
      'sepolia',
      expect.objectContaining({
        tokenAddress: TOKEN,
        amount: 0.5,
        side: 'buy',
      })
    );
  });

  it('calls burnERC20 with tokenAmount from buy result', async () => {
    vi.mocked(executeEVMBuy).mockResolvedValue(mockBuyResult({ tokenAmount: 7777n }));

    await buybackAndBurn(mockPublicClient, mockWalletClient, 'sepolia', {
      tokenAddress: TOKEN,
      ethAmount: 0.5,
    });

    expect(burnERC20).toHaveBeenCalledWith(
      mockWalletClient,
      'sepolia',
      expect.objectContaining({
        tokenAddress: TOKEN,
        amount: 7777n,
      })
    );
  });

  it('returns buyHash from executeEVMBuy', async () => {
    const result = await buybackAndBurn(mockPublicClient, mockWalletClient, 'sepolia', {
      tokenAddress: TOKEN,
      ethAmount: 0.5,
    });
    expect(result.buyHash).toBe(BUY_HASH);
  });

  it('returns burnHash from burnERC20', async () => {
    const result = await buybackAndBurn(mockPublicClient, mockWalletClient, 'sepolia', {
      tokenAddress: TOKEN,
      ethAmount: 0.5,
    });
    expect(result.burnHash).toBe(BURN_HASH);
  });

  it('returns tokensBurned from buy result tokenAmount', async () => {
    vi.mocked(executeEVMBuy).mockResolvedValue(mockBuyResult({ tokenAmount: 12345n }));

    const result = await buybackAndBurn(mockPublicClient, mockWalletClient, 'sepolia', {
      tokenAddress: TOKEN,
      ethAmount: 0.5,
    });
    expect(result.tokensBurned).toBe(12345n);
  });

  it('returns ethSpent from buy result ethAmount', async () => {
    vi.mocked(executeEVMBuy).mockResolvedValue(mockBuyResult({ ethAmount: 9999n }));

    const result = await buybackAndBurn(mockPublicClient, mockWalletClient, 'sepolia', {
      tokenAddress: TOKEN,
      ethAmount: 0.5,
    });
    expect(result.ethSpent).toBe(9999n);
  });

  it('passes slippageBps through to executeEVMBuy', async () => {
    await buybackAndBurn(mockPublicClient, mockWalletClient, 'sepolia', {
      tokenAddress: TOKEN,
      ethAmount: 0.5,
      slippageBps: 200,
    });

    const callArgs = vi.mocked(executeEVMBuy).mock.calls[0][3];
    expect(callArgs.slippageBps).toBe(200);
  });

  it('does not pass slippageBps when not provided', async () => {
    await buybackAndBurn(mockPublicClient, mockWalletClient, 'sepolia', {
      tokenAddress: TOKEN,
      ethAmount: 0.5,
    });

    const callArgs = vi.mocked(executeEVMBuy).mock.calls[0][3];
    expect(callArgs.slippageBps).toBeUndefined();
  });

  it('propagates error from executeEVMBuy and does not call burnERC20', async () => {
    vi.mocked(executeEVMBuy).mockRejectedValue(new Error('buy failed'));

    await expect(
      buybackAndBurn(mockPublicClient, mockWalletClient, 'sepolia', {
        tokenAddress: TOKEN,
        ethAmount: 0.5,
      })
    ).rejects.toThrow('buy failed');

    expect(burnERC20).not.toHaveBeenCalled();
  });

  it('propagates error from burnERC20', async () => {
    vi.mocked(burnERC20).mockRejectedValue(new Error('burn failed'));

    await expect(
      buybackAndBurn(mockPublicClient, mockWalletClient, 'sepolia', {
        tokenAddress: TOKEN,
        ethAmount: 0.5,
      })
    ).rejects.toThrow('burn failed');
  });

  it('calls buy before burn (sequential, not parallel)', async () => {
    const callOrder: string[] = [];
    vi.mocked(executeEVMBuy).mockImplementation(async () => {
      callOrder.push('buy');
      return mockBuyResult();
    });
    vi.mocked(burnERC20).mockImplementation(async () => {
      callOrder.push('burn');
      return { hash: BURN_HASH };
    });

    await buybackAndBurn(mockPublicClient, mockWalletClient, 'sepolia', {
      tokenAddress: TOKEN,
      ethAmount: 0.5,
    });

    expect(callOrder).toEqual(['buy', 'burn']);
  });

  it('passes network to both executeEVMBuy and burnERC20', async () => {
    await buybackAndBurn(mockPublicClient, mockWalletClient, 'base', {
      tokenAddress: TOKEN,
      ethAmount: 1,
    });

    expect(executeEVMBuy).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), 'base', expect.anything()
    );
    expect(burnERC20).toHaveBeenCalledWith(
      expect.anything(), 'base', expect.anything()
    );
  });
});
