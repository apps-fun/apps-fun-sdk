/**
 * Tests for src/evm/tokenOps.ts
 *
 * Public API under test:
 *   - transferERC20(walletClient, networkId, params): Promise<{ hash }>
 *   - transferFromERC20(publicClient, walletClient, networkId, params): Promise<{ hash }>
 *   - burnERC20(walletClient, networkId, params): Promise<{ hash }>
 *   - DEAD_ADDRESS constant
 *
 * Behavioral contracts:
 *   - transferERC20 calls writeContract with ERC20 transfer ABI
 *   - transferFromERC20 checks allowance before calling transferFrom
 *   - transferFromERC20 throws if allowance is insufficient
 *   - burnERC20 calls transferERC20 with DEAD_ADDRESS as recipient
 *   - All functions throw for unsupported networks
 *   - All functions throw when wallet has no account
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  transferERC20,
  transferFromERC20,
  burnERC20,
  DEAD_ADDRESS,
} from '../../evm/tokenOps';

// Mock the client module for allowance checks
vi.mock('../../evm/client', () => ({
  getEVMTokenAllowance: vi.fn(),
}));

import { getEVMTokenAllowance } from '../../evm/client';

const TOKEN = '0x1111111111111111111111111111111111111111' as `0x${string}`;
const TO = '0x2222222222222222222222222222222222222222' as `0x${string}`;
const FROM = '0x3333333333333333333333333333333333333333' as `0x${string}`;
const APP_WALLET = '0x4444444444444444444444444444444444444444' as `0x${string}`;

function makeMockWalletClient(address: string = APP_WALLET) {
  return {
    account: { address },
    writeContract: vi.fn().mockResolvedValue('0xHASH'),
  };
}

function makeMockWalletClientNoAccount() {
  return {
    account: null,
    writeContract: vi.fn(),
  };
}

describe('DEAD_ADDRESS', () => {
  it('is the standard burn address', () => {
    expect(DEAD_ADDRESS).toBe('0x000000000000000000000000000000000000dEaD');
  });
});

describe('transferERC20', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls writeContract with transfer function and returns hash', async () => {
    const wallet = makeMockWalletClient();
    const result = await transferERC20(wallet as any, 'sepolia', {
      tokenAddress: TOKEN,
      to: TO,
      amount: 1000n,
    });

    expect(result.hash).toBe('0xHASH');
    expect(wallet.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: TOKEN,
        functionName: 'transfer',
        args: [TO, 1000n],
      })
    );
  });

  it('passes the correct chain for sepolia', async () => {
    const wallet = makeMockWalletClient();
    await transferERC20(wallet as any, 'sepolia', {
      tokenAddress: TOKEN,
      to: TO,
      amount: 1n,
    });

    const callArgs = wallet.writeContract.mock.calls[0][0];
    expect(callArgs.chain.id).toBe(11155111);
  });

  it('passes the correct chain for base', async () => {
    const wallet = makeMockWalletClient();
    await transferERC20(wallet as any, 'base', {
      tokenAddress: TOKEN,
      to: TO,
      amount: 1n,
    });

    const callArgs = wallet.writeContract.mock.calls[0][0];
    expect(callArgs.chain.id).toBe(8453);
  });

  it('throws for solana network', async () => {
    const wallet = makeMockWalletClient();
    await expect(
      transferERC20(wallet as any, 'solana', {
        tokenAddress: TOKEN,
        to: TO,
        amount: 1n,
      })
    ).rejects.toThrow('Unsupported EVM network: solana');
  });

  it('throws when wallet has no account', async () => {
    const wallet = makeMockWalletClientNoAccount();
    await expect(
      transferERC20(wallet as any, 'sepolia', {
        tokenAddress: TOKEN,
        to: TO,
        amount: 1n,
      })
    ).rejects.toThrow('Wallet client has no account');
  });

  it('passes the account to writeContract', async () => {
    const wallet = makeMockWalletClient(APP_WALLET);
    await transferERC20(wallet as any, 'sepolia', {
      tokenAddress: TOKEN,
      to: TO,
      amount: 500n,
    });

    const callArgs = wallet.writeContract.mock.calls[0][0];
    expect(callArgs.account.address).toBe(APP_WALLET);
  });

  it('propagates writeContract errors', async () => {
    const wallet = makeMockWalletClient();
    wallet.writeContract.mockRejectedValue(new Error('tx reverted'));
    await expect(
      transferERC20(wallet as any, 'sepolia', {
        tokenAddress: TOKEN,
        to: TO,
        amount: 1n,
      })
    ).rejects.toThrow('tx reverted');
  });
});

describe('transferFromERC20', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('checks allowance then calls transferFrom', async () => {
    vi.mocked(getEVMTokenAllowance).mockResolvedValue(5000n);
    const wallet = makeMockWalletClient(APP_WALLET);

    const result = await transferFromERC20({} as any, wallet as any, 'sepolia', {
      tokenAddress: TOKEN,
      from: FROM,
      to: APP_WALLET,
      amount: 1000n,
    });

    expect(result.hash).toBe('0xHASH');
    expect(getEVMTokenAllowance).toHaveBeenCalledWith(
      expect.anything(),
      TOKEN,
      FROM,
      APP_WALLET
    );
    expect(wallet.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'transferFrom',
        args: [FROM, APP_WALLET, 1000n],
      })
    );
  });

  it('throws when allowance is less than amount', async () => {
    vi.mocked(getEVMTokenAllowance).mockResolvedValue(500n);
    const wallet = makeMockWalletClient(APP_WALLET);

    await expect(
      transferFromERC20({} as any, wallet as any, 'sepolia', {
        tokenAddress: TOKEN,
        from: FROM,
        to: APP_WALLET,
        amount: 1000n,
      })
    ).rejects.toThrow('Insufficient allowance');
  });

  it('includes account address in insufficient allowance error', async () => {
    vi.mocked(getEVMTokenAllowance).mockResolvedValue(500n);
    const wallet = makeMockWalletClient(APP_WALLET);

    await expect(
      transferFromERC20({} as any, wallet as any, 'sepolia', {
        tokenAddress: TOKEN,
        from: FROM,
        to: APP_WALLET,
        amount: 1000n,
      })
    ).rejects.toThrow(`User must approve ${APP_WALLET} to spend their tokens`);
  });

  it('succeeds when allowance equals amount exactly', async () => {
    vi.mocked(getEVMTokenAllowance).mockResolvedValue(1000n);
    const wallet = makeMockWalletClient(APP_WALLET);

    const result = await transferFromERC20({} as any, wallet as any, 'sepolia', {
      tokenAddress: TOKEN,
      from: FROM,
      to: APP_WALLET,
      amount: 1000n,
    });

    expect(result.hash).toBe('0xHASH');
  });

  it('throws for unsupported network', async () => {
    vi.mocked(getEVMTokenAllowance).mockResolvedValue(10000n);
    const wallet = makeMockWalletClient();

    await expect(
      transferFromERC20({} as any, wallet as any, 'solana', {
        tokenAddress: TOKEN,
        from: FROM,
        to: APP_WALLET,
        amount: 1n,
      })
    ).rejects.toThrow('Unsupported EVM network: solana');
  });

  it('throws when wallet has no account', async () => {
    const wallet = makeMockWalletClientNoAccount();
    await expect(
      transferFromERC20({} as any, wallet as any, 'sepolia', {
        tokenAddress: TOKEN,
        from: FROM,
        to: APP_WALLET,
        amount: 1n,
      })
    ).rejects.toThrow('Wallet client has no account');
  });

  it('error message includes allowance and required amounts', async () => {
    vi.mocked(getEVMTokenAllowance).mockResolvedValue(100n);
    const wallet = makeMockWalletClient(APP_WALLET);

    await expect(
      transferFromERC20({} as any, wallet as any, 'sepolia', {
        tokenAddress: TOKEN,
        from: FROM,
        to: APP_WALLET,
        amount: 500n,
      })
    ).rejects.toThrow(/have 100.*need 500/);
  });
});

describe('burnERC20', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls transfer with DEAD_ADDRESS', async () => {
    const wallet = makeMockWalletClient();
    const result = await burnERC20(wallet as any, 'sepolia', {
      tokenAddress: TOKEN,
      amount: 999n,
    });

    expect(result.hash).toBe('0xHASH');
    expect(wallet.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'transfer',
        args: [DEAD_ADDRESS, 999n],
      })
    );
  });

  it('uses the correct token address', async () => {
    const wallet = makeMockWalletClient();
    await burnERC20(wallet as any, 'base', {
      tokenAddress: TOKEN,
      amount: 1n,
    });

    const callArgs = wallet.writeContract.mock.calls[0][0];
    expect(callArgs.address).toBe(TOKEN);
  });

  it('throws for unsupported network', async () => {
    const wallet = makeMockWalletClient();
    await expect(
      burnERC20(wallet as any, 'solana', {
        tokenAddress: TOKEN,
        amount: 1n,
      })
    ).rejects.toThrow('Unsupported EVM network: solana');
  });
});
