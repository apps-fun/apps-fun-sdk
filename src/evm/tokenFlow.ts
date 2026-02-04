// Declarative token payment flow pipeline

import type { WalletClient } from 'viem';
import type { NetworkId } from '../types/chain';
import type { EVMPublicClient } from './client';
import { getEVMTokenBalance, getEVMTokenAllowance } from './client';
import { transferFromERC20, burnERC20, transferERC20 } from './tokenOps';
import { executeEVMSell } from './trading';
import { distributeETH } from './distribute';

// --- Types ---

export type SplitAction = 'burn' | 'send' | 'distribute';

export interface TokenFlowSplit {
  action: SplitAction;
  bps: number;
  to?: `0x${string}`;
}

export interface TokenFlowConfig {
  token: `0x${string}`;
  network: NetworkId;
  chargeAmount: bigint;
  splits: TokenFlowSplit[];
  slippageBps?: number;
}

export interface TokenFlowStepResult {
  action: SplitAction;
  amount: bigint;
  hash: `0x${string}`;
  to?: string;
}

export interface TokenFlowResult {
  success: boolean;
  steps: TokenFlowStepResult[];
  totalCharged: bigint;
}

// --- Validation ---

export function validateTokenFlowConfig(config: TokenFlowConfig): void {
  if (config.splits.length === 0) {
    throw new Error('TokenFlow must have at least one split');
  }

  const totalBps = config.splits.reduce((sum, s) => sum + s.bps, 0);
  if (totalBps !== 10000) {
    throw new Error(`Split basis points must sum to 10000, got ${totalBps}`);
  }

  for (const split of config.splits) {
    if (split.bps < 0 || split.bps > 10000) {
      throw new Error(`Invalid bps value: ${split.bps}`);
    }
    if (split.action === 'send' && !split.to) {
      throw new Error("Split action 'send' requires a 'to' address");
    }
  }
}

// --- Create ---

export function createTokenFlow(config: TokenFlowConfig): TokenFlowConfig {
  validateTokenFlowConfig(config);
  return config;
}

// --- Balance and Allowance Checks ---

export async function checkTokenFlowBalance(
  publicClient: EVMPublicClient,
  config: TokenFlowConfig,
  userWallet: `0x${string}`
): Promise<{
  canPay: boolean;
  balance: bigint;
  required: bigint;
  shortfall: bigint;
}> {
  const balance = await getEVMTokenBalance(publicClient, config.token, userWallet);
  const canPay = balance >= config.chargeAmount;
  return {
    canPay,
    balance,
    required: config.chargeAmount,
    shortfall: canPay ? 0n : config.chargeAmount - balance,
  };
}

export async function checkTokenFlowAllowance(
  publicClient: EVMPublicClient,
  config: TokenFlowConfig,
  userWallet: `0x${string}`,
  appWallet: `0x${string}`
): Promise<{
  approved: boolean;
  allowance: bigint;
  required: bigint;
}> {
  const allowance = await getEVMTokenAllowance(
    publicClient,
    config.token,
    userWallet,
    appWallet
  );
  return {
    approved: allowance >= config.chargeAmount,
    allowance,
    required: config.chargeAmount,
  };
}

// --- Execute ---

/**
 * Execute a token payment flow.
 *
 * 1. Pull chargeAmount from user via transferFrom
 * 2. For each split, execute the action with the split's portion
 *
 * The walletClient must be the app's server-side wallet.
 * The user must have approved this wallet to spend chargeAmount of the token.
 *
 * For 'distribute' splits: tokens are swapped to ETH via AppsFun AMM,
 * then ETH is distributed to recipients.
 */
export async function executeTokenFlow(
  publicClient: EVMPublicClient,
  walletClient: WalletClient,
  config: TokenFlowConfig,
  userWallet: `0x${string}`,
  options?: {
    distributionId?: bigint;
    recipients?: `0x${string}`[];
    recipientWeights?: number[];
  }
): Promise<TokenFlowResult> {
  validateTokenFlowConfig(config);

  const account = walletClient.account;
  if (!account) {
    throw new Error('Wallet client has no account');
  }

  const hasDistribute = config.splits.some(s => s.action === 'distribute');
  if (hasDistribute) {
    if (!options?.recipients || options.recipients.length === 0) {
      throw new Error("'distribute' split requires options.recipients");
    }
    if (options.distributionId === undefined) {
      throw new Error("'distribute' split requires options.distributionId");
    }
  }

  // Step 1: Pull tokens from user to app wallet
  await transferFromERC20(publicClient, walletClient, config.network, {
    tokenAddress: config.token,
    from: userWallet,
    to: account.address,
    amount: config.chargeAmount,
  });

  // Step 2: Execute each split
  const steps: TokenFlowStepResult[] = [];

  for (const split of config.splits) {
    const amount = (config.chargeAmount * BigInt(split.bps)) / BigInt(10000);
    if (amount === 0n) continue;

    switch (split.action) {
      case 'burn': {
        const { hash } = await burnERC20(walletClient, config.network, {
          tokenAddress: config.token,
          amount,
        });
        steps.push({ action: 'burn', amount, hash });
        break;
      }

      case 'send': {
        const { hash } = await transferERC20(walletClient, config.network, {
          tokenAddress: config.token,
          to: split.to!,
          amount,
        });
        steps.push({ action: 'send', amount, hash, to: split.to });
        break;
      }

      case 'distribute': {
        // Swap tokens to ETH
        const sellResult = await executeEVMSell(
          publicClient,
          walletClient,
          config.network,
          {
            tokenAddress: config.token,
            amount: Number(amount) / 1e18,
            side: 'sell',
            slippageBps: config.slippageBps ?? 100,
          }
        );

        // Distribute the ETH to recipients
        const recipients = options!.recipients!;
        const weights = options?.recipientWeights;
        let ethAmounts: bigint[];

        if (weights) {
          if (weights.length !== recipients.length) {
            throw new Error('recipientWeights length must match recipients length');
          }
          const totalWeight = weights.reduce((a, b) => a + b, 0);
          if (totalWeight !== 10000) {
            throw new Error(`recipientWeights must sum to 10000, got ${totalWeight}`);
          }
          ethAmounts = weights.map(w =>
            (sellResult.ethAmount * BigInt(w)) / BigInt(10000)
          );
        } else {
          const perRecipient = sellResult.ethAmount / BigInt(recipients.length);
          ethAmounts = recipients.map(() => perRecipient);
        }

        const totalETH = ethAmounts.reduce((a, b) => a + b, 0n);

        const { hash } = await distributeETH(walletClient, config.network, {
          appToken: config.token,
          distributionId: options!.distributionId!,
          recipients,
          amounts: ethAmounts,
          totalValue: totalETH,
        });

        steps.push({ action: 'distribute', amount, hash });
        break;
      }
    }
  }

  return {
    success: true,
    steps,
    totalCharged: config.chargeAmount,
  };
}
