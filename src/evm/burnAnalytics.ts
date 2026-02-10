// Burn history and circulating supply analytics

import type { EVMPublicClient } from './client';
import { getEVMTokenBalance } from './client';
import { getEVMTokenTotalSupply } from './tokenInfo';
import { DEAD_ADDRESS } from './tokenOps';

export interface BurnEvent {
  from: `0x${string}`;
  amount: bigint;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
}

export interface CirculatingSupplyStats {
  totalSupply: bigint;
  burned: bigint;
  circulating: bigint;
  burnPercent: number;
}

/**
 * Query Transfer events to the DEAD_ADDRESS for burn history.
 * Sorted by blockNumber ascending.
 */
export async function getEVMBurnHistory(
  client: EVMPublicClient,
  tokenAddress: `0x${string}`,
  fromBlock?: bigint,
  toBlock?: bigint
): Promise<BurnEvent[]> {
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
    args: {
      to: DEAD_ADDRESS,
    },
    fromBlock,
    toBlock,
  });

  const events: BurnEvent[] = logs.map((log) => ({
    from: (log.args as any).from as `0x${string}`,
    amount: (log.args as any).value as bigint,
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
  }));

  return events.sort((a, b) => Number(a.blockNumber - b.blockNumber));
}

/**
 * Compute circulating supply: totalSupply minus tokens at the DEAD_ADDRESS.
 */
export async function getEVMCirculatingSupply(
  client: EVMPublicClient,
  tokenAddress: `0x${string}`
): Promise<CirculatingSupplyStats> {
  const [totalSupply, burned] = await Promise.all([
    getEVMTokenTotalSupply(client, tokenAddress),
    getEVMTokenBalance(client, tokenAddress, DEAD_ADDRESS),
  ]);

  const circulating = totalSupply - burned;
  const burnPercent =
    totalSupply === 0n ? 0 : (Number(burned) / Number(totalSupply)) * 100;

  return { totalSupply, burned, circulating, burnPercent };
}
