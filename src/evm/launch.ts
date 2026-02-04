// EVM token launch functions

import type { WalletClient, Chain } from 'viem';
import { parseUnits } from 'viem';
import { base, mainnet, sepolia } from 'viem/chains';
import type { NetworkId } from '../types/chain';
import { getEVMContracts } from './contracts';
import { APPS_FUN_ABI, SIMPLE_ERC20_ABI, SIMPLE_ERC20_BYTECODE } from './abis';
import { getEVMPublicClient } from './client';

const CHAIN_MAP: Record<string, Chain> = {
  base,
  ethereum: mainnet,
  sepolia,
};

export interface EVMLaunchParams {
  name: string;
  symbol: string;
  supply: bigint; // Total supply in wei (18 decimals)
}

export interface EVMLaunchResult {
  hash: `0x${string}`;
  tokenAddress?: `0x${string}`;
  pairAddress?: `0x${string}`;
}

/**
 * Deploy and launch a token in a single transaction
 * Use this when creator does not want to hold any tokens
 */
export async function deployAndLaunchEVM(
  walletClient: WalletClient,
  networkId: NetworkId,
  params: EVMLaunchParams
): Promise<EVMLaunchResult> {
  const contracts = getEVMContracts(networkId);
  if (!contracts) {
    throw new Error(`EVM contracts not configured for network: ${networkId}`);
  }

  const chain = CHAIN_MAP[networkId];

  const account = walletClient.account;
  if (!account) {
    throw new Error('Wallet client has no account');
  }

  const hash = await walletClient.writeContract({
    chain,
    account,
    address: contracts.appsFun,
    abi: APPS_FUN_ABI,
    functionName: 'deployAndLaunch',
    args: [params.name, params.symbol, params.supply],
  });

  return { hash };
}

/**
 * Launch an existing token (after deploying separately)
 * Use this when creator wants to hold some tokens before launch
 */
export async function launchTokenEVM(
  walletClient: WalletClient,
  networkId: NetworkId,
  tokenAddress: `0x${string}`,
  amount: bigint
): Promise<EVMLaunchResult> {
  const contracts = getEVMContracts(networkId);
  if (!contracts) {
    throw new Error(`EVM contracts not configured for network: ${networkId}`);
  }

  const chain = CHAIN_MAP[networkId];

  const account = walletClient.account;
  if (!account) {
    throw new Error('Wallet client has no account');
  }

  const hash = await walletClient.writeContract({
    chain,
    account,
    address: contracts.appsFun,
    abi: APPS_FUN_ABI,
    functionName: 'launchToken',
    args: [tokenAddress, amount],
  });

  return { hash };
}

/**
 * Deploy an AppsFunToken contract separately (without launching).
 * Use this when the creator wants to hold some tokens before calling launchTokenEVM.
 */
export async function deployToken(
  walletClient: WalletClient,
  networkId: NetworkId,
  params: { name: string; symbol: string; supply: number }
): Promise<{ hash: `0x${string}`; tokenAddress: `0x${string}` }> {
  const chain = CHAIN_MAP[networkId];
  if (!chain) {
    throw new Error(`Unsupported EVM network: ${networkId}`);
  }

  const account = walletClient.account;
  if (!account) {
    throw new Error('Wallet client has no account');
  }

  const supplyWei = parseUnits(params.supply.toString(), 18);

  const hash = await walletClient.deployContract({
    chain,
    account,
    abi: SIMPLE_ERC20_ABI,
    bytecode: SIMPLE_ERC20_BYTECODE,
    args: [params.name, params.symbol, supplyWei],
  });

  const publicClient = getEVMPublicClient(networkId);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (!receipt.contractAddress) {
    throw new Error('Contract deployment failed: no contract address in receipt');
  }

  return { hash, tokenAddress: receipt.contractAddress };
}

/**
 * Helper to convert human-readable supply to wei
 * E.g., 1_000_000_000 (1B tokens) -> 1_000_000_000 * 10^18 wei
 */
export function parseTokenSupply(supply: number): bigint {
  return parseUnits(supply.toString(), 18);
}
