# Next.js + Privy Token-Gated App

A template for building token-gated web apps with apps.fun SDK and Privy embedded wallets.

## Features

- Privy authentication (email, social, wallet)
- Embedded wallet support (no browser extension needed)
- Token gating with @apps-fun/sdk
- Buy/sell tokens directly in the app

## Setup

1. Copy this template:
   ```bash
   cp -r templates/nextjs-privy my-app
   cd my-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env.local` from `.env.example`:
   ```bash
   cp .env.example .env.local
   ```

4. Configure environment variables:
   - `NEXT_PUBLIC_PRIVY_APP_ID`: Get from [Privy Dashboard](https://dashboard.privy.io)
   - `NEXT_PUBLIC_TOKEN_MINT`: Your token mint address from apps.fun
   - `NEXT_PUBLIC_MIN_TOKENS`: Minimum tokens required for access (with decimals)

5. Run the app:
   ```bash
   npm run dev
   ```

## How It Works

### Token Gating

```typescript
const gate = new TokenGate({
  tokenMint: new PublicKey(TOKEN_MINT),
  minAmount: BigInt(1_000_000), // 1 token (6 decimals)
  connection,
});

const result = await gate.check(walletAddress);
if (result.allowed) {
  // Show gated content
}
```

### Trading with Privy Wallets

Since Privy wallets don't expose private keys, use the prepare/submit pattern:

```typescript
// 1. Prepare unsigned transaction
const prepared = await prepareDirectBuy(connection, {
  tokenMint: TOKEN_MINT,
  amount: 0.1, // SOL
  walletAddress: wallet.address,
});

// 2. Sign with Privy (shows approval popup)
const signedTx = await wallet.signTransaction(prepared.transaction);

// 3. Submit to network
const signature = await submitSignedTransaction(connection, signedTx);
```

## Customization

- Edit `src/app/page.tsx` to customize the UI
- Add more pages in `src/app/`
- Modify token gate threshold in `.env.local`
