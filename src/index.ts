export { AppsFunClient, type AppsFunClientConfig, type AppInfo, type UserEarnings } from './client';
export { TokenGate, type TokenGateConfig, type GateResult } from './token-gate';
export {
  deriveProgramStatePDA,
  deriveAppRecordPDA,
  deriveTokenRecordPDA,
  deriveFeeEscrowPDA,
  deriveDividendPoolPDA,
  deriveClaimRecordPDA,
  deriveProcessedTradesPDA,
} from './pda';
export {
  getAppRecord,
  getTokenRecord,
  getFeeEscrow,
  getTokenBalance,
  type AppRecord,
  type TokenRecord,
  type FeeEscrow,
} from './accounts';
export {
  PROGRAM_ID,
  PDA_VERSION,
  APPS_FUN_FEE_CLAIMER,
  APPS_FUN_METEORA_CONFIGS,
  NATIVE_SOL_MINT,
  DEFAULT_SLIPPAGE_BPS,
  TOKEN_DECIMALS,
} from './constants';

// Direct on-chain operations (no API required)
export {
  buyTokenDirect,
  sellTokenDirect,
  burnTokenDirect,
  getPoolInfo,
  verifyAppsFunPool,
  getPoolFeeMetrics,
  // Prepare methods for external wallet signing (Privy, etc.)
  prepareDirectBuy,
  prepareDirectSell,
  prepareDirectBurn,
  submitSignedTransaction,
  type DirectTradeParams,
  type DirectTradeResult,
  type DirectBurnParams,
  type DirectBurnResult,
  type PrepareDirectTradeParams,
  type PrepareDirectBurnParams,
  type PreparedDirectTransaction,
  type PoolInfo,
  type PoolFeeMetrics,
} from './direct';

// Trading types
export type {
  QuoteParams,
  QuoteResult,
  PrepareTradeParams,
  PreparedTransaction,
  SubmitTradeParams,
  TradeResult,
} from './types';

// Earnings types
export type {
  TokenEarning,
  EarningsResult,
  PrepareClaimParams,
  PreparedClaim,
  SubmitClaimParams,
  ClaimResult,
} from './types';

// Market data types
export type { MarketData } from './types';

// Token info types
export type { TokenInfo, TokenListResult } from './types';

// Token launch types
export type {
  TokenSupply,
  LaunchTokenParams,
  PreparedLaunch,
  SubmitLaunchParams,
  LaunchResult,
} from './types';

// Burn types
export type {
  PrepareBurnParams,
  PreparedBurn,
  SubmitBurnParams,
  BurnResult,
} from './types';

// Error classes
export {
  AppsFunError,
  InsufficientBalanceError,
  TokenNotFoundError,
  UnauthorizedError,
  WalletNotLinkedError,
} from './types';

// Agent-friendly vibecode API
export * as vibe from './vibecode';
export {
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
} from './vibecode';
