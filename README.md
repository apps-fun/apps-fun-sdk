# @apps-fun/sdk

Official SDK for building token-gated applications on Solana using apps.fun bonding curves.

## Table of Contents

- [What is apps.fun?](#what-is-appsfun)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Getting Started](#getting-started)
- [Core Concepts](#core-concepts)
- [Quick Start Examples](#quick-start-examples)
- [API Reference](#api-reference)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)
- [Migration Guide](#migration-guide)
- [Templates](#templates)

## What is apps.fun?

apps.fun is a platform for launching tokens on Solana using bonding curves. Key features:

- **Token-gated apps**: Control access to your app based on token ownership
- **Bonding curves**: Automatic price discovery with Meteora Dynamic Bonding Curves
- **Revenue sharing**: 1% trading fee split between platform (0.5%) and creators (0.5%)
- **Graduation**: Tokens automatically migrate to Raydium when reaching ~$69k market cap
- **No presales**: Fair launch mechanism with transparent pricing

## Prerequisites

Before using the SDK, you need:

### 1. Solana Wallet
- **Development**: Generate a test wallet with `solana-keygen new`
- **Production**: Use hardware wallet (Ledger) or browser wallet (Phantom, Backpack)
- **Funding**: You need SOL for transaction fees (~0.01 SOL per transaction)

### 2. RPC Endpoint
- **Free tier**: `https://api.mainnet-beta.solana.com` (rate limited)
- **Recommended providers**:
  - [Helius](https://helius.dev) - Free tier available
  - [QuickNode](https://quicknode.com) - Free tier available
  - [Alchemy](https://alchemy.com) - Free tier available

### 3. Node.js Environment
- Node.js 16+ required
- TypeScript recommended for better type safety

## Installation

```bash
npm install @apps-fun/sdk @solana/web3.js
```

## Getting Started

### Step 1: Set Up Your Environment

Create a `.env` file:

```bash
# Required for trading operations
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# For testing on devnet
# SOLANA_RPC_URL=https://api.devnet.solana.com

# Your wallet private key (NEVER commit this!)
# For development only - use environment variables in production
WALLET_PRIVATE_KEY=[your_private_key_array_or_base58]

# Optional: Custom apps.fun API URL
APPS_FUN_API_URL=https://apps.fun
```

### Step 2: Create Your First Token Gate

```typescript
import { TokenGate } from '@apps-fun/sdk';
import { Connection, PublicKey } from '@solana/web3.js';

// Initialize connection
const connection = new Connection(process.env.SOLANA_RPC_URL!);

// Create a token gate
const gate = new TokenGate({
  tokenMint: new PublicKey('YOUR_TOKEN_MINT_ADDRESS'),
  minAmount: BigInt(1_000_000), // 1 token (tokens have 6 decimals)
  connection,
  cacheTtlMs: 30000, // Cache for 30 seconds
});

// Check if a wallet has access
async function checkAccess(walletAddress: string): Promise<boolean> {
  const result = await gate.check(walletAddress);
  
  if (result.allowed) {
    console.log(`✅ Access granted! Balance: ${result.balance}`);
    return true;
  } else {
    const needed = result.required - result.balance;
    console.log(`❌ Need ${needed} more tokens for access`);
    return false;
  }
}
```

### Step 3: Get a Token Mint Address

To use token gating, you need a token mint address. You have three options:

#### Option A: Use an Existing Token
Browse tokens on [apps.fun](https://apps.fun) and copy the mint address from any token page.

#### Option B: Create via Website
1. Go to [apps.fun](https://apps.fun)
2. Click "Launch Token"
3. Fill in token details
4. Pay ~0.02 SOL for creation
5. Copy the mint address from your token page

#### Option C: Create via API (Requires Auth)
```typescript
import { AppsFunClient } from '@apps-fun/sdk';

const client = new AppsFunClient({ cluster: 'mainnet-beta' });

// This requires authentication through apps.fun website
// See "Token Creation" section for details
```

## Core Concepts

### Bonding Curves

Tokens on apps.fun use Meteora Dynamic Bonding Curves for pricing:

- **Price increases** as more tokens are bought
- **Price decreases** as tokens are sold
- **No liquidity provider needed** - the curve IS the liquidity
- **Instant trading** - no order books or waiting

### Token Decimals

All tokens use 6 decimals (like USDC). This means:
- `1_000_000` units = 1 token
- `1_000` units = 0.001 tokens
- Always use `BigInt` for token amounts to avoid precision issues

### Trading Fees

Every trade has a 1% fee:
- 0.5% to apps.fun platform
- 0.5% to token creator
- Fees are taken from the output amount
- Example: Buy 100 tokens → receive 99 tokens

### Graduation

When a token reaches ~$69,000 market cap:
- Liquidity migrates to Raydium automatically
- Token becomes tradeable on all Solana DEXs
- Bonding curve closes (no more buys through apps.fun)

## Quick Start Examples

### Token Gating for Discord Bot

```typescript
import { TokenGate } from '@apps-fun/sdk';
import { Client, GatewayIntentBits } from 'discord.js';
import { Connection, PublicKey } from '@solana/web3.js';

const TOKEN_MINT = 'YOUR_TOKEN_MINT_ADDRESS';
const MIN_TOKENS = BigInt(10_000_000); // 10 tokens

const gate = new TokenGate({
  tokenMint: new PublicKey(TOKEN_MINT),
  minAmount: MIN_TOKENS,
  rpcUrl: process.env.SOLANA_RPC_URL,
  cacheTtlMs: 60000, // Cache for 1 minute
});

const bot = new Client({ intents: [GatewayIntentBits.Guilds] });

bot.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;
  
  if (interaction.commandName === 'verify') {
    // Get user's linked wallet (you need to implement this)
    const walletAddress = await getUserWallet(interaction.user.id);
    
    if (!walletAddress) {
      return interaction.reply('Please link your wallet first!');
    }
    
    const result = await gate.check(walletAddress);
    
    if (result.allowed) {
      // Grant role
      const role = interaction.guild?.roles.cache.find(r => r.name === 'Token Holder');
      await interaction.member?.roles.add(role!);
      return interaction.reply('✅ Verified! You have been granted access.');
    } else {
      return interaction.reply(
        `❌ You need ${result.required - result.balance} more tokens to access this server.`
      );
    }
  }
});

bot.login(process.env.DISCORD_TOKEN);
```

### Trading Bot

```typescript
import { buyTokenDirect, sellTokenDirect, getPoolInfo } from '@apps-fun/sdk';
import { Connection, Keypair } from '@solana/web3.js';

// Load wallet (NEVER hardcode private keys!)
const wallet = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.WALLET_PRIVATE_KEY!))
);

const connection = new Connection(process.env.SOLANA_RPC_URL!);
const TOKEN_MINT = 'YOUR_TOKEN_MINT_ADDRESS';

async function tradingBot() {
  // Check pool info first
  const poolInfo = await getPoolInfo(connection, TOKEN_MINT);
  if (!poolInfo) {
    console.error('Pool not found!');
    return;
  }
  
  console.log(`Current price: ${poolInfo.currentPrice} SOL`);
  console.log(`TVL: ${poolInfo.tvlSol} SOL`);
  
  // Buy when price is below threshold
  if (poolInfo.currentPrice < 0.001) {
    try {
      const result = await buyTokenDirect(connection, {
        tokenMint: TOKEN_MINT,
        amount: 0.1, // Buy with 0.1 SOL
        wallet,
        slippageBps: 100, // 1% slippage
        priorityFee: 300_000, // Higher priority for faster execution
      });
      
      console.log(`Bought tokens: ${result.outputAmount}`);
      console.log(`Transaction: https://solscan.io/tx/${result.signature}`);
    } catch (error) {
      console.error('Buy failed:', error);
    }
  }
  
  // Sell when price is above threshold
  if (poolInfo.currentPrice > 0.002) {
    try {
      const result = await sellTokenDirect(connection, {
        tokenMint: TOKEN_MINT,
        amount: 1000, // Sell 1000 tokens
        wallet,
        slippageBps: 100,
      });
      
      console.log(`Sold for ${result.outputAmount} SOL`);
      console.log(`Transaction: https://solscan.io/tx/${result.signature}`);
    } catch (error) {
      console.error('Sell failed:', error);
    }
  }
}

// Run every 30 seconds
setInterval(tradingBot, 30000);
```

### Next.js API Route with Token Gate

```typescript
// pages/api/premium-content.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { TokenGate } from '@apps-fun/sdk';
import { PublicKey } from '@solana/web3.js';

const gate = new TokenGate({
  tokenMint: new PublicKey(process.env.NEXT_PUBLIC_TOKEN_MINT!),
  minAmount: BigInt(process.env.MIN_TOKENS || '1000000'),
  rpcUrl: process.env.SOLANA_RPC_URL,
  cacheTtlMs: 60000,
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { wallet } = req.query;
  
  if (!wallet || typeof wallet !== 'string') {
    return res.status(400).json({ error: 'Wallet address required' });
  }
  
  try {
    const result = await gate.check(wallet);
    
    if (!result.allowed) {
      return res.status(403).json({
        error: 'Insufficient tokens',
        required: result.required.toString(),
        balance: result.balance.toString(),
        buyUrl: `https://apps.fun/token/${process.env.NEXT_PUBLIC_TOKEN_MINT}`,
      });
    }
    
    // Return premium content
    return res.json({
      content: 'This is premium content only for token holders!',
      data: {
        // Your premium data here
      },
    });
  } catch (error) {
    console.error('Gate check failed:', error);
    return res.status(500).json({ error: 'Failed to verify token ownership' });
  }
}
```

## API Reference

### TokenGate Class

Token gating functionality for controlling access based on token ownership.

#### Constructor

```typescript
new TokenGate(config: TokenGateConfig)
```

**Parameters:**
- `tokenMint: PublicKey` - The SPL token mint address to check
- `minAmount: bigint` - Minimum token balance required (in smallest units, 6 decimals)
- `connection?: Connection` - Optional Solana connection instance
- `rpcUrl?: string` - Alternative to connection, provide RPC URL directly
- `cacheTtlMs?: number` - Cache duration in milliseconds (default: 30000)
- `appId?: number` - Optional app ID for tracking

#### Methods

##### `check(wallet: string | PublicKey): Promise<GateResult>`

Check if a wallet meets the token requirement.

**Returns:**
```typescript
{
  allowed: boolean;       // Whether access should be granted
  balance: bigint;       // Wallet's token balance
  required: bigint;      // Required minimum balance
  message: string;       // Human-readable status message
}
```

**Throws:**
- `Error` if wallet address is invalid
- `Error` if RPC connection fails

##### `checkBatch(wallets: string[]): Promise<Map<string, GateResult>>`

Check multiple wallets in parallel (optimized for performance).

**Returns:** Map with wallet addresses as keys and GateResult as values

##### `clearCache(): void`

Clear the internal balance cache. Useful after token transfers.

##### `getTokenInfo()`

Get the gate configuration.

**Returns:**
```typescript
{
  mint: string;          // Token mint address
  minAmount: bigint;     // Required balance
  appId?: number;        // App ID if set
  graduated: boolean;    // Whether token has graduated
}
```

### Direct Trading Functions

Execute trades directly on-chain without API authentication.

#### `buyTokenDirect(connection, params): Promise<DirectTradeResult>`

Buy tokens with SOL.

**Parameters:**
```typescript
{
  tokenMint: string | PublicKey;  // Token to buy
  amount: number;                  // SOL amount to spend
  wallet: Keypair;                // Wallet with private key
  slippageBps?: number;           // Max slippage (default: 100 = 1%)
  priorityFee?: number;           // Priority fee in microlamports (default: 200000)
}
```

**Returns:**
```typescript
{
  success: boolean;
  signature: string;      // Transaction signature
  inputAmount: string;    // SOL spent (as string)
  outputAmount: string;   // Tokens received (as string)
}
```

**Throws:**
- `Error('Amount must be positive')` if amount <= 0
- `Error('Slippage must be between 0 and 10000 basis points')` if slippage invalid
- `Error('Priority fee must be non-negative')` if fee < 0
- `Error('Invalid token mint address')` if mint is invalid
- `Error('Insufficient SOL balance')` if wallet lacks funds
- Network/RPC errors

#### `sellTokenDirect(connection, params): Promise<DirectTradeResult>`

Sell tokens for SOL.

**Parameters:**
```typescript
{
  tokenMint: string | PublicKey;  // Token to sell
  amount: number;                  // Token amount to sell
  wallet: Keypair;                // Wallet with private key
  slippageBps?: number;           // Max slippage (default: 100 = 1%)
  priorityFee?: number;           // Priority fee (default: 200000)
}
```

**Returns:** Same as `buyTokenDirect`

**Throws:**
- Same validation errors as `buyTokenDirect`
- `Error('Insufficient token balance')` if wallet lacks tokens

#### `burnTokenDirect(connection, params): Promise<BurnResult>`

Permanently burn tokens to reduce supply.

**Parameters:**
```typescript
{
  tokenMint: string | PublicKey;  // Token to burn
  amount: number;                  // Amount to burn
  wallet: Keypair;                // Wallet with private key
  priorityFee?: number;           // Priority fee (default: 200000)
}
```

**Returns:**
```typescript
{
  success: boolean;
  signature: string;      // Transaction signature
  burnedAmount: string;   // Amount burned (as string)
}
```

### Prepare/Submit Pattern (for Privy/External Wallets)

For wallets that don't expose private keys (Privy, hardware wallets).

#### `prepareDirectBuy(connection, params): Promise<PreparedDirectTransaction>`

Build unsigned buy transaction.

**Parameters:**
```typescript
{
  tokenMint: string | PublicKey;
  amount: number;
  walletAddress: string | PublicKey;  // Just public key, no private key
  slippageBps?: number;
  priorityFee?: number;
}
```

**Returns:**
```typescript
{
  transaction: string;           // Base64 encoded unsigned transaction
  blockhash: string;            // Recent blockhash used
  lastValidBlockHeight: number;  // Transaction expiry
  estimatedOutput: string;      // Expected tokens to receive
}
```

#### `submitSignedTransaction(connection, signedTx): Promise<DirectTradeResult>`

Submit externally signed transaction.

**Parameters:**
- `signedTx: string | Buffer | Uint8Array` - Signed transaction

### Pool Information Functions

#### `getPoolInfo(connection, tokenMint): Promise<PoolInfo | null>`

Get detailed pool information.

**Returns:**
```typescript
{
  tokenMint: string;
  currentPrice: number;        // Current token price in SOL
  tvlSol: number;             // Total value locked in SOL
  totalSupply: bigint;        // Total token supply
  circulatingSupply: bigint;  // Circulating supply
  isGraduated: boolean;       // Has reached graduation
  tradingFeePercent: number;  // Fee percentage (1.0 = 1%)
}
```

#### `verifyAppsFunPool(connection, tokenMint): Promise<boolean>`

Verify a pool uses official apps.fun fee configuration.

**Returns:** `true` if pool has correct 1% fee split, `false` otherwise

#### `getPoolFeeMetrics(connection, tokenMint): Promise<FeeMetrics>`

Get fee collection metrics.

**Returns:**
```typescript
{
  accumulatedFees: bigint;    // Total fees collected
  claimableFees: bigint;      // Fees ready to claim
  lastClaim: Date | null;     // Last claim timestamp
}
```

### AppsFunClient

API client for authenticated operations.

#### Constructor

```typescript
new AppsFunClient(config?: AppsFunClientConfig)
```

**Parameters:**
```typescript
{
  cluster?: 'mainnet-beta' | 'devnet' | 'testnet';
  rpc?: string | Connection;
  apiUrl?: string;  // Default: https://apps.fun
}
```

#### Methods (No Auth Required)

##### `getQuote(params): Promise<QuoteResult>`

Get price quote for a trade.

##### `getMarketData(tokenMint): Promise<MarketData>`

Get market data for a token.

##### `getTokensByCreator(wallet): Promise<TokenInfo[]>`

Get all tokens created by a wallet.

#### Methods (Auth Required)

These methods require authentication token from apps.fun login:

##### `prepareTrade(params, authToken): Promise<PreparedTransaction>`
##### `submitTrade(params, authToken): Promise<TradeResult>`
##### `getEarnings(authToken): Promise<EarningsResult>`
##### `prepareTokenLaunch(params, authToken): Promise<PreparedLaunch>`

## Security Best Practices

### 🔴 CRITICAL: Private Key Management

**NEVER**:
- Hardcode private keys in source code
- Commit private keys to git
- Share private keys in Discord/Telegram
- Store private keys in frontend code
- Log private keys

**ALWAYS**:
- Use environment variables for development
- Use secure key management (AWS KMS, HashiCorp Vault) in production
- Use hardware wallets for large amounts
- Rotate keys regularly
- Use separate wallets for testing

### Example: Secure Wallet Loading

```typescript
import { Keypair } from '@solana/web3.js';
import * as bs58 from 'bs58';

function loadWallet(): Keypair {
  const key = process.env.WALLET_PRIVATE_KEY;
  
  if (!key) {
    throw new Error('WALLET_PRIVATE_KEY environment variable not set');
  }
  
  // Support both JSON array and base58 formats
  try {
    // Try JSON array format first
    const secretKey = JSON.parse(key);
    return Keypair.fromSecretKey(Uint8Array.from(secretKey));
  } catch {
    // Try base58 format
    try {
      return Keypair.fromSecretKey(bs58.decode(key));
    } catch (error) {
      throw new Error('Invalid private key format. Use JSON array or base58.');
    }
  }
}
```

### RPC Endpoint Security

- Don't expose RPC endpoints with credit cards attached in frontend
- Use read-only endpoints for public operations
- Implement rate limiting on your API routes
- Consider using RPC proxies for production

### Input Validation

Always validate user inputs:

```typescript
// Good
async function checkAccess(walletInput: unknown) {
  // Validate input
  if (typeof walletInput !== 'string') {
    throw new Error('Invalid wallet address');
  }
  
  // Verify it's a valid Solana address
  try {
    new PublicKey(walletInput);
  } catch {
    throw new Error('Invalid Solana address format');
  }
  
  // Now safe to use
  return gate.check(walletInput);
}

// Bad - no validation
async function checkAccess(wallet: any) {
  return gate.check(wallet); // Could throw or behave unexpectedly
}
```

## Troubleshooting

### Common Issues and Solutions

#### "Transaction simulation failed"

**Causes:**
- Insufficient SOL for fees (need ~0.01 SOL)
- Token account doesn't exist (need ~0.002 SOL to create)
- Slippage too low for volatile tokens

**Solution:**
```typescript
// Ensure wallet has enough SOL
const balance = await connection.getBalance(wallet.publicKey);
if (balance < 0.01 * LAMPORTS_PER_SOL) {
  throw new Error('Insufficient SOL for fees');
}

// Increase slippage for volatile tokens
const result = await buyTokenDirect(connection, {
  tokenMint,
  amount: 0.1,
  wallet,
  slippageBps: 500, // 5% slippage for volatile tokens
});
```

#### "blockhash not found"

**Cause:** Transaction took too long to submit (blockhash expired).

**Solution:**
```typescript
// Retry with fresh blockhash
async function retryTransaction(fn: () => Promise<any>, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      if (error.message?.includes('blockhash not found') && i < maxRetries - 1) {
        console.log(`Retry ${i + 1}/${maxRetries}...`);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      throw error;
    }
  }
}
```

#### "429 Too Many Requests"

**Cause:** RPC rate limiting.

**Solutions:**
1. Use a paid RPC provider (Helius, QuickNode)
2. Implement request throttling:

```typescript
import { TokenGate } from '@apps-fun/sdk';

// Batch checks to reduce RPC calls
const gate = new TokenGate({
  tokenMint: new PublicKey(TOKEN_MINT),
  minAmount: BigInt(1000000),
  rpcUrl: process.env.SOLANA_RPC_URL,
  cacheTtlMs: 60000, // Cache for 1 minute
});

// Check multiple wallets in one call
const wallets = ['wallet1', 'wallet2', 'wallet3'];
const results = await gate.checkBatch(wallets);
```

#### "Account not found"

**Cause:** Token account doesn't exist for the wallet.

**Solution:**
```typescript
import { getAssociatedTokenAddress } from '@solana/spl-token';

// Check if token account exists
const tokenAccount = await getAssociatedTokenAddress(
  new PublicKey(tokenMint),
  wallet.publicKey
);

try {
  await connection.getAccountInfo(tokenAccount);
} catch {
  console.log('Token account does not exist. Will be created on first trade.');
}
```

#### "Custom program error: 0x1"

**Cause:** Insufficient token balance for sell/burn operations.

**Solution:**
```typescript
// Check balance before selling
const gate = new TokenGate({ tokenMint, minAmount: BigInt(0), connection });
const result = await gate.check(wallet.publicKey.toString());

if (result.balance < amountToSell) {
  throw new Error(`Insufficient balance. Have: ${result.balance}, Need: ${amountToSell}`);
}
```

### RPC Endpoint Issues

#### Choosing the Right RPC

**Development:**
```typescript
// Free tier - good for testing
const connection = new Connection('https://api.devnet.solana.com');
```

**Production:**
```typescript
// Paid RPC with higher limits
const connection = new Connection(
  `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
  {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000,
  }
);
```

#### Connection Pooling

```typescript
// Reuse connections for better performance
let connection: Connection | null = null;

function getConnection(): Connection {
  if (!connection) {
    connection = new Connection(process.env.SOLANA_RPC_URL!, {
      commitment: 'confirmed',
      disableRetryOnRateLimit: false,
    });
  }
  return connection;
}
```

## Migration Guide

### From pump.fun

Key differences:
- apps.fun uses 6 decimals (pump.fun uses 9)
- Different fee structure (1% vs 1%)
- Different graduation threshold ($69k vs $100k)

```typescript
// pump.fun (9 decimals)
const amount = 1_000_000_000; // 1 token

// apps.fun (6 decimals)
const amount = 1_000_000; // 1 token

// Migration helper
function convertPumpToApps(pumpAmount: bigint): bigint {
  return pumpAmount / BigInt(1000); // Convert 9 decimals to 6
}
```

### From Raydium/Orca

If you're using standard DEX trading:

```typescript
// Before: Using Raydium SDK
import { Liquidity } from '@raydium-io/raydium-sdk';

// After: Using apps.fun SDK
import { buyTokenDirect } from '@apps-fun/sdk';

// Simpler API, no pool setup needed
const result = await buyTokenDirect(connection, {
  tokenMint,
  amount: 0.1,
  wallet,
});
```

### From Custom Token Gates

Replace custom balance checking:

```typescript
// Before: Manual balance checking
const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
  wallet,
  { mint: tokenMint }
);
const balance = tokenAccounts.value[0]?.account.data.parsed.info.tokenAmount.uiAmount || 0;

// After: Using TokenGate
const gate = new TokenGate({ tokenMint, minAmount, connection });
const result = await gate.check(wallet);
```

## Templates

Ready-to-deploy applications:

### Available Templates

| Template | Description | Features |
|----------|-------------|----------|
| `nextjs-privy` | Next.js with Privy wallet | Email login, embedded wallets, token gating |
| `discord-bot` | Discord bot with roles | Auto-role assignment, verification commands |
| `express-api` | REST API server | Token-gated endpoints, caching, rate limiting |

### Using Templates

```bash
# Clone template
cp -r node_modules/@apps-fun/sdk/templates/nextjs-privy my-app
cd my-app

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your values

# Run development server
npm run dev
```

### Template Configuration

Each template includes:
- Complete working application
- Environment variable setup
- Deployment instructions
- Best practices implementation

## Testing

### Unit Testing Your Token Gates

```typescript
import { TokenGate } from '@apps-fun/sdk';
import { Connection, PublicKey } from '@solana/web3.js';

describe('Token Gate', () => {
  let gate: TokenGate;
  
  beforeAll(() => {
    gate = new TokenGate({
      tokenMint: new PublicKey('YOUR_TOKEN_MINT'),
      minAmount: BigInt(1_000_000),
      rpcUrl: 'https://api.devnet.solana.com',
    });
  });
  
  test('should allow access with sufficient balance', async () => {
    // Use a known wallet with tokens on devnet
    const result = await gate.check('WALLET_WITH_TOKENS');
    expect(result.allowed).toBe(true);
  });
  
  test('should deny access with insufficient balance', async () => {
    // Random wallet with no tokens
    const result = await gate.check('11111111111111111111111111111111');
    expect(result.allowed).toBe(false);
  });
});
```

### Testing on Devnet

1. Get devnet SOL:
```bash
solana airdrop 2 YOUR_WALLET_ADDRESS --url devnet
```

2. Use devnet tokens for testing:
```typescript
const connection = new Connection('https://api.devnet.solana.com');

// Test with devnet tokens
const result = await buyTokenDirect(connection, {
  tokenMint: 'DEVNET_TOKEN_MINT',
  amount: 0.1,
  wallet: testWallet,
});
```

## Support

- **Documentation**: [Full API docs](https://github.com/apps-fun/sdk)
- **Discord**: [Join community](https://discord.gg/appsfun)
- **Issues**: [Report bugs](https://github.com/apps-fun/sdk/issues)

## License

MIT