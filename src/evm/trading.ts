// EVM trading functions

import type { WalletClient, Chain } from 'viem';
import { parseUnits, formatUnits } from 'viem';
import { base, mainnet, sepolia } from 'viem/chains';
import type { NetworkId } from '../types/chain';
import { getEVMContracts } from './contracts';
import { APPS_FUN_ABI, ERC20_ABI } from './abis';
import { getEVMTokenAllowance, type EVMPublicClient } from './client';

const CHAIN_MAP: Record<string, Chain> = {
  base,
  ethereum: mainnet,
  sepolia,
};

export interface EVMQuoteParams {
  tokenAddress: `0x${string}`;
  amount: number;
  side: 'buy' | 'sell';
  appsFunAddress?: `0x${string}`; // Override for tokens on different AppsFun instances
}

export interface EVMQuoteResult {
  tokenAmount: number;
  tokenAmountRaw: bigint;
  ethAmount: number;
  ethAmountRaw: bigint;
  pricePerToken: number;
}

export interface EVMTradeParams {
  tokenAddress: `0x${string}`;
  amount: number;
  side: 'buy' | 'sell';
  slippageBps?: number; // Default 100 (1%)
  deadline?: number; // Unix timestamp, default 20 minutes from now
  appsFunAddress?: `0x${string}`;
}

export interface EVMTradeResult {
  hash: `0x${string}`;
  tokenAmount: bigint;
  ethAmount: bigint;
}

/**
 * Get a quote for buying or selling tokens on EVM
 */
export async function getEVMQuote(
  client: EVMPublicClient,
  networkId: NetworkId,
  params: EVMQuoteParams
): Promise<EVMQuoteResult> {
  const contracts = getEVMContracts(networkId);
  if (!contracts) {
    throw new Error(`EVM contracts not configured for network: ${networkId}`);
  }

  const appsFunAddress = params.appsFunAddress || contracts.appsFun;
  const { tokenAddress, amount, side } = params;

  if (side === 'buy') {
    // Buy: input is ETH, output is tokens
    const ethAmountRaw = parseUnits(amount.toString(), 18);
    const tokenAmountRaw = await client.readContract({
      address: appsFunAddress,
      abi: APPS_FUN_ABI,
      functionName: 'quoteSwapExactETHForTokens',
      args: [ethAmountRaw, tokenAddress],
    }) as bigint;

    const tokenAmount = parseFloat(formatUnits(tokenAmountRaw, 18));
    const pricePerToken = amount / tokenAmount;

    return {
      tokenAmount,
      tokenAmountRaw,
      ethAmount: amount,
      ethAmountRaw,
      pricePerToken,
    };
  } else {
    // Sell: input is tokens, output is ETH
    const tokenAmountRaw = parseUnits(amount.toString(), 18);
    const ethAmountRaw = await client.readContract({
      address: appsFunAddress,
      abi: APPS_FUN_ABI,
      functionName: 'quoteSwapExactTokensForETH',
      args: [tokenAmountRaw, tokenAddress],
    }) as bigint;

    const ethAmount = parseFloat(formatUnits(ethAmountRaw, 18));
    const pricePerToken = ethAmount / amount;

    return {
      tokenAmount: amount,
      tokenAmountRaw,
      ethAmount,
      ethAmountRaw,
      pricePerToken,
    };
  }
}

/**
 * Execute a buy trade on EVM (requires wallet client)
 */
export async function executeEVMBuy(
  publicClient: EVMPublicClient,
  walletClient: WalletClient,
  networkId: NetworkId,
  params: EVMTradeParams
): Promise<EVMTradeResult> {
  const contracts = getEVMContracts(networkId);
  if (!contracts) {
    throw new Error(`EVM contracts not configured for network: ${networkId}`);
  }

  const chain = CHAIN_MAP[networkId];

  const appsFunAddress = params.appsFunAddress || contracts.appsFun;
  const slippageBps = params.slippageBps ?? 100;
  const deadline = params.deadline ?? Math.floor(Date.now() / 1000) + 1200;

  const account = walletClient.account;
  if (!account) {
    throw new Error('Wallet client has no account');
  }

  // Get quote
  const quote = await getEVMQuote(publicClient, networkId, {
    tokenAddress: params.tokenAddress,
    amount: params.amount,
    side: 'buy',
    appsFunAddress,
  });

  // Calculate minimum output with slippage
  const amountOutMin = quote.tokenAmountRaw * BigInt(10000 - slippageBps) / BigInt(10000);

  // Execute swap
  const hash = await walletClient.writeContract({
    chain,
    account,
    address: appsFunAddress,
    abi: APPS_FUN_ABI,
    functionName: 'swapExactETHForTokens',
    args: [amountOutMin, params.tokenAddress, account.address, BigInt(deadline)],
    value: quote.ethAmountRaw,
  });

  return {
    hash,
    tokenAmount: quote.tokenAmountRaw,
    ethAmount: quote.ethAmountRaw,
  };
}

/**
 * Execute a sell trade on EVM (requires wallet client)
 */
export async function executeEVMSell(
  publicClient: EVMPublicClient,
  walletClient: WalletClient,
  networkId: NetworkId,
  params: EVMTradeParams
): Promise<EVMTradeResult> {
  const contracts = getEVMContracts(networkId);
  if (!contracts) {
    throw new Error(`EVM contracts not configured for network: ${networkId}`);
  }

  const chain = CHAIN_MAP[networkId];

  const appsFunAddress = params.appsFunAddress || contracts.appsFun;
  const slippageBps = params.slippageBps ?? 100;
  const deadline = params.deadline ?? Math.floor(Date.now() / 1000) + 1200;

  const account = walletClient.account;
  if (!account) {
    throw new Error('Wallet client has no account');
  }

  // Get quote
  const quote = await getEVMQuote(publicClient, networkId, {
    tokenAddress: params.tokenAddress,
    amount: params.amount,
    side: 'sell',
    appsFunAddress,
  });

  // Check and handle approval
  const allowance = await getEVMTokenAllowance(
    publicClient,
    params.tokenAddress,
    account.address,
    appsFunAddress
  );

  if (allowance < quote.tokenAmountRaw) {
    // Approve max uint256 for one-time approval
    await walletClient.writeContract({
      chain,
      account,
      address: params.tokenAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [appsFunAddress, BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')],
    });
  }

  // Calculate minimum output with slippage
  const amountOutMin = quote.ethAmountRaw * BigInt(10000 - slippageBps) / BigInt(10000);

  // Execute swap
  const hash = await walletClient.writeContract({
    chain,
    account,
    address: appsFunAddress,
    abi: APPS_FUN_ABI,
    functionName: 'swapExactTokensForETH',
    args: [quote.tokenAmountRaw, amountOutMin, params.tokenAddress, account.address, BigInt(deadline)],
  });

  return {
    hash,
    tokenAmount: quote.tokenAmountRaw,
    ethAmount: quote.ethAmountRaw,
  };
}
