/**
 * Tests for src/evm/launch.ts
 *
 * Public API under test:
 *   - deployAndLaunchEVM(walletClient, networkId, params): Promise<EVMLaunchResult>
 *   - launchTokenEVM(walletClient, networkId, tokenAddress, amount): Promise<EVMLaunchResult>
 *   - parseTokenSupply(supply: number): bigint
 *
 * Behavioral contracts:
 *   - deployAndLaunchEVM calls deployAndLaunch with name, symbol, supply on appsFun contract
 *   - launchTokenEVM calls launchToken with tokenAddress and amount on appsFun contract
 *   - Both throw for unconfigured networks
 *   - Both throw for missing wallet account
 *   - parseTokenSupply converts human-readable number to 18-decimal wei
 *   - parseTokenSupply(1_000_000_000) = 1e27
 *   - parseTokenSupply(1) = 1e18
 *   - Return hash from writeContract
 *
 * Mocking boundary: viem client writeContract (network I/O)
 */

import { describe, it, expect, vi } from 'vitest';
import { parseUnits } from 'viem';
import fc from 'fast-check';
import {
  deployAndLaunchEVM,
  launchTokenEVM,
  deployToken,
  parseTokenSupply,
} from '../../evm/launch';

vi.mock('../../evm/client', () => ({
  getEVMPublicClient: vi.fn(() => ({
    waitForTransactionReceipt: vi.fn().mockResolvedValue({
      contractAddress: '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
    }),
  })),
}));

const TX_HASH = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as `0x${string}`;
const ACCOUNT_ADDR = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as `0x${string}`;
const TOKEN_ADDR = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as `0x${string}`;

function makeMockWalletClient(account?: { address: `0x${string}` }) {
  return {
    writeContract: vi.fn().mockResolvedValue(TX_HASH),
    account: account ?? { address: ACCOUNT_ADDR },
  } as any;
}

// ============================================================
// parseTokenSupply
// ============================================================

describe('parseTokenSupply', () => {
  it('converts 1 to 1e18', () => {
    expect(parseTokenSupply(1)).toBe(BigInt('1000000000000000000'));
  });

  it('converts 1_000_000_000 to 1e27', () => {
    expect(parseTokenSupply(1_000_000_000)).toBe(
      BigInt('1000000000000000000000000000'),
    );
  });

  it('converts 0 to 0', () => {
    expect(parseTokenSupply(0)).toBe(BigInt(0));
  });

  it('converts fractional amounts correctly', () => {
    // 0.5 tokens = 5 * 10^17
    expect(parseTokenSupply(0.5)).toBe(BigInt('500000000000000000'));
  });

  // Property: parseTokenSupply(n) = n * 10^18 for whole numbers
  it('equals n * 10^18 for positive integers', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        (n) => {
          const result = parseTokenSupply(n);
          const expected = BigInt(n) * BigInt('1000000000000000000');
          return result === expected;
        },
      ),
    );
  });

  // Property: result is always non-negative for non-negative input
  it('returns non-negative for non-negative input', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        (n) => parseTokenSupply(n) >= BigInt(0),
      ),
    );
  });
});

// ============================================================
// deployAndLaunchEVM
// ============================================================

describe('deployAndLaunchEVM', () => {
  it('throws for solana network', async () => {
    const wallet = makeMockWalletClient();
    await expect(
      deployAndLaunchEVM(wallet, 'solana', {
        name: 'Test',
        symbol: 'TST',
        supply: parseTokenSupply(1_000_000),
      }),
    ).rejects.toThrow('EVM contracts not configured for network: solana');
  });

  it('throws when wallet has no account', async () => {
    const wallet = { writeContract: vi.fn(), account: undefined } as any;
    await expect(
      deployAndLaunchEVM(wallet, 'sepolia', {
        name: 'Test',
        symbol: 'TST',
        supply: parseTokenSupply(1_000_000),
      }),
    ).rejects.toThrow('Wallet client has no account');
  });

  it('calls deployAndLaunch with name, symbol, supply', async () => {
    const wallet = makeMockWalletClient();
    const supply = parseTokenSupply(1_000_000);

    await deployAndLaunchEVM(wallet, 'sepolia', {
      name: 'MyToken',
      symbol: 'MTK',
      supply,
    });

    expect(wallet.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'deployAndLaunch',
        args: ['MyToken', 'MTK', supply],
      }),
    );
  });

  it('uses appsFun address from contracts config', async () => {
    const wallet = makeMockWalletClient();

    await deployAndLaunchEVM(wallet, 'sepolia', {
      name: 'T',
      symbol: 'T',
      supply: BigInt(1),
    });

    const callArgs = wallet.writeContract.mock.calls[0][0];
    expect(callArgs.address).toBe('0xFfFFfFfffF6469850a0619fDFbA72cf4b4efcd3D');
  });

  it('returns hash from writeContract', async () => {
    const wallet = makeMockWalletClient();

    const result = await deployAndLaunchEVM(wallet, 'sepolia', {
      name: 'T',
      symbol: 'T',
      supply: BigInt(1),
    });

    expect(result.hash).toBe(TX_HASH);
  });

  it('propagates writeContract errors', async () => {
    const wallet = makeMockWalletClient();
    wallet.writeContract.mockRejectedValue(new Error('Insufficient gas'));

    await expect(
      deployAndLaunchEVM(wallet, 'sepolia', {
        name: 'T',
        symbol: 'T',
        supply: BigInt(1),
      }),
    ).rejects.toThrow('Insufficient gas');
  });
});

// ============================================================
// launchTokenEVM
// ============================================================

describe('launchTokenEVM', () => {
  it('throws for solana network', async () => {
    const wallet = makeMockWalletClient();
    await expect(
      launchTokenEVM(wallet, 'solana', TOKEN_ADDR, BigInt(1000)),
    ).rejects.toThrow('EVM contracts not configured for network: solana');
  });

  it('throws when wallet has no account', async () => {
    const wallet = { writeContract: vi.fn(), account: undefined } as any;
    await expect(
      launchTokenEVM(wallet, 'sepolia', TOKEN_ADDR, BigInt(1000)),
    ).rejects.toThrow('Wallet client has no account');
  });

  it('calls launchToken with tokenAddress and amount', async () => {
    const wallet = makeMockWalletClient();
    const amount = parseUnits('500000', 18);

    await launchTokenEVM(wallet, 'sepolia', TOKEN_ADDR, amount);

    expect(wallet.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'launchToken',
        args: [TOKEN_ADDR, amount],
      }),
    );
  });

  it('returns hash from writeContract', async () => {
    const wallet = makeMockWalletClient();

    const result = await launchTokenEVM(
      wallet,
      'sepolia',
      TOKEN_ADDR,
      BigInt(1000),
    );

    expect(result.hash).toBe(TX_HASH);
  });

  it('uses appsFun address not feeHolder', async () => {
    const wallet = makeMockWalletClient();

    await launchTokenEVM(wallet, 'sepolia', TOKEN_ADDR, BigInt(1));

    const callArgs = wallet.writeContract.mock.calls[0][0];
    expect(callArgs.address).toBe('0xFfFFfFfffF6469850a0619fDFbA72cf4b4efcd3D');
  });

  it('works with base network', async () => {
    const wallet = makeMockWalletClient();

    const result = await launchTokenEVM(wallet, 'base', TOKEN_ADDR, BigInt(1));
    expect(result.hash).toBe(TX_HASH);
  });
});

// ============================================================
// deployToken
// ============================================================

describe('deployToken', () => {
  function makeMockDeployWalletClient(account?: { address: `0x${string}` }) {
    return {
      deployContract: vi.fn().mockResolvedValue(TX_HASH),
      account: account ?? { address: ACCOUNT_ADDR },
    } as any;
  }

  it('throws for unsupported network', async () => {
    const wallet = makeMockDeployWalletClient();
    await expect(
      deployToken(wallet, 'solana', { name: 'T', symbol: 'T', supply: 1000 }),
    ).rejects.toThrow('Unsupported EVM network: solana');
  });

  it('throws when wallet has no account', async () => {
    const wallet = { deployContract: vi.fn(), account: undefined } as any;
    await expect(
      deployToken(wallet, 'sepolia', { name: 'T', symbol: 'T', supply: 1000 }),
    ).rejects.toThrow('Wallet client has no account');
  });

  it('calls deployContract with SIMPLE_ERC20_ABI and bytecode', async () => {
    const wallet = makeMockDeployWalletClient();

    await deployToken(wallet, 'sepolia', {
      name: 'MyToken',
      symbol: 'MTK',
      supply: 1_000_000,
    });

    expect(wallet.deployContract).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ['MyToken', 'MTK', parseUnits('1000000', 18)],
      }),
    );
  });

  it('returns hash and token address from receipt', async () => {
    const wallet = makeMockDeployWalletClient();

    const result = await deployToken(wallet, 'sepolia', {
      name: 'T',
      symbol: 'T',
      supply: 1000,
    });

    expect(result.hash).toBe(TX_HASH);
    expect(result.tokenAddress).toBe('0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC');
  });

  it('throws when receipt has no contract address', async () => {
    const { getEVMPublicClient } = await import('../../evm/client');
    (getEVMPublicClient as any).mockReturnValueOnce({
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ contractAddress: null }),
    });

    const wallet = makeMockDeployWalletClient();
    await expect(
      deployToken(wallet, 'sepolia', { name: 'T', symbol: 'T', supply: 1000 }),
    ).rejects.toThrow('Contract deployment failed');
  });

  it('propagates deployContract errors', async () => {
    const wallet = makeMockDeployWalletClient();
    wallet.deployContract.mockRejectedValue(new Error('Out of gas'));

    await expect(
      deployToken(wallet, 'sepolia', { name: 'T', symbol: 'T', supply: 1000 }),
    ).rejects.toThrow('Out of gas');
  });

  it('works with base network', async () => {
    const wallet = makeMockDeployWalletClient();

    const result = await deployToken(wallet, 'base', {
      name: 'T',
      symbol: 'T',
      supply: 1000,
    });
    expect(result.hash).toBe(TX_HASH);
  });
});
