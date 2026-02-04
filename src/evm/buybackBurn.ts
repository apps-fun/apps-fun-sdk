// Buyback-and-burn: buy tokens on AppsFun AMM then burn them

import type { WalletClient } from 'viem';
import type { NetworkId } from '../types/chain';
import type { EVMPublicClient } from './client';
import { executeEVMBuy } from './trading';
import { burnERC20 } from './tokenOps';

// --- Types ---

export interface BuybackBurnParams {
  tokenAddress: `0x${string}`;
  ethAmount: number;
  slippageBps?: number;
}

export interface BuybackBurnResult {
  buyHash: `0x${string}`;
  burnHash: `0x${string}`;
  tokensBurned: bigint;
  ethSpent: bigint;
}

// --- Functions ---

/**
 * Buy tokens on the AppsFun AMM with ETH, then immediately burn them.
 * Creates deflationary pressure by removing tokens from circulation.
 */
export async function buybackAndBurn(
  publicClient: EVMPublicClient,
  walletClient: WalletClient,
  networkId: NetworkId,
  params: BuybackBurnParams
): Promise<BuybackBurnResult> {
  // Step 1: Buy tokens with ETH
  const buyResult = await executeEVMBuy(publicClient, walletClient, networkId, {
    tokenAddress: params.tokenAddress,
    amount: params.ethAmount,
    side: 'buy',
    slippageBps: params.slippageBps,
  });

  // Step 2: Burn the purchased tokens
  const burnResult = await burnERC20(walletClient, networkId, {
    tokenAddress: params.tokenAddress,
    amount: buyResult.tokenAmount,
  });

  return {
    buyHash: buyResult.hash,
    burnHash: burnResult.hash,
    tokensBurned: buyResult.tokenAmount,
    ethSpent: buyResult.ethAmount,
  };
}
