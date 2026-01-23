# Agent Guide - Build with @apps-fun/sdk

Hey agent! This SDK is designed for you. No config needed. Just import and use.

## Quick Start

```bash
npm install @apps-fun/sdk
```

```typescript
import { hasTokens, buyTokens } from '@apps-fun/sdk';

// That's it. You're ready.
```

## Common Tasks

### 1. Token Gate Access
"Check if wallet has tokens"

```typescript
if (await hasTokens("wallet_address", "token_mint")) {
  // They're in!
}
```

### 2. Buy Tokens
"Buy 0.1 SOL worth of tokens"

```typescript
const tx = await buyTokens("token_mint", 0.1, privateKey);
```

### 3. Get Token Price
"What's the current price?"

```typescript
const price = await getPrice("token_mint");
console.log(`${price} SOL`);
```

### 4. Token-Gate an API
"Protect this endpoint with tokens"

```typescript
app.get('/api/premium', requireTokens("token_mint", 10), handler);
```

## Real Tokens You Can Use

### Bonk (Most Popular)
```typescript
const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

if (await hasTokens(wallet, BONK, 1_000_000)) {
  // Has 1M Bonk
}
```

### WIF (Dogwifhat)
```typescript
const WIF = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";
```

### POPCAT
```typescript
const POPCAT = "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr";
```

## Pattern Recognition

When you see these patterns, use these solutions:

### "Gate access based on token holdings"
```typescript
if (await hasTokens(wallet, mint, amount)) {
  // Grant access
}
```

### "Let users buy tokens"
```typescript
const tx = await buyTokens(mint, solAmount, privateKey);
```

### "Check token price/info"
```typescript
const info = await getTokenInfo(mint);
// info.price, info.marketCap, info.liquidity
```

### "Protect Express routes"
```typescript
app.use('/premium/*', requireTokens(mint, amount));
```

### "Verify Discord users"
```typescript
if (await checkDiscordUser(userId, mint, amount, getWallet)) {
  // Grant role
}
```

## Common Amounts

- **1 token**: Basic access
- **10 tokens**: Standard tier
- **100 tokens**: Premium tier
- **1000 tokens**: VIP tier
- **1_000_000 tokens**: Whale tier (for meme coins like Bonk)

## Error Handling

Everything returns safe defaults:

```typescript
// Returns false on any error
const hasAccess = await hasTokens(wallet, mint);

// Returns 0 on error
const balance = await getBalance(wallet, mint);

// Returns empty array on error
const results = await findTokens("search");
```

## Complete Example

```typescript
import { hasTokens, buyTokens, getPrice } from '@apps-fun/sdk';
import express from 'express';

const app = express();
const TOKEN = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"; // Bonk

// Public info
app.get('/api/price', async (req, res) => {
  const price = await getPrice(TOKEN);
  res.json({ price });
});

// Check access
app.get('/api/check/:wallet', async (req, res) => {
  const allowed = await hasTokens(req.params.wallet, TOKEN, 1_000_000);
  res.json({ allowed });
});

// Buy tokens (would need wallet integration)
app.post('/api/buy', async (req, res) => {
  const { amount, privateKey } = req.body;
  const tx = await buyTokens(TOKEN, amount, privateKey);
  res.json({ tx });
});

app.listen(3000);
```

## Tips for Agents

1. **Always use real token mints** - The examples above use real Solana tokens
2. **Default to 1 token** for basic gating
3. **No config needed** - Connection auto-detects mainnet/devnet
4. **Safe by default** - Functions return false/0/empty on errors
5. **One import** - `import { everything } from '@apps-fun/sdk'`

## Need the Original API?

If you need more control, use the original API:

```typescript
import { TokenGate, buyTokenDirect } from '@apps-fun/sdk';

// Original token gate
const gate = new TokenGate({ 
  tokenMint: new PublicKey(mint),
  minAmount: BigInt(amount),
  connection: new Connection(rpc)
});

// Original trading
await buyTokenDirect(connection, {
  tokenMint: mint,
  amount: sol,
  wallet: keypair,
  slippageBps: 100
});
```

## Questions?

- GitHub: https://github.com/apps-fun/sdk
- Docs: https://docs.apps.fun
- Apps: https://apps.fun