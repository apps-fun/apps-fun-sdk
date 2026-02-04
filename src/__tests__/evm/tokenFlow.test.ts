/**
 * Tests for src/evm/tokenFlow.ts
 *
 * Public API under test:
 *   - validateTokenFlowConfig(config): void
 *   - createTokenFlow(config): TokenFlowConfig
 *   - checkTokenFlowBalance(publicClient, config, userWallet): Promise<BalanceResult>
 *   - checkTokenFlowAllowance(publicClient, config, userWallet, appWallet): Promise<AllowanceResult>
 *   - executeTokenFlow(publicClient, walletClient, config, userWallet, options?): Promise<TokenFlowResult>
 *
 * Behavioral contracts:
 *   - validateTokenFlowConfig throws if splits don't sum to 10000 bps
 *   - validateTokenFlowConfig throws if splits array is empty
 *   - validateTokenFlowConfig throws if 'send' action has no 'to' address
 *   - validateTokenFlowConfig throws for negative or >10000 bps
 *   - createTokenFlow validates and returns the config
 *   - checkTokenFlowBalance reports canPay, balance, required, shortfall
 *   - checkTokenFlowAllowance reports approved, allowance, required
 *   - executeTokenFlow pulls tokens, then executes burn/send/distribute splits
 *   - executeTokenFlow throws if distribute split has no recipients
 *   - executeTokenFlow throws if distribute split has no distributionId
 *   - Split amounts are calculated as (chargeAmount * bps) / 10000
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  validateTokenFlowConfig,
  createTokenFlow,
  checkTokenFlowBalance,
  checkTokenFlowAllowance,
  executeTokenFlow,
  type TokenFlowConfig,
} from '../../evm/tokenFlow';

// Mock dependencies
vi.mock('../../evm/client', () => ({
  getEVMTokenBalance: vi.fn(),
  getEVMTokenAllowance: vi.fn(),
}));

vi.mock('../../evm/tokenOps', () => ({
  transferFromERC20: vi.fn().mockResolvedValue({ hash: '0xPULL' }),
  burnERC20: vi.fn().mockResolvedValue({ hash: '0xBURN' }),
  transferERC20: vi.fn().mockResolvedValue({ hash: '0xSEND' }),
}));

vi.mock('../../evm/trading', () => ({
  executeEVMSell: vi.fn().mockResolvedValue({
    hash: '0xSWAP',
    tokenAmount: 2500n,
    ethAmount: 5000n,
  }),
}));

vi.mock('../../evm/distribute', () => ({
  distributeETH: vi.fn().mockResolvedValue({ hash: '0xDIST' }),
}));

import { getEVMTokenBalance, getEVMTokenAllowance } from '../../evm/client';
import { transferFromERC20, burnERC20, transferERC20 } from '../../evm/tokenOps';
import { executeEVMSell } from '../../evm/trading';
import { distributeETH } from '../../evm/distribute';

const TOKEN = '0x1111111111111111111111111111111111111111' as `0x${string}`;
const CREATOR = '0x2222222222222222222222222222222222222222' as `0x${string}`;
const USER = '0x3333333333333333333333333333333333333333' as `0x${string}`;
const APP = '0x4444444444444444444444444444444444444444' as `0x${string}`;
const HOLDER_A = '0x5555555555555555555555555555555555555555' as `0x${string}`;
const HOLDER_B = '0x6666666666666666666666666666666666666666' as `0x${string}`;

function makeConfig(overrides: Partial<TokenFlowConfig> = {}): TokenFlowConfig {
  return {
    token: TOKEN,
    network: 'sepolia',
    chargeAmount: 10000n,
    splits: [
      { action: 'burn', bps: 5000 },
      { action: 'send', bps: 2500, to: CREATOR },
      { action: 'distribute', bps: 2500 },
    ],
    ...overrides,
  };
}

function makeMockWalletClient() {
  return {
    account: { address: APP },
    writeContract: vi.fn(),
  };
}

// --- validateTokenFlowConfig ---

describe('validateTokenFlowConfig', () => {
  it('accepts valid config with splits summing to 10000', () => {
    expect(() => validateTokenFlowConfig(makeConfig())).not.toThrow();
  });

  it('throws when splits sum to less than 10000', () => {
    expect(() =>
      validateTokenFlowConfig(
        makeConfig({ splits: [{ action: 'burn', bps: 5000 }] })
      )
    ).toThrow('Split basis points must sum to 10000, got 5000');
  });

  it('throws when splits sum to more than 10000', () => {
    expect(() =>
      validateTokenFlowConfig(
        makeConfig({
          splits: [
            { action: 'burn', bps: 5000 },
            { action: 'burn', bps: 6000 },
          ],
        })
      )
    ).toThrow('Split basis points must sum to 10000, got 11000');
  });

  it('throws when splits array is empty', () => {
    expect(() =>
      validateTokenFlowConfig(makeConfig({ splits: [] }))
    ).toThrow('TokenFlow must have at least one split');
  });

  it('throws when send action has no to address', () => {
    expect(() =>
      validateTokenFlowConfig(
        makeConfig({
          splits: [{ action: 'send', bps: 10000 }],
        })
      )
    ).toThrow("Split action 'send' requires a 'to' address");
  });

  it('throws for negative bps', () => {
    expect(() =>
      validateTokenFlowConfig(
        makeConfig({
          splits: [
            { action: 'burn', bps: -1 },
            { action: 'burn', bps: 10001 },
          ],
        })
      )
    ).toThrow('Invalid bps value: -1');
  });

  it('throws for bps over 10000', () => {
    expect(() =>
      validateTokenFlowConfig(
        makeConfig({
          // Two splits: one over 10000, one negative to make sum 10000
          // But the individual check should fire first
          splits: [
            { action: 'burn', bps: 10001 },
            { action: 'burn', bps: -1 },
          ],
        })
      )
    ).toThrow('Invalid bps value: 10001');
  });

  it('accepts burn-only config at 10000 bps', () => {
    expect(() =>
      validateTokenFlowConfig(
        makeConfig({ splits: [{ action: 'burn', bps: 10000 }] })
      )
    ).not.toThrow();
  });

  it('accepts send with valid to address', () => {
    expect(() =>
      validateTokenFlowConfig(
        makeConfig({
          splits: [{ action: 'send', bps: 10000, to: CREATOR }],
        })
      )
    ).not.toThrow();
  });

  it('accepts split with bps=0 (no-op split)', () => {
    expect(() =>
      validateTokenFlowConfig(
        makeConfig({
          splits: [
            { action: 'burn', bps: 10000 },
            { action: 'burn', bps: 0 },
          ],
        })
      )
    ).not.toThrow();
  });
});

// --- createTokenFlow ---

describe('createTokenFlow', () => {
  it('returns the config after validation', () => {
    const config = makeConfig();
    const result = createTokenFlow(config);
    expect(result).toBe(config);
  });

  it('throws for invalid config', () => {
    expect(() =>
      createTokenFlow(makeConfig({ splits: [] }))
    ).toThrow('TokenFlow must have at least one split');
  });
});

// --- checkTokenFlowBalance ---

describe('checkTokenFlowBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports canPay true when balance >= chargeAmount', async () => {
    vi.mocked(getEVMTokenBalance).mockResolvedValue(10000n);
    const result = await checkTokenFlowBalance(
      {} as any,
      makeConfig(),
      USER
    );
    expect(result.canPay).toBe(true);
    expect(result.balance).toBe(10000n);
    expect(result.required).toBe(10000n);
    expect(result.shortfall).toBe(0n);
  });

  it('reports canPay false with correct shortfall', async () => {
    vi.mocked(getEVMTokenBalance).mockResolvedValue(3000n);
    const result = await checkTokenFlowBalance(
      {} as any,
      makeConfig(),
      USER
    );
    expect(result.canPay).toBe(false);
    expect(result.shortfall).toBe(7000n);
  });

  it('reports canPay true when balance exceeds chargeAmount', async () => {
    vi.mocked(getEVMTokenBalance).mockResolvedValue(99999n);
    const result = await checkTokenFlowBalance(
      {} as any,
      makeConfig(),
      USER
    );
    expect(result.canPay).toBe(true);
    expect(result.shortfall).toBe(0n);
  });

  it('reports canPay false for zero balance', async () => {
    vi.mocked(getEVMTokenBalance).mockResolvedValue(0n);
    const result = await checkTokenFlowBalance(
      {} as any,
      makeConfig(),
      USER
    );
    expect(result.canPay).toBe(false);
    expect(result.shortfall).toBe(10000n);
  });
});

// --- checkTokenFlowAllowance ---

describe('checkTokenFlowAllowance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports approved true when allowance >= chargeAmount', async () => {
    vi.mocked(getEVMTokenAllowance).mockResolvedValue(10000n);
    const result = await checkTokenFlowAllowance(
      {} as any,
      makeConfig(),
      USER,
      APP
    );
    expect(result.approved).toBe(true);
    expect(result.allowance).toBe(10000n);
    expect(result.required).toBe(10000n);
  });

  it('reports approved false when allowance < chargeAmount', async () => {
    vi.mocked(getEVMTokenAllowance).mockResolvedValue(5000n);
    const result = await checkTokenFlowAllowance(
      {} as any,
      makeConfig(),
      USER,
      APP
    );
    expect(result.approved).toBe(false);
    expect(result.allowance).toBe(5000n);
  });
});

// --- executeTokenFlow ---

describe('executeTokenFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes burn + send + distribute flow', async () => {
    const wallet = makeMockWalletClient();
    const config = makeConfig();

    const result = await executeTokenFlow(
      {} as any,
      wallet as any,
      config,
      USER,
      {
        distributionId: 1n,
        recipients: [HOLDER_A, HOLDER_B],
      }
    );

    expect(result.success).toBe(true);
    expect(result.totalCharged).toBe(10000n);
    expect(result.steps).toHaveLength(3);

    // Step 1: transferFrom to pull tokens
    expect(transferFromERC20).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'sepolia',
      expect.objectContaining({
        from: USER,
        to: APP,
        amount: 10000n,
      })
    );

    // Step 2: burn 50%
    expect(result.steps[0].action).toBe('burn');
    expect(result.steps[0].amount).toBe(5000n);
    expect(burnERC20).toHaveBeenCalledWith(
      expect.anything(),
      'sepolia',
      expect.objectContaining({ amount: 5000n })
    );

    // Step 3: send 25%
    expect(result.steps[1].action).toBe('send');
    expect(result.steps[1].amount).toBe(2500n);
    expect(result.steps[1].to).toBe(CREATOR);

    // Step 4: distribute 25%
    expect(result.steps[2].action).toBe('distribute');
    expect(result.steps[2].amount).toBe(2500n);
  });

  it('throws when wallet has no account', async () => {
    const wallet = { account: null, writeContract: vi.fn() };
    await expect(
      executeTokenFlow({} as any, wallet as any, makeConfig(), USER, {
        distributionId: 1n,
        recipients: [HOLDER_A],
      })
    ).rejects.toThrow('Wallet client has no account');
  });

  it('throws when distribute split has no recipients', async () => {
    const wallet = makeMockWalletClient();
    await expect(
      executeTokenFlow({} as any, wallet as any, makeConfig(), USER, {
        distributionId: 1n,
        recipients: [],
      })
    ).rejects.toThrow("'distribute' split requires options.recipients");
  });

  it('throws when distribute split has no distributionId', async () => {
    const wallet = makeMockWalletClient();
    await expect(
      executeTokenFlow({} as any, wallet as any, makeConfig(), USER, {
        recipients: [HOLDER_A],
      })
    ).rejects.toThrow("'distribute' split requires options.distributionId");
  });

  it('executes burn-only flow without options', async () => {
    const wallet = makeMockWalletClient();
    const config = makeConfig({
      splits: [{ action: 'burn', bps: 10000 }],
    });

    const result = await executeTokenFlow(
      {} as any,
      wallet as any,
      config,
      USER
    );

    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].action).toBe('burn');
    expect(result.steps[0].amount).toBe(10000n);
  });

  it('executes send-only flow', async () => {
    const wallet = makeMockWalletClient();
    const config = makeConfig({
      splits: [{ action: 'send', bps: 10000, to: CREATOR }],
    });

    const result = await executeTokenFlow(
      {} as any,
      wallet as any,
      config,
      USER
    );

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].action).toBe('send');
    expect(transferERC20).toHaveBeenCalledWith(
      expect.anything(),
      'sepolia',
      expect.objectContaining({ to: CREATOR, amount: 10000n })
    );
  });

  it('uses recipientWeights for unequal distribution', async () => {
    const wallet = makeMockWalletClient();
    const config = makeConfig({
      splits: [{ action: 'distribute', bps: 10000 }],
    });

    await executeTokenFlow(
      {} as any,
      wallet as any,
      config,
      USER,
      {
        distributionId: 1n,
        recipients: [HOLDER_A, HOLDER_B],
        recipientWeights: [7000, 3000],
      }
    );

    // The distribute step swaps tokens to ETH, then distributes
    expect(distributeETH).toHaveBeenCalledWith(
      expect.anything(),
      'sepolia',
      expect.objectContaining({
        // 5000n ETH from mock sell * 7000/10000 = 3500n, * 3000/10000 = 1500n
        amounts: [3500n, 1500n],
      })
    );
  });

  it('throws when recipientWeights dont sum to 10000', async () => {
    const wallet = makeMockWalletClient();
    const config = makeConfig({
      splits: [{ action: 'distribute', bps: 10000 }],
    });

    await expect(
      executeTokenFlow({} as any, wallet as any, config, USER, {
        distributionId: 1n,
        recipients: [HOLDER_A, HOLDER_B],
        recipientWeights: [5000, 3000],
      })
    ).rejects.toThrow('recipientWeights must sum to 10000, got 8000');
  });

  it('throws when recipientWeights length doesnt match recipients', async () => {
    const wallet = makeMockWalletClient();
    const config = makeConfig({
      splits: [{ action: 'distribute', bps: 10000 }],
    });

    await expect(
      executeTokenFlow({} as any, wallet as any, config, USER, {
        distributionId: 1n,
        recipients: [HOLDER_A, HOLDER_B],
        recipientWeights: [10000],
      })
    ).rejects.toThrow('recipientWeights length must match recipients length');
  });

  it('distributes equally when no weights provided', async () => {
    const wallet = makeMockWalletClient();
    const config = makeConfig({
      splits: [{ action: 'distribute', bps: 10000 }],
    });

    await executeTokenFlow(
      {} as any,
      wallet as any,
      config,
      USER,
      {
        distributionId: 1n,
        recipients: [HOLDER_A, HOLDER_B],
      }
    );

    // 5000n ETH / 2 recipients = 2500n each
    expect(distributeETH).toHaveBeenCalledWith(
      expect.anything(),
      'sepolia',
      expect.objectContaining({
        amounts: [2500n, 2500n],
      })
    );
  });
});

  it('step results contain correct hashes from underlying operations', async () => {
    const wallet = makeMockWalletClient();
    const config = makeConfig({
      splits: [
        { action: 'burn', bps: 5000 },
        { action: 'send', bps: 5000, to: CREATOR },
      ],
    });

    const result = await executeTokenFlow({} as any, wallet as any, config, USER);
    expect(result.steps[0].hash).toBe('0xBURN');
    expect(result.steps[1].hash).toBe('0xSEND');
  });

  it('distribute step result hash comes from distributeETH', async () => {
    const wallet = makeMockWalletClient();
    const config = makeConfig({
      splits: [{ action: 'distribute', bps: 10000 }],
    });

    const result = await executeTokenFlow(
      {} as any, wallet as any, config, USER,
      { distributionId: 1n, recipients: [HOLDER_A] }
    );
    expect(result.steps[0].hash).toBe('0xDIST');
  });

  it('skips split when calculated amount is 0', async () => {
    const wallet = makeMockWalletClient();
    // chargeAmount = 1n, with a 1-bps split -> (1 * 1) / 10000 = 0n -> skipped
    // and a 9999-bps split -> (1 * 9999) / 10000 = 0n -> also skipped
    // Only if chargeAmount is big enough will it produce non-zero amounts
    const config = makeConfig({
      chargeAmount: 1n,
      splits: [
        { action: 'burn', bps: 1 },
        { action: 'send', bps: 9999, to: CREATOR },
      ],
    });

    const result = await executeTokenFlow({} as any, wallet as any, config, USER);
    // Both splits produce 0n amount due to integer division, so both are skipped
    expect(result.steps).toHaveLength(0);
  });

  it('distribute step passes appToken and distributionId to distributeETH', async () => {
    const wallet = makeMockWalletClient();
    const config = makeConfig({
      splits: [{ action: 'distribute', bps: 10000 }],
    });

    await executeTokenFlow(
      {} as any, wallet as any, config, USER,
      { distributionId: 99n, recipients: [HOLDER_A] }
    );

    expect(distributeETH).toHaveBeenCalledWith(
      expect.anything(),
      'sepolia',
      expect.objectContaining({
        appToken: TOKEN,
        distributionId: 99n,
      })
    );
  });

  it('distribute step computes totalValue from ETH amounts', async () => {
    const wallet = makeMockWalletClient();
    const config = makeConfig({
      splits: [{ action: 'distribute', bps: 10000 }],
    });

    await executeTokenFlow(
      {} as any, wallet as any, config, USER,
      { distributionId: 1n, recipients: [HOLDER_A, HOLDER_B] }
    );

    // Mock sell returns ethAmount=5000n, split equally: 2500n + 2500n = 5000n total
    expect(distributeETH).toHaveBeenCalledWith(
      expect.anything(),
      'sepolia',
      expect.objectContaining({
        totalValue: 5000n,
      })
    );
  });

  it('send step records the to address in the result', async () => {
    const wallet = makeMockWalletClient();
    const config = makeConfig({
      splits: [{ action: 'send', bps: 10000, to: CREATOR }],
    });

    const result = await executeTokenFlow({} as any, wallet as any, config, USER);
    expect(result.steps[0].to).toBe(CREATOR);
  });

  it('burn step does not have a to field', async () => {
    const wallet = makeMockWalletClient();
    const config = makeConfig({
      splits: [{ action: 'burn', bps: 10000 }],
    });

    const result = await executeTokenFlow({} as any, wallet as any, config, USER);
    expect(result.steps[0].to).toBeUndefined();
  });

  it('calls executeEVMSell with correct token amount for distribute', async () => {
    const wallet = makeMockWalletClient();
    const config = makeConfig({
      chargeAmount: BigInt(1e18) * 100n, // 100 tokens
      splits: [{ action: 'distribute', bps: 10000 }],
    });

    await executeTokenFlow(
      {} as any, wallet as any, config, USER,
      { distributionId: 1n, recipients: [HOLDER_A] }
    );

    // executeEVMSell should be called with amount = Number(100 tokens in wei) / 1e18 = 100
    expect(executeEVMSell).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'sepolia',
      expect.objectContaining({
        tokenAddress: TOKEN,
        amount: 100,
        side: 'sell',
      })
    );
  });

  it('passes config.slippageBps to executeEVMSell when set', async () => {
    const wallet = makeMockWalletClient();
    const config = makeConfig({
      splits: [{ action: 'distribute', bps: 10000 }],
      slippageBps: 200,
    });

    await executeTokenFlow(
      {} as any, wallet as any, config, USER,
      { distributionId: 1n, recipients: [HOLDER_A] }
    );

    expect(executeEVMSell).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'sepolia',
      expect.objectContaining({ slippageBps: 200 })
    );
  });

  it('defaults slippageBps to 100 when config.slippageBps is undefined', async () => {
    const wallet = makeMockWalletClient();
    const config = makeConfig({
      splits: [{ action: 'distribute', bps: 10000 }],
    });

    await executeTokenFlow(
      {} as any, wallet as any, config, USER,
      { distributionId: 1n, recipients: [HOLDER_A] }
    );

    expect(executeEVMSell).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'sepolia',
      expect.objectContaining({ slippageBps: 100 })
    );
  });

// --- Property-based tests ---

describe('property: split amounts', () => {
  it('split amounts sum to chargeAmount for burn-only', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 10000n, max: BigInt(1e18) }),
        (chargeAmount: bigint) => {
          const amount = (chargeAmount * BigInt(10000)) / BigInt(10000);
          expect(amount).toBe(chargeAmount);
        }
      )
    );
  });

  it('two splits cover chargeAmount within rounding', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 10000n, max: BigInt(1e18) }),
        fc.integer({ min: 1, max: 9999 }),
        (chargeAmount: bigint, bps1: number) => {
          const bps2 = 10000 - bps1;
          const amount1 = (chargeAmount * BigInt(bps1)) / BigInt(10000);
          const amount2 = (chargeAmount * BigInt(bps2)) / BigInt(10000);
          expect(amount1 + amount2).toBeLessThanOrEqual(chargeAmount);
          expect(chargeAmount - (amount1 + amount2)).toBeLessThanOrEqual(1n);
        }
      )
    );
  });
});
