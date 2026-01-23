/**
 * Quote Integration Test
 *
 * Tests the getQuote method against the API
 *
 * Note: Requires a token that exists in the apps.fun database with a trading pool
 */

import { AppsFunClient } from '@apps-fun/sdk';

const API_URL = process.env.APPS_FUN_API_URL || 'https://apps.fun';
const TEST_TOKEN_MINT = process.env.TEST_TOKEN_MINT;

async function runTests() {
  console.log('=== Quote Integration Tests ===\n');
  console.log(`API URL: ${API_URL}`);
  console.log(`Test Token: ${TEST_TOKEN_MINT || '(not set)'}\n`);

  if (!TEST_TOKEN_MINT) {
    console.log('SKIP: Set TEST_TOKEN_MINT environment variable to run these tests');
    console.log('Example: TEST_TOKEN_MINT=<mint-address> npm run test:quote');
    process.exit(0);
  }

  const client = new AppsFunClient({
    cluster: 'devnet',
    apiUrl: API_URL,
  });

  let passed = 0;
  let failed = 0;

  // Test 1: Get buy quote (SOL -> Token)
  console.log('Test 1: Get buy quote (0.1 SOL -> Token)');
  try {
    const quote = await client.getQuote({
      mintAddress: TEST_TOKEN_MINT,
      amount: 0.1,
      inputMode: 'sol',
      side: 'buy',
    });

    console.log('  PASS: Buy quote retrieved');
    console.log(`    solAmount: ${quote.solAmount} SOL`);
    console.log(`    tokenAmount: ${quote.tokenAmount} tokens`);
    console.log(`    pricePerToken: ${quote.pricePerToken} SOL`);
    console.log(`    priceImpact: ${(quote.priceImpact * 100).toFixed(4)}%\n`);
    passed++;
  } catch (e) {
    const err = e as Error;
    console.log(`  FAIL: ${err.message}\n`);
    failed++;
  }

  // Test 2: Get sell quote (Token -> SOL)
  console.log('Test 2: Get sell quote (1000 tokens -> SOL)');
  try {
    const quote = await client.getQuote({
      mintAddress: TEST_TOKEN_MINT,
      amount: 1000,
      inputMode: 'token',
      side: 'sell',
    });

    console.log('  PASS: Sell quote retrieved');
    console.log(`    solAmount: ${quote.solAmount} SOL`);
    console.log(`    tokenAmount: ${quote.tokenAmount} tokens`);
    console.log(`    pricePerToken: ${quote.pricePerToken} SOL`);
    console.log(`    priceImpact: ${(quote.priceImpact * 100).toFixed(4)}%\n`);
    passed++;
  } catch (e) {
    const err = e as Error;
    console.log(`  FAIL: ${err.message}\n`);
    failed++;
  }

  // Test 3: Non-existent token
  console.log('Test 3: Quote for non-existent token');
  try {
    const fakeToken = 'FakeToken11111111111111111111111111111111111';
    await client.getQuote({
      mintAddress: fakeToken,
      amount: 0.1,
      inputMode: 'sol',
      side: 'buy',
    });
    console.log('  FAIL: Expected error for non-existent token\n');
    failed++;
  } catch (e) {
    const err = e as Error;
    if (err.message.includes('not found') || err.message.includes('404') || err.message.includes('Token')) {
      console.log('  PASS: Correctly errors for non-existent token');
      console.log(`    error: ${err.message}\n`);
      passed++;
    } else {
      console.log(`  FAIL: Unexpected error: ${err.message}\n`);
      failed++;
    }
  }

  // Test 4: Zero amount
  console.log('Test 4: Quote with zero amount');
  try {
    await client.getQuote({
      mintAddress: TEST_TOKEN_MINT,
      amount: 0,
      inputMode: 'sol',
      side: 'buy',
    });
    console.log('  FAIL: Expected error for zero amount\n');
    failed++;
  } catch (e) {
    const err = e as Error;
    console.log('  PASS: Correctly errors for zero amount');
    console.log(`    error: ${err.message}\n`);
    passed++;
  }

  // Summary
  console.log('=== Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
