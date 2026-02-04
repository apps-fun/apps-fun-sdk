// Token info reads: graduation status, pair info, decimals, total supply

import type { NetworkId } from '../types/chain';
import { getEVMContracts } from './contracts';
import { APPS_FUN_ABI, ERC20_ABI } from './abis';
import type { EVMPublicClient } from './client';

// --- AppsFun contract reads ---

/**
 * Check if a token is eligible to graduate from the bonding curve to full AMM.
 */
export async function getEVMCanGraduate(
  client: EVMPublicClient,
  networkId: NetworkId,
  tokenAddress: `0x${string}`
): Promise<boolean> {
  const contracts = getEVMContracts(networkId);
  if (!contracts) {
    throw new Error(`EVM contracts not configured for network: ${networkId}`);
  }

  const result = await client.readContract({
    address: contracts.appsFun,
    abi: APPS_FUN_ABI,
    functionName: 'canGraduate',
    args: [tokenAddress],
  });

  return result as boolean;
}

/**
 * Get the pair address and creator for a token.
 */
export async function getEVMPairInfo(
  client: EVMPublicClient,
  networkId: NetworkId,
  tokenAddress: `0x${string}`
): Promise<{ pair: `0x${string}`; creator: `0x${string}` }> {
  const contracts = getEVMContracts(networkId);
  if (!contracts) {
    throw new Error(`EVM contracts not configured for network: ${networkId}`);
  }

  const result = await client.readContract({
    address: contracts.appsFun,
    abi: APPS_FUN_ABI,
    functionName: 'getPair',
    args: [tokenAddress],
  });

  const [pair, creator] = result as [`0x${string}`, `0x${string}`];
  return { pair, creator };
}

// --- ERC20 metadata reads ---

/**
 * Get the decimals for an ERC20 token.
 */
export async function getEVMTokenDecimals(
  client: EVMPublicClient,
  tokenAddress: `0x${string}`
): Promise<number> {
  const decimals = await client.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'decimals',
    args: [],
  });

  return decimals as number;
}

/**
 * Get the total supply of an ERC20 token.
 */
export async function getEVMTokenTotalSupply(
  client: EVMPublicClient,
  tokenAddress: `0x${string}`
): Promise<bigint> {
  const supply = await client.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'totalSupply',
    args: [],
  });

  return supply as bigint;
}
