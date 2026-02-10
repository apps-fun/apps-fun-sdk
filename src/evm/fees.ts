// EVM fee claiming functions

import type { WalletClient, Chain } from 'viem';
import { base, mainnet, sepolia } from 'viem/chains';
import type { NetworkId } from '../types/chain';
import { getEVMContracts } from './contracts';
import { FEE_HOLDER_ABI } from './abis';
import type { EVMPublicClient } from './client';

const CHAIN_MAP: Record<string, Chain> = {
  base,
  ethereum: mainnet,
  sepolia,
};

/**
 * Get claimable creator fees for a wallet
 */
export async function getEVMCreatorFees(
  client: EVMPublicClient,
  networkId: NetworkId,
  creatorAddress: `0x${string}`
): Promise<bigint> {
  const contracts = getEVMContracts(networkId);
  if (!contracts) {
    throw new Error(`EVM contracts not configured for network: ${networkId}`);
  }

  const fees = await client.readContract({
    address: contracts.feeHolder,
    abi: FEE_HOLDER_ABI,
    functionName: 'creatorFees',
    args: [creatorAddress],
  });

  return fees as bigint;
}

/**
 * Claim accumulated creator fees
 */
export async function claimEVMFees(
  walletClient: WalletClient,
  networkId: NetworkId
): Promise<{ hash: `0x${string}` }> {
  const contracts = getEVMContracts(networkId);
  if (!contracts) {
    throw new Error(`EVM contracts not configured for network: ${networkId}`);
  }

  const chain = CHAIN_MAP[networkId];

  const hash = await walletClient.writeContract({
    chain,
    address: contracts.feeHolder,
    abi: FEE_HOLDER_ABI,
    functionName: 'claimFees',
    args: [],
    account: walletClient.account!,
  });

  return { hash };
}

/**
 * Claim LP fees for a graduated token
 */
export async function claimEVMLPFees(
  walletClient: WalletClient,
  networkId: NetworkId,
  tokenAddress: `0x${string}`
): Promise<{ hash: `0x${string}` }> {
  const contracts = getEVMContracts(networkId);
  if (!contracts) {
    throw new Error(`EVM contracts not configured for network: ${networkId}`);
  }

  const chain = CHAIN_MAP[networkId];

  const hash = await walletClient.writeContract({
    chain,
    address: contracts.feeHolder,
    abi: FEE_HOLDER_ABI,
    functionName: 'claimLPFees',
    args: [tokenAddress],
    account: walletClient.account!,
  });

  return { hash };
}
