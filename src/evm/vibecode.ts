// EVM Vibecode API - Zero-config, agent-friendly interface for EVM chains

import { parseUnits } from 'viem';
import type { WalletClient } from 'viem';
import { getEVMPublicClient, getEVMTokenBalance, type EVMPublicClient } from './client';
import { EVMTokenGate } from './tokenGate';
import { transferERC20, burnERC20 } from './tokenOps';
import { executeEVMBuy, executeEVMSell } from './trading';
import { distributeETH } from './distribute';
import {
  createTokenFlow,
  executeTokenFlow,
  checkTokenFlowBalance,
  checkTokenFlowAllowance,
  type TokenFlowConfig,
  type TokenFlowSplit,
} from './tokenFlow';
import { getDistributionLogs, watchDistributions as watchDistributionsRaw, type DistributionLog } from './events';
import { getRevenueStats } from './analytics';
import { buybackAndBurn } from './buybackBurn';
import { waitForTransaction } from './confirm';
import { getEVMCanGraduate, getEVMPairInfo, getEVMTokenDecimals, getEVMTokenTotalSupply } from './tokenInfo';
import { DEAD_ADDRESS } from './tokenOps';
import { getEVMTokenHolders, airdropETHToHolders } from './holders';
import { getEVMReferralEarnings } from './referral';
import { getEVMPortfolio } from './portfolio';
import { getEVMBurnHistory, getEVMCirculatingSupply } from './burnAnalytics';
export { deflationaryFlow, freemiumFlow, revenueShareFlow, payPerUseFlow } from './presets';

type EVMNetwork = 'base' | 'sepolia' | 'ethereum';

// Singleton clients per network
const clients: Partial<Record<EVMNetwork, EVMPublicClient>> = {};
function getClient(network: EVMNetwork): EVMPublicClient {
  if (!clients[network]) {
    clients[network] = getEVMPublicClient(network);
  }
  return clients[network]!;
}

// Decimals cache per token address
const decimalsCache: Map<string, number> = new Map();
async function getCachedDecimals(client: EVMPublicClient, token: `0x${string}`): Promise<number> {
  const key = token.toLowerCase();
  const cached = decimalsCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const decimals = await getEVMTokenDecimals(client, token);
  decimalsCache.set(key, decimals);
  return decimals;
}

// --- Token Gating ---

/**
 * Check if wallet holds enough tokens.
 *
 * @example
 * if (await hasTokens("0xWALLET", "0xTOKEN", 100)) {
 *   // They're in
 * }
 */
export async function hasTokens(
  wallet: string,
  token: string,
  minAmount: number = 1,
  network: EVMNetwork = 'base'
): Promise<boolean> {
  try {
    const gate = new EVMTokenGate({
      tokenAddress: token as `0x${string}`,
      minAmount: parseUnits(minAmount.toString(), 18),
      networkId: network,
    });
    const result = await gate.check(wallet);
    return result.allowed;
  } catch {
    return false;
  }
}

/**
 * Get token balance as a human-readable number.
 *
 * @example
 * const bal = await getBalance("0xWALLET", "0xTOKEN");
 */
export async function getBalance(
  wallet: string,
  token: string,
  network: EVMNetwork = 'base'
): Promise<number> {
  try {
    const client = getClient(network);
    const raw = await getEVMTokenBalance(
      client,
      token as `0x${string}`,
      wallet as `0x${string}`
    );
    return Number(raw) / 1e18;
  } catch {
    return 0;
  }
}

// --- Trading ---

/**
 * Buy tokens with ETH.
 *
 * @example
 * const hash = await buyTokens("0xTOKEN", 0.1, walletClient);
 */
export async function buyTokens(
  token: string,
  ethAmount: number,
  walletClient: WalletClient,
  network: EVMNetwork = 'base',
  options?: { slippage?: number }
): Promise<string> {
  const client = getClient(network);
  const result = await executeEVMBuy(client, walletClient, network, {
    tokenAddress: token as `0x${string}`,
    amount: ethAmount,
    side: 'buy',
    slippageBps: options?.slippage ? options.slippage * 100 : undefined,
  });
  return result.hash;
}

/**
 * Sell tokens for ETH.
 *
 * @example
 * const hash = await sellTokens("0xTOKEN", 1000, walletClient);
 */
export async function sellTokens(
  token: string,
  tokenAmount: number,
  walletClient: WalletClient,
  network: EVMNetwork = 'base',
  options?: { slippage?: number }
): Promise<string> {
  const client = getClient(network);
  const result = await executeEVMSell(client, walletClient, network, {
    tokenAddress: token as `0x${string}`,
    amount: tokenAmount,
    side: 'sell',
    slippageBps: options?.slippage ? options.slippage * 100 : undefined,
  });
  return result.hash;
}

/**
 * Burn tokens (send to dead address).
 *
 * @example
 * const hash = await burnTokens("0xTOKEN", 100, walletClient);
 */
export async function burnTokens(
  token: string,
  amount: number,
  walletClient: WalletClient,
  network: EVMNetwork = 'base'
): Promise<string> {
  const result = await burnERC20(walletClient, network, {
    tokenAddress: token as `0x${string}`,
    amount: parseUnits(amount.toString(), 18),
  });
  return result.hash;
}

/**
 * Send tokens to an address.
 *
 * @example
 * const hash = await sendTokens("0xTOKEN", 50, "0xTO", walletClient);
 */
export async function sendTokens(
  token: string,
  amount: number,
  to: string,
  walletClient: WalletClient,
  network: EVMNetwork = 'base'
): Promise<string> {
  const result = await transferERC20(walletClient, network, {
    tokenAddress: token as `0x${string}`,
    to: to as `0x${string}`,
    amount: parseUnits(amount.toString(), 18),
  });
  return result.hash;
}

// --- Token Payments ---

export interface SimplePaymentConfig {
  token: string;
  network?: EVMNetwork;
  amount: number;
  burn?: number;
  creator?: { address: string; share: number };
  distribute?: number;
}

/**
 * Create a payment flow from simple percentages.
 *
 * @example
 * const flow = createPaymentFlow({
 *   token: '0xTOKEN',
 *   amount: 100,
 *   burn: 50,
 *   creator: { address: '0xCREATOR', share: 25 },
 *   distribute: 25,
 * });
 */
export function createPaymentFlow(config: SimplePaymentConfig): TokenFlowConfig {
  const splits: TokenFlowSplit[] = [];

  if (config.burn && config.burn > 0) {
    splits.push({ action: 'burn', bps: config.burn * 100 });
  }
  if (config.creator && config.creator.share > 0) {
    splits.push({
      action: 'send',
      bps: config.creator.share * 100,
      to: config.creator.address as `0x${string}`,
    });
  }
  if (config.distribute && config.distribute > 0) {
    splits.push({ action: 'distribute', bps: config.distribute * 100 });
  }

  return createTokenFlow({
    token: config.token as `0x${string}`,
    network: config.network ?? 'base',
    chargeAmount: parseUnits(config.amount.toString(), 18),
    splits,
  });
}

/**
 * Charge a user using a payment flow.
 * The user must have approved the app wallet for the token.
 *
 * @example
 * const result = await chargeUser(flow, "0xUSER", appWalletClient, {
 *   distributionId: 1,
 *   recipients: ["0xA", "0xB"],
 * });
 */
export async function chargeUser(
  flow: TokenFlowConfig,
  userWallet: string,
  walletClient: WalletClient,
  options?: {
    distributionId?: number;
    recipients?: string[];
  }
): Promise<{ success: boolean; steps: Array<{ action: string; hash: string }> }> {
  const client = getClient(flow.network as EVMNetwork);
  const result = await executeTokenFlow(
    client,
    walletClient,
    flow,
    userWallet as `0x${string}`,
    options
      ? {
          distributionId:
            options.distributionId !== undefined
              ? BigInt(options.distributionId)
              : undefined,
          recipients: options.recipients?.map((r) => r as `0x${string}`),
        }
      : undefined
  );
  return {
    success: result.success,
    steps: result.steps.map((s) => ({ action: s.action, hash: s.hash })),
  };
}

/**
 * Check if a user can afford a payment flow.
 */
export async function canAfford(
  flow: TokenFlowConfig,
  userWallet: string
): Promise<boolean> {
  const client = getClient(flow.network as EVMNetwork);
  const result = await checkTokenFlowBalance(
    client,
    flow,
    userWallet as `0x${string}`
  );
  return result.canPay;
}

/**
 * Check if user has approved the app wallet for a payment flow.
 */
export async function hasApproval(
  flow: TokenFlowConfig,
  userWallet: string,
  appWallet: string
): Promise<boolean> {
  const client = getClient(flow.network as EVMNetwork);
  const result = await checkTokenFlowAllowance(
    client,
    flow,
    userWallet as `0x${string}`,
    appWallet as `0x${string}`
  );
  return result.approved;
}

// --- Distributions ---

/**
 * Distribute ETH to holders.
 *
 * @example
 * await distributeETHToHolders("0xTOKEN", 1, ["0xA", "0xB"], [0.5, 0.5], walletClient);
 */
export async function distributeETHToHolders(
  token: string,
  distributionId: number,
  recipients: string[],
  amounts: number[],
  walletClient: WalletClient,
  network: EVMNetwork = 'base'
): Promise<string> {
  const rawAmounts = amounts.map((a) => parseUnits(a.toString(), 18));
  const total = rawAmounts.reduce((a, b) => a + b, 0n);
  const { hash } = await distributeETH(walletClient, network, {
    appToken: token as `0x${string}`,
    distributionId: BigInt(distributionId),
    recipients: recipients.map((r) => r as `0x${string}`),
    amounts: rawAmounts,
    totalValue: total,
  });
  return hash;
}

// --- Middleware ---

/**
 * Express middleware: require tokens to access route.
 *
 * @example
 * app.use('/api/members', requireTokens('0xTOKEN', 100, 'base'));
 */
export function requireTokens(
  token: string,
  minAmount: number = 1,
  network: EVMNetwork = 'base'
) {
  return async (req: any, res: any, next: any) => {
    const wallet = req.query.wallet || req.headers['x-wallet-address'];
    if (!wallet) {
      return res.status(400).json({
        error: 'Wallet address required',
        hint: 'Pass ?wallet=ADDRESS or X-Wallet-Address header',
      });
    }

    const access = await hasTokens(wallet, token, minAmount, network);
    if (!access) {
      return res.status(403).json({
        error: 'Insufficient tokens',
        required: minAmount,
        token,
      });
    }

    req.tokenGate = { wallet, token, verified: true };
    next();
  };
}

/**
 * Express middleware: charge tokens per request using a payment flow.
 *
 * @example
 * app.use('/api/premium', chargeTokens(flow, appWalletClient, {
 *   distributionId: 1,
 *   recipients: ['0xA', '0xB'],
 * }));
 */
export function chargeTokens(
  flow: TokenFlowConfig,
  walletClient: WalletClient,
  options?: {
    distributionId?: number;
    recipients?: string[];
  }
) {
  return async (req: any, res: any, next: any) => {
    const wallet = req.query.wallet || req.headers['x-wallet-address'];
    if (!wallet) {
      return res.status(400).json({
        error: 'Wallet address required',
        hint: 'Pass ?wallet=ADDRESS or X-Wallet-Address header',
      });
    }

    const affordable = await canAfford(flow, wallet);
    if (!affordable) {
      return res.status(402).json({
        error: 'Insufficient token balance',
        required: Number(flow.chargeAmount) / 1e18,
        token: flow.token,
      });
    }

    try {
      const result = await chargeUser(flow, wallet, walletClient, options);
      req.tokenPayment = {
        wallet,
        charged: Number(flow.chargeAmount) / 1e18,
        steps: result.steps,
      };
      next();
    } catch (err: any) {
      return res.status(500).json({
        error: 'Payment failed',
        message: err.message,
      });
    }
  };
}

// --- Event Reading ---

/**
 * Get distribution history for a token.
 */
export async function getDistributions(
  token: string,
  network: EVMNetwork = 'base',
  options?: { fromBlock?: number }
): Promise<Array<{
  distributionId: number;
  total: number;
  isETH: boolean;
  txHash: string;
  block: number;
}>> {
  const client = getClient(network);
  const logs = await getDistributionLogs(client, network, {
    appToken: token as `0x${string}`,
    fromBlock: options?.fromBlock ? BigInt(options.fromBlock) : undefined,
  });
  return logs.map((l) => ({
    distributionId: Number(l.distributionId),
    total: Number(l.total) / 1e18,
    isETH: l.isETH,
    txHash: l.transactionHash,
    block: Number(l.blockNumber),
  }));
}

/**
 * Watch for new distributions in real-time.
 * Returns an unwatch function.
 */
export function watchTokenDistributions(
  token: string,
  onLog: (log: { distributionId: number; total: number; isETH: boolean; txHash: string }) => void,
  network: EVMNetwork = 'base'
): () => void {
  const client = getClient(network);
  return watchDistributionsRaw(client, network, token as `0x${string}`, (log) => {
    onLog({
      distributionId: Number(log.distributionId),
      total: Number(log.total) / 1e18,
      isETH: log.isETH,
      txHash: log.transactionHash,
    });
  });
}

// --- Revenue ---

/**
 * Get aggregated revenue stats for a token.
 */
export async function getRevenue(
  token: string,
  network: EVMNetwork = 'base'
): Promise<{
  totalETH: number;
  totalDistributions: number;
  uniqueRecipients: number;
}> {
  const client = getClient(network);
  const stats = await getRevenueStats(client, network, token as `0x${string}`);
  return {
    totalETH: Number(stats.totalETHDistributed) / 1e18,
    totalDistributions: stats.totalDistributions,
    uniqueRecipients: stats.uniqueRecipients,
  };
}

// --- Buyback and Burn ---

/**
 * Buy tokens on the AppsFun AMM and immediately burn them.
 */
export async function buybackAndBurnTokens(
  token: string,
  ethAmount: number,
  walletClient: WalletClient,
  network: EVMNetwork = 'base',
  options?: { slippage?: number }
): Promise<{ buyHash: string; burnHash: string; tokensBurned: number }> {
  const client = getClient(network);
  const result = await buybackAndBurn(client, walletClient, network, {
    tokenAddress: token as `0x${string}`,
    ethAmount,
    slippageBps: options?.slippage ? options.slippage * 100 : undefined,
  });
  return {
    buyHash: result.buyHash,
    burnHash: result.burnHash,
    tokensBurned: Number(result.tokensBurned) / 1e18,
  };
}

// --- Transaction Confirmation ---

/**
 * Wait for a transaction to be confirmed.
 */
export async function waitForTx(
  hash: string,
  network: EVMNetwork = 'base'
): Promise<{ status: 'success' | 'reverted'; blockNumber: number; gasUsed: number }> {
  const client = getClient(network);
  const result = await waitForTransaction(client, hash as `0x${string}`);
  return {
    status: result.status,
    blockNumber: Number(result.blockNumber),
    gasUsed: Number(result.gasUsed),
  };
}

// --- Token Info ---

/**
 * Check if a token is ready to graduate from bonding curve to full AMM.
 */
export async function isReadyToGraduate(
  token: string,
  network: EVMNetwork = 'base'
): Promise<boolean> {
  try {
    const client = getClient(network);
    return await getEVMCanGraduate(client, network, token as `0x${string}`);
  } catch {
    return false;
  }
}

/**
 * Get the creator address for a token.
 */
export async function getTokenCreator(
  token: string,
  network: EVMNetwork = 'base'
): Promise<string> {
  const client = getClient(network);
  const info = await getEVMPairInfo(client, network, token as `0x${string}`);
  return info.creator;
}

/**
 * Get the pair (liquidity pool) address for a token.
 */
export async function getPairAddress(
  token: string,
  network: EVMNetwork = 'base'
): Promise<string> {
  const client = getClient(network);
  const info = await getEVMPairInfo(client, network, token as `0x${string}`);
  return info.pair;
}

/**
 * Get total supply and decimals for a token.
 */
export async function getSupply(
  token: string,
  network: EVMNetwork = 'base'
): Promise<{ totalSupply: number; decimals: number }> {
  const client = getClient(network);
  const tokenAddr = token as `0x${string}`;
  const [supply, decimals] = await Promise.all([
    getEVMTokenTotalSupply(client, tokenAddr),
    getCachedDecimals(client, tokenAddr),
  ]);
  return {
    totalSupply: Number(supply) / 10 ** decimals,
    decimals,
  };
}

/**
 * Get the percentage of total supply that has been burned (sent to dead address).
 */
export async function getPercentBurned(
  token: string,
  network: EVMNetwork = 'base'
): Promise<number> {
  const client = getClient(network);
  const tokenAddr = token as `0x${string}`;
  const [supply, deadBalance] = await Promise.all([
    getEVMTokenTotalSupply(client, tokenAddr),
    getEVMTokenBalance(client, tokenAddr, DEAD_ADDRESS),
  ]);
  if (supply === 0n) {
    return 0;
  }
  return (Number(deadBalance) / Number(supply)) * 100;
}

/**
 * Get all token holders and their balances from Transfer event history.
 */
export async function getHolders(
  token: string,
  network: EVMNetwork = 'base'
): Promise<Array<{ address: string; balance: number }>> {
  const client = getClient(network);
  const tokenAddr = token as `0x${string}`;
  const holdersMap = await getEVMTokenHolders(client, tokenAddr);
  const decimals = await getCachedDecimals(client, tokenAddr);

  const result: Array<{ address: string; balance: number }> = [];
  for (const [address, balance] of holdersMap) {
    result.push({
      address,
      balance: Number(balance) / 10 ** decimals,
    });
  }

  return result.sort((a, b) => b.balance - a.balance);
}

/**
 * Airdrop ETH to token holders proportionally based on their holdings.
 */
export async function airdropToHolders(
  token: string,
  distributionId: number,
  totalETH: number,
  walletClient: WalletClient,
  network: EVMNetwork = 'base'
): Promise<string> {
  const client = getClient(network);
  const result = await airdropETHToHolders(client, walletClient, network, {
    appToken: token as `0x${string}`,
    distributionId: BigInt(distributionId),
    tokenAddress: token as `0x${string}`,
    totalAmount: BigInt(Math.floor(totalETH * 1e18)),
  });
  return result.hash;
}

/**
 * Get referral earnings for an address from distribution events.
 */
export async function getReferralEarnings(
  referrer: string,
  token?: string,
  network: EVMNetwork = 'base'
): Promise<{ totalETH: number; payments: number }> {
  const client = getClient(network);
  const result = await getEVMReferralEarnings(
    client,
    network,
    referrer as `0x${string}`,
    token ? (token as `0x${string}`) : undefined
  );
  return {
    totalETH: Number(result.totalETH) / 1e18,
    payments: result.paymentCount,
  };
}

/**
 * Get portfolio data for multiple tokens: balance and ETH value.
 */
export async function getPortfolio(
  wallet: string,
  tokens: string[],
  network: EVMNetwork = 'base'
): Promise<Array<{ token: string; balance: number; ethValue: number }>> {
  const client = getClient(network);
  const entries = await getEVMPortfolio(
    client,
    network,
    wallet as `0x${string}`,
    tokens.map((t) => t as `0x${string}`)
  );
  return entries.map((e) => ({
    token: e.token,
    balance: e.balanceFormatted,
    ethValue: e.ethValueFormatted,
  }));
}

/**
 * Get burn history for a token (transfers to dead address).
 */
export async function getBurnHistory(
  token: string,
  network: EVMNetwork = 'base',
  options?: { fromBlock?: number }
): Promise<Array<{ from: string; amount: number; block: number; txHash: string }>> {
  const client = getClient(network);
  const tokenAddr = token as `0x${string}`;
  const decimals = await getCachedDecimals(client, tokenAddr);
  const events = await getEVMBurnHistory(
    client,
    tokenAddr,
    options?.fromBlock ? BigInt(options.fromBlock) : undefined
  );
  return events.map((e) => ({
    from: e.from,
    amount: Number(e.amount) / 10 ** decimals,
    block: Number(e.blockNumber),
    txHash: e.transactionHash,
  }));
}

/**
 * Get circulating supply stats for a token.
 */
export async function getCirculatingSupply(
  token: string,
  network: EVMNetwork = 'base'
): Promise<{ totalSupply: number; burned: number; circulating: number; burnPercent: number }> {
  const client = getClient(network);
  const tokenAddr = token as `0x${string}`;
  const [stats, decimals] = await Promise.all([
    getEVMCirculatingSupply(client, tokenAddr),
    getCachedDecimals(client, tokenAddr),
  ]);
  return {
    totalSupply: Number(stats.totalSupply) / 10 ** decimals,
    burned: Number(stats.burned) / 10 ** decimals,
    circulating: Number(stats.circulating) / 10 ** decimals,
    burnPercent: stats.burnPercent,
  };
}

export default {
  hasTokens,
  getBalance,
  buyTokens,
  sellTokens,
  burnTokens,
  sendTokens,
  createPaymentFlow,
  chargeUser,
  canAfford,
  hasApproval,
  distributeETHToHolders,
  requireTokens,
  chargeTokens,
  getDistributions,
  watchTokenDistributions,
  getRevenue,
  buybackAndBurnTokens,
  waitForTx,
  isReadyToGraduate,
  getTokenCreator,
  getPairAddress,
  getSupply,
  getPercentBurned,
  getHolders,
  airdropToHolders,
  getReferralEarnings,
  getPortfolio,
  getBurnHistory,
  getCirculatingSupply,
};
