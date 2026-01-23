# Quick Start: Your First Token-Gated App in 5 Minutes

This guide gets you running with a token-gated app in under 5 minutes.

## Prerequisites Check

```bash
# Check Node.js (need v16+)
node --version

# Check npm
npm --version

# If missing, install from https://nodejs.org
```

## Step 1: Create Your Project (30 seconds)

```bash
mkdir my-token-app
cd my-token-app
npm init -y
npm install @apps-fun/sdk @solana/web3.js dotenv
```

## Step 2: Get a Token to Gate With (1 minute)

### Option A: Use Our Test Token (Instant)
```javascript
// Use this test token on mainnet
const TEST_TOKEN_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"; // Bonk token
```

### Option B: Get Any Token from apps.fun
1. Go to https://apps.fun
2. Click any token
3. Copy the mint address from the URL or page

## Step 3: Create Your Token Gate (2 minutes)

Create `index.js`:

```javascript
// Load environment variables
require('dotenv').config();

const { TokenGate } = require('@apps-fun/sdk');
const { PublicKey } = require('@solana/web3.js');

// Configuration
const TOKEN_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"; // Bonk
const MIN_TOKENS = 1000000; // 1 Bonk (6 decimals)

// Create gate
const gate = new TokenGate({
  tokenMint: new PublicKey(TOKEN_MINT),
  minAmount: BigInt(MIN_TOKENS),
  // Uses free public RPC by default
});

// Check function
async function checkWalletAccess(walletAddress) {
  try {
    const result = await gate.check(walletAddress);
    
    if (result.allowed) {
      console.log("✅ ACCESS GRANTED!");
      console.log(`   Balance: ${result.balance / BigInt(1000000)} tokens`);
      return true;
    } else {
      console.log("❌ ACCESS DENIED");
      const needed = (result.required - result.balance) / BigInt(1000000);
      console.log(`   Need ${needed} more tokens`);
      console.log(`   Buy here: https://apps.fun/token/${TOKEN_MINT}`);
      return false;
    }
  } catch (error) {
    console.error("Error checking wallet:", error.message);
    return false;
  }
}

// Example usage
async function main() {
  // Test with a random wallet (will fail)
  console.log("Testing with empty wallet:");
  await checkWalletAccess("11111111111111111111111111111111");
  
  console.log("\n" + "=".repeat(50) + "\n");
  
  // Test with Bonk treasury (will pass)
  console.log("Testing with Bonk treasury:");
  await checkWalletAccess("BJZADvWStGamUr5siokM6ip2SZhGRuY3hVHNi66W5tcB");
}

// Run the demo
main();
```

## Step 4: Run Your App (30 seconds)

```bash
node index.js
```

You should see:
```
Testing with empty wallet:
❌ ACCESS DENIED
   Need 1 more tokens
   Buy here: https://apps.fun/token/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263

==================================================

Testing with Bonk treasury:
✅ ACCESS GRANTED!
   Balance: 183799439339 tokens
```

## Step 5: Add to Your Web App (1 minute)

### Express.js API Example

Create `server.js`:

```javascript
const express = require('express');
const { TokenGate } = require('@apps-fun/sdk');
const { PublicKey } = require('@solana/web3.js');

const app = express();
const PORT = 3000;

// Setup gate
const gate = new TokenGate({
  tokenMint: new PublicKey("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"),
  minAmount: BigInt(1000000), // 1 Bonk
  cacheTtlMs: 60000, // Cache for 1 minute to reduce RPC calls
});

// Token-gated endpoint
app.get('/api/premium/:wallet', async (req, res) => {
  const { wallet } = req.params;
  
  try {
    const result = await gate.check(wallet);
    
    if (result.allowed) {
      res.json({
        access: true,
        message: "Welcome to premium content!",
        secretData: "This is only visible to token holders"
      });
    } else {
      res.status(403).json({
        access: false,
        message: "You need tokens to access this",
        required: result.required.toString(),
        balance: result.balance.toString()
      });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to verify wallet" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Test: http://localhost:${PORT}/api/premium/YOUR_WALLET_HERE`);
});
```

Run it:
```bash
node server.js
```

## Common Issues & Solutions

### "429 Too Many Requests"
You're hitting RPC limits. Solutions:
1. Add caching (already included in examples)
2. Get a free RPC from [Helius](https://helius.dev)
3. Add to `.env`:
```
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
```

### "Invalid public key"
Make sure the wallet address is a valid Solana address (base58 string, ~44 characters).

### "Connection timeout"
The free RPC might be slow. Try again or get a better RPC endpoint.

## Next Steps

### 1. Use Your Own Token
1. Go to https://apps.fun
2. Click "Launch Token"
3. Pay ~0.02 SOL to create
4. Use your token's mint address

### 2. Add Trading
```javascript
const { buyTokenDirect } = require('@apps-fun/sdk');
const { Keypair } = require('@solana/web3.js');

// Buy tokens (requires private key)
const wallet = Keypair.fromSecretKey(/* your key */);
await buyTokenDirect(connection, {
  tokenMint: TOKEN_MINT,
  amount: 0.1, // Buy with 0.1 SOL
  wallet
});
```

### 3. Production Setup

**Environment Variables** (`.env`):
```bash
# Required
SOLANA_RPC_URL=https://your-rpc-provider.com
TOKEN_MINT=YOUR_TOKEN_MINT_ADDRESS
MIN_TOKENS=1000000

# For trading (NEVER expose in frontend!)
WALLET_PRIVATE_KEY=[1,2,3,...] # JSON array
```

**Better RPC Providers**:
- [Helius](https://helius.dev) - 100k requests/day free
- [QuickNode](https://quicknode.com) - Free tier available
- [Alchemy](https://alchemy.com) - Free tier available

### 4. Full Examples

Check out the `/templates` folder:
- `nextjs-privy` - Full Next.js app with wallet connection
- `discord-bot` - Discord bot with automatic roles
- `express-api` - Production-ready API server

## That's It! 🎉

You now have a working token-gated app. Total time: ~5 minutes.

**What you built**:
- ✅ Token balance checking
- ✅ Access control based on ownership
- ✅ Cached requests for performance
- ✅ Ready to deploy

**Questions?** Join [Discord](https://discord.gg/appsfun) or check the [full docs](README.md).