// ERC20 token operation primitives

import type { WalletClient, Chain } from 'viem';
import { base, mainnet, sepolia } from 'viem/chains';
import type { NetworkId } from '../types/chain';
import { ERC20_ABI } from './abis';
import { getEVMTokenAllowance, type EVMPublicClient } from './client';

const CHAIN_MAP: Record<string, Chain> = {
  base,
  ethereum: mainnet,
  sepolia,
};

export const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD' as `0x${string}`;

export interface TransferParams {
  tokenAddress: `0x${string}`;
  to: `0x${string}`;
  amount: bigint;
}

export interface TransferFromParams {
  tokenAddress: `0x${string}`;
  from: `0x${string}`;
  to: `0x${string}`;
  amount: bigint;
}

export interface BurnParams {
  tokenAddress: `0x${string}`;
  amount: bigint;
}

/**
 * Transfer ERC20 tokens to an address.
 */
export async function transferERC20(
  walletClient: WalletClient,
  networkId: NetworkId,
  params: TransferParams
): Promise<{ hash: `0x${string}` }> {
  const chain = CHAIN_MAP[networkId];
  if (!chain) {
    throw new Error(`Unsupported EVM network: ${networkId}`);
  }

  const account = walletClient.account;
  if (!account) {
    throw new Error('Wallet client has no account');
  }

  const hash = await walletClient.writeContract({
    chain,
    account,
    address: params.tokenAddress,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [params.to, params.amount],
  });

  return { hash };
}

/**
 * Transfer ERC20 tokens from one address to another (requires allowance).
 */
export async function transferFromERC20(
  publicClient: EVMPublicClient,
  walletClient: WalletClient,
  networkId: NetworkId,
  params: TransferFromParams
): Promise<{ hash: `0x${string}` }> {
  const chain = CHAIN_MAP[networkId];
  if (!chain) {
    throw new Error(`Unsupported EVM network: ${networkId}`);
  }

  const account = walletClient.account;
  if (!account) {
    throw new Error('Wallet client has no account');
  }

  const allowance = await getEVMTokenAllowance(
    publicClient,
    params.tokenAddress,
    params.from,
    account.address
  );

  if (allowance < params.amount) {
    throw new Error(
      `Insufficient allowance: have ${allowance}, need ${params.amount}. ` +
      `User must approve ${account.address} to spend their tokens.`
    );
  }

  const hash = await walletClient.writeContract({
    chain,
    account,
    address: params.tokenAddress,
    abi: ERC20_ABI,
    functionName: 'transferFrom',
    args: [params.from, params.to, params.amount],
  });

  return { hash };
}

/**
 * Burn ERC20 tokens by sending them to the dead address.
 */
export async function burnERC20(
  walletClient: WalletClient,
  networkId: NetworkId,
  params: BurnParams
): Promise<{ hash: `0x${string}` }> {
  return transferERC20(walletClient, networkId, {
    tokenAddress: params.tokenAddress,
    to: DEAD_ADDRESS,
    amount: params.amount,
  });
}
