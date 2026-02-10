/**
 * Tests for src/evm/distribute.ts
 *
 * Public API under test:
 *   - distributeERC20(publicClient, walletClient, networkId, params): Promise<{ hash }>
 *   - distributeETH(walletClient, networkId, params): Promise<{ hash }>
 *
 * Behavioral contracts:
 *   - distributeERC20 approves MultiSend if allowance insufficient, then calls batchSendERC20
 *   - distributeERC20 skips approval if allowance sufficient
 *   - distributeETH calls batchSendEther with msg.value
 *   - Both validate recipients/amounts array length match
 *   - Both throw for empty recipients
 *   - Both throw for unconfigured networks
 *   - Both throw when wallet has no account
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../evm/contracts', () => ({
  getEVMContracts: vi.fn(),
}));

vi.mock('../../evm/client', () => ({
  getEVMTokenAllowance: vi.fn(),
}));

import { getEVMContracts } from '../../evm/contracts';
import { getEVMTokenAllowance } from '../../evm/client';
import { distributeERC20, distributeETH } from '../../evm/distribute';

const MULTI_SEND = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as `0x${string}`;
const APP_TOKEN = '0x1111111111111111111111111111111111111111' as `0x${string}`;
const PAY_TOKEN = '0x2222222222222222222222222222222222222222' as `0x${string}`;
const RECIPIENT_A = '0x3333333333333333333333333333333333333333' as `0x${string}`;
const RECIPIENT_B = '0x4444444444444444444444444444444444444444' as `0x${string}`;
const WALLET_ADDR = '0x5555555555555555555555555555555555555555' as `0x${string}`;

function makeMockWalletClient() {
  return {
    account: { address: WALLET_ADDR },
    writeContract: vi.fn().mockResolvedValue('0xDIST_HASH'),
  };
}

function mockContracts() {
  vi.mocked(getEVMContracts).mockReturnValue({
    appsFun: '0x6EF2633D87D5DD63ae1eB5518297093039BC33E6',
    feeHolder: '0x4fF4974Ae5Bfe5E53aCC35E3Aaad919CD599c98d',
    multiSend: MULTI_SEND,
  });
}

describe('distributeERC20', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContracts();
  });

  it('approves and calls batchSendERC20 when allowance insufficient', async () => {
    vi.mocked(getEVMTokenAllowance).mockResolvedValue(0n);
    const wallet = makeMockWalletClient();

    const result = await distributeERC20({} as any, wallet as any, 'sepolia', {
      appToken: APP_TOKEN,
      distributionId: 1n,
      paymentToken: PAY_TOKEN,
      recipients: [RECIPIENT_A, RECIPIENT_B],
      amounts: [100n, 200n],
    });

    expect(result.hash).toBe('0xDIST_HASH');
    // First call is approve, second is batchSendERC20
    expect(wallet.writeContract).toHaveBeenCalledTimes(2);
    expect(wallet.writeContract.mock.calls[0][0].functionName).toBe('approve');
    expect(wallet.writeContract.mock.calls[0][0].args[0]).toBe(MULTI_SEND);
    expect(wallet.writeContract.mock.calls[0][0].args[1]).toBe(
      BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),
    );
    expect(wallet.writeContract.mock.calls[1][0].functionName).toBe('batchSendERC20');
  });

  it('skips approval when allowance is sufficient', async () => {
    vi.mocked(getEVMTokenAllowance).mockResolvedValue(999999n);
    const wallet = makeMockWalletClient();

    await distributeERC20({} as any, wallet as any, 'sepolia', {
      appToken: APP_TOKEN,
      distributionId: 1n,
      paymentToken: PAY_TOKEN,
      recipients: [RECIPIENT_A],
      amounts: [100n],
    });

    expect(wallet.writeContract).toHaveBeenCalledTimes(1);
    expect(wallet.writeContract.mock.calls[0][0].functionName).toBe('batchSendERC20');
  });

  it('passes correct args to batchSendERC20', async () => {
    vi.mocked(getEVMTokenAllowance).mockResolvedValue(999999n);
    const wallet = makeMockWalletClient();

    await distributeERC20({} as any, wallet as any, 'sepolia', {
      appToken: APP_TOKEN,
      distributionId: 42n,
      paymentToken: PAY_TOKEN,
      recipients: [RECIPIENT_A, RECIPIENT_B],
      amounts: [100n, 200n],
    });

    const args = wallet.writeContract.mock.calls[0][0].args;
    expect(args[0]).toBe(APP_TOKEN);
    expect(args[1]).toBe(42n);
    expect(args[2]).toBe(PAY_TOKEN);
    expect(args[3]).toEqual([RECIPIENT_A, RECIPIENT_B]);
    expect(args[4]).toEqual([100n, 200n]);
  });

  it('throws when recipients and amounts length differ', async () => {
    vi.mocked(getEVMTokenAllowance).mockResolvedValue(999999n);
    const wallet = makeMockWalletClient();

    await expect(
      distributeERC20({} as any, wallet as any, 'sepolia', {
        appToken: APP_TOKEN,
        distributionId: 1n,
        paymentToken: PAY_TOKEN,
        recipients: [RECIPIENT_A],
        amounts: [100n, 200n],
      })
    ).rejects.toThrow('Recipients and amounts arrays must have equal length');
  });

  it('throws for empty recipients', async () => {
    vi.mocked(getEVMTokenAllowance).mockResolvedValue(999999n);
    const wallet = makeMockWalletClient();

    await expect(
      distributeERC20({} as any, wallet as any, 'sepolia', {
        appToken: APP_TOKEN,
        distributionId: 1n,
        paymentToken: PAY_TOKEN,
        recipients: [],
        amounts: [],
      })
    ).rejects.toThrow('Must have at least one recipient');
  });

  it('throws for unconfigured network', async () => {
    vi.mocked(getEVMContracts).mockReturnValue(null);
    const wallet = makeMockWalletClient();

    await expect(
      distributeERC20({} as any, wallet as any, 'solana', {
        appToken: APP_TOKEN,
        distributionId: 1n,
        paymentToken: PAY_TOKEN,
        recipients: [RECIPIENT_A],
        amounts: [100n],
      })
    ).rejects.toThrow('EVM contracts not configured');
  });

  it('throws when wallet has no account', async () => {
    const wallet = { account: null, writeContract: vi.fn() };
    await expect(
      distributeERC20({} as any, wallet as any, 'sepolia', {
        appToken: APP_TOKEN,
        distributionId: 1n,
        paymentToken: PAY_TOKEN,
        recipients: [RECIPIENT_A],
        amounts: [100n],
      })
    ).rejects.toThrow('Wallet client has no account');
  });

  it('checks allowance against total of all amounts', async () => {
    vi.mocked(getEVMTokenAllowance).mockResolvedValue(299n);
    const wallet = makeMockWalletClient();

    await distributeERC20({} as any, wallet as any, 'sepolia', {
      appToken: APP_TOKEN,
      distributionId: 1n,
      paymentToken: PAY_TOKEN,
      recipients: [RECIPIENT_A, RECIPIENT_B],
      amounts: [100n, 200n],
    });

    // 299 < 300 (100+200), so approval should happen
    expect(wallet.writeContract).toHaveBeenCalledTimes(2);
    expect(wallet.writeContract.mock.calls[0][0].functionName).toBe('approve');
  });

  it('skips approval when allowance equals total exactly', async () => {
    vi.mocked(getEVMTokenAllowance).mockResolvedValue(300n);
    const wallet = makeMockWalletClient();

    await distributeERC20({} as any, wallet as any, 'sepolia', {
      appToken: APP_TOKEN,
      distributionId: 1n,
      paymentToken: PAY_TOKEN,
      recipients: [RECIPIENT_A, RECIPIENT_B],
      amounts: [100n, 200n],
    });

    expect(wallet.writeContract).toHaveBeenCalledTimes(1);
  });
});

describe('distributeETH', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContracts();
  });

  it('calls batchSendEther with value', async () => {
    const wallet = makeMockWalletClient();

    const result = await distributeETH(wallet as any, 'sepolia', {
      appToken: APP_TOKEN,
      distributionId: 5n,
      recipients: [RECIPIENT_A, RECIPIENT_B],
      amounts: [1000n, 2000n],
      totalValue: 3000n,
    });

    expect(result.hash).toBe('0xDIST_HASH');
    const call = wallet.writeContract.mock.calls[0][0];
    expect(call.functionName).toBe('batchSendEther');
    expect(call.value).toBe(3000n);
    expect(call.args[0]).toBe(APP_TOKEN);
    expect(call.args[1]).toBe(5n);
    expect(call.args[2]).toEqual([RECIPIENT_A, RECIPIENT_B]);
    expect(call.args[3]).toEqual([1000n, 2000n]);
  });

  it('uses correct chain for base', async () => {
    const wallet = makeMockWalletClient();
    await distributeETH(wallet as any, 'base', {
      appToken: APP_TOKEN,
      distributionId: 1n,
      recipients: [RECIPIENT_A],
      amounts: [100n],
      totalValue: 100n,
    });

    const call = wallet.writeContract.mock.calls[0][0];
    expect(call.chain.id).toBe(8453);
  });

  it('throws when recipients and amounts length differ', async () => {
    const wallet = makeMockWalletClient();
    await expect(
      distributeETH(wallet as any, 'sepolia', {
        appToken: APP_TOKEN,
        distributionId: 1n,
        recipients: [RECIPIENT_A, RECIPIENT_B],
        amounts: [100n],
        totalValue: 100n,
      })
    ).rejects.toThrow('Recipients and amounts arrays must have equal length');
  });

  it('throws for empty recipients', async () => {
    const wallet = makeMockWalletClient();
    await expect(
      distributeETH(wallet as any, 'sepolia', {
        appToken: APP_TOKEN,
        distributionId: 1n,
        recipients: [],
        amounts: [],
        totalValue: 0n,
      })
    ).rejects.toThrow('Must have at least one recipient');
  });

  it('throws for unconfigured network', async () => {
    vi.mocked(getEVMContracts).mockReturnValue(null);
    const wallet = makeMockWalletClient();
    await expect(
      distributeETH(wallet as any, 'solana', {
        appToken: APP_TOKEN,
        distributionId: 1n,
        recipients: [RECIPIENT_A],
        amounts: [100n],
        totalValue: 100n,
      })
    ).rejects.toThrow('EVM contracts not configured');
  });

  it('throws when wallet has no account', async () => {
    const wallet = { account: null, writeContract: vi.fn() };
    await expect(
      distributeETH(wallet as any, 'sepolia', {
        appToken: APP_TOKEN,
        distributionId: 1n,
        recipients: [RECIPIENT_A],
        amounts: [100n],
        totalValue: 100n,
      })
    ).rejects.toThrow('Wallet client has no account');
  });

  it('sends to MultiSend contract address', async () => {
    const wallet = makeMockWalletClient();
    await distributeETH(wallet as any, 'sepolia', {
      appToken: APP_TOKEN,
      distributionId: 1n,
      recipients: [RECIPIENT_A],
      amounts: [100n],
      totalValue: 100n,
    });

    const call = wallet.writeContract.mock.calls[0][0];
    expect(call.address).toBe(MULTI_SEND);
  });
});
