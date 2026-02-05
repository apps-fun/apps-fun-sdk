# @apps-fun/sdk Agent Instructions

## Identity

SDK for building token-gated applications on Solana and EVM chains (Base, Sepolia, Ethereum mainnet) using apps.fun bonding curves. Supports token gating, trading, token payment flows, ETH/ERC20 distributions, holder snapshots, proportional airdrops, referral tracking, portfolio views, and burn analytics.

## Which API to Use

**Prefer the vibecode API.** It accepts plain strings and numbers, handles client setup internally, and returns human-readable values. Use the low-level API only when you need typed addresses, bigint amounts, or direct client control.

| Need | Solana | EVM |
|------|--------|-----|
| Import | `import { hasTokens } from '@apps-fun/sdk'` | `import evmVibe from '@apps-fun/sdk/evm/vibecode'` |
| Peer dep | `@solana/web3.js` | `viem` |
| Default network | auto-detect from `SOLANA_RPC_URL` | `'base'` |

## Setup

```bash
# Solana
npm install @apps-fun/sdk @solana/web3.js

# EVM
npm install @apps-fun/sdk viem

# Both
npm install @apps-fun/sdk @solana/web3.js viem
```

## EVM Vibecode API (29 functions)

All functions accept plain strings and numbers. Network defaults to `'base'`. Pass `'sepolia'` for testnet or `'ethereum'` for Ethereum mainnet.

**18-decimal assumption:** `hasTokens`, `getBalance`, `burnTokens`, and `sendTokens` hardcode 18 decimals for amount conversion. For tokens with non-18 decimals, use the low-level API with `getEVMTokenDecimals`. Functions that fetch decimals on-chain: `getHolders`, `getBurnHistory`, `getCirculatingSupply`, `getSupply`, `getPortfolio`, `getPercentBurned`.

### Token Gating

```typescript
import evmVibe from '@apps-fun/sdk/evm/vibecode';

// Check if wallet holds enough tokens (returns false on any error)
if (await evmVibe.hasTokens('0xWALLET', '0xTOKEN', 100)) {
  // granted
}

// Get balance as a number (returns 0 on error)
const balance = await evmVibe.getBalance('0xWALLET', '0xTOKEN');
```

### Trading

All trading functions require a viem `WalletClient` with an attached account.

```typescript
// Buy tokens with ETH
const hash = await evmVibe.buyTokens('0xTOKEN', 0.1, walletClient);

// Sell tokens for ETH
const hash = await evmVibe.sellTokens('0xTOKEN', 1000, walletClient);

// Burn tokens
const hash = await evmVibe.burnTokens('0xTOKEN', 100, walletClient);

// Transfer tokens
const hash = await evmVibe.sendTokens('0xTOKEN', 50, '0xTO', walletClient);
```

### Token Payment Flows

Percentages must sum to 100. Each split is converted to basis points internally.

```typescript
const flow = evmVibe.createPaymentFlow({
  token: '0xTOKEN',
  amount: 100,           // 100 tokens per charge
  burn: 50,              // 50% burned
  creator: { address: '0xCREATOR', share: 25 },  // 25% to creator
  distribute: 25,        // 25% distributed as ETH to holders
});

// Charge a user (requires ERC20 approval from user to app wallet)
const result = await evmVibe.chargeUser(flow, '0xUSER', appWalletClient, {
  distributionId: 1,
  recipients: ['0xA', '0xB'],   // required when flow has 'distribute' split
});

// Pre-flight checks
const affordable = await evmVibe.canAfford(flow, '0xUSER');
const approved = await evmVibe.hasApproval(flow, '0xUSER', '0xAPP_WALLET');
```

### Holder Snapshots and Airdrops

```typescript
// Get all holders sorted by balance descending
const holders = await evmVibe.getHolders('0xTOKEN');
// [{ address: '0xaaa...', balance: 50000 }, ...]

// Proportional ETH airdrop to all holders
const hash = await evmVibe.airdropToHolders('0xTOKEN', 1, 5.0, walletClient);
// Throws 'No holders found for token' if empty
// Throws 'No recipients with non-zero share' if all shares round to 0
```

### Referral Tracking

```typescript
const earnings = await evmVibe.getReferralEarnings('0xREFERRER', '0xTOKEN');
// { totalETH: 1.5, payments: 12 }
```

### Portfolio

```typescript
const portfolio = await evmVibe.getPortfolio('0xWALLET', ['0xA', '0xB']);
// [{ token: '0xA', balance: 1000, ethValue: 0.5 }, ...]
// Failed tokens excluded. Zero-balance tokens have ethValue: 0.
```

### Burn Analytics

```typescript
const burns = await evmVibe.getBurnHistory('0xTOKEN');
// [{ from: '0xaaa...', amount: 500, block: 123456, txHash: '0x...' }, ...]

const supply = await evmVibe.getCirculatingSupply('0xTOKEN');
// { totalSupply: 1000000, burned: 125000, circulating: 875000, burnPercent: 12.5 }
```

### Buyback and Burn

```typescript
const result = await evmVibe.buybackAndBurnTokens('0xTOKEN', 0.5, walletClient);
// { buyHash: '0x...', burnHash: '0x...', tokensBurned: 12500 }
```

### Revenue and Events

```typescript
const revenue = await evmVibe.getRevenue('0xTOKEN');
// { totalETH: 4.2, totalDistributions: 5, uniqueRecipients: 10 }

const dists = await evmVibe.getDistributions('0xTOKEN');
// [{ distributionId, total, isETH, txHash, block }, ...]

// Real-time event watching (returns unwatch function)
const unwatch = evmVibe.watchTokenDistributions('0xTOKEN', (log) => {
  console.log(log.distributionId, log.total, log.isETH);
});
```

### Token Info

```typescript
const ready = await evmVibe.isReadyToGraduate('0xTOKEN');   // false on error
const creator = await evmVibe.getTokenCreator('0xTOKEN');
const pair = await evmVibe.getPairAddress('0xTOKEN');
const info = await evmVibe.getSupply('0xTOKEN');             // { totalSupply, decimals }
const pct = await evmVibe.getPercentBurned('0xTOKEN');       // 0 when totalSupply is 0
```

### Transaction Confirmation

```typescript
const receipt = await evmVibe.waitForTx('0xHASH');
// { status: 'success' | 'reverted', blockNumber, gasUsed }
```

### Express Middleware

```typescript
import { requireTokens, chargeTokens } from '@apps-fun/sdk/evm/vibecode';

// Gate by balance. Reads wallet from ?wallet= or X-Wallet-Address header.
// 400 if no wallet, 403 if insufficient tokens, sets req.tokenGate on success.
app.use('/api/members', requireTokens('0xTOKEN', 100));

// Charge per request. 400 if no wallet, 402 if can't afford, 500 if payment fails.
// Sets req.tokenPayment on success.
app.use('/api/premium', chargeTokens(flow, appWalletClient));
```

### Flow Presets

```typescript
import { deflationaryFlow, freemiumFlow, revenueShareFlow, payPerUseFlow } from '@apps-fun/sdk/evm/vibecode';
import { parseUnits } from 'viem';

// These use bigint chargeAmount (low-level). Use createPaymentFlow for human-readable amounts.
const flow = deflationaryFlow({
  token: '0xTOKEN' as `0x${string}`,
  chargeAmount: parseUnits('100', 18),
});
```

## Solana Vibecode API (16 functions)

```typescript
import {
  hasTokens,
  getBalance,
  checkWallets,
  buyTokens,
  sellTokens,
  getPrice,
  getTokenInfo,
  requireTokens,
  prepareBuy,
  finishTransaction,
} from '@apps-fun/sdk';

// Token gating (returns false on error)
// hasTokens accepts human-readable amounts: 1 = 1 token (auto-multiplied by 1,000,000 for 6 decimals)
// Pass bigint to use raw amounts directly.
if (await hasTokens('WALLET', 'MINT', 1)) { /* has at least 1 token */ }

// Balance (returns 0 on error, divided by 1e6)
const balance = await getBalance('WALLET', 'MINT');

// Check multiple wallets at once
const results = await checkWallets(['WALLET1', 'WALLET2'], 'MINT', 10);
// [{ wallet: 'WALLET1', hasAccess: true, balance: 50 }, ...]

// Buy with SOL (wallet can be Keypair, base58 string, number[], or Uint8Array)
const sig = await buyTokens('MINT', 0.1, privateKey);

// Sell tokens
const sig2 = await sellTokens('MINT', 1000, privateKey);

// Token price in SOL (returns 0 on error)
const price = await getPrice('MINT');

// Token info
const info = await getTokenInfo('MINT');
// { price, marketCap, liquidity, volume, holders: 0, graduated, buyLink }
// Note: holders is always 0 (not available from API)

// Express middleware (reads wallet from ?wallet= or X-Wallet-Address header)
app.use('/api/premium', requireTokens('MINT', 10));

// External wallets (Privy, Phantom)
const prepared = await prepareBuy('MINT', 0.1, 'WALLET_ADDRESS');
// Sign externally, then:
const sig3 = await finishTransaction(signedTx);
```

## Low-Level APIs

When you need typed addresses (`0x${string}`), bigint amounts, or direct client control:

```typescript
// EVM low-level
import {
  getEVMPublicClient,
  getEVMTokenBalance,
  executeEVMBuy,
  EVMTokenGate,
  getEVMTokenHolders,
  createReferralFlow,
  getEVMBurnHistory,
  getEVMCirculatingSupply,
  getEVMPortfolio,
} from '@apps-fun/sdk';

// Solana low-level
import { TokenGate, buyTokenDirect, sellTokenDirect, burnTokenDirect } from '@apps-fun/sdk';
```

See [EVM_API.md](./EVM_API.md) for complete EVM low-level reference. See [API.md](./API.md) for Solana low-level reference.

## Project Structure

```
src/
  index.ts              # Main entry: re-exports Solana + EVM + vibecode
  vibecode.ts           # Solana vibecode API (16 functions)
  client.ts             # Solana AppsFunClient
  token-gate.ts         # Solana TokenGate class
  direct.ts             # Solana direct trading
  evm/
    index.ts            # EVM barrel exports (22 modules)
    vibecode.ts         # EVM vibecode API (29 functions)
    client.ts           # EVM public client factory, balance/allowance reads
    contracts.ts        # Contract address config with env var overrides
    trading.ts          # Quote + buy/sell with slippage, auto-approve
    tokenOps.ts         # Transfer, transferFrom, burn. Exports DEAD_ADDRESS.
    tokenFlow.ts        # Declarative payment pipeline (bps splits)
    distribute.ts       # MultiSend wrappers for ERC20 and ETH
    events.ts           # Distribution event reading and real-time watching
    fees.ts             # Creator fee reads and claims
    launch.ts           # Token deployment and launch
    tokenGate.ts        # EVM token gating with TTL cache
    tokenInfo.ts        # Graduation, pair info, decimals, total supply
    confirm.ts          # Transaction confirmation with timeout
    buybackBurn.ts      # Sequential buy-then-burn
    presets.ts           # 4 named flow presets
    analytics.ts        # Revenue aggregation
    holders.ts          # Holder snapshots from Transfer events, proportional airdrops
    referral.ts         # Referral flow transformation, earnings tracking
    portfolio.ts        # Multi-token balance + ETH valuation
    burnAnalytics.ts    # Burn history, circulating supply
    abis.ts             # Contract ABIs
  __tests__/            # 30 test files, 669 tests
```

## Build, Test, Typecheck

```bash
npm run build       # tsup: CJS + ESM + DTS
npm run typecheck   # tsc --noEmit
npm test            # vitest (669 tests across 30 files)
```

All three must pass before any change is considered complete.

Mutation testing (optional, for test quality):
```bash
npx stryker run     # target: 80%+ mutation score
```

## Security Requirements

- Never expose private keys in client-side code
- All secrets server-side only (API keys, wallet keys, RPC URLs with credits)
- Validate all user inputs at system boundaries
- Use environment variables for RPC URLs and sensitive config
- EVM wallets: use `privateKeyToAccount` from viem, never embed in frontend
- Solana wallets: use Keypair from env vars, never hardcode
- All trading fees (1%) collected at protocol level, not bypassable

## Fee Structure

All trades have a 1% fee:
- 50% to apps.fun platform
- 50% to token creator

Solana: enforced at Meteora protocol level.
EVM: enforced at AppsFun AMM contract level.

## Contract Addresses (EVM)

All EVM networks (Sepolia, Base, Ethereum mainnet) share the same default addresses:
- AppsFun: `0xFfFFfFfffF6469850a0619fDFbA72cf4b4efcd3D`
- FeeHolder: `0x4f3fC5CE6Cfa9605faa0a4E9747De460338b1c7c`
- MultiSend: `0xF981Ce18176F39a0E93fed69E34ec54Ef8200aAE`

Per-network env var overrides: `{NETWORK}_APPSFUN_ADDRESS`, `{NETWORK}_FEEHOLDER_ADDRESS`, `{NETWORK}_MULTISEND_ADDRESS` where NETWORK is `SEPOLIA`, `BASE`, or `ETHEREUM`.

## Repository Workflow

- Development happens under `numbergroup/app.fun` (parent repo at `/Users/zak/apps-fun`). The SDK is a submodule at `sdk/`.
- PRs for dev work go to `numbergroup/app.fun`, not to `apps-fun/apps-fun-sdk`.
- Once approved and merged, production releases go to `apps-fun/apps-fun-sdk`.
- Branch naming: use descriptive names reflecting full scope (e.g., `sdk-updates`), not narrow labels like `fix/docs-cleanup`.

## Documentation

- [README.md](./README.md) -- overview, getting started, quick start examples
- [EVM_API.md](./EVM_API.md) -- complete EVM API reference (29 vibecode + all low-level)
- [API.md](./API.md) -- complete Solana API reference
- [EXAMPLES.md](./EXAMPLES.md) -- 5 POC integration examples (SaaS, rewards, game, multi-chain, analytics)
- [AGENT_GUIDE.md](./AGENT_GUIDE.md) -- pattern-matching guide for agents
- [QUICK_START.md](./QUICK_START.md) -- 5-minute Solana quick start
