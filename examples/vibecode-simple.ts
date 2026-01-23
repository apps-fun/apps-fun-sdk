/**
 * Vibecode Examples - Agent-friendly code that just works
 * No config. No setup. Just import and go.
 */

import { hasTokens, buyTokens, getPrice, requireTokens } from '@apps-fun/sdk';

// ============================================================
// TOKEN GATING - One line to check access
// ============================================================

async function checkAccess() {
  // Check if wallet has tokens
  if (await hasTokens("wallet_address", "token_mint")) {
    console.log("Access granted!");
  }
  
  // Check with custom amount
  if (await hasTokens("wallet_address", "token_mint", 100)) {
    console.log("Premium user detected!");
  }
}

// ============================================================
// TRADING - Buy and sell in one line
// ============================================================

async function trading() {
  // Buy tokens with SOL
  const buyTx = await buyTokens("token_mint", 0.1, "private_key");
  console.log("Bought!", buyTx);
  
  // Sell tokens for SOL
  const sellTx = await sellTokens("token_mint", 1000, "private_key");
  console.log("Sold!", sellTx);
  
  // Get current price
  const price = await getPrice("token_mint");
  console.log(`Current price: ${price} SOL`);
}

// ============================================================
// EXPRESS SERVER - Token-gate your API
// ============================================================

import express from 'express';

const app = express();

// Public endpoint
app.get('/api/public', (req, res) => {
  res.json({ message: "Hello world" });
});

// Token-gated endpoint
app.get('/api/premium', 
  requireTokens("token_mint", 10),
  (req, res) => {
    res.json({ 
      message: "Welcome premium user!",
      wallet: req.tokenGate.wallet 
    });
  }
);

app.listen(3000);

// ============================================================
// REAL EXAMPLE - Gate content with Bonk
// ============================================================

const BONK_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

async function bonkGate() {
  // Check if user has 1M Bonk
  if (await hasTokens("wallet", BONK_MINT, 1_000_000)) {
    return "Access to exclusive Bonk content!";
  }
  
  return "Buy some Bonk at https://apps.fun/token/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
}

// ============================================================
// DISCORD BOT - Token verification
// ============================================================

async function discordExample(userId: string) {
  // Assume you have wallet mapping
  const getWallet = async (id: string) => "wallet_address";
  
  const { checkDiscordUser } = await import('@apps-fun/sdk');
  
  if (await checkDiscordUser(userId, "token_mint", 10, getWallet)) {
    // Grant holder role
    console.log("User verified as holder!");
  }
}

// ============================================================
// BATCH CHECK - Verify multiple wallets
// ============================================================

async function batchCheck() {
  const { checkWallets } = await import('@apps-fun/sdk');
  
  const wallets = ["wallet1", "wallet2", "wallet3"];
  const results = await checkWallets(wallets, "token_mint", 10);
  
  results.forEach(r => {
    console.log(`${r.wallet}: ${r.hasAccess ? 'YES' : 'NO'} (${r.balance} tokens)`);
  });
}

// ============================================================
// EXTERNAL WALLETS - Privy, Phantom, etc.
// ============================================================

async function externalWallet() {
  const { prepareBuy, finishTransaction } = await import('@apps-fun/sdk');
  
  // Prepare transaction
  const { transaction } = await prepareBuy("token_mint", 0.1, "wallet_address");
  
  // User signs with Privy/Phantom/etc
  const signedTx = await userWallet.sign(transaction);
  
  // Submit it
  const signature = await finishTransaction(signedTx);
  console.log("Success!", signature);
}