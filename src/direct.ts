/**
 * Direct On-Chain Operations
 *
 * These methods interact directly with Solana without going through the apps.fun API.
 * They are useful for:
 * - Testing and development
 * - Scenarios where API auth is not available
 * - Direct blockchain interactions
 *
 * IMPORTANT SECURITY NOTES:
 * - Trading fees are determined by the pool's Meteora config (set at pool creation)
 * - Token launches MUST use apps.fun's config to ensure fees go to the platform
 * - Burns are standard SPL Token operations with no fees
 */

import {
  Connection,
  PublicKey,
  Keypair,
  VersionedTransaction,
  TransactionMessage,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createBurnInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  DynamicBondingCurveClient,
  swapQuote,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import BN from 'bn.js';
import {
  APPS_FUN_FEE_CLAIMER,
  APPS_FUN_METEORA_CONFIGS,
  NATIVE_SOL_MINT,
  DEFAULT_SLIPPAGE_BPS,
  TOKEN_DECIMALS,
} from './constants';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface DirectTradeParams {
  /** Token mint address */
  tokenMint: PublicKey | string;
  /** Amount in SOL (for buy) or tokens (for sell) */
  amount: number;
  /** Wallet keypair (must have private key for signing) */
  wallet: Keypair;
  /** Slippage tolerance in basis points (default: 100 = 1%) */
  slippageBps?: number;
  /** Priority fee in microlamports (default: 200000) */
  priorityFee?: number;
}

export interface DirectTradeResult {
  success: boolean;
  signature: string;
  inputAmount: string;
  outputAmount: string;
  pricePerToken: number;
}

export interface DirectBurnParams {
  /** Token mint address */
  tokenMint: PublicKey | string;
  /** Amount to burn (in token units, not raw) */
  amount: number;
  /** Wallet keypair (must have private key for signing) */
  wallet: Keypair;
  /** Priority fee in microlamports (default: 200000) */
  priorityFee?: number;
}

export interface DirectBurnResult {
  success: boolean;
  signature: string;
  burnedAmount: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PREPARE TYPES (for Privy/external wallet signing)
// ═══════════════════════════════════════════════════════════════════════════

export interface PrepareDirectTradeParams {
  /** Token mint address */
  tokenMint: PublicKey | string;
  /** Amount in SOL (for buy) or tokens (for sell) */
  amount: number;
  /** Wallet public key (no private key needed) */
  walletAddress: PublicKey | string;
  /** Slippage tolerance in basis points (default: 100 = 1%) */
  slippageBps?: number;
  /** Priority fee in microlamports (default: 200000) */
  priorityFee?: number;
}

export interface PrepareDirectBurnParams {
  /** Token mint address */
  tokenMint: PublicKey | string;
  /** Amount to burn (in token units, not raw) */
  amount: number;
  /** Wallet public key (no private key needed) */
  walletAddress: PublicKey | string;
  /** Priority fee in microlamports (default: 200000) */
  priorityFee?: number;
}

export interface PreparedDirectTransaction {
  /** Base64 encoded unsigned VersionedTransaction */
  transaction: string;
  /** Expected input amount (formatted) */
  expectedInputAmount: string;
  /** Expected output amount (formatted) */
  expectedOutputAmount: string;
  /** Recent blockhash used */
  blockhash: string;
  /** Last valid block height */
  lastValidBlockHeight: number;
}

export interface PoolInfo {
  poolAddress: string;
  configAddress: string;
  feeClaimer: string;
  creator: string;
  isAppsFunPool: boolean;
  tradingFeePercent: number;
  creatorFeePercent: number;
  partnerFeePercent: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function toPublicKey(address: PublicKey | string): PublicKey {
  return typeof address === 'string' ? new PublicKey(address) : address;
}

async function getPoolState(
  client: DynamicBondingCurveClient,
  tokenMint: PublicKey
) {
  const poolAccount = await client.state.getPoolByBaseMint(tokenMint.toBase58());
  if (!poolAccount) {
    throw new Error(`Pool not found for token: ${tokenMint.toBase58()}`);
  }

  const config = await client.state.getPoolConfig(poolAccount.account.config);
  if (!config) {
    throw new Error(`Config not found for pool: ${poolAccount.publicKey.toBase58()}`);
  }

  return {
    pool: poolAccount.account,
    poolAddress: poolAccount.publicKey,
    config,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// POOL VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get information about a Meteora DBC pool
 *
 * Use this to verify a pool's fee configuration before trading.
 *
 * @param connection - Solana connection
 * @param tokenMint - Token mint address
 * @returns Pool information including fee configuration
 */
export async function getPoolInfo(
  connection: Connection,
  tokenMint: PublicKey | string
): Promise<PoolInfo> {
  const client = DynamicBondingCurveClient.create(connection, 'confirmed');
  const mint = toPublicKey(tokenMint);

  const { pool, poolAddress, config } = await getPoolState(client, mint);

  // Check if this is an apps.fun pool by comparing fee claimer
  const feeClaimer = config.feeClaimer.toBase58();
  const isAppsFunPool = feeClaimer === APPS_FUN_FEE_CLAIMER.toBase58();

  // Extract fee percentages
  const creatorFeePercent = config.creatorTradingFeePercentage || 0;
  const partnerFeePercent = 100 - creatorFeePercent;

  // Calculate total trading fee from pool fees config
  // Base fee numerator is in 1e9 scale (100% = 1e9)
  const baseFeeNumerator = config.poolFees?.baseFee?.cliffFeeNumerator?.toNumber() || 0;
  const tradingFeePercent = (baseFeeNumerator / 1e9) * 100;

  return {
    poolAddress: poolAddress.toBase58(),
    configAddress: config.feeClaimer.toBase58(), // Config address
    feeClaimer,
    creator: pool.creator.toBase58(),
    isAppsFunPool,
    tradingFeePercent,
    creatorFeePercent,
    partnerFeePercent,
  };
}

/**
 * Verify a pool is an official apps.fun pool
 *
 * @param connection - Solana connection
 * @param tokenMint - Token mint address
 * @returns true if pool uses apps.fun fee claimer
 */
export async function verifyAppsFunPool(
  connection: Connection,
  tokenMint: PublicKey | string
): Promise<boolean> {
  try {
    const info = await getPoolInfo(connection, tokenMint);
    return info.isAppsFunPool;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DIRECT TRADING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Buy tokens directly on-chain
 *
 * This executes a swap on the Meteora DBC pool, exchanging SOL for tokens.
 * Trading fees are automatically collected according to the pool's configuration.
 *
 * @param connection - Solana connection
 * @param params - Trade parameters
 * @returns Trade result with signature and amounts
 *
 * @example
 * ```ts
 * const result = await buyTokenDirect(connection, {
 *   tokenMint: 'TokenMintAddress...',
 *   amount: 0.1, // 0.1 SOL
 *   wallet: myKeypair,
 * });
 * console.log('Bought tokens:', result.outputAmount);
 * ```
 */
export async function buyTokenDirect(
  connection: Connection,
  params: DirectTradeParams
): Promise<DirectTradeResult> {
  const client = DynamicBondingCurveClient.create(connection, 'confirmed');
  const tokenMint = toPublicKey(params.tokenMint);
  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const priorityFee = params.priorityFee ?? 200_000;

  // Get pool state
  const { pool, poolAddress, config } = await getPoolState(client, tokenMint);

  // Calculate input amount in lamports
  const solAmountLamports = new BN(Math.floor(params.amount * LAMPORTS_PER_SOL));

  // Get quote
  const quote = swapQuote(
    pool,
    config,
    false, // swapBaseForQuote = false for buy (SOL -> tokens)
    solAmountLamports,
    slippageBps,
    false, // hasReferral
    new BN(Math.floor(Date.now() / 1000))
  );

  // Build swap transaction
  const swapTx = await client.pool.swap({
    owner: params.wallet.publicKey,
    pool: poolAddress,
    amountIn: solAmountLamports,
    minimumAmountOut: quote.minimumAmountOut,
    swapBaseForQuote: false,
    referralTokenAccount: null,
  });

  // Add priority fee
  const priorityIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: priorityFee,
  });

  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  const messageV0 = new TransactionMessage({
    payerKey: params.wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [priorityIx, ...swapTx.instructions],
  }).compileToV0Message();

  const tx = new VersionedTransaction(messageV0);
  tx.sign([params.wallet]);

  // Send and confirm
  const signature = await connection.sendTransaction(tx, {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  const latestBlockhash = await connection.getLatestBlockhash('confirmed');
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    'confirmed'
  );

  // Calculate price per token
  const tokensOut = quote.minimumAmountOut.toNumber();
  const pricePerToken = tokensOut > 0 ? solAmountLamports.toNumber() / tokensOut : 0;

  return {
    success: true,
    signature,
    inputAmount: (solAmountLamports.toNumber() / LAMPORTS_PER_SOL).toString(),
    outputAmount: (tokensOut / Math.pow(10, TOKEN_DECIMALS)).toString(),
    pricePerToken: pricePerToken / LAMPORTS_PER_SOL * Math.pow(10, TOKEN_DECIMALS),
  };
}

/**
 * Sell tokens directly on-chain
 *
 * This executes a swap on the Meteora DBC pool, exchanging tokens for SOL.
 * Trading fees are automatically collected according to the pool's configuration.
 *
 * @param connection - Solana connection
 * @param params - Trade parameters
 * @returns Trade result with signature and amounts
 *
 * @example
 * ```ts
 * const result = await sellTokenDirect(connection, {
 *   tokenMint: 'TokenMintAddress...',
 *   amount: 1000, // 1000 tokens
 *   wallet: myKeypair,
 * });
 * console.log('Received SOL:', result.outputAmount);
 * ```
 */
export async function sellTokenDirect(
  connection: Connection,
  params: DirectTradeParams
): Promise<DirectTradeResult> {
  const client = DynamicBondingCurveClient.create(connection, 'confirmed');
  const tokenMint = toPublicKey(params.tokenMint);
  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const priorityFee = params.priorityFee ?? 200_000;

  // Get pool state
  const { pool, poolAddress, config } = await getPoolState(client, tokenMint);

  // Calculate input amount in raw token units
  const tokenAmount = new BN(Math.floor(params.amount * Math.pow(10, TOKEN_DECIMALS)));

  // Get quote
  const quote = swapQuote(
    pool,
    config,
    true, // swapBaseForQuote = true for sell (tokens -> SOL)
    tokenAmount,
    slippageBps,
    false, // hasReferral
    new BN(Math.floor(Date.now() / 1000))
  );

  // Build swap transaction
  const swapTx = await client.pool.swap({
    owner: params.wallet.publicKey,
    pool: poolAddress,
    amountIn: tokenAmount,
    minimumAmountOut: quote.minimumAmountOut,
    swapBaseForQuote: true,
    referralTokenAccount: null,
  });

  // Add priority fee
  const priorityIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: priorityFee,
  });

  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  const messageV0 = new TransactionMessage({
    payerKey: params.wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [priorityIx, ...swapTx.instructions],
  }).compileToV0Message();

  const tx = new VersionedTransaction(messageV0);
  tx.sign([params.wallet]);

  // Send and confirm
  const signature = await connection.sendTransaction(tx, {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  const latestBlockhash = await connection.getLatestBlockhash('confirmed');
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    'confirmed'
  );

  // Calculate price per token
  const solOut = quote.minimumAmountOut.toNumber();
  const pricePerToken = tokenAmount.toNumber() > 0 ? solOut / tokenAmount.toNumber() : 0;

  return {
    success: true,
    signature,
    inputAmount: (tokenAmount.toNumber() / Math.pow(10, TOKEN_DECIMALS)).toString(),
    outputAmount: (solOut / LAMPORTS_PER_SOL).toString(),
    pricePerToken: pricePerToken / LAMPORTS_PER_SOL * Math.pow(10, TOKEN_DECIMALS),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DIRECT BURNS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Burn tokens directly on-chain
 *
 * This executes a standard SPL Token burn operation.
 * No fees are involved in burns.
 *
 * @param connection - Solana connection
 * @param params - Burn parameters
 * @returns Burn result with signature
 *
 * @example
 * ```ts
 * const result = await burnTokenDirect(connection, {
 *   tokenMint: 'TokenMintAddress...',
 *   amount: 100, // 100 tokens
 *   wallet: myKeypair,
 * });
 * console.log('Burned:', result.burnedAmount);
 * ```
 */
export async function burnTokenDirect(
  connection: Connection,
  params: DirectBurnParams
): Promise<DirectBurnResult> {
  const tokenMint = toPublicKey(params.tokenMint);
  const priorityFee = params.priorityFee ?? 200_000;

  // Get the associated token account
  const ata = await getAssociatedTokenAddress(tokenMint, params.wallet.publicKey);

  // Verify the account exists and has sufficient balance
  try {
    const account = await getAccount(connection, ata);
    const rawAmount = BigInt(Math.floor(params.amount * Math.pow(10, TOKEN_DECIMALS)));

    if (account.amount < rawAmount) {
      throw new Error(
        `Insufficient balance. Have: ${account.amount}, need: ${rawAmount}`
      );
    }
  } catch (err) {
    if ((err as Error).message.includes('could not find account')) {
      throw new Error('Token account not found. Wallet has no tokens.');
    }
    throw err;
  }

  // Calculate raw amount
  const rawAmount = BigInt(Math.floor(params.amount * Math.pow(10, TOKEN_DECIMALS)));

  // Build burn instruction
  const burnIx = createBurnInstruction(
    ata,
    tokenMint,
    params.wallet.publicKey,
    rawAmount
  );

  // Add priority fee
  const priorityIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: priorityFee,
  });

  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  const messageV0 = new TransactionMessage({
    payerKey: params.wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [priorityIx, burnIx],
  }).compileToV0Message();

  const tx = new VersionedTransaction(messageV0);
  tx.sign([params.wallet]);

  // Send and confirm
  const signature = await connection.sendTransaction(tx, {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  const latestBlockhash = await connection.getLatestBlockhash('confirmed');
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    'confirmed'
  );

  return {
    success: true,
    signature,
    burnedAmount: params.amount.toString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PREPARE TRANSACTIONS (for Privy/external wallet signing)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Prepare a buy transaction for external signing (e.g., Privy)
 *
 * Returns an unsigned transaction that can be signed by an external wallet
 * like Privy, then submitted with submitSignedTransaction().
 *
 * @param connection - Solana connection
 * @param params - Trade parameters (walletAddress instead of keypair)
 * @returns Prepared transaction ready for signing
 *
 * @example
 * ```ts
 * // 1. Prepare the transaction
 * const prepared = await prepareDirectBuy(connection, {
 *   tokenMint: 'TokenMint...',
 *   amount: 0.1, // SOL
 *   walletAddress: user.wallet.address,
 * });
 *
 * // 2. Sign with Privy
 * const signedTx = await privy.signTransaction(prepared.transaction);
 *
 * // 3. Submit
 * const result = await submitSignedTransaction(connection, signedTx);
 * ```
 */
export async function prepareDirectBuy(
  connection: Connection,
  params: PrepareDirectTradeParams
): Promise<PreparedDirectTransaction> {
  const client = DynamicBondingCurveClient.create(connection, 'confirmed');
  const tokenMint = toPublicKey(params.tokenMint);
  const walletPubkey = toPublicKey(params.walletAddress);
  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const priorityFee = params.priorityFee ?? 200_000;

  // Get pool state
  const { pool, poolAddress, config } = await getPoolState(client, tokenMint);

  // Calculate input amount in lamports
  const solAmountLamports = new BN(Math.floor(params.amount * LAMPORTS_PER_SOL));

  // Get quote
  const quote = swapQuote(
    pool,
    config,
    false, // swapBaseForQuote = false for buy (SOL -> tokens)
    solAmountLamports,
    slippageBps,
    false, // hasReferral
    new BN(Math.floor(Date.now() / 1000))
  );

  // Build swap transaction
  const swapTx = await client.pool.swap({
    owner: walletPubkey,
    pool: poolAddress,
    amountIn: solAmountLamports,
    minimumAmountOut: quote.minimumAmountOut,
    swapBaseForQuote: false,
    referralTokenAccount: null,
  });

  // Add priority fee
  const priorityIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: priorityFee,
  });

  const latestBlockhash = await connection.getLatestBlockhash('confirmed');

  const messageV0 = new TransactionMessage({
    payerKey: walletPubkey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: [priorityIx, ...swapTx.instructions],
  }).compileToV0Message();

  const tx = new VersionedTransaction(messageV0);

  // Serialize to base64 (unsigned)
  const serialized = Buffer.from(tx.serialize()).toString('base64');

  const tokensOut = quote.minimumAmountOut.toNumber();

  return {
    transaction: serialized,
    expectedInputAmount: (solAmountLamports.toNumber() / LAMPORTS_PER_SOL).toString(),
    expectedOutputAmount: (tokensOut / Math.pow(10, TOKEN_DECIMALS)).toString(),
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  };
}

/**
 * Prepare a sell transaction for external signing (e.g., Privy)
 *
 * Returns an unsigned transaction that can be signed by an external wallet.
 *
 * @param connection - Solana connection
 * @param params - Trade parameters
 * @returns Prepared transaction ready for signing
 */
export async function prepareDirectSell(
  connection: Connection,
  params: PrepareDirectTradeParams
): Promise<PreparedDirectTransaction> {
  const client = DynamicBondingCurveClient.create(connection, 'confirmed');
  const tokenMint = toPublicKey(params.tokenMint);
  const walletPubkey = toPublicKey(params.walletAddress);
  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const priorityFee = params.priorityFee ?? 200_000;

  // Get pool state
  const { pool, poolAddress, config } = await getPoolState(client, tokenMint);

  // Calculate input amount in raw token units
  const tokenAmount = new BN(Math.floor(params.amount * Math.pow(10, TOKEN_DECIMALS)));

  // Get quote
  const quote = swapQuote(
    pool,
    config,
    true, // swapBaseForQuote = true for sell (tokens -> SOL)
    tokenAmount,
    slippageBps,
    false, // hasReferral
    new BN(Math.floor(Date.now() / 1000))
  );

  // Build swap transaction
  const swapTx = await client.pool.swap({
    owner: walletPubkey,
    pool: poolAddress,
    amountIn: tokenAmount,
    minimumAmountOut: quote.minimumAmountOut,
    swapBaseForQuote: true,
    referralTokenAccount: null,
  });

  // Add priority fee
  const priorityIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: priorityFee,
  });

  const latestBlockhash = await connection.getLatestBlockhash('confirmed');

  const messageV0 = new TransactionMessage({
    payerKey: walletPubkey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: [priorityIx, ...swapTx.instructions],
  }).compileToV0Message();

  const tx = new VersionedTransaction(messageV0);

  // Serialize to base64 (unsigned)
  const serialized = Buffer.from(tx.serialize()).toString('base64');

  const solOut = quote.minimumAmountOut.toNumber();

  return {
    transaction: serialized,
    expectedInputAmount: (tokenAmount.toNumber() / Math.pow(10, TOKEN_DECIMALS)).toString(),
    expectedOutputAmount: (solOut / LAMPORTS_PER_SOL).toString(),
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  };
}

/**
 * Prepare a burn transaction for external signing (e.g., Privy)
 *
 * Returns an unsigned transaction that can be signed by an external wallet.
 *
 * @param connection - Solana connection
 * @param params - Burn parameters
 * @returns Prepared transaction ready for signing
 */
export async function prepareDirectBurn(
  connection: Connection,
  params: PrepareDirectBurnParams
): Promise<PreparedDirectTransaction> {
  const tokenMint = toPublicKey(params.tokenMint);
  const walletPubkey = toPublicKey(params.walletAddress);
  const priorityFee = params.priorityFee ?? 200_000;

  // Get the associated token account
  const ata = await getAssociatedTokenAddress(tokenMint, walletPubkey);

  // Verify the account exists and has sufficient balance
  try {
    const account = await getAccount(connection, ata);
    const rawAmount = BigInt(Math.floor(params.amount * Math.pow(10, TOKEN_DECIMALS)));

    if (account.amount < rawAmount) {
      throw new Error(
        `Insufficient balance. Have: ${account.amount}, need: ${rawAmount}`
      );
    }
  } catch (err) {
    if ((err as Error).message.includes('could not find account')) {
      throw new Error('Token account not found. Wallet has no tokens.');
    }
    throw err;
  }

  // Calculate raw amount
  const rawAmount = BigInt(Math.floor(params.amount * Math.pow(10, TOKEN_DECIMALS)));

  // Build burn instruction
  const burnIx = createBurnInstruction(
    ata,
    tokenMint,
    walletPubkey,
    rawAmount
  );

  // Add priority fee
  const priorityIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: priorityFee,
  });

  const latestBlockhash = await connection.getLatestBlockhash('confirmed');

  const messageV0 = new TransactionMessage({
    payerKey: walletPubkey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: [priorityIx, burnIx],
  }).compileToV0Message();

  const tx = new VersionedTransaction(messageV0);

  // Serialize to base64 (unsigned)
  const serialized = Buffer.from(tx.serialize()).toString('base64');

  return {
    transaction: serialized,
    expectedInputAmount: params.amount.toString(),
    expectedOutputAmount: '0', // Burns have no output
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  };
}

/**
 * Submit a signed transaction to the network
 *
 * Use this after signing a prepared transaction with Privy or another wallet.
 *
 * @param connection - Solana connection
 * @param signedTransaction - Base64 encoded signed transaction
 * @param blockhash - Optional blockhash for confirmation (from prepare result)
 * @param lastValidBlockHeight - Optional last valid block height (from prepare result)
 * @returns Transaction signature
 *
 * @example
 * ```ts
 * const signature = await submitSignedTransaction(
 *   connection,
 *   signedTxBase64,
 *   prepared.blockhash,
 *   prepared.lastValidBlockHeight
 * );
 * ```
 */
export async function submitSignedTransaction(
  connection: Connection,
  signedTransaction: string,
  blockhash?: string,
  lastValidBlockHeight?: number
): Promise<string> {
  // Decode the signed transaction
  const txBuffer = Buffer.from(signedTransaction, 'base64');
  const tx = VersionedTransaction.deserialize(txBuffer);

  // Send transaction
  const signature = await connection.sendTransaction(tx, {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  // Get blockhash for confirmation if not provided
  let confirmBlockhash = blockhash;
  let confirmLastValidBlockHeight = lastValidBlockHeight;

  if (!confirmBlockhash || !confirmLastValidBlockHeight) {
    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    confirmBlockhash = latestBlockhash.blockhash;
    confirmLastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
  }

  // Confirm transaction
  await connection.confirmTransaction(
    {
      signature,
      blockhash: confirmBlockhash,
      lastValidBlockHeight: confirmLastValidBlockHeight,
    },
    'confirmed'
  );

  return signature;
}

// ═══════════════════════════════════════════════════════════════════════════
// FEE CHECKING
// ═══════════════════════════════════════════════════════════════════════════

export interface PoolFeeMetrics {
  /** Partner (platform) claimable fees in lamports */
  partnerClaimableLamports: bigint;
  /** Partner claimable fees in SOL */
  partnerClaimableSol: number;
  /** Creator claimable fees in lamports */
  creatorClaimableLamports: bigint;
  /** Creator claimable fees in SOL */
  creatorClaimableSol: number;
}

/**
 * Get claimable fee metrics for a pool
 *
 * @param connection - Solana connection
 * @param tokenMint - Token mint address
 * @returns Fee metrics
 */
export async function getPoolFeeMetrics(
  connection: Connection,
  tokenMint: PublicKey | string
): Promise<PoolFeeMetrics> {
  const client = DynamicBondingCurveClient.create(connection, 'confirmed');
  const mint = toPublicKey(tokenMint);

  const { poolAddress } = await getPoolState(client, mint);

  const metrics = await client.state.getPoolFeeMetrics(poolAddress);

  const partnerClaimable = BigInt(metrics.current.partnerQuoteFee.toString());
  const creatorClaimable = BigInt(metrics.current.creatorQuoteFee.toString());

  return {
    partnerClaimableLamports: partnerClaimable,
    partnerClaimableSol: Number(partnerClaimable) / LAMPORTS_PER_SOL,
    creatorClaimableLamports: creatorClaimable,
    creatorClaimableSol: Number(creatorClaimable) / LAMPORTS_PER_SOL,
  };
}
