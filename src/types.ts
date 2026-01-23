// Trading types
export interface QuoteParams {
  mintAddress: string;
  amount: number;
  inputMode: 'sol' | 'token';
  side: 'buy' | 'sell';
}

export interface QuoteResult {
  solAmount: number;
  tokenAmount: number;
  pricePerToken: number;
  priceImpact: number;
}

export interface PrepareTradeParams {
  mintAddress: string;
  amount: number;
  inputMode: 'sol' | 'token';
  side: 'buy' | 'sell';
  walletAddress: string;
  slippageBps?: number;
}

export interface PreparedTransaction {
  transaction: string;
  estimatedTokens: number;
  estimatedSol: number;
  estimatedPrice: number;
}

export interface SubmitTradeParams {
  signedTransaction: string;
  tokenMint: string;
  side: 'buy' | 'sell';
  solAmount: number;
  tokenAmount: number;
  pricePerToken: number;
  walletAddress: string;
}

export interface TradeResult {
  success: boolean;
  signature: string;
  trade?: {
    id: string;
    signature: string;
    side: 'buy' | 'sell';
    amount_tokens: number;
    amount_sol: number;
    price_per_token: number;
  };
}

// Earnings types
export interface TokenEarning {
  tokenMint: string;
  tokenSymbol: string;
  appName: string;
  claimable: number;
  claimed: number;
  role: string;
}

export interface EarningsResult {
  totalClaimable: number;
  totalClaimed: number;
  byToken: TokenEarning[];
}

export interface PrepareClaimParams {
  tokenMint: string;
  walletAddress: string;
}

export interface PreparedClaim {
  transaction: string;
  claimableBase: string;
  claimableQuote: string;
  poolAddress: string;
}

export interface SubmitClaimParams {
  signedTransaction: string;
  tokenMint: string;
  walletAddress: string;
  claimedBaseAmount: string;
  claimedQuoteAmount: string;
}

export interface ClaimResult {
  success: boolean;
  signature: string;
}

// Market data types
export interface MarketData {
  price: number;
  priceUsd: number | null;
  marketCap: number;
  marketCapUsd: number | null;
  volume24h: number;
  volume24hUsd: number | null;
  priceChange24h: number | null;
  bondingProgress: number;
  totalFees: number;
  source: 'birdeye' | 'meteora';
}

// Token info types
export interface TokenInfo {
  id: number;
  mintAddress: string;
  name: string;
  symbol: string;
  imageUrl: string | null;
  graduated: boolean;
  graduatedAt: string | null;
  createdAt: string;
  app: {
    id: number;
    name: string;
    url: string;
    category: string | null;
  } | null;
  launcher: {
    id: string;
    walletAddress: string;
  } | null;
}

export interface TokenListResult {
  tokens: TokenInfo[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// Token launch types
export type TokenSupply = 1000000 | 10000000 | 100000000 | 1000000000 | 10000000000;

export interface LaunchTokenParams {
  appId: number;
  name: string;
  symbol: string;
  description?: string;
  imageUrl?: string;
  imageData?: string;
  creatorWallet: string;
  initialBuyAmount?: number;
  supply?: TokenSupply;
}

export interface PreparedLaunch {
  tokenId: string;
  mintAddress: string;
  transaction: string;
  mintKeypair: string;
}

export interface SubmitLaunchParams {
  tokenId: string;
  signedTransaction: string;
  mintAddress: string;
  appId: number;
  name: string;
  symbol: string;
}

export interface LaunchResult {
  success: boolean;
  token: {
    id: string;
    mint_address: string;
    name: string;
    symbol: string;
  };
  mintAddress: string;
  txSignature: string;
}

// Burn types
export interface PrepareBurnParams {
  tokenMint: string;
  amount: string;
  walletAddress: string;
}

export interface PreparedBurn {
  transaction: string;
  burnAmount: string;
}

export interface SubmitBurnParams {
  signedTransaction: string;
  tokenMint: string;
  amount: string;
  walletAddress: string;
}

export interface BurnResult {
  success: boolean;
  signature: string;
  burnedAmount: string;
}

// Error types
export class AppsFunError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'AppsFunError';
  }
}

export class InsufficientBalanceError extends AppsFunError {
  constructor(required: bigint, available: bigint) {
    super(
      `Insufficient balance: required ${required}, available ${available}`,
      'INSUFFICIENT_BALANCE'
    );
    this.name = 'InsufficientBalanceError';
  }
}

export class TokenNotFoundError extends AppsFunError {
  constructor(tokenMint: string) {
    super(`Token not found: ${tokenMint}`, 'TOKEN_NOT_FOUND', 404);
    this.name = 'TokenNotFoundError';
  }
}

export class UnauthorizedError extends AppsFunError {
  constructor(message = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
  }
}

export class WalletNotLinkedError extends AppsFunError {
  constructor(walletAddress: string) {
    super(`Wallet not linked: ${walletAddress}`, 'WALLET_NOT_LINKED', 403);
    this.name = 'WalletNotLinkedError';
  }
}
