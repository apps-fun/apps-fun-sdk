// EVM client utilities using viem

import { createPublicClient, http, type Chain, type Transport, type PublicClient } from 'viem';
import { base, mainnet, sepolia } from 'viem/chains';
import type { NetworkId } from '../types/chain';
import { ERC20_ABI } from './abis';

const CHAIN_MAP = {
  base,
  ethereum: mainnet,
  sepolia,
} as const;

// Type alias for our public client
type EVMPublicClient = PublicClient<Transport, Chain>;

/**
 * Create a public client for reading from EVM chains
 */
export function getEVMPublicClient(networkId: NetworkId, rpcUrl?: string): EVMPublicClient {
  if (networkId === 'solana') {
    throw new Error('Cannot create EVM client for Solana network');
  }

  const chain = CHAIN_MAP[networkId];
  if (!chain) {
    throw new Error(`Unsupported EVM network: ${networkId}`);
  }

  return createPublicClient({
    chain,
    transport: http(rpcUrl),
  }) as EVMPublicClient;
}

/**
 * Get ERC20 token balance for a wallet
 */
export async function getEVMTokenBalance(
  client: EVMPublicClient,
  tokenAddress: `0x${string}`,
  walletAddress: `0x${string}`
): Promise<bigint> {
  const balance = await client.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [walletAddress],
  });
  return balance as bigint;
}

/**
 * Get native ETH balance for a wallet
 */
export async function getEVMNativeBalance(
  client: EVMPublicClient,
  walletAddress: `0x${string}`
): Promise<bigint> {
  return client.getBalance({ address: walletAddress });
}

/**
 * Get ERC20 token allowance
 */
export async function getEVMTokenAllowance(
  client: EVMPublicClient,
  tokenAddress: `0x${string}`,
  ownerAddress: `0x${string}`,
  spenderAddress: `0x${string}`
): Promise<bigint> {
  const allowance = await client.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [ownerAddress, spenderAddress],
  });
  return allowance as bigint;
}

// Re-export the type for use in other modules
export type { EVMPublicClient };
