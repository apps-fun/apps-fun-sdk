// MultiSend distribution event reading and watching

import type { NetworkId } from '../types/chain';
import { getEVMContracts } from './contracts';
import { MULTI_SEND_ABI } from './abis';
import type { EVMPublicClient } from './client';

// --- Types ---

export interface DistributionLog {
  appToken: `0x${string}`;
  distributionId: bigint;
  token: `0x${string}` | null;
  total: bigint;
  isETH: boolean;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
}

export interface DistributedETHLog {
  appToken: `0x${string}`;
  distributionId: bigint;
  user: `0x${string}`;
  ethAmount: bigint;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
}

export interface GetDistributionLogsParams {
  appToken?: `0x${string}`;
  distributionId?: bigint;
  fromBlock?: bigint;
  toBlock?: bigint;
}

// --- Functions ---

/**
 * Query distribution events (both ERC20 and ETH) from the MultiSend contract.
 */
export async function getDistributionLogs(
  publicClient: EVMPublicClient,
  networkId: NetworkId,
  params?: GetDistributionLogsParams
): Promise<DistributionLog[]> {
  const contracts = getEVMContracts(networkId);
  if (!contracts) {
    throw new Error(`EVM contracts not configured for network: ${networkId}`);
  }

  const args = {
    app_token: params?.appToken ?? undefined,
    distribution_id: params?.distributionId ?? undefined,
  } as const;

  // Query ERC20 Distribution events
  const erc20Logs = await publicClient.getLogs({
    address: contracts.multiSend,
    event: {
      type: 'event',
      name: 'Distribution',
      inputs: [
        { name: 'app_token', type: 'address', indexed: true },
        { name: 'distribution_id', type: 'uint256', indexed: true },
        { name: 'token', type: 'address', indexed: false },
        { name: 'total', type: 'uint256', indexed: false },
      ],
    },
    args,
    fromBlock: params?.fromBlock,
    toBlock: params?.toBlock,
  });

  // Query ETH DistributionETH events
  const ethLogs = await publicClient.getLogs({
    address: contracts.multiSend,
    event: {
      type: 'event',
      name: 'DistributionETH',
      inputs: [
        { name: 'app_token', type: 'address', indexed: true },
        { name: 'distribution_id', type: 'uint256', indexed: true },
        { name: 'total', type: 'uint256', indexed: false },
      ],
    },
    args,
    fromBlock: params?.fromBlock,
    toBlock: params?.toBlock,
  });

  const result: DistributionLog[] = [];

  for (const log of erc20Logs) {
    result.push({
      appToken: log.args.app_token!,
      distributionId: log.args.distribution_id!,
      token: log.args.token!,
      total: log.args.total!,
      isETH: false,
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
    });
  }

  for (const log of ethLogs) {
    result.push({
      appToken: log.args.app_token!,
      distributionId: log.args.distribution_id!,
      token: null,
      total: log.args.total!,
      isETH: true,
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
    });
  }

  return result.sort((a, b) => Number(a.blockNumber - b.blockNumber));
}

/**
 * Query individual ETH payout events from the MultiSend contract.
 */
export async function getDistributedETHLogs(
  publicClient: EVMPublicClient,
  networkId: NetworkId,
  params?: GetDistributionLogsParams
): Promise<DistributedETHLog[]> {
  const contracts = getEVMContracts(networkId);
  if (!contracts) {
    throw new Error(`EVM contracts not configured for network: ${networkId}`);
  }

  const logs = await publicClient.getLogs({
    address: contracts.multiSend,
    event: {
      type: 'event',
      name: 'DistributedETH',
      inputs: [
        { name: 'app_token', type: 'address', indexed: true },
        { name: 'distribution_id', type: 'uint256', indexed: true },
        { name: 'user', type: 'address', indexed: false },
        { name: 'eth_amount', type: 'uint256', indexed: false },
      ],
    },
    args: {
      app_token: params?.appToken ?? undefined,
      distribution_id: params?.distributionId ?? undefined,
    } as const,
    fromBlock: params?.fromBlock,
    toBlock: params?.toBlock,
  });

  return logs.map((log) => ({
    appToken: log.args.app_token!,
    distributionId: log.args.distribution_id!,
    user: log.args.user!,
    ethAmount: log.args.eth_amount!,
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
  }));
}

/**
 * Watch for new distribution events in real-time.
 * Returns an unwatch function to stop the subscription.
 */
export function watchDistributions(
  publicClient: EVMPublicClient,
  networkId: NetworkId,
  appToken: `0x${string}`,
  onLog: (log: DistributionLog) => void
): () => void {
  const contracts = getEVMContracts(networkId);
  if (!contracts) {
    throw new Error(`EVM contracts not configured for network: ${networkId}`);
  }

  const unwatchERC20 = publicClient.watchContractEvent({
    address: contracts.multiSend,
    abi: MULTI_SEND_ABI,
    eventName: 'Distribution',
    args: { app_token: appToken },
    onLogs: (logs) => {
      for (const log of logs) {
        onLog({
          appToken: (log.args as any).app_token,
          distributionId: (log.args as any).distribution_id,
          token: (log.args as any).token,
          total: (log.args as any).total,
          isETH: false,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
        });
      }
    },
  });

  const unwatchETH = publicClient.watchContractEvent({
    address: contracts.multiSend,
    abi: MULTI_SEND_ABI,
    eventName: 'DistributionETH',
    args: { app_token: appToken },
    onLogs: (logs) => {
      for (const log of logs) {
        onLog({
          appToken: (log.args as any).app_token,
          distributionId: (log.args as any).distribution_id,
          token: null,
          total: (log.args as any).total,
          isETH: true,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
        });
      }
    },
  });

  return () => {
    unwatchERC20();
    unwatchETH();
  };
}
