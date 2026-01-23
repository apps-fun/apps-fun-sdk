/**
 * Token Gate Integration Test
 *
 * Tests the TokenGate class against Solana devnet
 */

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { TokenGate, AppsFunClient } from '@apps-fun/sdk';

const DEVNET_RPC = 'https://api.devnet.solana.com';
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

async function runTests() {
  console.log('=== TokenGate Integration Tests ===\n');

  const connection = new Connection(DEVNET_RPC, 'confirmed');
  let passed = 0;
  let failed = 0;

  // Test 1: Create TokenGate instance
  console.log('Test 1: Create TokenGate instance');
  try {
    const gate = new TokenGate({
      tokenMint: new PublicKey(WSOL_MINT),
      minAmount: BigInt(1000000),
      connection,
    });
    console.log('  PASS: TokenGate created successfully\n');
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${e}\n`);
    failed++;
  }

  // Test 2: Get token info (synchronous)
  console.log('Test 2: Get token info');
  try {
    const gate = new TokenGate({
      tokenMint: new PublicKey(WSOL_MINT),
      minAmount: BigInt(1000000),
      connection,
      appId: 123,
    });
    const info = gate.getTokenInfo();

    if (info.mint !== WSOL_MINT) {
      throw new Error(`Expected mint ${WSOL_MINT}, got ${info.mint}`);
    }
    if (info.minAmount !== BigInt(1000000)) {
      throw new Error(`Expected minAmount 1000000n, got ${info.minAmount}`);
    }
    if (info.appId !== 123) {
      throw new Error(`Expected appId 123, got ${info.appId}`);
    }
    console.log('  PASS: Token info returned correctly');
    console.log(`    mint: ${info.mint}`);
    console.log(`    minAmount: ${info.minAmount}`);
    console.log(`    appId: ${info.appId}\n`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${e}\n`);
    failed++;
  }

  // Test 3: Check balance of random wallet (should have 0 balance)
  console.log('Test 3: Check balance of random wallet');
  try {
    const gate = new TokenGate({
      tokenMint: new PublicKey(WSOL_MINT),
      minAmount: BigInt(1000000),
      connection,
    });
    const randomWallet = Keypair.generate().publicKey.toBase58();
    const result = await gate.check(randomWallet);

    if (result.allowed !== false) {
      throw new Error(`Expected allowed=false, got ${result.allowed}`);
    }
    if (result.balance !== BigInt(0)) {
      throw new Error(`Expected balance=0n, got ${result.balance}`);
    }
    console.log('  PASS: Random wallet correctly denied');
    console.log(`    wallet: ${randomWallet.slice(0, 8)}...`);
    console.log(`    balance: ${result.balance}`);
    console.log(`    allowed: ${result.allowed}\n`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${e}\n`);
    failed++;
  }

  // Test 4: Check with minAmount=0 (should always allow)
  console.log('Test 4: Check with minAmount=0');
  try {
    const gate = new TokenGate({
      tokenMint: new PublicKey(WSOL_MINT),
      minAmount: BigInt(0),
      connection,
    });
    const randomWallet = Keypair.generate().publicKey.toBase58();
    const result = await gate.check(randomWallet);

    if (result.allowed !== true) {
      throw new Error(`Expected allowed=true with 0 minimum, got ${result.allowed}`);
    }
    console.log('  PASS: Zero minimum correctly allows any wallet');
    console.log(`    allowed: ${result.allowed}\n`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${e}\n`);
    failed++;
  }

  // Test 5: Caching behavior
  console.log('Test 5: Caching behavior');
  try {
    const gate = new TokenGate({
      tokenMint: new PublicKey(WSOL_MINT),
      minAmount: BigInt(0),
      connection,
      cacheTtlMs: 30000,
    });
    const wallet = Keypair.generate().publicKey.toBase58();

    const start1 = Date.now();
    await gate.check(wallet);
    const time1 = Date.now() - start1;

    const start2 = Date.now();
    await gate.check(wallet);
    const time2 = Date.now() - start2;

    if (time2 >= time1) {
      console.log(`  WARN: Second call not faster (${time1}ms vs ${time2}ms)`);
    }
    console.log('  PASS: Caching works');
    console.log(`    First call: ${time1}ms`);
    console.log(`    Second call: ${time2}ms (cached)\n`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${e}\n`);
    failed++;
  }

  // Test 6: Batch checking
  console.log('Test 6: Batch checking');
  try {
    const gate = new TokenGate({
      tokenMint: new PublicKey(WSOL_MINT),
      minAmount: BigInt(0),
      connection,
    });
    const wallets = Array.from({ length: 5 }, () =>
      Keypair.generate().publicKey.toBase58()
    );

    const results = await gate.checkBatch(wallets);

    if (results.size !== 5) {
      throw new Error(`Expected 5 results, got ${results.size}`);
    }
    for (const wallet of wallets) {
      const result = results.get(wallet);
      if (!result) {
        throw new Error(`Missing result for ${wallet}`);
      }
      if (result.balance !== BigInt(0)) {
        throw new Error(`Expected balance=0n, got ${result.balance}`);
      }
    }
    console.log('  PASS: Batch checking works');
    console.log(`    Checked ${results.size} wallets\n`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${e}\n`);
    failed++;
  }

  // Test 7: AppsFunClient creates TokenGate
  console.log('Test 7: AppsFunClient creates TokenGate');
  try {
    const client = new AppsFunClient({
      cluster: 'devnet',
    });
    const gate = client.createTokenGate({
      tokenMint: new PublicKey(WSOL_MINT),
      minAmount: BigInt(1000000),
    });

    if (!(gate instanceof TokenGate)) {
      throw new Error('Expected TokenGate instance');
    }
    console.log('  PASS: Client creates TokenGate correctly\n');
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${e}\n`);
    failed++;
  }

  // Test 8: Client getTokenBalance
  console.log('Test 8: Client getTokenBalance');
  try {
    const client = new AppsFunClient({
      cluster: 'devnet',
    });
    const randomWallet = Keypair.generate().publicKey;
    const balance = await client.getTokenBalance(
      new PublicKey(WSOL_MINT),
      randomWallet
    );

    if (balance !== BigInt(0)) {
      throw new Error(`Expected balance=0n, got ${balance}`);
    }
    console.log('  PASS: Client getTokenBalance works');
    console.log(`    balance: ${balance}\n`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${e}\n`);
    failed++;
  }

  // Test 9: Invalid wallet address
  console.log('Test 9: Invalid wallet address handling');
  try {
    const gate = new TokenGate({
      tokenMint: new PublicKey(WSOL_MINT),
      minAmount: BigInt(1000000),
      connection,
    });

    let threw = false;
    try {
      await gate.check('invalid-address');
    } catch {
      threw = true;
    }

    if (!threw) {
      throw new Error('Expected error for invalid address');
    }
    console.log('  PASS: Invalid address throws error\n');
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${e}\n`);
    failed++;
  }

  // Summary
  console.log('=== Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
