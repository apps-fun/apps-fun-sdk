# EVM API Reference

Complete API documentation for the EVM modules in @apps-fun/sdk. Covers Base and Sepolia networks.

## Table of Contents

- [Installation](#installation)
- [High-Level API (Vibecode)](#high-level-api-vibecode)
  - [Token Gating](#token-gating)
  - [Trading](#trading)
  - [Token Payments](#token-payments)
  - [Distributions](#distributions)
  - [Holder Snapshots](#holder-snapshots)
  - [Referral Tracking](#referral-tracking)
  - [Portfolio](#portfolio)
  - [Burn Analytics](#burn-analytics)
  - [Revenue](#revenue)
  - [Buyback and Burn](#buyback-and-burn)
  - [Token Info](#token-info)
  - [Transaction Confirmation](#transaction-confirmation)
  - [Express Middleware](#express-middleware)
  - [Flow Presets](#flow-presets)
- [Low-Level API](#low-level-api)
  - [Client](#client)
  - [Contracts](#contracts)
  - [Trading (Low-Level)](#trading-low-level)
  - [Token Operations](#token-operations)
  - [Token Flow Pipeline](#token-flow-pipeline)
  - [Distribution](#distribution)
  - [Events](#events)
  - [Fees](#fees)
  - [Token Launch](#token-launch)
  - [Token Info (Low-Level)](#token-info-low-level)
  - [Token Gate (Low-Level)](#token-gate-low-level)
  - [Holders (Low-Level)](#holders-low-level)
  - [Referral (Low-Level)](#referral-low-level)
  - [Portfolio (Low-Level)](#portfolio-low-level)
  - [Burn Analytics (Low-Level)](#burn-analytics-low-level)
  - [Confirm (Low-Level)](#confirm-low-level)
  - [Buyback Burn (Low-Level)](#buyback-burn-low-level)
  - [Revenue Analytics (Low-Level)](#revenue-analytics-low-level)
- [Types](#types)
- [Contract Addresses](#contract-addresses)

## Installation

```bash
npm install @apps-fun/sdk viem
```

## High-Level API (Vibecode)

The vibecode API is a zero-config, agent-friendly interface. All functions accept plain strings and numbers. Network defaults to `'base'`. ETH and token amounts are human-readable numbers (not wei).

```typescript
import evmVibe from '@apps-fun/sdk/evm/vibecode';
// or
import { hasTokens, buyTokens, getHolders } from '@apps-fun/sdk/evm/vibecode';
```

The default export is an object with all 29 functions.

### Token Gating

#### hasTokens

Check if a wallet holds enough tokens.

```typescript
async function hasTokens(
  wallet: string,
  token: string,
  minAmount?: number,
  network?: 'base' | 'sepolia'
): Promise<boolean>
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `wallet` | `string` | required | Wallet address |
| `token` | `string` | required | Token contract address |
| `minAmount` | `number` | `1` | Minimum token balance |
| `network` | `'base' \| 'sepolia'` | `'base'` | Network |

Returns `false` on any error (RPC failure, invalid address, etc).

Note: Converts `minAmount` using 18 decimals internally. For tokens with non-18 decimals, use the low-level `EVMTokenGate` class instead.

```typescript
if (await hasTokens('0xWALLET', '0xTOKEN', 100)) {
  // Wallet holds at least 100 tokens
}
```

#### getBalance

Get token balance as a human-readable number.

```typescript
async function getBalance(
  wallet: string,
  token: string,
  network?: 'base' | 'sepolia'
): Promise<number>
```

Returns `0` on any error.

Note: Divides raw balance by `1e18` internally. For tokens with non-18 decimals, use the low-level `getEVMTokenBalance` and `getEVMTokenDecimals` functions.

```typescript
const balance = await getBalance('0xWALLET', '0xTOKEN');
// 1500.5
```

### Trading

All trading functions require a viem `WalletClient` with an attached account.

#### buyTokens

Buy tokens with ETH.

```typescript
async function buyTokens(
  token: string,
  ethAmount: number,
  walletClient: WalletClient,
  network?: 'base' | 'sepolia',
  options?: { slippage?: number }
): Promise<string>
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `token` | `string` | required | Token contract address |
| `ethAmount` | `number` | required | ETH to spend (e.g. `0.1` for 0.1 ETH) |
| `walletClient` | `WalletClient` | required | Viem wallet client with account |
| `network` | `'base' \| 'sepolia'` | `'base'` | Network |
| `options.slippage` | `number` | `undefined` | Slippage as percentage (e.g. `2` for 2%). Converts to bps internally. When undefined, defaults to 1% in the low-level function. |

Returns the transaction hash as a string.

```typescript
const hash = await buyTokens('0xTOKEN', 0.1, walletClient);
```

#### sellTokens

Sell tokens for ETH.

```typescript
async function sellTokens(
  token: string,
  tokenAmount: number,
  walletClient: WalletClient,
  network?: 'base' | 'sepolia',
  options?: { slippage?: number }
): Promise<string>
```

Parameters follow the same pattern as `buyTokens`, with `tokenAmount` being the number of tokens to sell (human-readable). Handles ERC20 approval automatically if needed.

```typescript
const hash = await sellTokens('0xTOKEN', 1000, walletClient);
```

#### burnTokens

Burn tokens by sending to the dead address (`0x000000000000000000000000000000000000dEaD`).

```typescript
async function burnTokens(
  token: string,
  amount: number,
  walletClient: WalletClient,
  network?: 'base' | 'sepolia'
): Promise<string>
```

Converts `amount` to 18-decimal bigint internally.

```typescript
const hash = await burnTokens('0xTOKEN', 100, walletClient);
```

#### sendTokens

Transfer tokens to another address.

```typescript
async function sendTokens(
  token: string,
  amount: number,
  to: string,
  walletClient: WalletClient,
  network?: 'base' | 'sepolia'
): Promise<string>
```

Converts `amount` to 18-decimal bigint internally.

```typescript
const hash = await sendTokens('0xTOKEN', 50, '0xRECIPIENT', walletClient);
```

### Token Payments

Token payments use a declarative split system. Percentages must sum to 100. Each payment pulls tokens from a user (via `transferFrom`) and distributes them according to the configured splits.

#### createPaymentFlow

Create a payment flow from percentages.

```typescript
function createPaymentFlow(config: SimplePaymentConfig): TokenFlowConfig
```

```typescript
interface SimplePaymentConfig {
  token: string;
  network?: 'base' | 'sepolia';  // default: 'base'
  amount: number;                  // charge amount in tokens
  burn?: number;                   // burn percentage (0-100)
  creator?: {
    address: string;
    share: number;                 // percentage (0-100)
  };
  distribute?: number;             // distribute percentage (0-100)
}
```

Percentages are converted to basis points internally (`* 100`). Splits with 0% are omitted. Total must equal 100%.

Throws `Error('Split basis points must sum to 10000, got ...')` if percentages do not sum to 100.

```typescript
const flow = createPaymentFlow({
  token: '0xTOKEN',
  amount: 100,         // charge 100 tokens per use
  burn: 50,            // 50% burned
  creator: {
    address: '0xCREATOR',
    share: 25,         // 25% to creator
  },
  distribute: 25,      // 25% distributed as ETH to holders
});
```

#### chargeUser

Execute a payment flow against a user wallet. The user must have approved the app wallet to spend their tokens via ERC20 `approve`.

```typescript
async function chargeUser(
  flow: TokenFlowConfig,
  userWallet: string,
  walletClient: WalletClient,
  options?: {
    distributionId?: number;
    recipients?: string[];
  }
): Promise<{
  success: boolean;
  steps: Array<{ action: string; hash: string }>;
}>
```

`options.distributionId` and `options.recipients` are required when the flow contains a `distribute` split.

```typescript
const result = await chargeUser(flow, '0xUSER', appWalletClient, {
  distributionId: 1,
  recipients: ['0xHOLDER_A', '0xHOLDER_B'],
});
// result.success === true
// result.steps === [{ action: 'burn', hash: '0x...' }, ...]
```

#### canAfford

Check if a user has enough tokens for a payment flow.

```typescript
async function canAfford(
  flow: TokenFlowConfig,
  userWallet: string
): Promise<boolean>
```

#### hasApproval

Check if a user has approved the app wallet for a payment flow.

```typescript
async function hasApproval(
  flow: TokenFlowConfig,
  userWallet: string,
  appWallet: string
): Promise<boolean>
```

### Distributions

#### distributeETHToHolders

Distribute ETH to a list of recipients via the MultiSend contract.

```typescript
async function distributeETHToHolders(
  token: string,
  distributionId: number,
  recipients: string[],
  amounts: number[],
  walletClient: WalletClient,
  network?: 'base' | 'sepolia'
): Promise<string>
```

`amounts` are in ETH (human-readable). Converts to 18-decimal bigint internally. Total value is computed as the sum of all amounts.

```typescript
const hash = await distributeETHToHolders(
  '0xTOKEN', 1,
  ['0xALICE', '0xBOB'],
  [0.5, 0.5],
  walletClient
);
```

#### getDistributions

Query distribution event history for a token.

```typescript
async function getDistributions(
  token: string,
  network?: 'base' | 'sepolia',
  options?: { fromBlock?: number }
): Promise<Array<{
  distributionId: number;
  total: number;        // ETH or token amount (divided by 1e18)
  isETH: boolean;
  txHash: string;
  block: number;
}>>
```

#### watchTokenDistributions

Watch for new distribution events in real-time. Returns an unwatch function.

```typescript
function watchTokenDistributions(
  token: string,
  onLog: (log: {
    distributionId: number;
    total: number;
    isETH: boolean;
    txHash: string;
  }) => void,
  network?: 'base' | 'sepolia'
): () => void
```

```typescript
const unwatch = watchTokenDistributions('0xTOKEN', (log) => {
  console.log(`Distribution #${log.distributionId}: ${log.total} ETH`);
});
// Later: unwatch();
```

### Holder Snapshots

#### getHolders

Build a holder list from on-chain Transfer event history. Returns holders sorted by balance descending. Excludes the zero address, the dead address, and wallets with zero or negative balance.

```typescript
async function getHolders(
  token: string,
  network?: 'base' | 'sepolia'
): Promise<Array<{ address: string; balance: number }>>
```

Balance is converted using the token's actual decimals (fetched on-chain and cached).

```typescript
const holders = await getHolders('0xTOKEN');
// [{ address: '0xaaa...', balance: 50000 }, { address: '0xbbb...', balance: 30000 }, ...]
```

Note: Queries all Transfer events for the token. For tokens with a large transfer history, this may be slow or hit RPC limits.

#### airdropToHolders

Airdrop ETH to all token holders proportionally based on their holdings.

```typescript
async function airdropToHolders(
  token: string,
  distributionId: number,
  totalETH: number,
  walletClient: WalletClient,
  network?: 'base' | 'sepolia'
): Promise<string>
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `token` | `string` | required | Token contract address (used as both `appToken` and `tokenAddress`) |
| `distributionId` | `number` | required | Distribution identifier |
| `totalETH` | `number` | required | Total ETH to distribute (e.g. `5.0`) |
| `walletClient` | `WalletClient` | required | Wallet sending the ETH |
| `network` | `'base' \| 'sepolia'` | `'base'` | Network |

Internally: fetches holder balances, computes proportional shares using bigint arithmetic (`share = (balance * totalAmount) / totalHeld`), filters zero-share recipients, calls the MultiSend contract.

Throws:
- `Error('No holders found for token')` if no holders exist
- `Error('No recipients with non-zero share')` if all holders' shares round to zero

Returns the transaction hash.

```typescript
const hash = await airdropToHolders('0xTOKEN', 1, 5.0, walletClient);
```

### Referral Tracking

#### getReferralEarnings

Query referral earnings from DistributedETH events for a specific address.

```typescript
async function getReferralEarnings(
  referrer: string,
  token?: string,
  network?: 'base' | 'sepolia'
): Promise<{ totalETH: number; payments: number }>
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `referrer` | `string` | required | Referrer wallet address |
| `token` | `string` | `undefined` | Filter by token. When undefined, returns earnings across all tokens. |
| `network` | `'base' \| 'sepolia'` | `'base'` | Network |

Address matching is case-insensitive. `totalETH` is a human-readable number (divided by `1e18`).

```typescript
const earnings = await getReferralEarnings('0xREFERRER', '0xTOKEN');
// { totalETH: 1.5, payments: 12 }
```

### Portfolio

#### getPortfolio

Get portfolio data for multiple tokens: balance and ETH value.

```typescript
async function getPortfolio(
  wallet: string,
  tokens: string[],
  network?: 'base' | 'sepolia'
): Promise<Array<{ token: string; balance: number; ethValue: number }>>
```

For each token: fetches balance and decimals in parallel, then fetches a sell quote for tokens with non-zero balance. Failed tokens are excluded from the result. Quote failures result in `ethValue: 0`.

```typescript
const portfolio = await getPortfolio('0xWALLET', ['0xTOKEN_A', '0xTOKEN_B']);
// [{ token: '0xTOKEN_A', balance: 1000, ethValue: 0.5 }, ...]
```

### Burn Analytics

#### getBurnHistory

Query burn events (transfers to the dead address) for a token.

```typescript
async function getBurnHistory(
  token: string,
  network?: 'base' | 'sepolia',
  options?: { fromBlock?: number }
): Promise<Array<{
  from: string;
  amount: number;
  block: number;
  txHash: string;
}>>
```

Amounts are converted using the token's actual decimals (fetched on-chain and cached). Events are sorted by block number ascending.

```typescript
const burns = await getBurnHistory('0xTOKEN');
// [{ from: '0xaaa...', amount: 500, block: 123456, txHash: '0x...' }, ...]
```

#### getCirculatingSupply

Get circulating supply statistics.

```typescript
async function getCirculatingSupply(
  token: string,
  network?: 'base' | 'sepolia'
): Promise<{
  totalSupply: number;
  burned: number;
  circulating: number;
  burnPercent: number;
}>
```

All supply numbers are converted using the token's actual decimals. `burnPercent` is `0` when `totalSupply` is zero.

```typescript
const stats = await getCirculatingSupply('0xTOKEN');
// { totalSupply: 1000000, burned: 125000, circulating: 875000, burnPercent: 12.5 }
```

### Revenue

#### getRevenue

Get aggregated revenue statistics from distribution events.

```typescript
async function getRevenue(
  token: string,
  network?: 'base' | 'sepolia'
): Promise<{
  totalETH: number;
  totalDistributions: number;
  uniqueRecipients: number;
}>
```

```typescript
const revenue = await getRevenue('0xTOKEN');
// { totalETH: 4.2, totalDistributions: 5, uniqueRecipients: 10 }
```

### Buyback and Burn

#### buybackAndBurnTokens

Buy tokens on the AppsFun AMM with ETH, then immediately burn them.

```typescript
async function buybackAndBurnTokens(
  token: string,
  ethAmount: number,
  walletClient: WalletClient,
  network?: 'base' | 'sepolia',
  options?: { slippage?: number }
): Promise<{
  buyHash: string;
  burnHash: string;
  tokensBurned: number;
}>
```

`tokensBurned` is divided by `1e18`. `slippage` is a percentage (e.g. `3` for 3%).

```typescript
const result = await buybackAndBurnTokens('0xTOKEN', 0.5, walletClient);
// { buyHash: '0x...', burnHash: '0x...', tokensBurned: 12500 }
```

### Token Info

#### isReadyToGraduate

Check if a token is eligible to graduate from the bonding curve.

```typescript
async function isReadyToGraduate(
  token: string,
  network?: 'base' | 'sepolia'
): Promise<boolean>
```

Returns `false` on any error.

#### getTokenCreator

Get the creator address for a token.

```typescript
async function getTokenCreator(
  token: string,
  network?: 'base' | 'sepolia'
): Promise<string>
```

#### getPairAddress

Get the liquidity pool pair address for a token.

```typescript
async function getPairAddress(
  token: string,
  network?: 'base' | 'sepolia'
): Promise<string>
```

#### getSupply

Get total supply and decimals.

```typescript
async function getSupply(
  token: string,
  network?: 'base' | 'sepolia'
): Promise<{ totalSupply: number; decimals: number }>
```

Uses the token's actual decimals for conversion.

#### getPercentBurned

Get the percentage of total supply that has been burned.

```typescript
async function getPercentBurned(
  token: string,
  network?: 'base' | 'sepolia'
): Promise<number>
```

Returns `0` when `totalSupply` is zero.

### Transaction Confirmation

#### waitForTx

Wait for a transaction to be confirmed.

```typescript
async function waitForTx(
  hash: string,
  network?: 'base' | 'sepolia'
): Promise<{
  status: 'success' | 'reverted';
  blockNumber: number;
  gasUsed: number;
}>
```

Uses 1 confirmation and 60-second timeout by default.

### Express Middleware

#### requireTokens

Express middleware that gates routes by token balance.

```typescript
function requireTokens(
  token: string,
  minAmount?: number,
  network?: 'base' | 'sepolia'
): (req, res, next) => void
```

Reads wallet from `req.query.wallet` or `req.headers['x-wallet-address']` (query parameter takes precedence).

Responses:
- **400**: No wallet provided. Body: `{ error: 'Wallet address required', hint: 'Pass ?wallet=ADDRESS or X-Wallet-Address header' }`
- **403**: Insufficient tokens. Body: `{ error: 'Insufficient tokens', required: number, token: string }`
- **next()**: Sets `req.tokenGate = { wallet, token, verified: true }`

```typescript
import express from 'express';
import { requireTokens } from '@apps-fun/sdk/evm/vibecode';

const app = express();
app.use('/api/members', requireTokens('0xTOKEN', 100));
```

#### chargeTokens

Express middleware that charges tokens per request using a payment flow.

```typescript
function chargeTokens(
  flow: TokenFlowConfig,
  walletClient: WalletClient,
  options?: {
    distributionId?: number;
    recipients?: string[];
  }
): (req, res, next) => void
```

Reads wallet from `req.query.wallet` or `req.headers['x-wallet-address']`.

Responses:
- **400**: No wallet provided.
- **402**: Cannot afford. Body: `{ error: 'Insufficient token balance', required: number, token: string }`
- **500**: Payment failed. Body: `{ error: 'Payment failed', message: string }`
- **next()**: Sets `req.tokenPayment = { wallet, charged: number, steps: Array }`

```typescript
const flow = createPaymentFlow({ token: '0xTOKEN', amount: 10, burn: 100 });
app.use('/api/premium', chargeTokens(flow, appWalletClient));
```

### Flow Presets

Re-exported from `src/evm/presets.ts`. Each returns a `TokenFlowConfig`.

#### deflationaryFlow

100% burn.

```typescript
function deflationaryFlow(config: {
  token: `0x${string}`;
  network?: NetworkId;
  chargeAmount: bigint;
}): TokenFlowConfig
```

#### freemiumFlow

70% to creator, 30% burn.

```typescript
function freemiumFlow(config: {
  token: `0x${string}`;
  network?: NetworkId;
  chargeAmount: bigint;
  creatorAddress: `0x${string}`;
}): TokenFlowConfig
```

#### revenueShareFlow

50% to creator, 25% burn, 25% distribute to holders as ETH.

```typescript
function revenueShareFlow(config: {
  token: `0x${string}`;
  network?: NetworkId;
  chargeAmount: bigint;
  creatorAddress: `0x${string}`;
}): TokenFlowConfig
```

#### payPerUseFlow

100% to creator.

```typescript
function payPerUseFlow(config: {
  token: `0x${string}`;
  network?: NetworkId;
  chargeAmount: bigint;
  creatorAddress: `0x${string}`;
}): TokenFlowConfig
```

Note: `chargeAmount` is in raw units (bigint with 18 decimals). Use `parseUnits('100', 18)` from viem to convert.

---

## Low-Level API

The low-level API uses typed addresses (`0x${string}`), bigint amounts, and explicit client parameters. Import from `@apps-fun/sdk` or `@apps-fun/sdk/evm`.

```typescript
import {
  getEVMPublicClient,
  getEVMTokenBalance,
  executeEVMBuy,
  getEVMTokenHolders,
  // ...
} from '@apps-fun/sdk';
```

### Client

```typescript
import { getEVMPublicClient, getEVMTokenBalance, getEVMNativeBalance, getEVMTokenAllowance } from '@apps-fun/sdk';
```

#### getEVMPublicClient

Create a viem PublicClient for an EVM network.

```typescript
function getEVMPublicClient(
  networkId: NetworkId,
  rpcUrl?: string
): EVMPublicClient
```

Throws `Error('Cannot create EVM client for Solana network')` if `networkId` is `'solana'`.

When `rpcUrl` is omitted, uses the chain's default public RPC.

#### getEVMTokenBalance

```typescript
async function getEVMTokenBalance(
  client: EVMPublicClient,
  tokenAddress: `0x${string}`,
  walletAddress: `0x${string}`
): Promise<bigint>
```

Returns the raw balance in the token's smallest unit.

#### getEVMNativeBalance

```typescript
async function getEVMNativeBalance(
  client: EVMPublicClient,
  walletAddress: `0x${string}`
): Promise<bigint>
```

Returns ETH balance in wei.

#### getEVMTokenAllowance

```typescript
async function getEVMTokenAllowance(
  client: EVMPublicClient,
  tokenAddress: `0x${string}`,
  ownerAddress: `0x${string}`,
  spenderAddress: `0x${string}`
): Promise<bigint>
```

### Contracts

```typescript
import { getEVMContracts } from '@apps-fun/sdk';
```

#### getEVMContracts

```typescript
function getEVMContracts(
  networkId: NetworkId
): EVMContractAddresses | null
```

Returns `null` for `'solana'`. Returns addresses for `'base'`, `'sepolia'`, and `'ethereum'`.

```typescript
interface EVMContractAddresses {
  appsFun: `0x${string}`;
  feeHolder: `0x${string}`;
  multiSend: `0x${string}`;
}
```

**All EVM Networks (Sepolia, Base, Ethereum mainnet):**
- AppsFun: `0xfFFfffFff91A48384F062D43f1672F217C20aB20`
- FeeHolder: `0x36618900De93aAB3a9C765d39BC582F74120F403`
- MultiSend: `0xF981Ce18176F39a0E93fed69E34ec54Ef8200aAE`

Per-network env var overrides: `{NETWORK}_APPSFUN_ADDRESS`, `{NETWORK}_FEEHOLDER_ADDRESS`, `{NETWORK}_MULTISEND_ADDRESS` where NETWORK is `SEPOLIA`, `BASE`, or `ETHEREUM`.

### Trading (Low-Level)

```typescript
import { getEVMQuote, executeEVMBuy, executeEVMSell } from '@apps-fun/sdk';
```

#### getEVMQuote

```typescript
async function getEVMQuote(
  client: EVMPublicClient,
  networkId: NetworkId,
  params: EVMQuoteParams
): Promise<EVMQuoteResult>
```

```typescript
interface EVMQuoteParams {
  tokenAddress: `0x${string}`;
  amount: number;                    // ETH for buy, tokens for sell
  side: 'buy' | 'sell';
  appsFunAddress?: `0x${string}`;    // Override AppsFun contract
}

interface EVMQuoteResult {
  tokenAmount: number;               // Human-readable
  tokenAmountRaw: bigint;            // 18 decimals
  ethAmount: number;                 // Human-readable
  ethAmountRaw: bigint;              // 18 decimals
  pricePerToken: number;             // ETH per token
}
```

#### executeEVMBuy

```typescript
async function executeEVMBuy(
  publicClient: EVMPublicClient,
  walletClient: WalletClient,
  networkId: NetworkId,
  params: EVMTradeParams
): Promise<EVMTradeResult>
```

```typescript
interface EVMTradeParams {
  tokenAddress: `0x${string}`;
  amount: number;
  side: 'buy' | 'sell';
  slippageBps?: number;              // Default: 100 (1%)
  deadline?: number;                 // Unix timestamp. Default: now + 1200 seconds
  appsFunAddress?: `0x${string}`;
}

interface EVMTradeResult {
  hash: `0x${string}`;
  tokenAmount: bigint;
  ethAmount: bigint;
}
```

#### executeEVMSell

Same signature as `executeEVMBuy`. Handles ERC20 approval automatically if the current allowance is insufficient (approves max uint256).

### Token Operations

```typescript
import { transferERC20, transferFromERC20, burnERC20, DEAD_ADDRESS } from '@apps-fun/sdk';
```

#### transferERC20

```typescript
async function transferERC20(
  walletClient: WalletClient,
  networkId: NetworkId,
  params: { tokenAddress: `0x${string}`; to: `0x${string}`; amount: bigint }
): Promise<{ hash: `0x${string}` }>
```

Throws `Error('Wallet client has no account')` if the wallet client has no attached account.

#### transferFromERC20

```typescript
async function transferFromERC20(
  publicClient: EVMPublicClient,
  walletClient: WalletClient,
  networkId: NetworkId,
  params: {
    tokenAddress: `0x${string}`;
    from: `0x${string}`;
    to: `0x${string}`;
    amount: bigint;
  }
): Promise<{ hash: `0x${string}` }>
```

Checks allowance before executing. Throws `Error('Insufficient allowance: have ..., need ...')` if the allowance is too low.

#### burnERC20

```typescript
async function burnERC20(
  walletClient: WalletClient,
  networkId: NetworkId,
  params: { tokenAddress: `0x${string}`; amount: bigint }
): Promise<{ hash: `0x${string}` }>
```

Implemented as a transfer to `DEAD_ADDRESS` (`0x000000000000000000000000000000000000dEaD`).

### Token Flow Pipeline

```typescript
import {
  createTokenFlow,
  validateTokenFlowConfig,
  executeTokenFlow,
  checkTokenFlowBalance,
  checkTokenFlowAllowance,
} from '@apps-fun/sdk';
```

#### Types

```typescript
type SplitAction = 'burn' | 'send' | 'distribute';

interface TokenFlowSplit {
  action: SplitAction;
  bps: number;           // Basis points (0-10000)
  to?: `0x${string}`;    // Required when action is 'send'
}

interface TokenFlowConfig {
  token: `0x${string}`;
  network: NetworkId;
  chargeAmount: bigint;
  splits: TokenFlowSplit[];
  slippageBps?: number;  // For 'distribute' action (default: 100)
}
```

#### validateTokenFlowConfig

```typescript
function validateTokenFlowConfig(config: TokenFlowConfig): void
```

Throws:
- `Error('TokenFlow must have at least one split')`
- `Error('Split basis points must sum to 10000, got ...')`
- `Error('Invalid bps value: ...')` for bps outside 0-10000
- `Error("Split action 'send' requires a 'to' address")`

#### createTokenFlow

Validates and returns the config. Equivalent to calling `validateTokenFlowConfig` then returning the input.

```typescript
function createTokenFlow(config: TokenFlowConfig): TokenFlowConfig
```

#### checkTokenFlowBalance

```typescript
async function checkTokenFlowBalance(
  publicClient: EVMPublicClient,
  config: TokenFlowConfig,
  userWallet: `0x${string}`
): Promise<{
  canPay: boolean;
  balance: bigint;
  required: bigint;
  shortfall: bigint;
}>
```

#### checkTokenFlowAllowance

```typescript
async function checkTokenFlowAllowance(
  publicClient: EVMPublicClient,
  config: TokenFlowConfig,
  userWallet: `0x${string}`,
  appWallet: `0x${string}`
): Promise<{
  approved: boolean;
  allowance: bigint;
  required: bigint;
}>
```

#### executeTokenFlow

```typescript
async function executeTokenFlow(
  publicClient: EVMPublicClient,
  walletClient: WalletClient,
  config: TokenFlowConfig,
  userWallet: `0x${string}`,
  options?: {
    distributionId?: bigint;
    recipients?: `0x${string}`[];
    recipientWeights?: number[];     // Must sum to 10000 if provided
  }
): Promise<{
  success: boolean;
  steps: Array<{
    action: SplitAction;
    amount: bigint;
    hash: `0x${string}`;
    to?: string;
  }>;
  totalCharged: bigint;
}>
```

Execution order:
1. Pull `chargeAmount` from user via `transferFrom`
2. For each split, compute `amount = (chargeAmount * bps) / 10000`
3. Execute the split action:
   - `burn`: transfer to dead address
   - `send`: transfer to `split.to`
   - `distribute`: sell tokens for ETH via AppsFun AMM, then distribute ETH to recipients via MultiSend

Throws:
- `Error("'distribute' split requires options.recipients")`
- `Error("'distribute' split requires options.distributionId")`
- `Error('recipientWeights length must match recipients length')`
- `Error('recipientWeights must sum to 10000, got ...')`

### Distribution

```typescript
import { distributeERC20, distributeETH } from '@apps-fun/sdk';
```

#### distributeERC20

```typescript
async function distributeERC20(
  publicClient: EVMPublicClient,
  walletClient: WalletClient,
  networkId: NetworkId,
  params: {
    appToken: `0x${string}`;
    distributionId: bigint;
    paymentToken: `0x${string}`;
    recipients: `0x${string}`[];
    amounts: bigint[];
  }
): Promise<{ hash: `0x${string}` }>
```

Handles ERC20 approval automatically if allowance is insufficient. Validates that recipients and amounts arrays have equal length and are non-empty.

#### distributeETH

```typescript
async function distributeETH(
  walletClient: WalletClient,
  networkId: NetworkId,
  params: {
    appToken: `0x${string}`;
    distributionId: bigint;
    recipients: `0x${string}`[];
    amounts: bigint[];
    totalValue: bigint;
  }
): Promise<{ hash: `0x${string}` }>
```

`totalValue` is sent as the transaction's ETH value.

### Events

```typescript
import { getDistributionLogs, getDistributedETHLogs, watchDistributions } from '@apps-fun/sdk';
```

#### getDistributionLogs

Query both ERC20 Distribution and ETH DistributionETH events from the MultiSend contract. Results are sorted by block number ascending.

```typescript
async function getDistributionLogs(
  publicClient: EVMPublicClient,
  networkId: NetworkId,
  params?: {
    appToken?: `0x${string}`;
    distributionId?: bigint;
    fromBlock?: bigint;
    toBlock?: bigint;
  }
): Promise<DistributionLog[]>
```

```typescript
interface DistributionLog {
  appToken: `0x${string}`;
  distributionId: bigint;
  token: `0x${string}` | null;   // null for ETH distributions
  total: bigint;
  isETH: boolean;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
}
```

#### getDistributedETHLogs

Query individual ETH payout events (DistributedETH) from the MultiSend contract.

```typescript
async function getDistributedETHLogs(
  publicClient: EVMPublicClient,
  networkId: NetworkId,
  params?: {
    appToken?: `0x${string}`;
    distributionId?: bigint;
    fromBlock?: bigint;
    toBlock?: bigint;
  }
): Promise<DistributedETHLog[]>
```

```typescript
interface DistributedETHLog {
  appToken: `0x${string}`;
  distributionId: bigint;
  user: `0x${string}`;
  ethAmount: bigint;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
}
```

#### watchDistributions

Watch for new distribution events in real-time. Returns an unwatch function.

```typescript
function watchDistributions(
  publicClient: EVMPublicClient,
  networkId: NetworkId,
  appToken: `0x${string}`,
  onLog: (log: DistributionLog) => void
): () => void
```

### Fees

```typescript
import { getEVMCreatorFees, claimEVMFees, claimEVMLPFees } from '@apps-fun/sdk';
```

#### getEVMCreatorFees

```typescript
async function getEVMCreatorFees(
  client: EVMPublicClient,
  networkId: NetworkId,
  creatorAddress: `0x${string}`
): Promise<bigint>
```

Returns claimable creator fees in wei.

#### claimEVMFees

```typescript
async function claimEVMFees(
  walletClient: WalletClient,
  networkId: NetworkId
): Promise<{ hash: `0x${string}` }>
```

#### claimEVMLPFees

```typescript
async function claimEVMLPFees(
  walletClient: WalletClient,
  networkId: NetworkId,
  tokenAddress: `0x${string}`
): Promise<{ hash: `0x${string}` }>
```

### Token Launch

```typescript
import { deployAndLaunchEVM, launchTokenEVM, parseTokenSupply } from '@apps-fun/sdk';
```

#### deployAndLaunchEVM

Deploy and launch a token in a single transaction.

```typescript
async function deployAndLaunchEVM(
  walletClient: WalletClient,
  networkId: NetworkId,
  params: {
    name: string;
    symbol: string;
    supply: bigint;    // Total supply in wei (18 decimals)
  }
): Promise<{
  hash: `0x${string}`;
  tokenAddress?: `0x${string}`;
  pairAddress?: `0x${string}`;
}>
```

#### launchTokenEVM

Launch an existing token that was deployed separately.

```typescript
async function launchTokenEVM(
  walletClient: WalletClient,
  networkId: NetworkId,
  tokenAddress: `0x${string}`,
  amount: bigint
): Promise<{
  hash: `0x${string}`;
  tokenAddress?: `0x${string}`;
  pairAddress?: `0x${string}`;
}>
```

#### parseTokenSupply

Helper to convert a human-readable supply number to 18-decimal bigint.

```typescript
function parseTokenSupply(supply: number): bigint
```

```typescript
parseTokenSupply(1_000_000_000) // 1B tokens => 1000000000000000000000000000n
```

### Token Info (Low-Level)

```typescript
import {
  getEVMCanGraduate,
  getEVMPairInfo,
  getEVMTokenDecimals,
  getEVMTokenTotalSupply,
} from '@apps-fun/sdk';
```

#### getEVMCanGraduate

```typescript
async function getEVMCanGraduate(
  client: EVMPublicClient,
  networkId: NetworkId,
  tokenAddress: `0x${string}`
): Promise<boolean>
```

#### getEVMPairInfo

```typescript
async function getEVMPairInfo(
  client: EVMPublicClient,
  networkId: NetworkId,
  tokenAddress: `0x${string}`
): Promise<{ pair: `0x${string}`; creator: `0x${string}` }>
```

#### getEVMTokenDecimals

```typescript
async function getEVMTokenDecimals(
  client: EVMPublicClient,
  tokenAddress: `0x${string}`
): Promise<number>
```

#### getEVMTokenTotalSupply

```typescript
async function getEVMTokenTotalSupply(
  client: EVMPublicClient,
  tokenAddress: `0x${string}`
): Promise<bigint>
```

### Token Gate (Low-Level)

```typescript
import { EVMTokenGate } from '@apps-fun/sdk';
```

#### EVMTokenGate

```typescript
class EVMTokenGate {
  constructor(config: {
    tokenAddress: `0x${string}`;
    minAmount: bigint;
    networkId: NetworkId;
    rpcUrl?: string;
    cacheTtlMs?: number;          // Default: 30000 (30 seconds)
  })

  async check(walletAddress: string): Promise<{
    allowed: boolean;
    balance: bigint;
    required: bigint;
    message: string;
  }>

  async checkBatch(wallets: string[]): Promise<Map<string, EVMGateResult>>
  clearCache(): void
  clearCacheFor(wallet: string): void
  setMinAmount(amount: bigint): void
  getTokenInfo(): { tokenAddress: string; minAmount: bigint }
}
```

Throws `Error('EVMTokenGate cannot be used with Solana network')` if `networkId` is `'solana'`.

### Holders (Low-Level)

```typescript
import { getEVMTokenHolders, airdropETHToHolders } from '@apps-fun/sdk';
```

#### getEVMTokenHolders

Build a holder map from Transfer events. Keys are lowercase addresses. Excludes the zero address, `DEAD_ADDRESS`, and wallets with zero or negative balance.

```typescript
async function getEVMTokenHolders(
  client: EVMPublicClient,
  tokenAddress: `0x${string}`,
  fromBlock?: bigint,
  toBlock?: bigint
): Promise<Map<string, bigint>>
```

#### airdropETHToHolders

```typescript
async function airdropETHToHolders(
  publicClient: EVMPublicClient,
  walletClient: WalletClient,
  networkId: NetworkId,
  params: {
    appToken: `0x${string}`;
    distributionId: bigint;
    tokenAddress: `0x${string}`;
    totalAmount: bigint;
    fromBlock?: bigint;
  }
): Promise<{ hash: `0x${string}`; recipientCount: number }>
```

### Referral (Low-Level)

```typescript
import { createReferralFlow, getEVMReferralEarnings } from '@apps-fun/sdk';
```

#### createReferralFlow

Transform a payment flow to include a referrer split. Proportionally reduces existing splits to make room. Does not mutate the input config.

```typescript
function createReferralFlow(
  baseConfig: TokenFlowConfig,
  referrerAddress: `0x${string}`,
  referralBps: number              // 1-5000
): TokenFlowConfig
```

Scaling formula for each existing split: `newBps = Math.floor(split.bps * (10000 - referralBps) / 10000)`. Rounding deficit is added to the first split. Result splits always sum to 10000.

Throws:
- `Error('referralBps must be between 1 and 5000')`
- `Error('Base config splits must sum to 10000')`

```typescript
const referralFlow = createReferralFlow(baseFlow, '0xREFERRER', 1000); // 10% to referrer
```

#### getEVMReferralEarnings

```typescript
async function getEVMReferralEarnings(
  client: EVMPublicClient,
  networkId: NetworkId,
  referrerAddress: `0x${string}`,
  appToken?: `0x${string}`,
  fromBlock?: bigint
): Promise<{ totalETH: bigint; paymentCount: number }>
```

Filters DistributedETH events by referrer address (case-insensitive).

### Portfolio (Low-Level)

```typescript
import { getEVMPortfolio } from '@apps-fun/sdk';
```

#### getEVMPortfolio

```typescript
async function getEVMPortfolio(
  client: EVMPublicClient,
  networkId: NetworkId,
  walletAddress: `0x${string}`,
  tokens: `0x${string}`[]
): Promise<PortfolioEntry[]>
```

```typescript
interface PortfolioEntry {
  token: `0x${string}`;
  balance: bigint;
  balanceFormatted: number;
  decimals: number;
  ethValue: bigint;
  ethValueFormatted: number;
}
```

Uses `Promise.allSettled` for balance/decimals queries. Failed tokens are excluded. Zero-balance tokens skip the quote call (`ethValue = 0n`). Quote failures are caught and result in `ethValue = 0n`.

### Burn Analytics (Low-Level)

```typescript
import { getEVMBurnHistory, getEVMCirculatingSupply } from '@apps-fun/sdk';
```

#### getEVMBurnHistory

```typescript
async function getEVMBurnHistory(
  client: EVMPublicClient,
  tokenAddress: `0x${string}`,
  fromBlock?: bigint,
  toBlock?: bigint
): Promise<BurnEvent[]>
```

```typescript
interface BurnEvent {
  from: `0x${string}`;
  amount: bigint;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
}
```

Queries Transfer events where `to` equals `DEAD_ADDRESS`. Sorted by `blockNumber` ascending.

#### getEVMCirculatingSupply

```typescript
async function getEVMCirculatingSupply(
  client: EVMPublicClient,
  tokenAddress: `0x${string}`
): Promise<CirculatingSupplyStats>
```

```typescript
interface CirculatingSupplyStats {
  totalSupply: bigint;
  burned: bigint;
  circulating: bigint;              // totalSupply - burned
  burnPercent: number;              // 0 when totalSupply is 0
}
```

Queries `totalSupply` and `balanceOf(DEAD_ADDRESS)` in parallel.

### Confirm (Low-Level)

```typescript
import { waitForTransaction } from '@apps-fun/sdk';
```

#### waitForTransaction

```typescript
async function waitForTransaction(
  publicClient: EVMPublicClient,
  hash: `0x${string}`,
  options?: {
    confirmations?: number;         // Default: 1
    timeoutMs?: number;             // Default: 60000
  }
): Promise<{
  hash: `0x${string}`;
  status: 'success' | 'reverted';
  blockNumber: bigint;
  gasUsed: bigint;
}>
```

### Buyback Burn (Low-Level)

```typescript
import { buybackAndBurn } from '@apps-fun/sdk';
```

#### buybackAndBurn

```typescript
async function buybackAndBurn(
  publicClient: EVMPublicClient,
  walletClient: WalletClient,
  networkId: NetworkId,
  params: {
    tokenAddress: `0x${string}`;
    ethAmount: number;
    slippageBps?: number;
  }
): Promise<{
  buyHash: `0x${string}`;
  burnHash: `0x${string}`;
  tokensBurned: bigint;
  ethSpent: bigint;
}>
```

Executes a buy on the AppsFun AMM, then immediately burns the purchased tokens.

### Revenue Analytics (Low-Level)

```typescript
import { getRevenueStats } from '@apps-fun/sdk';
```

#### getRevenueStats

```typescript
async function getRevenueStats(
  publicClient: EVMPublicClient,
  networkId: NetworkId,
  appToken: `0x${string}`,
  fromBlock?: bigint
): Promise<{
  totalDistributions: number;
  totalETHDistributed: bigint;
  totalTokenDistributed: bigint;
  uniqueRecipients: number;
  latestDistributionId: bigint;
}>
```

Queries distribution logs and payout logs in parallel.

---

## Types

### NetworkId

```typescript
type NetworkId = 'solana' | 'base' | 'sepolia' | 'ethereum';
```

### EVMPublicClient

```typescript
type EVMPublicClient = PublicClient<Transport, Chain>;
```

A viem `PublicClient` bound to a specific chain.

### WalletClient

From viem. Must have an `account` property set. Used for all write operations.

---

## Contract Addresses

### All EVM Networks

All networks share the same default contract addresses:

| Contract | Address | Override Pattern |
|----------|---------|-----------------|
| AppsFun | `0xfFFfffFff91A48384F062D43f1672F217C20aB20` | `{NETWORK}_APPSFUN_ADDRESS` |
| FeeHolder | `0x36618900De93aAB3a9C765d39BC582F74120F403` | `{NETWORK}_FEEHOLDER_ADDRESS` |
| MultiSend | `0xF981Ce18176F39a0E93fed69E34ec54Ef8200aAE` | `{NETWORK}_MULTISEND_ADDRESS` |

Where `{NETWORK}` is `SEPOLIA`, `BASE`, or `ETHEREUM`. Each network can override addresses independently via environment variables.
