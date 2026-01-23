# API Reference

Complete API documentation for @apps-fun/sdk.

## Table of Contents

- [TokenGate](#tokengate)
- [Direct Trading](#direct-trading)
- [Pool Information](#pool-information)
- [AppsFunClient](#appsfunclient)
- [PDA Derivation](#pda-derivation)
- [Account Reading](#account-reading)
- [Types](#types)
- [Constants](#constants)
- [Error Handling](#error-handling)

## TokenGate

Token gating functionality for access control based on token ownership.

### Constructor

```typescript
new TokenGate(config: TokenGateConfig)
```

#### TokenGateConfig

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `tokenMint` | `PublicKey` | ✅ | - | SPL token mint address to check |
| `minAmount` | `bigint` | ✅ | - | Minimum balance required (with 6 decimals) |
| `connection` | `Connection` | ❌ | - | Solana connection instance |
| `rpcUrl` | `string` | ❌ | mainnet | RPC endpoint URL |
| `cacheTtlMs` | `number` | ❌ | 30000 | Cache duration in milliseconds |
| `appId` | `number` | ❌ | - | Optional app ID for tracking |

### Methods

#### check(wallet)

Check if a wallet meets the token requirement.

```typescript
async check(wallet: string | PublicKey): Promise<GateResult>
```

**Parameters:**
- `wallet`: Wallet address to check (base58 string or PublicKey)

**Returns: GateResult**
```typescript
{
  allowed: boolean;      // Whether access is granted
  balance: bigint;      // Wallet's token balance
  required: bigint;     // Required minimum balance
  message: string;      // Human-readable message
}
```

**Example:**
```typescript
const result = await gate.check("FnK2WZ8n2RZY6nZrTrYcBGiwZf3PL8tJhVVr3KBDMVQB");
if (result.allowed) {
  console.log("Access granted!");
}
```

#### checkBatch(wallets)

Check multiple wallets in parallel for better performance.

```typescript
async checkBatch(wallets: string[]): Promise<Map<string, GateResult>>
```

**Parameters:**
- `wallets`: Array of wallet addresses (base58 strings)

**Returns:** Map with wallet address as key and GateResult as value

**Example:**
```typescript
const wallets = ["wallet1...", "wallet2...", "wallet3..."];
const results = await gate.checkBatch(wallets);
results.forEach((result, wallet) => {
  console.log(`${wallet}: ${result.allowed}`);
});
```

#### clearCache()

Clear the internal balance cache.

```typescript
clearCache(): void
```

**Use case:** Call after token transfers to ensure fresh balance checks.

#### getTokenInfo()

Get the current gate configuration and token status.

```typescript
async getTokenInfo(): Promise<TokenInfo>
```

**Returns:**
```typescript
{
  mint: string;          // Token mint address
  minAmount: bigint;     // Required balance
  appId?: number;        // App ID if set
  graduated: boolean;    // Whether token has graduated to Raydium
}
```

## Direct Trading

Execute trades directly on-chain without API authentication.

### buyTokenDirect

Buy tokens with SOL using the bonding curve.

```typescript
async buyTokenDirect(
  connection: Connection,
  params: DirectTradeParams
): Promise<DirectTradeResult>
```

#### DirectTradeParams

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `tokenMint` | `string \| PublicKey` | ✅ | - | Token to buy |
| `amount` | `number` | ✅ | - | SOL amount to spend |
| `wallet` | `Keypair` | ✅ | - | Wallet with private key |
| `slippageBps` | `number` | ❌ | 100 | Max slippage in basis points (100 = 1%) |
| `priorityFee` | `number` | ❌ | 200000 | Priority fee in microlamports |

#### DirectTradeResult

```typescript
{
  success: boolean;
  signature: string;      // Transaction signature
  inputAmount: string;    // SOL spent (string for precision)
  outputAmount: string;   // Tokens received (string for precision)
}
```

**Example:**
```typescript
const result = await buyTokenDirect(connection, {
  tokenMint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  amount: 0.1,  // Buy with 0.1 SOL
  wallet: myKeypair,
  slippageBps: 200,  // 2% slippage
});
console.log(`Bought ${result.outputAmount} tokens`);
console.log(`Transaction: https://solscan.io/tx/${result.signature}`);
```

**Errors:**
- `Error('Amount must be positive')` - Amount <= 0
- `Error('Invalid token mint address')` - Invalid mint format
- `Error('Insufficient SOL balance')` - Not enough SOL
- `Error('Slippage exceeded')` - Price moved too much

### sellTokenDirect

Sell tokens for SOL using the bonding curve.

```typescript
async sellTokenDirect(
  connection: Connection,
  params: DirectTradeParams
): Promise<DirectTradeResult>
```

**Parameters:** Same as `buyTokenDirect` except:
- `amount`: Number of tokens to sell (not SOL)

**Example:**
```typescript
const result = await sellTokenDirect(connection, {
  tokenMint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  amount: 1000,  // Sell 1000 tokens
  wallet: myKeypair,
});
console.log(`Received ${result.outputAmount} SOL`);
```

### burnTokenDirect

Permanently burn tokens to reduce supply.

```typescript
async burnTokenDirect(
  connection: Connection,
  params: DirectBurnParams
): Promise<BurnResult>
```

#### DirectBurnParams

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `tokenMint` | `string \| PublicKey` | ✅ | - | Token to burn |
| `amount` | `number` | ✅ | - | Amount to burn |
| `wallet` | `Keypair` | ✅ | - | Wallet with private key |
| `priorityFee` | `number` | ❌ | 200000 | Priority fee |

**Returns:**
```typescript
{
  success: boolean;
  signature: string;
  burnedAmount: string;
}
```

### Prepare/Submit Pattern

For wallets that don't expose private keys (Privy, Ledger, etc.).

#### prepareDirectBuy

Build an unsigned buy transaction.

```typescript
async prepareDirectBuy(
  connection: Connection,
  params: PrepareDirectTradeParams
): Promise<PreparedDirectTransaction>
```

#### PrepareDirectTradeParams

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tokenMint` | `string \| PublicKey` | ✅ | Token to trade |
| `amount` | `number` | ✅ | Amount to trade |
| `walletAddress` | `string \| PublicKey` | ✅ | Wallet public key only |
| `slippageBps` | `number` | ❌ | Max slippage |
| `priorityFee` | `number` | ❌ | Priority fee |

**Returns:**
```typescript
{
  transaction: string;           // Base64 encoded unsigned transaction
  blockhash: string;            // Recent blockhash
  lastValidBlockHeight: number;  // Expiry block height
  estimatedOutput: string;      // Expected output amount
}
```

#### prepareDirectSell

Build an unsigned sell transaction.

```typescript
async prepareDirectSell(
  connection: Connection,
  params: PrepareDirectTradeParams
): Promise<PreparedDirectTransaction>
```

#### prepareDirectBurn

Build an unsigned burn transaction.

```typescript
async prepareDirectBurn(
  connection: Connection,
  params: PrepareDirectBurnParams
): Promise<PreparedDirectTransaction>
```

#### submitSignedTransaction

Submit an externally signed transaction.

```typescript
async submitSignedTransaction(
  connection: Connection,
  signedTx: string | Buffer | Uint8Array,
  blockhash?: string,
  lastValidBlockHeight?: number
): Promise<DirectTradeResult>
```

**Example with Privy:**
```typescript
// 1. Prepare
const prepared = await prepareDirectBuy(connection, {
  tokenMint: "TOKEN_MINT",
  amount: 0.1,
  walletAddress: privyUser.wallet.address,
});

// 2. Sign with Privy (shows user approval popup)
const signedTx = await privyWallet.signTransaction(prepared.transaction);

// 3. Submit
const result = await submitSignedTransaction(
  connection,
  signedTx,
  prepared.blockhash,
  prepared.lastValidBlockHeight
);
```

## Pool Information

Query bonding curve pool data.

### getPoolInfo

Get comprehensive pool information.

```typescript
async getPoolInfo(
  connection: Connection,
  tokenMint: string | PublicKey
): Promise<PoolInfo | null>
```

**Returns:**
```typescript
{
  tokenMint: string;
  currentPrice: number;        // Price per token in SOL
  tvlSol: number;             // Total value locked in SOL
  totalSupply: bigint;        // Total token supply
  circulatingSupply: bigint;  // Tokens in circulation
  isGraduated: boolean;       // Has migrated to Raydium
  tradingFeePercent: number;  // Fee (1.0 = 1%)
}
```

**Example:**
```typescript
const info = await getPoolInfo(connection, "TOKEN_MINT");
console.log(`Price: ${info.currentPrice} SOL`);
console.log(`Market Cap: ${info.tvlSol * 2} SOL`);
```

### verifyAppsFunPool

Check if a pool uses official apps.fun configuration.

```typescript
async verifyAppsFunPool(
  connection: Connection,
  tokenMint: string | PublicKey
): Promise<boolean>
```

**Returns:** `true` if pool has correct fee structure, `false` otherwise

**Use case:** Verify tokens before trading to ensure proper fee collection.

### getPoolFeeMetrics

Get fee collection metrics for a pool.

```typescript
async getPoolFeeMetrics(
  connection: Connection,
  tokenMint: string | PublicKey
): Promise<FeeMetrics>
```

**Returns:**
```typescript
{
  accumulatedFees: bigint;    // Total fees collected
  claimableFees: bigint;      // Unclaimed fees
  lastClaim: Date | null;     // Last claim timestamp
}
```

## AppsFunClient

API client for authenticated operations and market data.

### Constructor

```typescript
new AppsFunClient(config?: AppsFunClientConfig)
```

#### AppsFunClientConfig

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `cluster` | `'mainnet-beta' \| 'devnet' \| 'testnet'` | ❌ | mainnet-beta | Solana cluster |
| `rpc` | `string \| Connection` | ❌ | - | Custom RPC endpoint |
| `apiUrl` | `string` | ❌ | https://apps.fun | API base URL |

### Methods (No Auth Required)

#### getQuote

Get a price quote for a trade.

```typescript
async getQuote(params: QuoteParams): Promise<QuoteResult>
```

**QuoteParams:**
```typescript
{
  mintAddress: string;
  amount: number;
  inputMode: 'sol' | 'token';
  side: 'buy' | 'sell';
}
```

**Returns:**
```typescript
{
  inputAmount: number;
  outputAmount: number;
  priceImpact: number;
  fee: number;
}
```

#### getMarketData

Get market data for a token.

```typescript
async getMarketData(tokenMint: string): Promise<MarketData>
```

**Returns:**
```typescript
{
  price: number;
  volume24h: number;
  priceChange24h: number;
  marketCap: number;
  holders: number;
  graduated: boolean;
}
```

#### getTokensByCreator

Get all tokens created by a wallet.

```typescript
async getTokensByCreator(walletAddress: string): Promise<TokenInfo[]>
```

#### getAppsByOwner

Get all apps owned by a wallet.

```typescript
async getAppsByOwner(walletAddress: string): Promise<AppInfo[]>
```

#### getTradeHistory

Get trade history for a token.

```typescript
async getTradeHistory(
  tokenMint: string,
  options?: { limit?: number; offset?: number }
): Promise<Trade[]>
```

### Methods (Auth Required)

These require authentication token from apps.fun login.

#### prepareTrade

Prepare a trade transaction (requires auth).

```typescript
async prepareTrade(
  params: PrepareTradeParams,
  authToken: string
): Promise<PreparedTransaction>
```

#### getEarnings

Get user earnings from fees.

```typescript
async getEarnings(authToken: string): Promise<EarningsResult>
```

**Returns:**
```typescript
{
  earnings: UserEarnings[];
  totalClaimable: number;
  totalClaimed: number;
}
```

#### prepareTokenLaunch

Prepare a new token launch (requires auth).

```typescript
async prepareTokenLaunch(
  params: LaunchTokenParams,
  authToken: string
): Promise<PreparedLaunch>
```

## PDA Derivation

Program Derived Address functions for on-chain accounts.

### deriveProgramStatePDA

Get the program's global state PDA.

```typescript
function deriveProgramStatePDA(): [PublicKey, number]
```

**Returns:** `[pda, bump]` tuple

### deriveAppRecordPDA

Get PDA for an app record.

```typescript
function deriveAppRecordPDA(appId: bigint): [PublicKey, number]
```

### deriveTokenRecordPDA

Get PDA for a token record.

```typescript
function deriveTokenRecordPDA(tokenMint: PublicKey): [PublicKey, number]
```

### deriveFeeEscrowPDA

Get PDA for fee escrow account.

```typescript
function deriveFeeEscrowPDA(tokenMint: PublicKey): [PublicKey, number]
```

### deriveClaimRecordPDA

Get PDA for user claim record.

```typescript
function deriveClaimRecordPDA(
  user: PublicKey,
  tokenMint: PublicKey
): [PublicKey, number]
```

## Account Reading

Read on-chain account data.

### getAppRecord

Get app record from chain.

```typescript
async getAppRecord(
  connection: Connection,
  appId: bigint
): Promise<AppRecord | null>
```

**Returns:**
```typescript
{
  appId: bigint;
  bump: number;
  appUrlHash: number[];
  creator: PublicKey;
  verifiedOwner: PublicKey | null;
  dividendSplitBps: number;
  totalTokens: bigint;
  isSuspended: boolean;
}
```

### getTokenRecord

Get token record from chain.

```typescript
async getTokenRecord(
  connection: Connection,
  tokenMint: PublicKey
): Promise<TokenRecord | null>
```

**Returns:**
```typescript
{
  bump: number;
  appId: bigint;
  tokenMint: PublicKey;
  graduated: boolean;
  graduatedAt: bigint | null;
  totalVolume: bigint;
  totalTrades: bigint;
}
```

### getFeeEscrow

Get fee escrow account data.

```typescript
async getFeeEscrow(
  connection: Connection,
  tokenMint: PublicKey
): Promise<FeeEscrow | null>
```

**Returns:**
```typescript
{
  tokenMint: PublicKey;
  accumulatedFees: bigint;
  claimedFees: bigint;
  lastDistribution: bigint;
  bump: number;
}
```

### getTokenBalance

Get token balance for a wallet.

```typescript
async getTokenBalance(
  connection: Connection,
  tokenMint: PublicKey,
  wallet: PublicKey
): Promise<bigint>
```

**Returns:** Balance in smallest units (6 decimals)

## Types

### Core Types

```typescript
// Gate result from token checks
interface GateResult {
  allowed: boolean;
  balance: bigint;
  required: bigint;
  message: string;
}

// Pool information
interface PoolInfo {
  tokenMint: string;
  currentPrice: number;
  tvlSol: number;
  totalSupply: bigint;
  circulatingSupply: bigint;
  isGraduated: boolean;
  tradingFeePercent: number;
}

// Trade result
interface DirectTradeResult {
  success: boolean;
  signature: string;
  inputAmount: string;
  outputAmount: string;
}

// Market data
interface MarketData {
  price: number;
  volume24h: number;
  priceChange24h: number;
  marketCap: number;
  holders: number;
  graduated: boolean;
}
```

## Constants

### Program Constants

```typescript
// Program ID for apps.fun on-chain program
export const PROGRAM_ID = new PublicKey("GdAjWuq53tC4GgSYf8yTWawhRiYeA8sDYg8HwGXbMCL7");

// Native SOL mint (Wrapped SOL)
export const NATIVE_SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

// Default trading fee (100 = 1%)
export const DEFAULT_TRADING_FEE_BPS = 100;

// Default slippage (100 = 1%)
export const DEFAULT_SLIPPAGE_BPS = 100;

// Token decimals
export const TOKEN_DECIMALS = 6;

// apps.fun fee claimer wallet
export const APPS_FUN_FEE_CLAIMER = new PublicKey("6RbHZRAb5wLDKPaXSPLYd7RDGzeaeVVhQst2X9UwyGqb");
```

## Error Handling

### Custom Errors

```typescript
// Base error class
class AppsFunError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
  }
}

// Specific error types
class TokenNotFoundError extends AppsFunError
class UnauthorizedError extends AppsFunError
class InsufficientBalanceError extends AppsFunError
class WalletNotLinkedError extends AppsFunError
```

### Error Handling Example

```typescript
try {
  const result = await buyTokenDirect(connection, params);
} catch (error) {
  if (error instanceof InsufficientBalanceError) {
    console.log("Not enough SOL for trade");
  } else if (error instanceof TokenNotFoundError) {
    console.log("Token pool does not exist");
  } else if (error.message?.includes("slippage")) {
    console.log("Price moved too much, increase slippage");
  } else {
    console.error("Unknown error:", error);
  }
}
```

### Common Error Messages

| Error Message | Cause | Solution |
|--------------|-------|----------|
| `"Amount must be positive"` | Invalid amount | Ensure amount > 0 |
| `"Invalid token mint address"` | Bad mint format | Use valid base58 address |
| `"Insufficient SOL balance"` | Not enough SOL | Add SOL to wallet |
| `"Insufficient token balance"` | Not enough tokens | Check balance first |
| `"Slippage exceeded"` | Price moved | Increase slippageBps |
| `"Transaction simulation failed"` | Various | Check all parameters |
| `"blockhash not found"` | Expired transaction | Retry with fresh blockhash |
| `"429 Too Many Requests"` | RPC rate limit | Use better RPC or add caching |
| `"Custom program error: 0x1"` | Insufficient balance | Check token balance |

## Rate Limiting

### RPC Rate Limits

| Provider | Free Tier | Rate Limit |
|----------|-----------|------------|
| Public RPC | Free | ~10 req/sec |
| Helius | Free | 100k req/day |
| QuickNode | Free | 100k req/month |
| Alchemy | Free | 300M compute/month |

### Caching Strategy

```typescript
// Use caching to reduce RPC calls
const gate = new TokenGate({
  tokenMint: new PublicKey("..."),
  minAmount: BigInt(1000000),
  cacheTtlMs: 60000, // Cache for 1 minute
});

// Batch operations when possible
const results = await gate.checkBatch(wallets);
```

## Best Practices

1. **Always validate inputs** before calling SDK functions
2. **Use BigInt for token amounts** to avoid precision loss
3. **Cache balance checks** to reduce RPC calls
4. **Handle all error cases** explicitly
5. **Use environment variables** for sensitive data
6. **Test on devnet first** before mainnet
7. **Monitor RPC rate limits** and implement retries
8. **Use batch operations** when checking multiple wallets