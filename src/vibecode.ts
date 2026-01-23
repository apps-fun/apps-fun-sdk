/**
 * Vibecode API - Zero-config, agent-friendly interface for apps.fun
 * 
 * Just import and use. Everything works with sensible defaults.
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { TokenGate } from './token-gate';
import { 
  buyTokenDirect, 
  sellTokenDirect, 
  burnTokenDirect,
  getPoolInfo,
  verifyAppsFunPool,
  prepareDirectBuy,
  prepareDirectSell,
  submitSignedTransaction
} from './direct';
import { AppsFunClient } from './client';

// Auto-detect the best RPC endpoint
const AUTO_RPC = process.env.SOLANA_RPC_URL || 
  (process.env.NODE_ENV === 'production' 
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com');

// Singleton connection
let _connection: Connection | null = null;
function getConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(AUTO_RPC, 'confirmed');
  }
  return _connection;
}

// ============================================================
// TOKEN GATING - Dead simple access control
// ============================================================

/**
 * Check if wallet has enough tokens. That's it.
 * 
 * @example
 * if (await hasTokens("wallet_address", "token_mint")) {
 *   // They're in!
 * }
 */
export async function hasTokens(
  wallet: string,
  tokenMint: string,
  minAmount: number | string | bigint = 1
): Promise<boolean> {
  try {
    const gate = new TokenGate({
      tokenMint: new PublicKey(tokenMint),
      minAmount: typeof minAmount === 'bigint' 
        ? minAmount 
        : BigInt(Math.floor(Number(minAmount) * 1_000_000)),
      connection: getConnection(),
      cacheTtlMs: 60000,
    });
    
    const result = await gate.check(wallet);
    return result.allowed;
  } catch {
    return false;
  }
}

/**
 * Get token balance. Simple as that.
 * 
 * @example
 * const balance = await getBalance("wallet", "token");
 * console.log(`Has ${balance} tokens`);
 */
export async function getBalance(
  wallet: string,
  tokenMint: string
): Promise<number> {
  try {
    const gate = new TokenGate({
      tokenMint: new PublicKey(tokenMint),
      minAmount: BigInt(0),
      connection: getConnection(),
    });
    
    const result = await gate.check(wallet);
    return Number(result.balance) / 1_000_000;
  } catch {
    return 0;
  }
}

/**
 * Check multiple wallets at once.
 * 
 * @example
 * const results = await checkWallets(["wallet1", "wallet2"], "token_mint", 10);
 * results.forEach(r => console.log(r.wallet, r.hasAccess));
 */
export async function checkWallets(
  wallets: string[],
  tokenMint: string,
  minAmount: number = 1
): Promise<Array<{wallet: string, hasAccess: boolean, balance: number}>> {
  const gate = new TokenGate({
    tokenMint: new PublicKey(tokenMint),
    minAmount: BigInt(Math.floor(minAmount * 1_000_000)),
    connection: getConnection(),
    cacheTtlMs: 60000,
  });
  
  const results = await gate.checkBatch(wallets);
  
  return wallets.map(wallet => ({
    wallet,
    hasAccess: results.get(wallet)?.allowed || false,
    balance: Number(results.get(wallet)?.balance || 0) / 1_000_000
  }));
}

// ============================================================
// TRADING - Buy, sell, burn with one line
// ============================================================

/**
 * Buy tokens with SOL. Auto-handles everything.
 * 
 * @example
 * const tx = await buyTokens("token_mint", 0.1, privateKeyOrKeypair);
 * console.log("Bought tokens!", tx);
 */
export async function buyTokens(
  tokenMint: string,
  solAmount: number,
  walletKey: Keypair | string | number[] | Uint8Array,
  options?: {
    slippage?: number;  // Percentage (1 = 1%)
    priority?: 'low' | 'medium' | 'high';
  }
): Promise<string> {
  const wallet = parseWallet(walletKey);
  const priorityFee = getPriorityFee(options?.priority);
  
  const result = await buyTokenDirect(getConnection(), {
    tokenMint,
    amount: solAmount,
    wallet,
    slippageBps: (options?.slippage || 1) * 100,
    priorityFee,
  });
  
  return result.signature;
}

/**
 * Sell tokens for SOL. Just works.
 * 
 * @example
 * const tx = await sellTokens("token_mint", 1000, privateKey);
 * console.log("Sold tokens!", tx);
 */
export async function sellTokens(
  tokenMint: string,
  tokenAmount: number,
  walletKey: Keypair | string | number[] | Uint8Array,
  options?: {
    slippage?: number;
    priority?: 'low' | 'medium' | 'high';
  }
): Promise<string> {
  const wallet = parseWallet(walletKey);
  const priorityFee = getPriorityFee(options?.priority);
  
  const result = await sellTokenDirect(getConnection(), {
    tokenMint,
    amount: tokenAmount,
    wallet,
    slippageBps: (options?.slippage || 1) * 100,
    priorityFee,
  });
  
  return result.signature;
}

/**
 * Burn tokens. Gone forever.
 * 
 * @example
 * await burnTokens("token_mint", 100, privateKey);
 */
export async function burnTokens(
  tokenMint: string,
  amount: number,
  walletKey: Keypair | string | number[] | Uint8Array
): Promise<string> {
  const wallet = parseWallet(walletKey);
  
  const result = await burnTokenDirect(getConnection(), {
    tokenMint,
    amount,
    wallet,
  });
  
  return result.signature;
}

// ============================================================
// POOL INFO - Get token data instantly
// ============================================================

/**
 * Get token price in SOL.
 * 
 * @example
 * const price = await getPrice("token_mint");
 * console.log(`Price: ${price} SOL`);
 */
export async function getPrice(tokenMint: string): Promise<number> {
  try {
    const client = new AppsFunClient();
    return await client.getTokenPrice(tokenMint);
  } catch {
    return 0;
  }
}

/**
 * Get all token info at once.
 * 
 * @example
 * const info = await getTokenInfo("token_mint");
 * console.log(info.price, info.marketCap, info.volume);
 */
export async function getTokenInfo(tokenMint: string): Promise<{
  price: number;
  marketCap: number;
  liquidity: number;
  volume: number;
  holders: number;
  graduated: boolean;
  buyLink: string;
}> {
  try {
    const client = new AppsFunClient();
    const [price, graduated, marketData] = await Promise.all([
      client.getTokenPrice(tokenMint).catch(() => 0),
      client.isGraduated(new PublicKey(tokenMint)).catch(() => false),
      client.getMarketData(tokenMint).catch(() => null),
    ]);
    
    return {
      price,
      marketCap: marketData?.marketCap || 0,
      liquidity: marketData?.bondingProgress || 0,
      volume: marketData?.volume24h || 0,
      holders: 0, // Not available from API
      graduated,
      buyLink: `https://apps.fun/token/${tokenMint}`,
    };
  } catch {
    return {
      price: 0,
      marketCap: 0,
      liquidity: 0,
      volume: 0,
      holders: 0,
      graduated: false,
      buyLink: `https://apps.fun/token/${tokenMint}`,
    };
  }
}

/**
 * Check if token is from apps.fun (has correct fees).
 * 
 * @example
 * if (await isAppsFunToken("token_mint")) {
 *   // It's legit
 * }
 */
export async function isAppsFunToken(tokenMint: string): Promise<boolean> {
  return verifyAppsFunPool(getConnection(), tokenMint);
}

// ============================================================
// EXTERNAL WALLETS - For Privy, Phantom, etc.
// ============================================================

/**
 * Prepare a buy transaction for external signing.
 * 
 * @example
 * const tx = await prepareBuy("token_mint", 0.1, "wallet_address");
 * // Sign with Privy/Phantom/etc
 * const signature = await finishTransaction(signedTx);
 */
export async function prepareBuy(
  tokenMint: string,
  solAmount: number,
  walletAddress: string
): Promise<{
  transaction: string;
  message: string;
}> {
  const prepared = await prepareDirectBuy(getConnection(), {
    tokenMint,
    amount: solAmount,
    walletAddress,
  });
  
  return {
    transaction: prepared.transaction,
    message: `Buy tokens with ${solAmount} SOL`,
  };
}

/**
 * Prepare a sell transaction for external signing.
 * 
 * @example
 * const tx = await prepareSell("token_mint", 1000, "wallet_address");
 * // Sign with wallet
 * const signature = await finishTransaction(signedTx);
 */
export async function prepareSell(
  tokenMint: string,
  tokenAmount: number,
  walletAddress: string
): Promise<{
  transaction: string;
  message: string;
}> {
  const prepared = await prepareDirectSell(getConnection(), {
    tokenMint,
    amount: tokenAmount,
    walletAddress,
  });
  
  return {
    transaction: prepared.transaction,
    message: `Sell ${tokenAmount} tokens`,
  };
}

/**
 * Submit a signed transaction.
 * 
 * @example
 * const signature = await finishTransaction(signedTx);
 */
export async function finishTransaction(
  signedTransaction: string | Buffer | Uint8Array
): Promise<string> {
  // Convert to string if needed
  const txString = typeof signedTransaction === 'string' 
    ? signedTransaction
    : Buffer.from(signedTransaction).toString('base64');
  
  const signature = await submitSignedTransaction(
    getConnection(),
    txString
  );
  
  return signature;
}

// ============================================================
// MARKET DATA - Get token analytics
// ============================================================

/**
 * Search for tokens by name or symbol.
 * 
 * @example
 * const tokens = await findTokens("bonk");
 * tokens.forEach(t => console.log(t.name, t.mint));
 */
export async function findTokens(query: string): Promise<Array<{
  name: string;
  symbol: string;
  mint: string;
  price: number;
  marketCap: number;
  buyLink: string;
}>> {
  // This would need API implementation
  // For now return empty array as the API doesn't have search yet
  return [];
}

/**
 * Get trending tokens.
 * 
 * @example
 * const trending = await getTrending();
 * console.log("Hot tokens:", trending);
 */
export async function getTrending(limit: number = 10): Promise<Array<{
  name: string;
  symbol: string;
  mint: string;
  price: number;
  change24h: number;
  volume24h: number;
  buyLink: string;
}>> {
  // This would need to be implemented with the API
  // For now, return empty array
  return [];
}

// ============================================================
// UTILITIES
// ============================================================

/**
 * Parse any wallet format into Keypair.
 */
function parseWallet(
  wallet: Keypair | string | number[] | Uint8Array
): Keypair {
  // Already a keypair
  if (wallet instanceof Keypair) {
    return wallet;
  }
  
  // Base58 string
  if (typeof wallet === 'string') {
    try {
      const bs58 = require('bs58');
      return Keypair.fromSecretKey(bs58.decode(wallet));
    } catch {
      throw new Error('Invalid wallet key format');
    }
  }
  
  // Number array
  if (Array.isArray(wallet)) {
    return Keypair.fromSecretKey(Uint8Array.from(wallet));
  }
  
  // Uint8Array
  if (wallet instanceof Uint8Array) {
    return Keypair.fromSecretKey(wallet);
  }
  
  throw new Error('Invalid wallet format');
}

/**
 * Convert priority level to fee.
 */
function getPriorityFee(priority?: 'low' | 'medium' | 'high'): number {
  switch (priority) {
    case 'low': return 100_000;
    case 'medium': return 200_000;
    case 'high': return 500_000;
    default: return 200_000;
  }
}

// ============================================================
// EXPRESS MIDDLEWARE - Drop-in token gating
// ============================================================

/**
 * Express middleware for token gating.
 * 
 * @example
 * app.use('/api/premium', requireTokens("token_mint", 10));
 */
export function requireTokens(tokenMint: string, minAmount: number = 1) {
  return async (req: any, res: any, next: any) => {
    const wallet = req.query.wallet || req.headers['x-wallet-address'];
    
    if (!wallet) {
      return res.status(400).json({ 
        error: 'Wallet address required',
        hint: 'Pass ?wallet=ADDRESS or X-Wallet-Address header'
      });
    }
    
    const hasAccess = await hasTokens(wallet, tokenMint, minAmount);
    
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Insufficient tokens',
        required: minAmount,
        buyLink: `https://apps.fun/token/${tokenMint}`,
      });
    }
    
    // Add token info to request
    req.tokenGate = {
      wallet,
      tokenMint,
      verified: true,
    };
    
    next();
  };
}

// ============================================================
// DISCORD HELPERS - One-line bot integration
// ============================================================

/**
 * Check Discord user's tokens (assumes wallet mapping exists).
 * 
 * @example
 * if (await checkDiscordUser(userId, "token_mint")) {
 *   await grantRole(userId, "Holder");
 * }
 */
export async function checkDiscordUser(
  userId: string,
  tokenMint: string,
  minAmount: number = 1,
  getWallet: (userId: string) => Promise<string | null>
): Promise<boolean> {
  const wallet = await getWallet(userId);
  if (!wallet) return false;
  
  return hasTokens(wallet, tokenMint, minAmount);
}

// ============================================================
// EXPORT ALL FOR MAXIMUM VIBE
// ============================================================

export default {
  // Token gating
  hasTokens,
  getBalance,
  checkWallets,
  
  // Trading
  buyTokens,
  sellTokens,
  burnTokens,
  
  // Pool info
  getPrice,
  getTokenInfo,
  isAppsFunToken,
  
  // External wallets
  prepareBuy,
  prepareSell,
  finishTransaction,
  
  // Market data
  findTokens,
  getTrending,
  
  // Middleware
  requireTokens,
  
  // Discord
  checkDiscordUser,
};