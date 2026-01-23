# @apps-fun/sdk

Build token-gated apps on Solana. Token gating, trading, burns, and earnings in one SDK.

## Install

```bash
npm install @apps-fun/sdk @solana/web3.js
```

## Quick Start

### Token Gating (Most Common Use Case)

```typescript
import { TokenGate } from '@apps-fun/sdk';
import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');

const gate = new TokenGate({
  tokenMint: new PublicKey('YOUR_TOKEN_MINT'),
  minAmount: BigInt(1_000_000), // 1 token (6 decimals)
  connection,
});

// Check if user has access
const result = await gate.check('USER_WALLET_ADDRESS');

if (result.allowed) {
  // User has enough tokens - grant access
} else {
  // User needs more tokens
  console.log(`Need ${result.required - result.balance} more tokens`);
}
```

### Direct Trading (No Auth Required)

```typescript
import { buyTokenDirect, sellTokenDirect } from '@apps-fun/sdk';
import { Connection, Keypair } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.fromSecretKey(/* your secret key */);

// Buy tokens with SOL
const buyResult = await buyTokenDirect(connection, {
  tokenMint: 'TOKEN_MINT_ADDRESS',
  amount: 0.1, // 0.1 SOL
  wallet,
});
console.log(`Bought tokens: ${buyResult.signature}`);

// Sell tokens for SOL
const sellResult = await sellTokenDirect(connection, {
  tokenMint: 'TOKEN_MINT_ADDRESS',
  amount: 1000, // 1000 tokens
  wallet,
});
console.log(`Sold tokens: ${sellResult.signature}`);
```

### Burn Tokens

```typescript
import { burnTokenDirect } from '@apps-fun/sdk';

const result = await burnTokenDirect(connection, {
  tokenMint: 'TOKEN_MINT_ADDRESS',
  amount: 100, // 100 tokens
  wallet,
});
console.log(`Burned: ${result.signature}`);
```

## API Reference

### Token Gating

| Function | Description |
|----------|-------------|
| `new TokenGate(config)` | Create a token gate |
| `gate.check(wallet)` | Check if wallet passes gate |
| `gate.checkBatch(wallets)` | Check multiple wallets |
| `gate.getTokenInfo()` | Get gate configuration |
| `gate.clearCache()` | Clear balance cache |

**TokenGate Config:**
```typescript
{
  tokenMint: PublicKey,      // Token to check
  minAmount: bigint,         // Minimum balance required
  connection?: Connection,   // Solana connection
  rpcUrl?: string,          // Or RPC URL string
  cacheTtlMs?: number,      // Cache duration (default: 30000)
  appId?: number,           // Optional app ID
}
```

### Direct Trading

| Function | Description |
|----------|-------------|
| `buyTokenDirect(connection, params)` | Buy tokens with SOL |
| `sellTokenDirect(connection, params)` | Sell tokens for SOL |
| `burnTokenDirect(connection, params)` | Burn tokens |
| `getPoolInfo(connection, mint)` | Get pool fee info |
| `verifyAppsFunPool(connection, mint)` | Check if apps.fun pool |
| `getPoolFeeMetrics(connection, mint)` | Get claimable fees |

**Trade Params (with Keypair):**
```typescript
{
  tokenMint: string | PublicKey,  // Token mint
  amount: number,                  // SOL (buy) or tokens (sell)
  wallet: Keypair,                // Wallet with private key
  slippageBps?: number,           // Slippage (default: 100 = 1%)
  priorityFee?: number,           // Priority fee (default: 200000)
}
```

### Privy/External Wallet Support

For wallets that don't expose private keys (Privy, etc.), use the prepare/submit pattern:

| Function | Description |
|----------|-------------|
| `prepareDirectBuy(connection, params)` | Build unsigned buy transaction |
| `prepareDirectSell(connection, params)` | Build unsigned sell transaction |
| `prepareDirectBurn(connection, params)` | Build unsigned burn transaction |
| `submitSignedTransaction(connection, signedTx)` | Submit externally-signed transaction |

```typescript
import { prepareDirectBuy, submitSignedTransaction } from '@apps-fun/sdk';

// 1. Prepare unsigned transaction
const prepared = await prepareDirectBuy(connection, {
  tokenMint: 'TOKEN_MINT',
  amount: 0.1,
  walletAddress: user.wallet.address, // Just the public key
});

// 2. Sign with Privy (shows approval popup)
const signedTx = await privyWallet.signTransaction(prepared.transaction);

// 3. Submit
const signature = await submitSignedTransaction(
  connection,
  signedTx,
  prepared.blockhash,
  prepared.lastValidBlockHeight
);
```

### Privy Wallet Limitations

**Important**: If you purchase tokens on apps.fun using a Privy embedded wallet, those tokens cannot be accessed programmatically via this SDK in standalone contexts (CLI, Node.js scripts, bots).

**Why**: Privy embedded wallets do not expose private keys. The prepare/submit pattern above only works in browser contexts where Privy's `signTransaction` method is available.

**Workarounds**:

1. **Transfer tokens** - Send tokens from your Privy wallet to an external wallet (Phantom, Backpack, etc.) that you control. Then use the SDK with that wallet's keypair.

2. **Export wallet** - Privy allows users to export their embedded wallet private key via the apps.fun UI. After export, import into another wallet or use directly with the SDK.

3. **Browser-only apps** - Use the `nextjs-privy` template for web apps where Privy signing is available.

```typescript
// This works in browser with Privy
const prepared = await prepareDirectBuy(connection, { ... });
const signed = await privyWallet.signTransaction(prepared.transaction);
await submitSignedTransaction(connection, signed);

// This does NOT work - no way to sign
const wallet = Keypair.fromSecretKey(/* can't get this from Privy */);
await buyTokenDirect(connection, { wallet, ... });
```

<!-- TODO: Future improvements for Privy wallet access

Option B: Cross-App Connect (Browser Only)
- Requires apps.fun to enable cross-app sharing in Privy dashboard
- Third-party web apps could use @privy-io/cross-app-connect package
- User approves each transaction in a popup to apps.fun domain
- See: https://docs.privy.io/guide/react/cross-app/requester

Option C: apps.fun Authenticated Trading API
- apps.fun sets up server-side authorization keys in Privy
- New API endpoint: POST /api/v1/trades/execute (server signs on behalf of user)
- SDK users authenticate via Privy, get JWT, call API
- Server uses authorization key to sign transactions for user's embedded wallet
- See: https://docs.privy.io/recipes/wallets/user-and-server-signers

Both options require changes to apps.fun infrastructure, not just the SDK.
-->

### API Client (Requires Auth)

For operations requiring authentication (via apps.fun account):

```typescript
import { AppsFunClient } from '@apps-fun/sdk';

const client = new AppsFunClient({
  cluster: 'mainnet-beta',
  apiUrl: 'https://apps.fun',
});

// Get quote (no auth)
const quote = await client.getQuote({
  mintAddress: 'TOKEN_MINT',
  amount: 1,
  inputMode: 'sol',
  side: 'buy',
});

// Get market data (no auth)
const market = await client.getMarketData('TOKEN_MINT');

// Prepare trade (requires auth)
const prepared = await client.prepareTrade(params, authToken);

// Get earnings (requires auth)
const earnings = await client.getEarnings(authToken);
```

## Examples

### Discord Bot Token Gate

```typescript
import { TokenGate } from '@apps-fun/sdk';
import { Connection, PublicKey } from '@solana/web3.js';

const gate = new TokenGate({
  tokenMint: new PublicKey(process.env.TOKEN_MINT!),
  minAmount: BigInt(process.env.MIN_TOKENS || '1000000'),
  rpcUrl: process.env.RPC_URL,
});

async function checkDiscordUser(walletAddress: string): Promise<boolean> {
  const result = await gate.check(walletAddress);
  return result.allowed;
}

// In your Discord bot command
bot.on('message', async (msg) => {
  if (msg.content === '!verify') {
    const wallet = await getLinkedWallet(msg.author.id);
    if (await checkDiscordUser(wallet)) {
      await msg.member.roles.add('Holder');
      msg.reply('Verified! You now have access.');
    } else {
      msg.reply('You need more tokens to access this server.');
    }
  }
});
```

### Next.js API Route Token Gate

```typescript
// pages/api/premium-content.ts
import { TokenGate } from '@apps-fun/sdk';
import { Connection, PublicKey } from '@solana/web3.js';

const gate = new TokenGate({
  tokenMint: new PublicKey(process.env.TOKEN_MINT!),
  minAmount: BigInt(1_000_000),
  rpcUrl: process.env.RPC_URL,
});

export default async function handler(req, res) {
  const { wallet } = req.query;

  const result = await gate.check(wallet as string);

  if (!result.allowed) {
    return res.status(403).json({
      error: 'Insufficient tokens',
      required: result.required.toString(),
      balance: result.balance.toString(),
    });
  }

  // Return premium content
  return res.json({ content: 'Secret premium content here' });
}
```

### Trading Bot

```typescript
import { buyTokenDirect, sellTokenDirect, getPoolInfo } from '@apps-fun/sdk';
import { Connection, Keypair } from '@solana/web3.js';

const connection = new Connection(process.env.RPC_URL!);
const wallet = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.WALLET_KEY!))
);

async function trade(mint: string, action: 'buy' | 'sell', amount: number) {
  // Check pool info first
  const info = await getPoolInfo(connection, mint);
  console.log(`Trading on pool with ${info.tradingFeePercent}% fee`);

  if (action === 'buy') {
    return buyTokenDirect(connection, { tokenMint: mint, amount, wallet });
  } else {
    return sellTokenDirect(connection, { tokenMint: mint, amount, wallet });
  }
}

// Buy 0.1 SOL worth of tokens
await trade('TOKEN_MINT', 'buy', 0.1);

// Sell 1000 tokens
await trade('TOKEN_MINT', 'sell', 1000);
```

## Error Handling

```typescript
import {
  AppsFunError,
  TokenNotFoundError,
  UnauthorizedError,
  InsufficientBalanceError,
  WalletNotLinkedError,
} from '@apps-fun/sdk';

try {
  await buyTokenDirect(connection, params);
} catch (err) {
  if (err instanceof InsufficientBalanceError) {
    console.log('Not enough SOL or tokens');
  } else if (err instanceof TokenNotFoundError) {
    console.log('Token pool does not exist');
  } else {
    console.error('Trade failed:', err.message);
  }
}
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SOLANA_RPC_URL` | Solana RPC endpoint | mainnet-beta |
| `APPS_FUN_API_URL` | API base URL | https://apps.fun |
| `APPS_FUN_FEE_CLAIMER` | Fee claimer address | (apps.fun default) |

### Networks

```typescript
// Mainnet
const client = new AppsFunClient({ cluster: 'mainnet-beta' });

// Devnet
const client = new AppsFunClient({ cluster: 'devnet' });

// Custom RPC
const client = new AppsFunClient({
  rpc: 'https://your-rpc-provider.com'
});
```

## Fee Structure

All trades on apps.fun pools have a 1% trading fee:
- 50% goes to the platform (apps.fun)
- 50% goes to the token creator

Fees are collected automatically at the protocol level and cannot be bypassed.

## TypeScript

Full TypeScript support with exported types:

```typescript
import type {
  TokenGateConfig,
  GateResult,
  DirectTradeParams,
  DirectTradeResult,
  PoolInfo,
  QuoteParams,
  QuoteResult,
  MarketData,
} from '@apps-fun/sdk';
```

## App Templates

Ready-to-use starter templates in `templates/`:

| Template | Description |
|----------|-------------|
| `nextjs-privy` | Next.js app with Privy embedded wallets |
| `discord-bot` | Discord bot with role-based token gating |
| `express-api` | REST API with token-gated endpoints |

```bash
# Copy a template
cp -r node_modules/@apps-fun/sdk/templates/nextjs-privy my-app
cd my-app
npm install
cp .env.example .env.local
npm run dev
```

## License

MIT
# apps-fun-sdk
