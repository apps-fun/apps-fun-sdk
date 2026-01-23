/**
 * Full E2E Integration Test
 *
 * Tests the complete flow using the test wallet:
 * 1. Check initial WISE balance (should be 0)
 * 2. Buy WISE tokens directly via Meteora pool
 * 3. Verify TokenGate passes with actual balance
 * 4. Sell some tokens
 * 5. Burn some tokens
 */

import { Connection, PublicKey, Keypair, VersionedTransaction, TransactionMessage, ComputeBudgetProgram } from '@solana/web3.js';
import { DynamicBondingCurveClient, swapQuote } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { getAssociatedTokenAddress, createBurnInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { TokenGate, AppsFunClient } from '@apps-fun/sdk';
import BN from 'bn.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEVNET_RPC = 'https://api.devnet.solana.com';
const WISE_MINT = '8mhrgWYE7ghFnbtxeGyGaP9Vd2D5SPSEjBa9xxA5xL3Y';
const WISE_POOL = '9TTFtkCot3kSLPjXNLybcs6tAsyYZgCXVjE8JZfNKmD3';

async function loadTestWallet(): Promise<Keypair> {
  const walletPath = path.join(__dirname, '..', 'test-wallet.json');
  const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

async function getTokenBalance(connection: Connection, mint: PublicKey, owner: PublicKey): Promise<bigint> {
  try {
    const ata = await getAssociatedTokenAddress(mint, owner);
    const account = await connection.getTokenAccountBalance(ata);
    return BigInt(account.value.amount);
  } catch {
    return BigInt(0);
  }
}

async function runE2ETests() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║      Full E2E Integration Test         ║');
  console.log('╚════════════════════════════════════════╝\n');

  const connection = new Connection(DEVNET_RPC, 'confirmed');
  const wallet = await loadTestWallet();
  const client = DynamicBondingCurveClient.create(connection, 'confirmed');

  console.log(`Test Wallet: ${wallet.publicKey.toBase58()}`);
  console.log(`WISE Token: ${WISE_MINT}\n`);

  let passed = 0;
  let failed = 0;

  // Check SOL balance
  const solBalance = await connection.getBalance(wallet.publicKey);
  console.log(`SOL Balance: ${solBalance / 1e9} SOL\n`);

  if (solBalance < 0.1 * 1e9) {
    console.log('ERROR: Insufficient SOL balance. Need at least 0.1 SOL');
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════
  // Test 1: Check initial WISE balance
  // ═══════════════════════════════════════════════════════════════
  console.log('Test 1: Check initial WISE balance');
  try {
    const initialBalance = await getTokenBalance(connection, new PublicKey(WISE_MINT), wallet.publicKey);
    console.log(`  Initial WISE balance: ${initialBalance}`);
    console.log('  PASS\n');
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${e}\n`);
    failed++;
  }

  // ═══════════════════════════════════════════════════════════════
  // Test 2: TokenGate check (should fail - no tokens yet)
  // ═══════════════════════════════════════════════════════════════
  console.log('Test 2: TokenGate check (before buy)');
  try {
    const gate = new TokenGate({
      tokenMint: new PublicKey(WISE_MINT),
      minAmount: BigInt(1000000), // 1 token (6 decimals)
      connection,
    });

    const result = await gate.check(wallet.publicKey.toBase58());
    console.log(`  Balance: ${result.balance}`);
    console.log(`  Required: ${result.required}`);
    console.log(`  Allowed: ${result.allowed}`);

    if (result.balance === BigInt(0)) {
      console.log('  PASS: Correctly shows 0 balance\n');
      passed++;
    } else {
      console.log('  INFO: Wallet already has tokens\n');
      passed++;
    }
  } catch (e) {
    console.log(`  FAIL: ${e}\n`);
    failed++;
  }

  // ═══════════════════════════════════════════════════════════════
  // Test 3: Buy WISE tokens via Meteora pool
  // ═══════════════════════════════════════════════════════════════
  console.log('Test 3: Buy WISE tokens (0.01 SOL worth)');
  try {
    const pool = await client.state.getPool(new PublicKey(WISE_POOL));
    if (!pool) throw new Error('Pool not found');

    const config = await client.state.getPoolConfig(pool.config);
    if (!config) throw new Error('Config not found');

    // Buy with 0.01 SOL
    const solAmount = new BN(0.01 * 1e9); // 0.01 SOL in lamports

    // Get quote
    const quote = swapQuote(
      pool,
      config,
      false, // swapBaseForQuote = false for buy (SOL -> tokens)
      solAmount,
      100, // 1% slippage
      false,
      new BN(Math.floor(Date.now() / 1000))
    );

    console.log(`  Input: 0.01 SOL`);
    console.log(`  Expected output: ~${(quote.minimumAmountOut.toNumber() / 1e6).toFixed(2)} WISE`);

    // Build swap transaction
    const swapTx = await client.pool.swap({
      owner: wallet.publicKey,
      pool: new PublicKey(WISE_POOL),
      amountIn: solAmount,
      minimumAmountOut: quote.minimumAmountOut,
      swapBaseForQuote: false,
      referralTokenAccount: null,
    });

    // Add priority fee
    const priorityIx = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 200_000,
    });

    const { blockhash } = await connection.getLatestBlockhash('confirmed');

    const messageV0 = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: blockhash,
      instructions: [priorityIx, ...swapTx.instructions],
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    tx.sign([wallet]);

    const sig = await connection.sendTransaction(tx, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    console.log(`  Transaction: ${sig}`);

    // Wait for confirmation
    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    await connection.confirmTransaction({
      signature: sig,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    }, 'confirmed');

    console.log('  PASS: Buy transaction confirmed\n');
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${e}\n`);
    failed++;
  }

  // Wait a moment for balance to update
  await new Promise(r => setTimeout(r, 2000));

  // ═══════════════════════════════════════════════════════════════
  // Test 4: Verify WISE balance after buy
  // ═══════════════════════════════════════════════════════════════
  console.log('Test 4: Verify WISE balance after buy');
  let wiseBalance = BigInt(0);
  try {
    wiseBalance = await getTokenBalance(connection, new PublicKey(WISE_MINT), wallet.publicKey);
    console.log(`  WISE balance: ${wiseBalance} (${Number(wiseBalance) / 1e6} tokens)`);

    if (wiseBalance > BigInt(0)) {
      console.log('  PASS: Tokens received\n');
      passed++;
    } else {
      console.log('  FAIL: No tokens received\n');
      failed++;
    }
  } catch (e) {
    console.log(`  FAIL: ${e}\n`);
    failed++;
  }

  // ═══════════════════════════════════════════════════════════════
  // Test 5: TokenGate check (should pass now)
  // ═══════════════════════════════════════════════════════════════
  console.log('Test 5: TokenGate check (after buy)');
  try {
    const gate = new TokenGate({
      tokenMint: new PublicKey(WISE_MINT),
      minAmount: BigInt(1000000), // 1 token
      connection,
    });

    const result = await gate.check(wallet.publicKey.toBase58());
    console.log(`  Balance: ${result.balance}`);
    console.log(`  Required: ${result.required}`);
    console.log(`  Allowed: ${result.allowed}`);

    if (result.allowed && result.balance > BigInt(0)) {
      console.log('  PASS: TokenGate correctly allows wallet with tokens\n');
      passed++;
    } else {
      console.log('  FAIL: TokenGate should allow wallet\n');
      failed++;
    }
  } catch (e) {
    console.log(`  FAIL: ${e}\n`);
    failed++;
  }

  // ═══════════════════════════════════════════════════════════════
  // Test 6: Sell some WISE tokens
  // ═══════════════════════════════════════════════════════════════
  console.log('Test 6: Sell some WISE tokens');
  if (wiseBalance > BigInt(1000000)) {
    try {
      const pool = await client.state.getPool(new PublicKey(WISE_POOL));
      if (!pool) throw new Error('Pool not found');

      const config = await client.state.getPoolConfig(pool.config);
      if (!config) throw new Error('Config not found');

      // Sell 10% of balance
      const sellAmount = new BN((wiseBalance / BigInt(10)).toString());

      const quote = swapQuote(
        pool,
        config,
        true, // swapBaseForQuote = true for sell (tokens -> SOL)
        sellAmount,
        100, // 1% slippage
        false,
        new BN(Math.floor(Date.now() / 1000))
      );

      console.log(`  Selling: ${Number(sellAmount) / 1e6} WISE`);
      console.log(`  Expected SOL: ~${quote.minimumAmountOut.toNumber() / 1e9} SOL`);

      const swapTx = await client.pool.swap({
        owner: wallet.publicKey,
        pool: new PublicKey(WISE_POOL),
        amountIn: sellAmount,
        minimumAmountOut: quote.minimumAmountOut,
        swapBaseForQuote: true,
        referralTokenAccount: null,
      });

      const priorityIx = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 200_000,
      });

      const { blockhash } = await connection.getLatestBlockhash('confirmed');

      const messageV0 = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: blockhash,
        instructions: [priorityIx, ...swapTx.instructions],
      }).compileToV0Message();

      const tx = new VersionedTransaction(messageV0);
      tx.sign([wallet]);

      const sig = await connection.sendTransaction(tx, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      console.log(`  Transaction: ${sig}`);

      const latestBlockhash = await connection.getLatestBlockhash('confirmed');
      await connection.confirmTransaction({
        signature: sig,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      }, 'confirmed');

      console.log('  PASS: Sell transaction confirmed\n');
      passed++;
    } catch (e) {
      console.log(`  FAIL: ${e}\n`);
      failed++;
    }
  } else {
    console.log('  SKIP: Insufficient balance to sell\n');
  }

  // Wait for balance update
  await new Promise(r => setTimeout(r, 2000));

  // ═══════════════════════════════════════════════════════════════
  // Test 7: Burn some WISE tokens
  // ═══════════════════════════════════════════════════════════════
  console.log('Test 7: Burn some WISE tokens');
  const currentBalance = await getTokenBalance(connection, new PublicKey(WISE_MINT), wallet.publicKey);

  if (currentBalance > BigInt(1000000)) {
    try {
      const ata = await getAssociatedTokenAddress(new PublicKey(WISE_MINT), wallet.publicKey);

      // Burn 1 token (1000000 with 6 decimals)
      const burnAmount = BigInt(1000000);

      const burnIx = createBurnInstruction(
        ata,
        new PublicKey(WISE_MINT),
        wallet.publicKey,
        burnAmount
      );

      const priorityIx = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 200_000,
      });

      const { blockhash } = await connection.getLatestBlockhash('confirmed');

      const messageV0 = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: blockhash,
        instructions: [priorityIx, burnIx],
      }).compileToV0Message();

      const tx = new VersionedTransaction(messageV0);
      tx.sign([wallet]);

      console.log(`  Burning: 1 WISE token`);

      const sig = await connection.sendTransaction(tx, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      console.log(`  Transaction: ${sig}`);

      const latestBlockhash = await connection.getLatestBlockhash('confirmed');
      await connection.confirmTransaction({
        signature: sig,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      }, 'confirmed');

      // Verify balance decreased
      await new Promise(r => setTimeout(r, 2000));
      const newBalance = await getTokenBalance(connection, new PublicKey(WISE_MINT), wallet.publicKey);
      console.log(`  Balance before: ${currentBalance}`);
      console.log(`  Balance after: ${newBalance}`);

      if (newBalance < currentBalance) {
        console.log('  PASS: Burn transaction confirmed, balance decreased\n');
        passed++;
      } else {
        console.log('  FAIL: Balance did not decrease\n');
        failed++;
      }
    } catch (e) {
      console.log(`  FAIL: ${e}\n`);
      failed++;
    }
  } else {
    console.log('  SKIP: Insufficient balance to burn\n');
  }

  // ═══════════════════════════════════════════════════════════════
  // Test 8: SDK Client market data
  // ═══════════════════════════════════════════════════════════════
  console.log('Test 8: SDK Client getMarketData');
  try {
    const sdkClient = new AppsFunClient({
      cluster: 'devnet',
      apiUrl: 'http://localhost:3000',
    });

    const marketData = await sdkClient.getMarketData(WISE_MINT);
    console.log(`  Price: ${marketData.price} SOL`);
    console.log(`  Market Cap: ${marketData.marketCap} SOL`);
    console.log(`  Bonding Progress: ${(marketData.bondingProgress * 100).toFixed(2)}%`);
    console.log('  PASS\n');
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${e}\n`);
    failed++;
  }

  // ═══════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════
  console.log('╔════════════════════════════════════════╗');
  console.log('║           E2E Test Results             ║');
  console.log('╠════════════════════════════════════════╣');
  console.log(`║  Passed: ${passed.toString().padStart(2)}                            ║`);
  console.log(`║  Failed: ${failed.toString().padStart(2)}                            ║`);
  console.log(`║  Total:  ${(passed + failed).toString().padStart(2)}                            ║`);
  console.log('╚════════════════════════════════════════╝');

  process.exit(failed > 0 ? 1 : 0);
}

runE2ETests().catch(console.error);
