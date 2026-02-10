// MultiSend contract wrappers for token and ETH distribution

import type { WalletClient, Chain } from 'viem';
import { base, mainnet, sepolia } from 'viem/chains';
import type { NetworkId } from '../types/chain';
import { getEVMContracts } from './contracts';
import { MULTI_SEND_ABI, ERC20_ABI } from './abis';
import { getEVMTokenAllowance, type EVMPublicClient } from './client';

const CHAIN_MAP: Record<string, Chain> = {
  base,
  ethereum: mainnet,
  sepolia,
};

export interface DistributeERC20Params {
  appToken: `0x${string}`;
  distributionId: bigint;
  paymentToken: `0x${string}`;
  recipients: `0x${string}`[];
  amounts: bigint[];
}

export interface DistributeETHParams {
  appToken: `0x${string}`;
  distributionId: bigint;
  recipients: `0x${string}`[];
  amounts: bigint[];
  totalValue: bigint;
}

function validateDistribution(recipients: unknown[], amounts: unknown[]) {
  if (recipients.length !== amounts.length) {
    throw new Error('Recipients and amounts arrays must have equal length');
  }
  if (recipients.length === 0) {
    throw new Error('Must have at least one recipient');
  }
}

/**
 * Distribute ERC20 tokens to multiple recipients via MultiSend.
 * Handles approval if allowance is insufficient.
 */
export async function distributeERC20(
  publicClient: EVMPublicClient,
  walletClient: WalletClient,
  networkId: NetworkId,
  params: DistributeERC20Params
): Promise<{ hash: `0x${string}` }> {
  validateDistribution(params.recipients, params.amounts);

  const contracts = getEVMContracts(networkId);
  if (!contracts) {
    throw new Error(`EVM contracts not configured for network: ${networkId}`);
  }

  const chain = CHAIN_MAP[networkId];

  const account = walletClient.account;
  if (!account) {
    throw new Error('Wallet client has no account');
  }

  // Check and handle approval
  const total = params.amounts.reduce((a, b) => a + b, 0n);
  const allowance = await getEVMTokenAllowance(
    publicClient,
    params.paymentToken,
    account.address,
    contracts.multiSend
  );

  if (allowance < total) {
    await walletClient.writeContract({
      chain,
      account,
      address: params.paymentToken,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [contracts.multiSend, BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')],
    });
  }

  const hash = await walletClient.writeContract({
    chain,
    account,
    address: contracts.multiSend,
    abi: MULTI_SEND_ABI,
    functionName: 'batchSendERC20',
    args: [
      params.appToken,
      params.distributionId,
      params.paymentToken,
      params.recipients,
      params.amounts,
    ],
  });

  return { hash };
}

/**
 * Distribute ETH to multiple recipients via MultiSend.
 */
export async function distributeETH(
  walletClient: WalletClient,
  networkId: NetworkId,
  params: DistributeETHParams
): Promise<{ hash: `0x${string}` }> {
  validateDistribution(params.recipients, params.amounts);

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
    address: contracts.multiSend,
    abi: MULTI_SEND_ABI,
    functionName: 'batchSendEther',
    args: [
      params.appToken,
      params.distributionId,
      params.recipients,
      params.amounts,
    ],
    value: params.totalValue,
  });

  return { hash };
}
