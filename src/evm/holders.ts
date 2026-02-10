// Token holder snapshots and proportional ETH airdrops

import type { WalletClient } from 'viem';
import type { NetworkId } from '../types/chain';
import { EVM_CHAIN_IDS } from '../types/chain';
import type { EVMPublicClient } from './client';
import { ERC20_ABI } from './abis';
import { DEAD_ADDRESS } from './tokenOps';
import { distributeETH, type DistributeETHParams } from './distribute';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const ALCHEMY_SUBDOMAINS: Record<number, string> = {
  1: 'eth-mainnet',
  8453: 'base-mainnet',
  11155111: 'eth-sepolia',
};

export interface GetHoldersOptions {
  alchemyApiKey?: string;
  fromBlock?: bigint;
  toBlock?: bigint;
}

/**
 * Fetch token holders via Alchemy getOwnersForContract API.
 * Falls back to Transfer-event scanning on failure.
 */
async function getHoldersViaAlchemy(
  client: EVMPublicClient,
  tokenAddress: `0x${string}`,
  chainId: number,
  apiKey: string,
  fromBlock?: bigint,
  toBlock?: bigint,
): Promise<Map<string, bigint>> {
  const subdomain = ALCHEMY_SUBDOMAINS[chainId];
  if (!subdomain) {
    return getHoldersViaTransferEvents(client, tokenAddress, fromBlock, toBlock);
  }

  const baseUrl = `https://${subdomain}.g.alchemy.com/v2/${apiKey}`;
  const holders = new Map<string, bigint>();
  let pageKey: string | undefined;

  try {
    do {
      const url = new URL(`${baseUrl}/getOwnersForContract`);
      url.searchParams.set('contractAddress', tokenAddress);
      url.searchParams.set('withTokenBalances', 'true');
      if (pageKey) {
        url.searchParams.set('pageKey', pageKey);
      }

      const response = await fetch(url.toString());
      if (!response.ok) {
        return getHoldersViaTransferEvents(client, tokenAddress, fromBlock, toBlock);
      }

      const data: any = await response.json();
      if (data.owners && Array.isArray(data.owners)) {
        for (const owner of data.owners) {
          if (owner.tokenBalances && Array.isArray(owner.tokenBalances)) {
            for (const tokenBalance of owner.tokenBalances) {
              if (tokenBalance.contractAddress?.toLowerCase() === tokenAddress.toLowerCase()) {
                const balance = BigInt(tokenBalance.tokenBalance || '0');
                if (balance > 0n) {
                  holders.set(owner.ownerAddress.toLowerCase(), balance);
                }
              }
            }
          }
        }
      }
      pageKey = data.pageKey;
    } while (pageKey);
  } catch {
    return getHoldersViaTransferEvents(client, tokenAddress, fromBlock, toBlock);
  }

  return holders;
}

/**
 * Build a map of token holders and their balances from Transfer event history.
 * Keys are lowercase addresses. Excludes zero address, DEAD_ADDRESS, and zero/negative balances.
 */
function getHoldersViaTransferEvents(
  client: EVMPublicClient,
  tokenAddress: `0x${string}`,
  fromBlock?: bigint,
  toBlock?: bigint
): Promise<Map<string, bigint>> {
  return getEVMTokenHoldersFromLogs(client, tokenAddress, fromBlock, toBlock);
}

async function getEVMTokenHoldersFromLogs(
  client: EVMPublicClient,
  tokenAddress: `0x${string}`,
  fromBlock?: bigint,
  toBlock?: bigint
): Promise<Map<string, bigint>> {
  const logs = await client.getLogs({
    address: tokenAddress,
    event: {
      type: 'event',
      name: 'Transfer',
      inputs: [
        { name: 'from', type: 'address', indexed: true },
        { name: 'to', type: 'address', indexed: true },
        { name: 'value', type: 'uint256', indexed: false },
      ],
    },
    fromBlock,
    toBlock,
  });

  const balances = new Map<string, bigint>();

  for (const log of logs) {
    const from = (log.args as any).from as string;
    const to = (log.args as any).to as string;
    const value = (log.args as any).value as bigint;

    const fromKey = from.toLowerCase();
    const toKey = to.toLowerCase();

    balances.set(fromKey, (balances.get(fromKey) ?? 0n) - value);
    balances.set(toKey, (balances.get(toKey) ?? 0n) + value);
  }

  const zeroKey = ZERO_ADDRESS.toLowerCase();
  const deadKey = DEAD_ADDRESS.toLowerCase();

  for (const [address, balance] of balances) {
    if (address === zeroKey || address === deadKey || balance <= 0n) {
      balances.delete(address);
    }
  }

  return balances;
}

/**
 * Get token holders. When alchemyApiKey is provided, uses Alchemy API for faster
 * enumeration with Transfer-event fallback. Otherwise uses Transfer-event scanning only.
 */
export async function getEVMTokenHolders(
  client: EVMPublicClient,
  tokenAddress: `0x${string}`,
  fromBlock?: bigint,
  toBlock?: bigint,
  options?: GetHoldersOptions,
): Promise<Map<string, bigint>> {
  if (options?.alchemyApiKey) {
    const chainId = await client.getChainId();
    return getHoldersViaAlchemy(
      client,
      tokenAddress,
      chainId,
      options.alchemyApiKey,
      fromBlock ?? options?.fromBlock,
      toBlock ?? options?.toBlock,
    );
  }
  return getEVMTokenHoldersFromLogs(client, tokenAddress, fromBlock, toBlock);
}

export interface AirdropETHParams {
  appToken: `0x${string}`;
  distributionId: bigint;
  tokenAddress: `0x${string}`;
  totalAmount: bigint;
  fromBlock?: bigint;
}

/**
 * Airdrop ETH to token holders proportionally based on their holdings.
 */
export async function airdropETHToHolders(
  publicClient: EVMPublicClient,
  walletClient: WalletClient,
  networkId: NetworkId,
  params: AirdropETHParams
): Promise<{ hash: `0x${string}`; recipientCount: number }> {
  const holders = await getEVMTokenHolders(
    publicClient,
    params.tokenAddress,
    params.fromBlock
  );

  if (holders.size === 0) {
    throw new Error('No holders found for token');
  }

  let totalHeld = 0n;
  for (const balance of holders.values()) {
    totalHeld += balance;
  }

  const recipients: `0x${string}`[] = [];
  const amounts: bigint[] = [];

  for (const [address, balance] of holders) {
    const share = (balance * params.totalAmount) / totalHeld;
    if (share > 0n) {
      recipients.push(address as `0x${string}`);
      amounts.push(share);
    }
  }

  if (recipients.length === 0) {
    throw new Error('No recipients with non-zero share');
  }

  const totalDistributed = amounts.reduce((sum, a) => sum + a, 0n);

  const result = await distributeETH(walletClient, networkId, {
    appToken: params.appToken,
    distributionId: params.distributionId,
    recipients,
    amounts,
    totalValue: totalDistributed,
  });

  return { hash: result.hash, recipientCount: recipients.length };
}
