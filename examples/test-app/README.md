# apps.fun SDK Test App

Integration tests for the apps.fun SDK running on Solana devnet.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure test wallet:

Either set environment variable:
```bash
export TEST_PRIVATE_KEY="[your devnet wallet private key array or base58]"
```

Or create a `test-wallet.json` file (see `test-wallet.json.example`).

**IMPORTANT**: Only use devnet test wallets! Never use mainnet wallets with real funds.

## Running Tests

Run all tests:
```bash
npm start
```

Run specific test suites:
```bash
npm run test:token-gate    # Token gating tests
npm run test:market        # Market data tests
npm run test:quote         # Quote tests
npm run test:e2e          # End-to-end test
npm run test:sdk-direct   # Direct SDK methods
```

## Test Wallets

The test files use devnet-only wallets. To get devnet SOL for testing:

1. Go to https://faucet.solana.com/
2. Enter your test wallet address
3. Request devnet SOL

## Security Note

This test app is for devnet testing only. The example wallet files are placeholders.
Never commit real private keys to version control.