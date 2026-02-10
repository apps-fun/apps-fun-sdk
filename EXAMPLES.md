# Integration Examples

Proof-of-concept integrations showing how the SDK composes for real applications. Every function call matches the actual API. See [EVM_API.md](./EVM_API.md) for full parameter details.

## Table of Contents

- [1. Token-Gated SaaS API](#1-token-gated-saas-api)
- [2. Community Rewards Platform](#2-community-rewards-platform)
- [3. Deflationary Game Economy](#3-deflationary-game-economy)
- [4. Multi-Chain Access Gateway](#4-multi-chain-access-gateway)
- [5. Portfolio and Analytics Dashboard](#5-portfolio-and-analytics-dashboard)

---

## 1. Token-Gated SaaS API

Express server with tiered access, per-request token charges, and a revenue dashboard. Uses EVM (Base).

**What it demonstrates:**
- `requireTokens` middleware for tiered gating
- `createPaymentFlow` + `chargeTokens` middleware for per-request charges
- `canAfford` / `hasApproval` pre-flight checks
- `getRevenue` for operator analytics
- `getDistributions` for payment history

```typescript
import express from 'express';
import evmVibe, {
  requireTokens,
  chargeTokens,
} from '@apps-fun/sdk/evm/vibecode';

const app = express();
app.use(express.json());

const TOKEN = '0xYOUR_TOKEN_ADDRESS';
const CREATOR = '0xYOUR_CREATOR_WALLET';

// --- Tiered Access ---

// Free tier: just hold 1 token
app.get('/api/free',
  requireTokens(TOKEN, 1),
  (req, res) => {
    res.json({ tier: 'free', data: 'Basic content' });
  }
);

// Premium tier: hold 100 tokens
app.get('/api/premium',
  requireTokens(TOKEN, 100),
  (req, res) => {
    res.json({ tier: 'premium', data: 'Premium content' });
  }
);

// VIP tier: hold 10000 tokens
app.get('/api/vip',
  requireTokens(TOKEN, 10000),
  (req, res) => {
    res.json({ tier: 'vip', data: 'VIP content' });
  }
);

// --- Per-Request Charges ---

// Create a payment flow: 50% burned, 50% to creator
const chargeFlow = evmVibe.createPaymentFlow({
  token: TOKEN,
  amount: 10,           // 10 tokens per API call
  burn: 50,             // 50% burned
  creator: {
    address: CREATOR,
    share: 50,           // 50% to creator
  },
});

// Paid endpoint: charges 10 tokens per call
// Requires the app wallet to execute the flow
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

const appAccount = privateKeyToAccount(
  process.env.APP_PRIVATE_KEY as `0x${string}`
);
const appWalletClient = createWalletClient({
  account: appAccount,
  chain: base,
  transport: http(),
});

app.post('/api/generate',
  chargeTokens(chargeFlow, appWalletClient),
  (req, res) => {
    // req.tokenPayment is set by chargeTokens middleware:
    // { wallet, charged: 10, steps: [{ action: 'burn', hash: '0x...' }, ...] }
    res.json({
      result: 'Generated content',
      payment: req.tokenPayment,
    });
  }
);

// --- Pre-Flight Check ---

app.get('/api/can-use', async (req, res) => {
  const wallet = req.query.wallet as string;
  if (!wallet) {
    return res.status(400).json({ error: 'wallet required' });
  }

  const [affordable, approved] = await Promise.all([
    evmVibe.canAfford(chargeFlow, wallet),
    evmVibe.hasApproval(chargeFlow, wallet, appAccount.address),
  ]);

  res.json({ affordable, approved });
});

// --- Revenue Dashboard ---

app.get('/api/admin/revenue', async (req, res) => {
  const revenue = await evmVibe.getRevenue(TOKEN);
  // { totalETH: 4.2, totalDistributions: 5, uniqueRecipients: 10 }

  const distributions = await evmVibe.getDistributions(TOKEN);
  // [{ distributionId, total, isETH, txHash, block }, ...]

  res.json({ revenue, distributions });
});

app.listen(3000);
```

---

## 2. Community Rewards Platform

Holder snapshots, proportional ETH airdrops, referral program, and burn analytics. Uses EVM (Base).

**What it demonstrates:**
- `getHolders` for holder snapshots
- `airdropToHolders` for proportional ETH distribution
- `createReferralFlow` (low-level) for referral splits
- `getReferralEarnings` for referral tracking
- `getBurnHistory` + `getCirculatingSupply` for burn analytics

```typescript
import express from 'express';
import evmVibe from '@apps-fun/sdk/evm/vibecode';
import { createReferralFlow } from '@apps-fun/sdk';

const app = express();
app.use(express.json());

const TOKEN = '0xYOUR_TOKEN_ADDRESS';
const CREATOR = '0xYOUR_CREATOR_WALLET';

// --- Holder Snapshots ---

app.get('/api/holders', async (req, res) => {
  const holders = await evmVibe.getHolders(TOKEN);
  // Sorted by balance descending. Excludes zero address, dead address, zero balances.
  // [{ address: '0xaaa...', balance: 50000 }, { address: '0xbbb...', balance: 30000 }]

  res.json({
    count: holders.length,
    holders,
    totalHeld: holders.reduce((sum, h) => sum + h.balance, 0),
  });
});

// --- Proportional ETH Airdrop ---

import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

const operatorAccount = privateKeyToAccount(
  process.env.OPERATOR_KEY as `0x${string}`
);
const operatorWallet = createWalletClient({
  account: operatorAccount,
  chain: base,
  transport: http(),
});

// Distributes ETH to all holders proportionally based on their token balance.
// Holders with larger balances receive proportionally more ETH.
app.post('/api/airdrop', async (req, res) => {
  const { totalETH, distributionId } = req.body;

  try {
    const hash = await evmVibe.airdropToHolders(
      TOKEN,
      distributionId,    // unique ID for this distribution
      totalETH,          // e.g. 5.0 for 5 ETH
      operatorWallet,
    );
    // Internally: fetches holders, computes share = (balance * total) / totalHeld,
    // filters zero shares, calls MultiSend contract.

    res.json({ hash });
  } catch (err: any) {
    // Throws 'No holders found for token' if no holders
    // Throws 'No recipients with non-zero share' if all shares round to 0
    res.status(400).json({ error: err.message });
  }
});

// --- Referral Program ---

// Create a referral-aware payment flow from a base flow.
// Uses the low-level API to transform splits.
const baseFlow = evmVibe.createPaymentFlow({
  token: TOKEN,
  amount: 50,
  burn: 40,
  creator: { address: CREATOR, share: 60 },
});

app.post('/api/pay-with-referral', async (req, res) => {
  const { userWallet, referrerAddress } = req.body;

  // createReferralFlow scales existing splits proportionally to make room.
  // 1000 bps = 10% to referrer.
  // Existing 40% burn -> 36%, existing 60% creator -> 54%, referrer -> 10%.
  const referralFlow = createReferralFlow(baseFlow, referrerAddress, 1000);

  const result = await evmVibe.chargeUser(
    referralFlow,
    userWallet,
    operatorWallet,
  );

  res.json({ success: result.success, steps: result.steps });
});

// --- Referral Earnings ---

app.get('/api/referral/:address', async (req, res) => {
  const earnings = await evmVibe.getReferralEarnings(
    req.params.address,
    TOKEN,               // filter by this token (optional)
  );
  // { totalETH: 1.5, payments: 12 }

  res.json(earnings);
});

// --- Burn Analytics ---

app.get('/api/burns', async (req, res) => {
  const [history, supply] = await Promise.all([
    evmVibe.getBurnHistory(TOKEN),
    evmVibe.getCirculatingSupply(TOKEN),
  ]);

  // history: [{ from: '0x...', amount: 500, block: 123456, txHash: '0x...' }, ...]
  // supply: { totalSupply: 1000000, burned: 125000, circulating: 875000, burnPercent: 12.5 }

  res.json({
    burnHistory: history,
    supply,
    totalBurnEvents: history.length,
  });
});

app.listen(3000);
```

---

## 3. Deflationary Game Economy

In-game purchases with configurable burn/distribute splits, automated buyback-and-burn, and supply tracking. Uses EVM (Base).

**What it demonstrates:**
- `createPaymentFlow` with burn + distribute splits
- `chargeUser` for in-game purchases
- `buybackAndBurnTokens` for treasury-funded deflation
- `getCirculatingSupply` + `getPercentBurned` for live supply tracking
- `watchTokenDistributions` for real-time event feed
- Flow presets (`deflationaryFlow`, `revenueShareFlow`)

```typescript
import express from 'express';
import evmVibe, {
  deflationaryFlow,
  revenueShareFlow,
} from '@apps-fun/sdk/evm/vibecode';
import { parseUnits, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

const app = express();
app.use(express.json());

const TOKEN = '0xYOUR_GAME_TOKEN';
const CREATOR = '0xYOUR_TREASURY';

const treasuryAccount = privateKeyToAccount(
  process.env.TREASURY_KEY as `0x${string}`
);
const treasuryWallet = createWalletClient({
  account: treasuryAccount,
  chain: base,
  transport: http(),
});

// --- In-Game Purchases ---

// Consumable item: 100% burned (deflationary pressure)
const consumableFlow = evmVibe.createPaymentFlow({
  token: TOKEN,
  amount: 25,            // 25 tokens per item
  burn: 100,             // 100% burned
});

// Premium item: 50% to creator, 25% burn, 25% distributed as ETH to holders
const premiumFlow = evmVibe.createPaymentFlow({
  token: TOKEN,
  amount: 500,           // 500 tokens
  burn: 25,
  creator: { address: CREATOR, share: 50 },
  distribute: 25,
});

app.post('/api/game/buy-consumable', async (req, res) => {
  const { wallet } = req.body;

  const affordable = await evmVibe.canAfford(consumableFlow, wallet);
  if (!affordable) {
    return res.status(402).json({ error: 'Not enough tokens' });
  }

  const result = await evmVibe.chargeUser(consumableFlow, wallet, treasuryWallet);
  res.json({ success: result.success, steps: result.steps });
});

app.post('/api/game/buy-premium', async (req, res) => {
  const { wallet, holders } = req.body;
  // holders: list of addresses to receive ETH distribution

  const result = await evmVibe.chargeUser(premiumFlow, wallet, treasuryWallet, {
    distributionId: Date.now(),    // unique per purchase
    recipients: holders,           // required for 'distribute' split
  });

  res.json({ success: result.success, steps: result.steps });
});

// --- Using Flow Presets ---

// Presets use the low-level API with bigint amounts.
// deflationaryFlow: 100% burn
const lootBoxFlow = deflationaryFlow({
  token: TOKEN as `0x${string}`,
  chargeAmount: parseUnits('100', 18),   // 100 tokens
});

// revenueShareFlow: 50% creator, 25% burn, 25% distribute
const battlePassFlow = revenueShareFlow({
  token: TOKEN as `0x${string}`,
  creatorAddress: CREATOR as `0x${string}`,
  chargeAmount: parseUnits('1000', 18),  // 1000 tokens
});

// --- Treasury Buyback and Burn ---

// Treasury uses ETH to buy tokens on the AMM, then immediately burns them.
app.post('/api/admin/buyback-burn', async (req, res) => {
  const { ethAmount } = req.body;

  const result = await evmVibe.buybackAndBurnTokens(
    TOKEN,
    ethAmount,           // e.g. 0.5 for 0.5 ETH
    treasuryWallet,
    'base',
    { slippage: 3 },     // 3% slippage tolerance
  );

  // { buyHash: '0x...', burnHash: '0x...', tokensBurned: 12500 }
  res.json(result);
});

// --- Live Supply Dashboard ---

app.get('/api/game/supply', async (req, res) => {
  const [supply, percentBurned, supplyInfo] = await Promise.all([
    evmVibe.getCirculatingSupply(TOKEN),
    evmVibe.getPercentBurned(TOKEN),
    evmVibe.getSupply(TOKEN),
  ]);

  // supply: { totalSupply, burned, circulating, burnPercent }
  // percentBurned: number (e.g. 12.5)
  // supplyInfo: { totalSupply, decimals }

  res.json({
    ...supply,
    decimals: supplyInfo.decimals,
    percentBurned,
  });
});

// --- Real-Time Event Feed ---

// Watch for distribution events (e.g. from premium item purchases).
const unwatch = evmVibe.watchTokenDistributions(
  TOKEN,
  (log) => {
    // log: { distributionId, total, isETH, txHash }
    console.log(
      `Distribution #${log.distributionId}: ${log.total} ${log.isETH ? 'ETH' : 'tokens'}`
    );
  },
);

// Call unwatch() to stop listening.

app.listen(3000);
```

---

## 4. Multi-Chain Access Gateway

Single Express server that gates routes using both Solana and EVM tokens. Users authenticate with whichever chain they hold tokens on.

**What it demonstrates:**
- Solana `hasTokens` + `getBalance` + `requireTokens` middleware
- EVM `hasTokens` + `getBalance` + `requireTokens` middleware
- Side-by-side usage of both chains in one server
- Solana `getTokenInfo` for token metadata

```typescript
import express from 'express';
// Solana vibecode (named exports)
import {
  hasTokens as solHasTokens,
  getBalance as solGetBalance,
  getTokenInfo as solGetTokenInfo,
  requireTokens as solRequireTokens,
} from '@apps-fun/sdk';
// EVM vibecode
import evmVibe, {
  requireTokens as evmRequireTokens,
} from '@apps-fun/sdk/evm/vibecode';

const app = express();
app.use(express.json());

const SOL_TOKEN = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'; // Bonk
const EVM_TOKEN = '0xYOUR_EVM_TOKEN';

// --- Chain-Specific Gated Routes ---

// Solana-gated route: requires 1M Bonk
// Reads wallet from ?wallet= or X-Wallet-Address header
app.get('/api/solana/premium',
  solRequireTokens(SOL_TOKEN, 1_000_000),
  (req, res) => {
    res.json({ chain: 'solana', access: 'granted' });
  }
);

// EVM-gated route: requires 100 tokens on Base
app.get('/api/evm/premium',
  evmRequireTokens(EVM_TOKEN, 100),
  (req, res) => {
    res.json({ chain: 'evm', access: 'granted' });
  }
);

// --- Multi-Chain Check ---

// Solana wallets are base58, EVM wallets are 0x-prefixed hex.
// Accept separate query params for each chain.
app.get('/api/check', async (req, res) => {
  const solWallet = req.query.solWallet as string | undefined;
  const evmWallet = req.query.evmWallet as string | undefined;

  if (!solWallet && !evmWallet) {
    return res.status(400).json({ error: 'Provide ?solWallet= and/or ?evmWallet=' });
  }

  const [solAccess, evmAccess] = await Promise.all([
    solWallet ? solHasTokens(solWallet, SOL_TOKEN, 1_000_000) : Promise.resolve(false),
    evmWallet ? evmVibe.hasTokens(evmWallet, EVM_TOKEN, 100) : Promise.resolve(false),
  ]);

  res.json({
    solana: {
      hasAccess: solAccess,
      token: SOL_TOKEN,
      required: 1_000_000,
    },
    evm: {
      hasAccess: evmAccess,
      token: EVM_TOKEN,
      required: 100,
    },
    anyChainAccess: solAccess || evmAccess,
  });
});

// --- Multi-Chain Balance ---

app.get('/api/balance', async (req, res) => {
  const solWallet = req.query.solWallet as string | undefined;
  const evmWallet = req.query.evmWallet as string | undefined;

  const [solBalance, evmBalance] = await Promise.all([
    solWallet ? solGetBalance(solWallet, SOL_TOKEN) : Promise.resolve(0),
    evmWallet ? evmVibe.getBalance(evmWallet, EVM_TOKEN) : Promise.resolve(0),
  ]);

  res.json({
    solana: { token: SOL_TOKEN, balance: solBalance },
    evm: { token: EVM_TOKEN, balance: evmBalance },
  });
});

// --- Solana Token Info ---

app.get('/api/solana/token-info', async (req, res) => {
  const info = await solGetTokenInfo(SOL_TOKEN);
  // { price, marketCap, liquidity, volume, holders: 0, graduated, buyLink }
  // Note: holders is always 0 (not available from the API)
  res.json(info);
});

// --- Either-Chain Middleware ---

// Custom middleware: grant access if user holds tokens on EITHER chain.
// Reads solWallet and evmWallet from query params or headers.
function requireEitherChain(solToken: string, solMin: number, evmToken: string, evmMin: number) {
  return async (req: any, res: any, next: any) => {
    const solWallet = req.query.solWallet || req.headers['x-solana-wallet'];
    const evmWallet = req.query.evmWallet || req.headers['x-evm-wallet'];

    if (!solWallet && !evmWallet) {
      return res.status(400).json({ error: 'Provide solWallet and/or evmWallet' });
    }

    const [sol, evm] = await Promise.all([
      solWallet ? solHasTokens(solWallet, solToken, solMin) : Promise.resolve(false),
      evmWallet ? evmVibe.hasTokens(evmWallet, evmToken, evmMin) : Promise.resolve(false),
    ]);

    if (!sol && !evm) {
      return res.status(403).json({
        error: 'Insufficient tokens on either chain',
        solana: { token: solToken, required: solMin },
        evm: { token: evmToken, required: evmMin },
      });
    }

    req.tokenGate = {
      wallet: sol ? solWallet : evmWallet,
      chain: sol ? 'solana' : 'evm',
      verified: true,
    };
    next();
  };
}

app.get('/api/universal/content',
  requireEitherChain(SOL_TOKEN, 1_000_000, EVM_TOKEN, 100),
  (req, res) => {
    res.json({
      content: 'Accessible to holders on either chain',
      authenticatedVia: req.tokenGate.chain,
    });
  }
);

app.listen(3000);
```

---

## 5. Portfolio and Analytics Dashboard

Multi-token portfolio tracker with burn history, revenue stats, and real-time event monitoring. Uses EVM (Base).

**What it demonstrates:**
- `getPortfolio` for multi-token balance + ETH valuation
- `getBurnHistory` for burn event timeline
- `getCirculatingSupply` for supply breakdown
- `getRevenue` for aggregated revenue stats
- `getDistributions` for distribution history
- `watchTokenDistributions` for real-time updates
- `getHolders` for holder distribution analysis
- `isReadyToGraduate` + `getTokenCreator` + `getPairAddress` for token metadata

```typescript
import express from 'express';
import evmVibe from '@apps-fun/sdk/evm/vibecode';

const app = express();

// --- Portfolio View ---

// Returns balance and ETH value for each token in a wallet.
app.get('/api/portfolio/:wallet', async (req, res) => {
  const tokens = (req.query.tokens as string || '').split(',').filter(Boolean);

  if (tokens.length === 0) {
    return res.status(400).json({ error: 'Pass ?tokens=0xA,0xB,0xC' });
  }

  const portfolio = await evmVibe.getPortfolio(req.params.wallet, tokens);
  // [{ token: '0xA', balance: 1000, ethValue: 0.5 }, ...]
  // Tokens that fail to fetch are excluded. Zero-balance tokens have ethValue: 0.

  const totalETH = portfolio.reduce((sum, p) => sum + p.ethValue, 0);

  res.json({
    wallet: req.params.wallet,
    positions: portfolio,
    totalETHValue: totalETH,
    tokenCount: portfolio.length,
  });
});

// --- Token Analytics ---

app.get('/api/analytics/:token', async (req, res) => {
  const token = req.params.token;

  const [
    supply,
    burnHistory,
    revenue,
    distributions,
    holders,
  ] = await Promise.all([
    evmVibe.getCirculatingSupply(token),
    evmVibe.getBurnHistory(token),
    evmVibe.getRevenue(token),
    evmVibe.getDistributions(token),
    evmVibe.getHolders(token),
  ]);

  res.json({
    supply: {
      total: supply.totalSupply,
      circulating: supply.circulating,
      burned: supply.burned,
      burnPercent: supply.burnPercent,
    },
    burns: {
      count: burnHistory.length,
      totalBurned: burnHistory.reduce((sum, b) => sum + b.amount, 0),
      recent: burnHistory.slice(-10),   // last 10 burns
    },
    revenue: {
      totalETH: revenue.totalETH,
      distributions: revenue.totalDistributions,
      uniqueRecipients: revenue.uniqueRecipients,
    },
    distributionHistory: distributions.slice(-20),  // last 20
    holders: {
      count: holders.length,
      top10: holders.slice(0, 10),
      totalHeld: holders.reduce((sum, h) => sum + h.balance, 0),
    },
  });
});

// --- Token Metadata ---

app.get('/api/token/:token', async (req, res) => {
  const token = req.params.token;

  const [
    canGraduate,
    creator,
    pair,
    supplyInfo,
    percentBurned,
  ] = await Promise.all([
    evmVibe.isReadyToGraduate(token),
    evmVibe.getTokenCreator(token),
    evmVibe.getPairAddress(token),
    evmVibe.getSupply(token),
    evmVibe.getPercentBurned(token),
  ]);

  res.json({
    token,
    creator,
    pair,
    totalSupply: supplyInfo.totalSupply,
    decimals: supplyInfo.decimals,
    percentBurned,
    canGraduate,
  });
});

// --- Real-Time Distribution Feed (SSE) ---

app.get('/api/stream/:token', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const unwatch = evmVibe.watchTokenDistributions(
    req.params.token,
    (log) => {
      res.write(`data: ${JSON.stringify(log)}\n\n`);
    },
  );

  req.on('close', () => {
    unwatch();
  });
});

// --- Holder Distribution Analysis ---

app.get('/api/holders/:token/distribution', async (req, res) => {
  const holders = await evmVibe.getHolders(req.params.token);

  if (holders.length === 0) {
    return res.json({ holders: 0, distribution: {} });
  }

  const totalHeld = holders.reduce((sum, h) => sum + h.balance, 0);

  // Concentration metrics
  const top1Pct = holders.slice(0, Math.max(1, Math.floor(holders.length * 0.01)));
  const top10Pct = holders.slice(0, Math.max(1, Math.floor(holders.length * 0.1)));

  res.json({
    totalHolders: holders.length,
    totalHeld,
    top1PercentHolders: top1Pct.length,
    top1PercentShare: top1Pct.reduce((s, h) => s + h.balance, 0) / totalHeld * 100,
    top10PercentHolders: top10Pct.length,
    top10PercentShare: top10Pct.reduce((s, h) => s + h.balance, 0) / totalHeld * 100,
    largestHolder: holders[0],
    smallestHolder: holders[holders.length - 1],
  });
});

app.listen(3000);
```

---

## Common Patterns

### Wallet Authentication

All middleware reads the wallet address from either the query string or a header:

```
GET /api/premium?wallet=0xYOUR_WALLET
```

or

```
GET /api/premium
X-Wallet-Address: 0xYOUR_WALLET
```

### Error Responses

| Status | Meaning | Example |
|--------|---------|---------|
| 400 | Missing wallet | `{ error: 'Wallet address required' }` |
| 402 | Cannot afford | `{ error: 'Insufficient token balance', required: 10 }` |
| 403 | Insufficient tokens | `{ error: 'Insufficient tokens', required: 100 }` |
| 500 | Payment failed | `{ error: 'Payment failed', message: '...' }` |

### Environment Variables

```bash
# EVM operator/treasury wallet (private key, never in frontend)
APP_PRIVATE_KEY=0x...
OPERATOR_KEY=0x...
TREASURY_KEY=0x...

# Optional: custom RPC endpoints
BASE_RPC_URL=https://mainnet.base.org
SEPOLIA_RPC_URL=https://rpc.sepolia.org

# Optional: contract address overrides for Base
BASE_APPSFUN_ADDRESS=0x...
BASE_FEEHOLDER_ADDRESS=0x...
BASE_MULTISEND_ADDRESS=0x...
```

### ERC20 Approval Requirement

Payment flows that use `chargeUser` require the user to have called ERC20 `approve` on the token contract, granting the app wallet permission to spend their tokens. Check with `hasApproval` before charging:

```typescript
const approved = await evmVibe.hasApproval(flow, userWallet, appWalletAddress);
if (!approved) {
  // Prompt user to approve the app wallet for this token
}
```

### Network Selection

All vibecode functions default to `'base'`. Pass `'sepolia'` for testnet:

```typescript
// Base (default)
await evmVibe.getHolders('0xTOKEN');

// Sepolia
await evmVibe.getHolders('0xTOKEN', 'sepolia');
```

### 18-Decimal Assumption

`hasTokens`, `getBalance`, `burnTokens`, and `sendTokens` in the vibecode API hardcode 18 decimals for amount conversion. For tokens with non-18 decimals (e.g. USDC with 6), these functions will produce incorrect results. Use the low-level API with explicit decimal handling instead:

```typescript
import { getEVMPublicClient, getEVMTokenBalance, getEVMTokenDecimals } from '@apps-fun/sdk';

const client = getEVMPublicClient('base');
const [rawBalance, decimals] = await Promise.all([
  getEVMTokenBalance(client, tokenAddress, walletAddress),
  getEVMTokenDecimals(client, tokenAddress),
]);
const balance = Number(rawBalance) / 10 ** decimals;
```

Functions that fetch decimals on-chain and handle them correctly: `getHolders`, `getBurnHistory`, `getCirculatingSupply`, `getSupply`, `getPortfolio`, `getPercentBurned`.
