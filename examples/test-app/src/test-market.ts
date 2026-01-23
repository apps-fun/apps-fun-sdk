/**
 * Market Data Integration Test
 *
 * Tests the getMarketData method against the API
 *
 * Note: Requires a token that exists in the apps.fun database
 */

import { AppsFunClient } from '@apps-fun/sdk';

const API_URL = process.env.APPS_FUN_API_URL || 'https://apps.fun';
const TEST_TOKEN_MINT = process.env.TEST_TOKEN_MINT;

async function runTests() {
  console.log('=== Market Data Integration Tests ===\n');
  console.log(`API URL: ${API_URL}`);
  console.log(`Test Token: ${TEST_TOKEN_MINT || '(not set)'}\n`);

  if (!TEST_TOKEN_MINT) {
    console.log('SKIP: Set TEST_TOKEN_MINT environment variable to run these tests');
    console.log('Example: TEST_TOKEN_MINT=<mint-address> npm run test:market');
    process.exit(0);
  }

  const client = new AppsFunClient({
    cluster: 'devnet',
    apiUrl: API_URL,
  });

  let passed = 0;
  let failed = 0;

  // Test 1: Get market data for token
  console.log('Test 1: Get market data');
  try {
    const data = await client.getMarketData(TEST_TOKEN_MINT);

    console.log('  PASS: Market data retrieved');
    console.log(`    price: ${data.price} SOL`);
    console.log(`    priceUsd: ${data.priceUsd ?? 'N/A'}`);
    console.log(`    marketCap: ${data.marketCap} SOL`);
    console.log(`    volume24h: ${data.volume24h} SOL`);
    console.log(`    bondingProgress: ${(data.bondingProgress * 100).toFixed(2)}%`);
    console.log(`    source: ${data.source}\n`);
    passed++;
  } catch (e) {
    const err = e as Error;
    console.log(`  FAIL: ${err.message}\n`);
    failed++;
  }

  // Test 2: Get price helper
  console.log('Test 2: getTokenPrice helper');
  try {
    const price = await client.getTokenPrice(TEST_TOKEN_MINT);

    console.log('  PASS: Token price retrieved');
    console.log(`    price: ${price} SOL\n`);
    passed++;
  } catch (e) {
    const err = e as Error;
    console.log(`  FAIL: ${err.message}\n`);
    failed++;
  }

  // Test 3: Non-existent token
  console.log('Test 3: Non-existent token');
  try {
    const fakeToken = 'FakeToken11111111111111111111111111111111111';
    await client.getMarketData(fakeToken);
    console.log('  FAIL: Expected error for non-existent token\n');
    failed++;
  } catch (e) {
    const err = e as Error;
    if (err.message.includes('not found') || err.message.includes('404')) {
      console.log('  PASS: Correctly errors for non-existent token');
      console.log(`    error: ${err.message}\n`);
      passed++;
    } else {
      console.log(`  FAIL: Unexpected error: ${err.message}\n`);
      failed++;
    }
  }

  // Summary
  console.log('=== Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
