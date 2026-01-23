# @apps-fun/sdk Agent Instructions

## Identity

This SDK enables token-gated apps on Solana using apps.fun bonding curves.

## Capabilities

- Token gating: Check wallet balances against thresholds
- Trading: Buy/sell tokens directly on-chain (no API auth required)
- Burns: Burn tokens to reduce supply
- Pool verification: Confirm pools use apps.fun fee structure

## Setup

```bash
npm install @apps-fun/sdk @solana/web3.js
```

## Token Gating

```typescript
import { TokenGate } from '@apps-fun/sdk';
import { Connection, PublicKey } from '@solana/web3.js';

const gate = new TokenGate({
  tokenMint: new PublicKey('TOKEN_MINT'),
  minAmount: BigInt(1_000_000),
  connection: new Connection('https://api.mainnet-beta.solana.com'),
});

const result = await gate.check('WALLET_ADDRESS');
if (result.allowed) { /* grant access */ }
```

## Trading

```typescript
import { buyTokenDirect, sellTokenDirect } from '@apps-fun/sdk';
import { Connection, Keypair } from '@solana/web3.js';

const connection = new Connection(RPC_URL);
const wallet = Keypair.fromSecretKey(secretKey);

// Buy with SOL
await buyTokenDirect(connection, {
  tokenMint: 'MINT',
  amount: 0.1,
  wallet,
});

// Sell tokens
await sellTokenDirect(connection, {
  tokenMint: 'MINT',
  amount: 1000,
  wallet,
});
```

## Burns

```typescript
import { burnTokenDirect } from '@apps-fun/sdk';

await burnTokenDirect(connection, {
  tokenMint: 'MINT',
  amount: 100,
  wallet,
});
```

## Pool Verification

```typescript
import { verifyAppsFunPool, getPoolInfo } from '@apps-fun/sdk';

const isAppsFun = await verifyAppsFunPool(connection, mint);
const info = await getPoolInfo(connection, mint);
```

## Security Requirements

- Never expose private keys in client code
- Validate all user inputs
- Use environment variables for RPC URLs and sensitive config
- All trading fees (1%) are collected at protocol level

## Testing

```bash
cd sdk && npm run build && npm run typecheck && npm test
```

## Fee Structure

All trades have 1% fee:
- 50% to apps.fun platform
- 50% to token creator

Fees are enforced at Meteora protocol level.
