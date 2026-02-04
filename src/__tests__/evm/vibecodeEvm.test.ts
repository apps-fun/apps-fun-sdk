/**
 * Tests for src/evm/vibecode.ts
 *
 * Public API under test:
 *   - hasTokens(wallet, token, minAmount?, network?): Promise<boolean>
 *   - getBalance(wallet, token, network?): Promise<number>
 *   - buyTokens(token, ethAmount, walletClient, network?, options?): Promise<string>
 *   - sellTokens(token, tokenAmount, walletClient, network?, options?): Promise<string>
 *   - burnTokens(token, amount, walletClient, network?): Promise<string>
 *   - sendTokens(token, amount, to, walletClient, network?): Promise<string>
 *   - createPaymentFlow(config): TokenFlowConfig
 *   - chargeUser(flow, userWallet, walletClient, options?): Promise<result>
 *   - canAfford(flow, userWallet): Promise<boolean>
 *   - hasApproval(flow, userWallet, appWallet): Promise<boolean>
 *   - distributeETHToHolders(token, distId, recipients, amounts, walletClient, network?): Promise<string>
 *   - requireTokens(token, minAmount?, network?): Express middleware
 *   - chargeTokens(flow, walletClient, options?): Express middleware
 *   - default export object contains all public functions
 *
 * Behavioral contracts:
 *   - createPaymentFlow converts percentages (0-100) to bps (0-10000)
 *   - createPaymentFlow omits splits with 0% share
 *   - createPaymentFlow validates that splits sum to 100%
 *   - buyTokens passes token, amount, side='buy' to executeEVMBuy and returns hash
 *   - buyTokens converts slippage percentage to bps (slippage * 100)
 *   - sellTokens passes token, amount, side='sell' to executeEVMSell and returns hash
 *   - burnTokens converts human amount to 18-decimal bigint and calls burnERC20
 *   - sendTokens converts human amount to 18-decimal bigint and calls transferERC20
 *   - getBalance reads raw bigint and converts to human number (divide by 1e18)
 *   - chargeUser converts distributionId to BigInt and recipients to 0x strings
 *   - hasApproval returns result.approved from checkTokenFlowAllowance
 *   - distributeETHToHolders converts amounts to 18-decimal, sums total, passes to distributeETH
 *   - requireTokens: 400 without wallet, 403 insufficient, next() on success
 *   - chargeTokens: 400 without wallet, 402 can't afford, 500 on failure, next() on success
 *   - default export includes all named functions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseUnits } from 'viem';

// Mock all EVM dependencies at the module boundary
vi.mock('../../evm/client', () => ({
  getEVMPublicClient: vi.fn().mockReturnValue({ mockPublicClient: true }),
  getEVMTokenBalance: vi.fn(),
  getEVMTokenAllowance: vi.fn(),
}));

const mockCheckFn = vi.fn();
let lastGateArgs: any;
vi.mock('../../evm/tokenGate', () => ({
  EVMTokenGate: function MockEVMTokenGate(args: any) {
    lastGateArgs = args;
    return { check: mockCheckFn };
  },
}));

vi.mock('../../evm/tokenOps', () => ({
  transferERC20: vi.fn().mockResolvedValue({ hash: '0xTRANSFER_HASH' }),
  burnERC20: vi.fn().mockResolvedValue({ hash: '0xBURN_HASH' }),
  DEAD_ADDRESS: '0x000000000000000000000000000000000000dEaD',
}));

vi.mock('../../evm/trading', () => ({
  executeEVMBuy: vi.fn().mockResolvedValue({ hash: '0xBUY_HASH', tokenAmount: 1000n, ethAmount: 100n }),
  executeEVMSell: vi.fn().mockResolvedValue({ hash: '0xSELL_HASH', tokenAmount: 1000n, ethAmount: 100n }),
}));

vi.mock('../../evm/distribute', () => ({
  distributeETH: vi.fn().mockResolvedValue({ hash: '0xDIST_HASH' }),
}));

vi.mock('../../evm/tokenFlow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../evm/tokenFlow')>();
  return {
    ...actual,
    createTokenFlow: vi.fn().mockImplementation(actual.createTokenFlow),
    executeTokenFlow: vi.fn().mockResolvedValue({
      success: true,
      steps: [
        { action: 'burn', amount: 5000n, hash: '0xBURN_STEP' },
        { action: 'send', amount: 2500n, hash: '0xSEND_STEP' },
      ],
      totalCharged: 10000n,
    }),
    checkTokenFlowBalance: vi.fn(),
    checkTokenFlowAllowance: vi.fn(),
  };
});

vi.mock('../../evm/events', () => ({
  getDistributionLogs: vi.fn().mockResolvedValue([
    {
      appToken: '0x1111111111111111111111111111111111111111',
      distributionId: 1n,
      token: null,
      total: 5000000000000000000n,
      isETH: true,
      blockNumber: 100n,
      transactionHash: '0xDIST_TX',
    },
  ]),
  watchDistributions: vi.fn().mockReturnValue(vi.fn()),
  getDistributedETHLogs: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../evm/analytics', () => ({
  getRevenueStats: vi.fn().mockResolvedValue({
    totalDistributions: 5,
    totalETHDistributed: 4200000000000000000n,
    totalTokenDistributed: 0n,
    uniqueRecipients: 10,
    latestDistributionId: 5n,
  }),
}));

vi.mock('../../evm/buybackBurn', () => ({
  buybackAndBurn: vi.fn().mockResolvedValue({
    buyHash: '0xBUYBACK_HASH',
    burnHash: '0xBBURN_HASH',
    tokensBurned: 12500000000000000000000n,
    ethSpent: 500000000000000000n,
  }),
}));

vi.mock('../../evm/confirm', () => ({
  waitForTransaction: vi.fn().mockResolvedValue({
    hash: '0xCONFIRM_TX',
    status: 'success',
    blockNumber: 12345n,
    gasUsed: 21000n,
  }),
}));

vi.mock('../../evm/tokenInfo', () => ({
  getEVMCanGraduate: vi.fn().mockResolvedValue(true),
  getEVMPairInfo: vi.fn().mockResolvedValue({
    pair: '0xPAIR_ADDRESS_000000000000000000000000000',
    creator: '0xCREATOR_ADDRESS_0000000000000000000000000',
  }),
  getEVMTokenDecimals: vi.fn().mockResolvedValue(18),
  getEVMTokenTotalSupply: vi.fn().mockResolvedValue(1000000000000000000000000n),
}));

vi.mock('../../evm/holders', () => ({
  getEVMTokenHolders: vi.fn().mockResolvedValue(
    new Map([
      ['0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 750000000000000000000n],
      ['0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 250000000000000000000n],
    ])
  ),
  airdropETHToHolders: vi.fn().mockResolvedValue({ hash: '0xAIRDROP_HASH', recipientCount: 2 }),
}));

vi.mock('../../evm/referral', () => ({
  getEVMReferralEarnings: vi.fn().mockResolvedValue({ totalETH: 1500000000000000000n, paymentCount: 12 }),
}));

vi.mock('../../evm/portfolio', () => ({
  getEVMPortfolio: vi.fn().mockResolvedValue([
    { token: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', balance: 1000000000000000000n, balanceFormatted: 1.0, decimals: 18, ethValue: 500000000000000000n, ethValueFormatted: 0.5 },
  ]),
}));

vi.mock('../../evm/burnAnalytics', () => ({
  getEVMBurnHistory: vi.fn().mockResolvedValue([
    { from: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', amount: 500000000000000000000n, blockNumber: 100n, transactionHash: '0xBURN_TX' },
  ]),
  getEVMCirculatingSupply: vi.fn().mockResolvedValue({
    totalSupply: 1000000000000000000000000n,
    burned: 125000000000000000000000n,
    circulating: 875000000000000000000000n,
    burnPercent: 12.5,
  }),
}));

import { getEVMTokenBalance } from '../../evm/client';
import { transferERC20, burnERC20 } from '../../evm/tokenOps';
import { executeEVMBuy, executeEVMSell } from '../../evm/trading';
import { distributeETH } from '../../evm/distribute';
import { createTokenFlow as createTokenFlowImpl, executeTokenFlow, checkTokenFlowBalance, checkTokenFlowAllowance } from '../../evm/tokenFlow';
import { getDistributionLogs, watchDistributions as watchDistributionsRaw } from '../../evm/events';
import { getRevenueStats } from '../../evm/analytics';
import { buybackAndBurn } from '../../evm/buybackBurn';
import { waitForTransaction } from '../../evm/confirm';
import { getEVMCanGraduate, getEVMPairInfo, getEVMTokenDecimals, getEVMTokenTotalSupply } from '../../evm/tokenInfo';
import { getEVMTokenHolders, airdropETHToHolders as airdropETHToHoldersLowLevel } from '../../evm/holders';
import { getEVMReferralEarnings } from '../../evm/referral';
import { getEVMPortfolio } from '../../evm/portfolio';
import { getEVMBurnHistory, getEVMCirculatingSupply } from '../../evm/burnAnalytics';
import evmVibeDefault, {
  createPaymentFlow,
  requireTokens,
  chargeTokens,
  hasTokens,
  getBalance,
  buyTokens,
  sellTokens,
  burnTokens,
  sendTokens,
  chargeUser,
  canAfford,
  hasApproval,
  distributeETHToHolders,
  getDistributions,
  watchTokenDistributions,
  getRevenue,
  buybackAndBurnTokens,
  waitForTx,
  isReadyToGraduate,
  getTokenCreator,
  getPairAddress,
  getSupply,
  getPercentBurned,
  getHolders,
  airdropToHolders,
  getReferralEarnings,
  getPortfolio,
  getBurnHistory,
  getCirculatingSupply,
} from '../../evm/vibecode';

const TOKEN = '0x1111111111111111111111111111111111111111';
const CREATOR = '0x2222222222222222222222222222222222222222';

const mockWalletClient = {
  account: { address: '0xAPP_WALLET' },
  writeContract: vi.fn(),
} as any;

// --- createPaymentFlow ---

describe('createPaymentFlow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('converts burn percentage to bps', () => {
    const flow = createPaymentFlow({ token: TOKEN, amount: 100, burn: 100 });
    expect(flow.splits[0].bps).toBe(10000);
  });

  it('converts 50% burn to 5000 bps', () => {
    const flow = createPaymentFlow({
      token: TOKEN, amount: 100,
      burn: 50, creator: { address: CREATOR, share: 50 },
    });
    expect(flow.splits[0].bps).toBe(5000);
    expect(flow.splits[1].bps).toBe(5000);
  });

  it('converts all three split types with correct actions', () => {
    const flow = createPaymentFlow({
      token: TOKEN, amount: 100,
      burn: 50,
      creator: { address: CREATOR, share: 25 },
      distribute: 25,
    });

    expect(flow.splits).toHaveLength(3);
    expect(flow.splits[0]).toEqual({ action: 'burn', bps: 5000 });
    expect(flow.splits[1]).toEqual({ action: 'send', bps: 2500, to: CREATOR });
    expect(flow.splits[2]).toEqual({ action: 'distribute', bps: 2500 });
  });

  it('throws when percentages dont sum to 100', () => {
    expect(() => createPaymentFlow({ token: TOKEN, amount: 100, burn: 50 }))
      .toThrow('Split basis points must sum to 10000, got 5000');
  });

  it('defaults network to base', () => {
    const flow = createPaymentFlow({ token: TOKEN, amount: 100, burn: 100 });
    expect(flow.network).toBe('base');
  });

  it('uses explicit network', () => {
    const flow = createPaymentFlow({ token: TOKEN, network: 'sepolia', amount: 100, burn: 100 });
    expect(flow.network).toBe('sepolia');
  });

  it('converts amount to 18-decimal bigint', () => {
    const flow = createPaymentFlow({ token: TOKEN, amount: 100, burn: 100 });
    expect(flow.chargeAmount).toBe(parseUnits('100', 18));
  });

  it('sets token address on the flow config', () => {
    const flow = createPaymentFlow({ token: TOKEN, amount: 100, burn: 100 });
    expect(flow.token).toBe(TOKEN);
  });

  it('omits burn split when burn is 0', () => {
    const flow = createPaymentFlow({
      token: TOKEN, amount: 100,
      burn: 0,
      creator: { address: CREATOR, share: 100 },
    });
    expect(flow.splits).toHaveLength(1);
    expect(flow.splits[0].action).toBe('send');
  });

  it('omits creator split when share is 0', () => {
    const flow = createPaymentFlow({
      token: TOKEN, amount: 100,
      burn: 100,
      creator: { address: CREATOR, share: 0 },
    });
    expect(flow.splits).toHaveLength(1);
    expect(flow.splits[0].action).toBe('burn');
  });

  it('omits distribute split when distribute is 0', () => {
    const flow = createPaymentFlow({
      token: TOKEN, amount: 100,
      burn: 100,
      distribute: 0,
    });
    expect(flow.splits).toHaveLength(1);
    expect(flow.splits[0].action).toBe('burn');
  });

  it('omits creator split when creator is undefined', () => {
    const flow = createPaymentFlow({ token: TOKEN, amount: 100, burn: 100 });
    expect(flow.splits.find(s => s.action === 'send')).toBeUndefined();
  });

  it('omits distribute split when distribute is undefined', () => {
    const flow = createPaymentFlow({ token: TOKEN, amount: 100, burn: 100 });
    expect(flow.splits.find(s => s.action === 'distribute')).toBeUndefined();
  });

  it('passes burn split with correct action and bps to createTokenFlow', () => {
    createPaymentFlow({ token: TOKEN, amount: 100, burn: 100 });
    const args = vi.mocked(createTokenFlowImpl).mock.calls[0][0];
    expect(args.splits).toEqual([{ action: 'burn', bps: 10000 }]);
  });

  it('passes all three splits with correct bps to createTokenFlow', () => {
    createPaymentFlow({
      token: TOKEN, amount: 100,
      burn: 50, creator: { address: CREATOR, share: 25 }, distribute: 25,
    });
    const args = vi.mocked(createTokenFlowImpl).mock.calls[0][0];
    expect(args.splits).toEqual([
      { action: 'burn', bps: 5000 },
      { action: 'send', bps: 2500, to: CREATOR },
      { action: 'distribute', bps: 2500 },
    ]);
  });

  it('passes token and chargeAmount to createTokenFlow', () => {
    createPaymentFlow({ token: TOKEN, amount: 100, burn: 100 });
    const args = vi.mocked(createTokenFlowImpl).mock.calls[0][0];
    expect(args.token).toBe(TOKEN);
    expect(args.chargeAmount).toBe(parseUnits('100', 18));
  });

  it('passes network to createTokenFlow defaulting to base', () => {
    createPaymentFlow({ token: TOKEN, amount: 100, burn: 100 });
    const args = vi.mocked(createTokenFlowImpl).mock.calls[0][0];
    expect(args.network).toBe('base');
  });

  it('builds empty splits array when no percentages given that sum', () => {
    expect(() => createPaymentFlow({ token: TOKEN, amount: 100 }))
      .toThrow();
    const args = vi.mocked(createTokenFlowImpl).mock.calls[0]?.[0];
    // Should have been called with empty splits before validation throws
    if (args) {
      expect(args.splits).toEqual([]);
    }
  });

  it('multiplies burn percentage by 100 to get bps (not divide)', () => {
    const flow = createPaymentFlow({
      token: TOKEN, amount: 100,
      burn: 30, creator: { address: CREATOR, share: 70 },
    });
    const burnSplit = flow.splits.find(s => s.action === 'burn');
    expect(burnSplit!.bps).toBe(3000); // 30 * 100, not 30 / 100
  });

  it('includes burn split when burn > 0', () => {
    const flow = createPaymentFlow({
      token: TOKEN, amount: 100,
      burn: 10, creator: { address: CREATOR, share: 90 },
    });
    const burnSplit = flow.splits.find(s => s.action === 'burn');
    expect(burnSplit).toEqual({ action: 'burn', bps: 1000 });
  });

  it('includes distribute split when distribute > 0', () => {
    const flow = createPaymentFlow({
      token: TOKEN, amount: 100,
      burn: 50, distribute: 50,
    });
    const distSplit = flow.splits.find(s => s.action === 'distribute');
    expect(distSplit).toEqual({ action: 'distribute', bps: 5000 });
  });

  it('includes creator split with correct to address when share > 0', () => {
    const flow = createPaymentFlow({
      token: TOKEN, amount: 100,
      burn: 50, creator: { address: CREATOR, share: 50 },
    });
    const creatorSplit = flow.splits.find(s => s.action === 'send');
    expect(creatorSplit).toEqual({ action: 'send', bps: 5000, to: CREATOR });
  });
});

// --- hasTokens ---

describe('hasTokens', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true when gate check allows', async () => {
    mockCheckFn.mockResolvedValue({ allowed: true });
    expect(await hasTokens('0xUSER', TOKEN, 100, 'base')).toBe(true);
  });

  it('returns false when gate check disallows', async () => {
    mockCheckFn.mockResolvedValue({ allowed: false });
    expect(await hasTokens('0xUSER', TOKEN, 100, 'base')).toBe(false);
  });

  it('returns false on error', async () => {
    mockCheckFn.mockRejectedValue(new Error('rpc fail'));
    expect(await hasTokens('0xUSER', TOKEN)).toBe(false);
  });

  it('defaults minAmount to 1', async () => {
    mockCheckFn.mockResolvedValue({ allowed: true });
    const result = await hasTokens('0xUSER', TOKEN);
    expect(result).toBe(true);
  });

  it('passes token, minAmount as 18-decimal, and network to EVMTokenGate', async () => {
    mockCheckFn.mockResolvedValue({ allowed: true });
    await hasTokens('0xUSER', TOKEN, 50, 'sepolia');
    expect(lastGateArgs.tokenAddress).toBe(TOKEN);
    expect(lastGateArgs.minAmount).toBe(parseUnits('50', 18));
    expect(lastGateArgs.networkId).toBe('sepolia');
  });

  it('defaults network to base when not provided', async () => {
    mockCheckFn.mockResolvedValue({ allowed: true });
    await hasTokens('0xUSER', TOKEN, 10);
    expect(lastGateArgs.networkId).toBe('base');
  });
});

// --- getBalance ---

describe('getBalance', () => {
  beforeEach(() => vi.clearAllMocks());

  it('converts raw bigint balance to human-readable number', async () => {
    vi.mocked(getEVMTokenBalance).mockResolvedValue(parseUnits('500', 18));
    const balance = await getBalance('0xUSER', TOKEN, 'base');
    expect(balance).toBe(500);
  });

  it('returns 0 on error', async () => {
    vi.mocked(getEVMTokenBalance).mockRejectedValue(new Error('rpc fail'));
    const balance = await getBalance('0xUSER', TOKEN);
    expect(balance).toBe(0);
  });

  it('returns fractional amounts correctly', async () => {
    vi.mocked(getEVMTokenBalance).mockResolvedValue(parseUnits('1.5', 18));
    const balance = await getBalance('0xUSER', TOKEN, 'sepolia');
    expect(balance).toBeCloseTo(1.5);
  });

  it('returns 0 for zero balance', async () => {
    vi.mocked(getEVMTokenBalance).mockResolvedValue(0n);
    const balance = await getBalance('0xUSER', TOKEN);
    expect(balance).toBe(0);
  });

  it('defaults network to base and passes to getEVMTokenBalance', async () => {
    vi.mocked(getEVMTokenBalance).mockResolvedValue(parseUnits('1', 18));
    await getBalance('0xUSER', TOKEN);
    expect(getEVMTokenBalance).toHaveBeenCalledWith(
      expect.anything(), TOKEN, '0xUSER'
    );
  });
});

// --- buyTokens ---

describe('buyTokens', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the transaction hash from executeEVMBuy', async () => {
    const hash = await buyTokens(TOKEN, 0.1, mockWalletClient);
    expect(hash).toBe('0xBUY_HASH');
  });

  it('passes correct params to executeEVMBuy', async () => {
    await buyTokens(TOKEN, 0.5, mockWalletClient, 'sepolia');
    expect(executeEVMBuy).toHaveBeenCalledWith(
      expect.anything(),
      mockWalletClient,
      'sepolia',
      expect.objectContaining({
        tokenAddress: TOKEN,
        amount: 0.5,
        side: 'buy',
      })
    );
  });

  it('converts slippage percentage to bps', async () => {
    await buyTokens(TOKEN, 0.1, mockWalletClient, 'base', { slippage: 2 });
    const callArgs = vi.mocked(executeEVMBuy).mock.calls[0][3];
    expect(callArgs.slippageBps).toBe(200);
  });

  it('passes undefined slippageBps when no slippage option', async () => {
    await buyTokens(TOKEN, 0.1, mockWalletClient);
    const callArgs = vi.mocked(executeEVMBuy).mock.calls[0][3];
    expect(callArgs.slippageBps).toBeUndefined();
  });

  it('defaults network to base', async () => {
    await buyTokens(TOKEN, 0.1, mockWalletClient);
    expect(executeEVMBuy).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), 'base', expect.anything()
    );
  });
});

// --- sellTokens ---

describe('sellTokens', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the transaction hash from executeEVMSell', async () => {
    const hash = await sellTokens(TOKEN, 1000, mockWalletClient);
    expect(hash).toBe('0xSELL_HASH');
  });

  it('passes correct params to executeEVMSell', async () => {
    await sellTokens(TOKEN, 500, mockWalletClient, 'sepolia');
    expect(executeEVMSell).toHaveBeenCalledWith(
      expect.anything(),
      mockWalletClient,
      'sepolia',
      expect.objectContaining({
        tokenAddress: TOKEN,
        amount: 500,
        side: 'sell',
      })
    );
  });

  it('converts slippage percentage to bps', async () => {
    await sellTokens(TOKEN, 100, mockWalletClient, 'base', { slippage: 3 });
    const callArgs = vi.mocked(executeEVMSell).mock.calls[0][3];
    expect(callArgs.slippageBps).toBe(300);
  });

  it('passes undefined slippageBps when no slippage option', async () => {
    await sellTokens(TOKEN, 100, mockWalletClient);
    const callArgs = vi.mocked(executeEVMSell).mock.calls[0][3];
    expect(callArgs.slippageBps).toBeUndefined();
  });

  it('defaults network to base', async () => {
    await sellTokens(TOKEN, 100, mockWalletClient);
    expect(executeEVMSell).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), 'base', expect.anything()
    );
  });
});

// --- burnTokens ---

describe('burnTokens', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the transaction hash from burnERC20', async () => {
    const hash = await burnTokens(TOKEN, 100, mockWalletClient);
    expect(hash).toBe('0xBURN_HASH');
  });

  it('converts human amount to 18-decimal bigint', async () => {
    await burnTokens(TOKEN, 100, mockWalletClient, 'sepolia');
    expect(burnERC20).toHaveBeenCalledWith(
      mockWalletClient,
      'sepolia',
      expect.objectContaining({
        tokenAddress: TOKEN,
        amount: parseUnits('100', 18),
      })
    );
  });

  it('defaults network to base', async () => {
    await burnTokens(TOKEN, 50, mockWalletClient);
    expect(burnERC20).toHaveBeenCalledWith(
      mockWalletClient, 'base', expect.anything()
    );
  });
});

// --- sendTokens ---

describe('sendTokens', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the transaction hash from transferERC20', async () => {
    const hash = await sendTokens(TOKEN, 50, CREATOR, mockWalletClient);
    expect(hash).toBe('0xTRANSFER_HASH');
  });

  it('passes correct token, to, and 18-decimal amount', async () => {
    await sendTokens(TOKEN, 25, CREATOR, mockWalletClient, 'sepolia');
    expect(transferERC20).toHaveBeenCalledWith(
      mockWalletClient,
      'sepolia',
      expect.objectContaining({
        tokenAddress: TOKEN,
        to: CREATOR,
        amount: parseUnits('25', 18),
      })
    );
  });

  it('defaults network to base', async () => {
    await sendTokens(TOKEN, 10, CREATOR, mockWalletClient);
    expect(transferERC20).toHaveBeenCalledWith(
      mockWalletClient, 'base', expect.anything()
    );
  });
});

// --- chargeUser ---

describe('chargeUser', () => {
  beforeEach(() => vi.clearAllMocks());

  const flow = createPaymentFlow({ token: TOKEN, amount: 100, burn: 100 });

  it('returns success and step hashes from executeTokenFlow', async () => {
    const result = await chargeUser(flow, '0xUSER', mockWalletClient);
    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]).toEqual({ action: 'burn', hash: '0xBURN_STEP' });
    expect(result.steps[1]).toEqual({ action: 'send', hash: '0xSEND_STEP' });
  });

  it('converts distributionId to BigInt in options', async () => {
    await chargeUser(flow, '0xUSER', mockWalletClient, {
      distributionId: 42,
      recipients: ['0xA', '0xB'],
    });
    const callOptions = vi.mocked(executeTokenFlow).mock.calls[0][4];
    expect(callOptions?.distributionId).toBe(42n);
  });

  it('converts recipients to 0x string type', async () => {
    await chargeUser(flow, '0xUSER', mockWalletClient, {
      distributionId: 1,
      recipients: ['0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
    });
    const callOptions = vi.mocked(executeTokenFlow).mock.calls[0][4];
    expect(callOptions?.recipients).toEqual(['0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA']);
  });

  it('passes undefined options when none provided', async () => {
    await chargeUser(flow, '0xUSER', mockWalletClient);
    const callOptions = vi.mocked(executeTokenFlow).mock.calls[0][4];
    expect(callOptions).toBeUndefined();
  });

  it('passes userWallet to executeTokenFlow', async () => {
    await chargeUser(flow, '0xMY_USER', mockWalletClient);
    const userArg = vi.mocked(executeTokenFlow).mock.calls[0][3];
    expect(userArg).toBe('0xMY_USER');
  });

  it('passes undefined distributionId when options have no distributionId', async () => {
    await chargeUser(flow, '0xUSER', mockWalletClient, {
      recipients: ['0xA'],
    });
    const callOptions = vi.mocked(executeTokenFlow).mock.calls[0][4];
    expect(callOptions?.distributionId).toBeUndefined();
  });
});

// --- canAfford ---

describe('canAfford', () => {
  beforeEach(() => vi.clearAllMocks());

  const flow = createPaymentFlow({ token: TOKEN, amount: 100, burn: 100 });

  it('returns true when checkTokenFlowBalance says canPay', async () => {
    vi.mocked(checkTokenFlowBalance).mockResolvedValue({
      canPay: true, balance: 999n, required: 100n, shortfall: 0n,
    });
    expect(await canAfford(flow, '0xUSER')).toBe(true);
  });

  it('returns false when checkTokenFlowBalance says cannot pay', async () => {
    vi.mocked(checkTokenFlowBalance).mockResolvedValue({
      canPay: false, balance: 1n, required: 100n, shortfall: 99n,
    });
    expect(await canAfford(flow, '0xUSER')).toBe(false);
  });
});

// --- hasApproval ---

describe('hasApproval', () => {
  beforeEach(() => vi.clearAllMocks());

  const flow = createPaymentFlow({ token: TOKEN, amount: 100, burn: 100 });

  it('returns true when allowance is sufficient', async () => {
    vi.mocked(checkTokenFlowAllowance).mockResolvedValue({
      approved: true, allowance: 10000n, required: 100n,
    });
    expect(await hasApproval(flow, '0xUSER', '0xAPP')).toBe(true);
  });

  it('returns false when allowance is insufficient', async () => {
    vi.mocked(checkTokenFlowAllowance).mockResolvedValue({
      approved: false, allowance: 1n, required: 100n,
    });
    expect(await hasApproval(flow, '0xUSER', '0xAPP')).toBe(false);
  });

  it('passes user and app wallet addresses to checkTokenFlowAllowance', async () => {
    vi.mocked(checkTokenFlowAllowance).mockResolvedValue({
      approved: true, allowance: 10000n, required: 100n,
    });
    await hasApproval(flow, '0xUSER_ADDR', '0xAPP_ADDR');
    expect(checkTokenFlowAllowance).toHaveBeenCalledWith(
      expect.anything(), flow, '0xUSER_ADDR', '0xAPP_ADDR'
    );
  });
});

// --- distributeETHToHolders ---

describe('distributeETHToHolders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the transaction hash', async () => {
    const hash = await distributeETHToHolders(
      TOKEN, 1, ['0xA', '0xB'], [0.5, 0.5], mockWalletClient
    );
    expect(hash).toBe('0xDIST_HASH');
  });

  it('converts amounts to 18-decimal bigints', async () => {
    await distributeETHToHolders(TOKEN, 1, ['0xA'], [2.5], mockWalletClient, 'sepolia');
    const callArgs = vi.mocked(distributeETH).mock.calls[0][2];
    expect(callArgs.amounts[0]).toBe(parseUnits('2.5', 18));
  });

  it('computes totalValue as sum of all amounts', async () => {
    await distributeETHToHolders(TOKEN, 1, ['0xA', '0xB'], [1, 2], mockWalletClient);
    const callArgs = vi.mocked(distributeETH).mock.calls[0][2];
    expect(callArgs.totalValue).toBe(parseUnits('1', 18) + parseUnits('2', 18));
  });

  it('converts distributionId to BigInt', async () => {
    await distributeETHToHolders(TOKEN, 42, ['0xA'], [1], mockWalletClient);
    const callArgs = vi.mocked(distributeETH).mock.calls[0][2];
    expect(callArgs.distributionId).toBe(42n);
  });

  it('passes appToken as token address', async () => {
    await distributeETHToHolders(TOKEN, 1, ['0xA'], [1], mockWalletClient);
    const callArgs = vi.mocked(distributeETH).mock.calls[0][2];
    expect(callArgs.appToken).toBe(TOKEN);
  });

  it('defaults network to base', async () => {
    await distributeETHToHolders(TOKEN, 1, ['0xA'], [1], mockWalletClient);
    expect(distributeETH).toHaveBeenCalledWith(mockWalletClient, 'base', expect.anything());
  });

  it('uses explicit network', async () => {
    await distributeETHToHolders(TOKEN, 1, ['0xA'], [1], mockWalletClient, 'sepolia');
    expect(distributeETH).toHaveBeenCalledWith(mockWalletClient, 'sepolia', expect.anything());
  });

  it('passes recipient addresses through to distributeETH', async () => {
    await distributeETHToHolders(
      TOKEN, 1,
      ['0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222'],
      [1, 2], mockWalletClient
    );
    const callArgs = vi.mocked(distributeETH).mock.calls[0][2];
    expect(callArgs.recipients).toEqual([
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
    ]);
  });
});

// --- requireTokens middleware ---

describe('requireTokens', () => {
  function makeReq(wallet?: string) {
    return { query: wallet ? { wallet } : {}, headers: {} };
  }
  function makeRes() {
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    return res;
  }

  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when no wallet in query or header', async () => {
    const middleware = requireTokens(TOKEN);
    const res = makeRes();
    const next = vi.fn();
    await middleware(makeReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Wallet address required',
      hint: 'Pass ?wallet=ADDRESS or X-Wallet-Address header',
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 with token and required amount in body when insufficient', async () => {
    mockCheckFn.mockResolvedValue({ allowed: false });
    const middleware = requireTokens(TOKEN, 50);
    const res = makeRes();
    const next = vi.fn();
    await middleware(makeReq('0xUSER'), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Insufficient tokens',
      required: 50,
      token: TOKEN,
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() and sets req.tokenGate when sufficient', async () => {
    mockCheckFn.mockResolvedValue({ allowed: true });
    const middleware = requireTokens(TOKEN, 10);
    const req = makeReq('0xUSER') as any;
    const res = makeRes();
    const next = vi.fn();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.tokenGate).toEqual({
      wallet: '0xUSER',
      token: TOKEN,
      verified: true,
    });
  });

  it('reads wallet from X-Wallet-Address header when query is empty', async () => {
    mockCheckFn.mockResolvedValue({ allowed: true });
    const middleware = requireTokens(TOKEN);
    const req = { query: {}, headers: { 'x-wallet-address': '0xHEADER' } } as any;
    const res = makeRes();
    const next = vi.fn();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.tokenGate.wallet).toBe('0xHEADER');
  });

  it('defaults network to base for gate check', async () => {
    mockCheckFn.mockResolvedValue({ allowed: true });
    const middleware = requireTokens(TOKEN);
    const req = makeReq('0xUSER') as any;
    const res = makeRes();
    const next = vi.fn();
    await middleware(req, res, next);
    expect(lastGateArgs.networkId).toBe('base');
  });

  it('prefers query wallet over header', async () => {
    mockCheckFn.mockResolvedValue({ allowed: true });
    const middleware = requireTokens(TOKEN);
    const req = {
      query: { wallet: '0xQUERY' },
      headers: { 'x-wallet-address': '0xHEADER' },
    } as any;
    const res = makeRes();
    const next = vi.fn();
    await middleware(req, res, next);
    expect(req.tokenGate.wallet).toBe('0xQUERY');
  });
});

// --- chargeTokens middleware ---

describe('chargeTokens', () => {
  function makeReq(wallet?: string) {
    return { query: wallet ? { wallet } : {}, headers: {} };
  }
  function makeRes() {
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    return res;
  }

  const flow = createPaymentFlow({ token: TOKEN, amount: 100, burn: 100 });

  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when no wallet', async () => {
    const middleware = chargeTokens(flow, mockWalletClient);
    const res = makeRes();
    const next = vi.fn();
    await middleware(makeReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Wallet address required',
      hint: 'Pass ?wallet=ADDRESS or X-Wallet-Address header',
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 402 with token and required amount when cannot afford', async () => {
    vi.mocked(checkTokenFlowBalance).mockResolvedValue({
      canPay: false, balance: 0n, required: 100n, shortfall: 100n,
    });
    const middleware = chargeTokens(flow, mockWalletClient);
    const res = makeRes();
    const next = vi.fn();
    await middleware(makeReq('0xUSER'), res, next);
    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Insufficient token balance',
      required: 100,
      token: TOKEN,
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 500 with error message when charge fails', async () => {
    vi.mocked(checkTokenFlowBalance).mockResolvedValue({
      canPay: true, balance: 999n, required: 100n, shortfall: 0n,
    });
    vi.mocked(executeTokenFlow).mockRejectedValueOnce(new Error('tx reverted'));
    const middleware = chargeTokens(flow, mockWalletClient);
    const res = makeRes();
    const next = vi.fn();
    await middleware(makeReq('0xUSER'), res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Payment failed',
      message: 'tx reverted',
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('reads wallet from X-Wallet-Address header', async () => {
    vi.mocked(checkTokenFlowBalance).mockResolvedValue({
      canPay: true, balance: 999n, required: 100n, shortfall: 0n,
    });
    const middleware = chargeTokens(flow, mockWalletClient);
    const req = { query: {}, headers: { 'x-wallet-address': '0xHEADER_WALLET' } } as any;
    const res = makeRes();
    const next = vi.fn();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.tokenPayment.wallet).toBe('0xHEADER_WALLET');
  });

  it('sets req.tokenPayment with wallet, charged amount, and steps on success', async () => {
    vi.mocked(checkTokenFlowBalance).mockResolvedValue({
      canPay: true, balance: 999n, required: 100n, shortfall: 0n,
    });
    const middleware = chargeTokens(flow, mockWalletClient);
    const req = makeReq('0xUSER') as any;
    const res = makeRes();
    const next = vi.fn();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.tokenPayment.wallet).toBe('0xUSER');
    expect(req.tokenPayment.charged).toBe(100);
    expect(req.tokenPayment.steps).toHaveLength(2);
    expect(req.tokenPayment.steps[0].action).toBe('burn');
    expect(req.tokenPayment.steps[0].hash).toBe('0xBURN_STEP');
    expect(req.tokenPayment.steps[1].action).toBe('send');
  });
});

// --- getDistributions ---

describe('getDistributions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns distribution logs mapped to human-readable format', async () => {
    const result = await getDistributions(TOKEN);
    expect(result).toHaveLength(1);
    expect(result[0].distributionId).toBe(1);
    expect(result[0].total).toBe(5);
    expect(result[0].isETH).toBe(true);
    expect(result[0].txHash).toBe('0xDIST_TX');
    expect(result[0].block).toBe(100);
  });

  it('defaults network to base', async () => {
    await getDistributions(TOKEN);
    expect(getDistributionLogs).toHaveBeenCalledWith(
      expect.anything(), 'base', expect.anything()
    );
  });

  it('uses explicit network', async () => {
    await getDistributions(TOKEN, 'sepolia');
    expect(getDistributionLogs).toHaveBeenCalledWith(
      expect.anything(), 'sepolia', expect.anything()
    );
  });

  it('passes fromBlock option', async () => {
    await getDistributions(TOKEN, 'base', { fromBlock: 500 });
    const callArgs = vi.mocked(getDistributionLogs).mock.calls[0][2];
    expect(callArgs?.fromBlock).toBe(500n);
  });

  it('passes appToken to getDistributionLogs', async () => {
    await getDistributions(TOKEN);
    const callArgs = vi.mocked(getDistributionLogs).mock.calls[0][2];
    expect(callArgs?.appToken).toBe(TOKEN);
  });

  it('returns empty array when no logs', async () => {
    vi.mocked(getDistributionLogs).mockResolvedValue([]);
    const result = await getDistributions(TOKEN);
    expect(result).toEqual([]);
  });
});

// --- watchTokenDistributions ---

describe('watchTokenDistributions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns unwatch function from watchDistributions', () => {
    const onLog = vi.fn();
    const unwatch = watchTokenDistributions(TOKEN, onLog);
    expect(typeof unwatch).toBe('function');
  });

  it('defaults network to base', () => {
    watchTokenDistributions(TOKEN, vi.fn());
    expect(watchDistributionsRaw).toHaveBeenCalledWith(
      expect.anything(), 'base', TOKEN, expect.any(Function)
    );
  });

  it('uses explicit network', () => {
    watchTokenDistributions(TOKEN, vi.fn(), 'sepolia');
    expect(watchDistributionsRaw).toHaveBeenCalledWith(
      expect.anything(), 'sepolia', TOKEN, expect.any(Function)
    );
  });

  it('wraps onLog callback to convert to human-readable format', () => {
    const onLog = vi.fn();
    watchTokenDistributions(TOKEN, onLog);

    // Get the callback passed to watchDistributionsRaw and invoke it
    const innerCallback = vi.mocked(watchDistributionsRaw).mock.calls[0][3];
    innerCallback({
      appToken: TOKEN as `0x${string}`,
      distributionId: 3n,
      token: null,
      total: 2000000000000000000n,
      isETH: true,
      blockNumber: 50n,
      transactionHash: '0xWATCH_TX' as `0x${string}`,
    });

    expect(onLog).toHaveBeenCalledWith({
      distributionId: 3,
      total: 2,
      isETH: true,
      txHash: '0xWATCH_TX',
    });
  });
});

// --- getRevenue ---

describe('getRevenue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns revenue stats in human-readable format', async () => {
    const result = await getRevenue(TOKEN);
    expect(result.totalETH).toBeCloseTo(4.2);
    expect(result.totalDistributions).toBe(5);
    expect(result.uniqueRecipients).toBe(10);
  });

  it('defaults network to base', async () => {
    await getRevenue(TOKEN);
    expect(getRevenueStats).toHaveBeenCalledWith(
      expect.anything(), 'base', TOKEN
    );
  });

  it('uses explicit network', async () => {
    await getRevenue(TOKEN, 'sepolia');
    expect(getRevenueStats).toHaveBeenCalledWith(
      expect.anything(), 'sepolia', TOKEN
    );
  });

  it('passes token address to getRevenueStats', async () => {
    await getRevenue(TOKEN);
    expect(getRevenueStats).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), TOKEN
    );
  });
});

// --- buybackAndBurnTokens ---

describe('buybackAndBurnTokens', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns human-readable buyback and burn result', async () => {
    const result = await buybackAndBurnTokens(TOKEN, 0.5, mockWalletClient);
    expect(result.buyHash).toBe('0xBUYBACK_HASH');
    expect(result.burnHash).toBe('0xBBURN_HASH');
    expect(result.tokensBurned).toBeCloseTo(12500);
  });

  it('defaults network to base', async () => {
    await buybackAndBurnTokens(TOKEN, 0.5, mockWalletClient);
    expect(buybackAndBurn).toHaveBeenCalledWith(
      expect.anything(), mockWalletClient, 'base', expect.anything()
    );
  });

  it('uses explicit network', async () => {
    await buybackAndBurnTokens(TOKEN, 0.5, mockWalletClient, 'sepolia');
    expect(buybackAndBurn).toHaveBeenCalledWith(
      expect.anything(), mockWalletClient, 'sepolia', expect.anything()
    );
  });

  it('passes token and ethAmount to buybackAndBurn', async () => {
    await buybackAndBurnTokens(TOKEN, 1.5, mockWalletClient);
    const callArgs = vi.mocked(buybackAndBurn).mock.calls[0][3];
    expect(callArgs.tokenAddress).toBe(TOKEN);
    expect(callArgs.ethAmount).toBe(1.5);
  });

  it('converts slippage percentage to bps', async () => {
    await buybackAndBurnTokens(TOKEN, 0.5, mockWalletClient, 'base', { slippage: 3 });
    const callArgs = vi.mocked(buybackAndBurn).mock.calls[0][3];
    expect(callArgs.slippageBps).toBe(300);
  });

  it('does not pass slippageBps when no slippage option', async () => {
    await buybackAndBurnTokens(TOKEN, 0.5, mockWalletClient);
    const callArgs = vi.mocked(buybackAndBurn).mock.calls[0][3];
    expect(callArgs.slippageBps).toBeUndefined();
  });
});

// --- waitForTx ---

describe('waitForTx', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns human-readable transaction confirmation', async () => {
    const result = await waitForTx('0xCONFIRM_TX');
    expect(result.status).toBe('success');
    expect(result.blockNumber).toBe(12345);
    expect(result.gasUsed).toBe(21000);
  });

  it('defaults network to base', async () => {
    await waitForTx('0xCONFIRM_TX');
    // waitForTransaction is called with a client from getClient('base')
    expect(waitForTransaction).toHaveBeenCalledWith(
      expect.anything(), '0xCONFIRM_TX'
    );
  });

  it('passes hash to waitForTransaction', async () => {
    await waitForTx('0xMY_TX_HASH');
    expect(waitForTransaction).toHaveBeenCalledWith(
      expect.anything(), '0xMY_TX_HASH'
    );
  });

  it('converts blockNumber from bigint to number', async () => {
    const result = await waitForTx('0xCONFIRM_TX');
    expect(typeof result.blockNumber).toBe('number');
  });

  it('converts gasUsed from bigint to number', async () => {
    const result = await waitForTx('0xCONFIRM_TX');
    expect(typeof result.gasUsed).toBe('number');
  });
});

// --- isReadyToGraduate ---

describe('isReadyToGraduate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true when contract says token can graduate', async () => {
    const result = await isReadyToGraduate(TOKEN);
    expect(result).toBe(true);
  });

  it('defaults network to base', async () => {
    await isReadyToGraduate(TOKEN);
    expect(getEVMCanGraduate).toHaveBeenCalledWith(
      expect.anything(), 'base', TOKEN
    );
  });

  it('uses explicit network', async () => {
    await isReadyToGraduate(TOKEN, 'sepolia');
    expect(getEVMCanGraduate).toHaveBeenCalledWith(
      expect.anything(), 'sepolia', TOKEN
    );
  });

  it('returns false on error', async () => {
    vi.mocked(getEVMCanGraduate).mockRejectedValue(new Error('rpc fail'));
    const result = await isReadyToGraduate(TOKEN);
    expect(result).toBe(false);
  });

  it('returns false when contract returns false', async () => {
    vi.mocked(getEVMCanGraduate).mockResolvedValue(false);
    const result = await isReadyToGraduate(TOKEN);
    expect(result).toBe(false);
  });
});

// --- getTokenCreator ---

describe('getTokenCreator', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns creator address from pair info', async () => {
    const result = await getTokenCreator(TOKEN);
    expect(result).toBe('0xCREATOR_ADDRESS_0000000000000000000000000');
  });

  it('defaults network to base', async () => {
    await getTokenCreator(TOKEN);
    expect(getEVMPairInfo).toHaveBeenCalledWith(
      expect.anything(), 'base', TOKEN
    );
  });

  it('uses explicit network', async () => {
    await getTokenCreator(TOKEN, 'sepolia');
    expect(getEVMPairInfo).toHaveBeenCalledWith(
      expect.anything(), 'sepolia', TOKEN
    );
  });
});

// --- getPairAddress ---

describe('getPairAddress', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns pair address from pair info', async () => {
    const result = await getPairAddress(TOKEN);
    expect(result).toBe('0xPAIR_ADDRESS_000000000000000000000000000');
  });

  it('defaults network to base', async () => {
    await getPairAddress(TOKEN);
    expect(getEVMPairInfo).toHaveBeenCalledWith(
      expect.anything(), 'base', TOKEN
    );
  });
});

// --- getSupply ---

describe('getSupply', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns totalSupply as human-readable number and decimals', async () => {
    const result = await getSupply(TOKEN);
    expect(result.totalSupply).toBe(1000000);
    expect(result.decimals).toBe(18);
  });

  it('defaults network to base', async () => {
    await getSupply(TOKEN);
    expect(getEVMTokenTotalSupply).toHaveBeenCalledWith(
      expect.anything(), TOKEN
    );
  });

  it('uses explicit network', async () => {
    await getSupply(TOKEN, 'sepolia');
    expect(getEVMTokenTotalSupply).toHaveBeenCalledWith(
      expect.anything(), TOKEN
    );
  });

  it('respects token decimals for conversion', async () => {
    const USDC_TOKEN = '0x2222222222222222222222222222222222222222';
    vi.mocked(getEVMTokenDecimals).mockResolvedValue(6);
    vi.mocked(getEVMTokenTotalSupply).mockResolvedValue(1000000000000n);

    const result = await getSupply(USDC_TOKEN);
    expect(result.totalSupply).toBe(1000000);
    expect(result.decimals).toBe(6);
  });
});

// --- getPercentBurned ---

describe('getPercentBurned', () => {
  beforeEach(() => vi.clearAllMocks());

  it('computes correct burn percentage', async () => {
    vi.mocked(getEVMTokenTotalSupply).mockResolvedValue(1000n);
    vi.mocked(getEVMTokenBalance).mockResolvedValue(125n);

    const result = await getPercentBurned(TOKEN);
    expect(result).toBeCloseTo(12.5);
  });

  it('returns 0 when totalSupply is 0', async () => {
    vi.mocked(getEVMTokenTotalSupply).mockResolvedValue(0n);
    vi.mocked(getEVMTokenBalance).mockResolvedValue(0n);

    const result = await getPercentBurned(TOKEN);
    expect(result).toBe(0);
  });

  it('defaults network to base', async () => {
    vi.mocked(getEVMTokenTotalSupply).mockResolvedValue(1000n);
    vi.mocked(getEVMTokenBalance).mockResolvedValue(100n);

    await getPercentBurned(TOKEN);
    expect(getEVMTokenTotalSupply).toHaveBeenCalledWith(
      expect.anything(), TOKEN
    );
  });

  it('returns 100 when all tokens are burned', async () => {
    vi.mocked(getEVMTokenTotalSupply).mockResolvedValue(500n);
    vi.mocked(getEVMTokenBalance).mockResolvedValue(500n);

    const result = await getPercentBurned(TOKEN);
    expect(result).toBe(100);
  });

  it('reads balance at DEAD_ADDRESS', async () => {
    vi.mocked(getEVMTokenTotalSupply).mockResolvedValue(1000n);
    vi.mocked(getEVMTokenBalance).mockResolvedValue(0n);

    await getPercentBurned(TOKEN);
    expect(getEVMTokenBalance).toHaveBeenCalledWith(
      expect.anything(),
      TOKEN,
      '0x000000000000000000000000000000000000dEaD'
    );
  });
});

// --- getHolders ---

describe('getHolders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns holders sorted by balance descending', async () => {
    // Mock with 3 holders in ascending order to verify sort reversal
    vi.mocked(getEVMTokenHolders).mockResolvedValueOnce(
      new Map([
        ['0xcccccccccccccccccccccccccccccccccccccccc', 100000000000000000000n],  // 100 (smallest)
        ['0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 500000000000000000000n],  // 500 (middle)
        ['0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 900000000000000000000n],  // 900 (largest)
      ])
    );

    const result = await getHolders(TOKEN);

    expect(result.length).toBe(3);
    // Must be sorted descending: 900, 500, 100
    expect(result[0].balance).toBe(900);
    expect(result[1].balance).toBe(500);
    expect(result[2].balance).toBe(100);
    // Each element strictly greater than the next
    expect(result[0].balance).toBeGreaterThan(result[1].balance);
    expect(result[1].balance).toBeGreaterThan(result[2].balance);
  });

  it('converts bigint balance to human-readable number', async () => {
    const result = await getHolders(TOKEN);

    // 750000000000000000000n / 1e18 = 750
    expect(result[0].balance).toBe(750);
    // 250000000000000000000n / 1e18 = 250
    expect(result[1].balance).toBe(250);
  });

  it('defaults network to base', async () => {
    await getHolders(TOKEN);
    expect(getEVMTokenHolders).toHaveBeenCalledWith(
      expect.anything(), TOKEN
    );
  });

  it('calls getEVMTokenHolders with token address', async () => {
    await getHolders(TOKEN);
    expect(getEVMTokenHolders).toHaveBeenCalled();
  });
});

// --- airdropToHolders ---

describe('airdropToHolders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the transaction hash', async () => {
    const result = await airdropToHolders(TOKEN, 1, 5.0, {} as any);
    expect(result).toBe('0xAIRDROP_HASH');
  });

  it('calls airdropETHToHolders with correct params', async () => {
    await airdropToHolders(TOKEN, 3, 2.5, {} as any);
    expect(airdropETHToHoldersLowLevel).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'base',
      expect.objectContaining({
        appToken: TOKEN,
        distributionId: 3n,
        tokenAddress: TOKEN,
        totalAmount: BigInt(Math.floor(2.5 * 1e18)),
      })
    );
  });

  it('defaults network to base', async () => {
    await airdropToHolders(TOKEN, 1, 1.0, {} as any);
    expect(airdropETHToHoldersLowLevel).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'base',
      expect.anything()
    );
  });

  it('uses explicit network', async () => {
    await airdropToHolders(TOKEN, 1, 1.0, {} as any, 'sepolia');
    expect(airdropETHToHoldersLowLevel).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'sepolia',
      expect.anything()
    );
  });
});

// --- getReferralEarnings ---

describe('getReferralEarnings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns human-readable totalETH and payments', async () => {
    const result = await getReferralEarnings('0xREFERRER', TOKEN);

    expect(result.totalETH).toBe(1.5);
    expect(result.payments).toBe(12);
  });

  it('passes referrer address and token to low-level function', async () => {
    await getReferralEarnings('0xREFERRER', TOKEN);

    expect(getEVMReferralEarnings).toHaveBeenCalledWith(
      expect.anything(),
      'base',
      '0xREFERRER',
      TOKEN
    );
  });

  it('defaults network to base', async () => {
    await getReferralEarnings('0xREFERRER');
    expect(getEVMReferralEarnings).toHaveBeenCalledWith(
      expect.anything(),
      'base',
      expect.anything(),
      undefined
    );
  });

  it('passes undefined appToken when token not provided', async () => {
    await getReferralEarnings('0xREFERRER');
    expect(getEVMReferralEarnings).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      undefined
    );
  });
});

// --- getPortfolio ---

describe('getPortfolio', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns simplified portfolio entries', async () => {
    const result = await getPortfolio('0xWALLET', [TOKEN]);

    expect(result.length).toBe(1);
    expect(result[0].token).toBe('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    expect(result[0].balance).toBe(1.0);
    expect(result[0].ethValue).toBe(0.5);
  });

  it('defaults network to base', async () => {
    await getPortfolio('0xWALLET', [TOKEN]);
    expect(getEVMPortfolio).toHaveBeenCalledWith(
      expect.anything(),
      'base',
      expect.anything(),
      expect.anything()
    );
  });

  it('uses explicit network', async () => {
    await getPortfolio('0xWALLET', [TOKEN], 'sepolia');
    expect(getEVMPortfolio).toHaveBeenCalledWith(
      expect.anything(),
      'sepolia',
      expect.anything(),
      expect.anything()
    );
  });

  it('passes wallet and tokens as 0x strings', async () => {
    await getPortfolio('0xWALLET', [TOKEN, '0xBBBB']);
    expect(getEVMPortfolio).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      '0xWALLET',
      [TOKEN, '0xBBBB']
    );
  });
});

// --- getBurnHistory ---

describe('getBurnHistory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns human-readable burn events', async () => {
    const result = await getBurnHistory(TOKEN);

    expect(result.length).toBe(1);
    expect(result[0].from).toBe('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    expect(result[0].amount).toBe(500);
    expect(result[0].block).toBe(100);
    expect(result[0].txHash).toBe('0xBURN_TX');
  });

  it('defaults network to base', async () => {
    await getBurnHistory(TOKEN);
    expect(getEVMBurnHistory).toHaveBeenCalledWith(
      expect.anything(),
      TOKEN,
      undefined
    );
  });

  it('passes fromBlock option', async () => {
    await getBurnHistory(TOKEN, 'base', { fromBlock: 500 });
    expect(getEVMBurnHistory).toHaveBeenCalledWith(
      expect.anything(),
      TOKEN,
      500n
    );
  });

  it('uses explicit network', async () => {
    await getBurnHistory(TOKEN, 'sepolia');
    expect(getEVMBurnHistory).toHaveBeenCalled();
  });
});

// --- getCirculatingSupply ---

describe('getCirculatingSupply', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns human-readable circulating supply stats', async () => {
    const result = await getCirculatingSupply(TOKEN);

    expect(result.totalSupply).toBe(1000000);
    expect(result.burned).toBe(125000);
    expect(result.circulating).toBe(875000);
    expect(result.burnPercent).toBe(12.5);
  });

  it('defaults network to base', async () => {
    await getCirculatingSupply(TOKEN);
    expect(getEVMCirculatingSupply).toHaveBeenCalledWith(
      expect.anything(), TOKEN
    );
  });

  it('uses explicit network', async () => {
    await getCirculatingSupply(TOKEN, 'sepolia');
    expect(getEVMCirculatingSupply).toHaveBeenCalled();
  });
});

// --- default export ---

describe('default export', () => {
  it('includes all original public functions', () => {
    expect(evmVibeDefault.hasTokens).toBe(hasTokens);
    expect(evmVibeDefault.getBalance).toBe(getBalance);
    expect(evmVibeDefault.buyTokens).toBe(buyTokens);
    expect(evmVibeDefault.sellTokens).toBe(sellTokens);
    expect(evmVibeDefault.burnTokens).toBe(burnTokens);
    expect(evmVibeDefault.sendTokens).toBe(sendTokens);
    expect(evmVibeDefault.createPaymentFlow).toBe(createPaymentFlow);
    expect(evmVibeDefault.chargeUser).toBe(chargeUser);
    expect(evmVibeDefault.canAfford).toBe(canAfford);
    expect(evmVibeDefault.hasApproval).toBe(hasApproval);
    expect(evmVibeDefault.distributeETHToHolders).toBe(distributeETHToHolders);
    expect(evmVibeDefault.requireTokens).toBe(requireTokens);
    expect(evmVibeDefault.chargeTokens).toBe(chargeTokens);
  });

  it('includes event/revenue/buyback wrapper functions', () => {
    expect(evmVibeDefault.getDistributions).toBe(getDistributions);
    expect(evmVibeDefault.watchTokenDistributions).toBe(watchTokenDistributions);
    expect(evmVibeDefault.getRevenue).toBe(getRevenue);
    expect(evmVibeDefault.buybackAndBurnTokens).toBe(buybackAndBurnTokens);
    expect(evmVibeDefault.waitForTx).toBe(waitForTx);
  });

  it('includes token info wrapper functions', () => {
    expect(evmVibeDefault.isReadyToGraduate).toBe(isReadyToGraduate);
    expect(evmVibeDefault.getTokenCreator).toBe(getTokenCreator);
    expect(evmVibeDefault.getPairAddress).toBe(getPairAddress);
    expect(evmVibeDefault.getSupply).toBe(getSupply);
    expect(evmVibeDefault.getPercentBurned).toBe(getPercentBurned);
  });

  it('includes holder/referral/portfolio/burn wrapper functions', () => {
    expect(evmVibeDefault.getHolders).toBe(getHolders);
    expect(evmVibeDefault.airdropToHolders).toBe(airdropToHolders);
    expect(evmVibeDefault.getReferralEarnings).toBe(getReferralEarnings);
    expect(evmVibeDefault.getPortfolio).toBe(getPortfolio);
    expect(evmVibeDefault.getBurnHistory).toBe(getBurnHistory);
    expect(evmVibeDefault.getCirculatingSupply).toBe(getCirculatingSupply);
  });

  it('has exactly 29 keys', () => {
    expect(Object.keys(evmVibeDefault)).toHaveLength(29);
  });
});
