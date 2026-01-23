/**
 * SDK Direct Methods E2E Test
 *
 * Tests the SDK's direct on-chain methods and verifies fees are collected correctly.
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import {
  buyTokenDirect,
  sellTokenDirect,
  burnTokenDirect,
  getPoolInfo,
  verifyAppsFunPool,
  getPoolFeeMetrics,
  TokenGate,
  APPS_FUN_FEE_CLAIMER,
} from '@apps-fun/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEVNET_RPC = 'https://api.devnet.solana.com';
const WISE_MINT = '8mhrgWYE7ghFnbtxeGyGaP9Vd2D5SPSEjBa9xxA5xL3Y';

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

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║      SDK Direct Methods E2E Test + Fee Verification        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const connection = new Connection(DEVNET_RPC, 'confirmed');
  const wallet = await loadTestWallet();

  console.log(`Test Wallet: ${wallet.publicKey.toBase58()}`);
  console.log(`WISE Token: ${WISE_MINT}`);
  console.log(`Expected Fee Claimer: ${APPS_FUN_FEE_CLAIMER.toBase58()}\n`);

  let passed = 0;
  let failed = 0;

  // Check SOL balance
  const solBalance = await connection.getBalance(wallet.publicKey);
  console.log(`SOL Balance: ${solBalance / LAMPORTS_PER_SOL} SOL\n`);

  if (solBalance < 0.05 * LAMPORTS_PER_SOL) {
    console.log('ERROR: Insufficient SOL balance. Need at least 0.05 SOL');
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════
  // Test 1: Get pool info and verify it's an apps.fun pool
  // ═══════════════════════════════════════════════════════════════
  console.log('Test 1: Get pool info and verify apps.fun pool');
  try {
    const poolInfo = await getPoolInfo(connection, WISE_MINT);

    console.log('  Pool Info:');
    console.log(`    Pool Address: ${poolInfo.poolAddress}`);
    console.log(`    Fee Claimer: ${poolInfo.feeClaimer}`);
    console.log(`    Creator: ${poolInfo.creator}`);
    console.log(`    Is Apps.fun Pool: ${poolInfo.isAppsFunPool}`);
    console.log(`    Trading Fee: ${poolInfo.tradingFeePercent}%`);
    console.log(`    Creator Fee: ${poolInfo.creatorFeePercent}%`);
    console.log(`    Partner Fee: ${poolInfo.partnerFeePercent}%`);

    if (poolInfo.isAppsFunPool) {
      console.log('  PASS: Pool verified as apps.fun pool\n');
      passed++;
    } else {
      console.log('  FAIL: Pool is NOT an apps.fun pool\n');
      failed++;
    }
  } catch (e) {
    console.log(`  FAIL: ${e}\n`);
    failed++;
  }

  // ═══════════════════════════════════════════════════════════════
  // Test 2: verifyAppsFunPool helper
  // ═══════════════════════════════════════════════════════════════
  console.log('Test 2: verifyAppsFunPool helper');
  try {
    const isAppsFun = await verifyAppsFunPool(connection, WISE_MINT);

    if (isAppsFun) {
      console.log('  PASS: verifyAppsFunPool returns true\n');
      passed++;
    } else {
      console.log('  FAIL: verifyAppsFunPool should return true\n');
      failed++;
    }
  } catch (e) {
    console.log(`  FAIL: ${e}\n`);
    failed++;
  }

  // ═══════════════════════════════════════════════════════════════
  // Test 3: Get initial fee metrics
  // ═══════════════════════════════════════════════════════════════
  console.log('Test 3: Get initial fee metrics');
  let initialPartnerFees = 0n;
  let initialCreatorFees = 0n;
  try {
    const fees = await getPoolFeeMetrics(connection, WISE_MINT);

    initialPartnerFees = fees.partnerClaimableLamports;
    initialCreatorFees = fees.creatorClaimableLamports;

    console.log('  Initial Claimable Fees:');
    console.log(`    Partner (apps.fun): ${fees.partnerClaimableSol.toFixed(9)} SOL`);
    console.log(`    Creator: ${fees.creatorClaimableSol.toFixed(9)} SOL`);
    console.log('  PASS\n');
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${e}\n`);
    failed++;
  }

  // ═══════════════════════════════════════════════════════════════
  // Test 4: Buy tokens using SDK direct method
  // ═══════════════════════════════════════════════════════════════
  console.log('Test 4: Buy tokens using buyTokenDirect (0.005 SOL)');
  try {
    const result = await buyTokenDirect(connection, {
      tokenMint: WISE_MINT,
      amount: 0.005, // 0.005 SOL
      wallet,
      slippageBps: 200, // 2% slippage
    });

    console.log('  Buy Result:');
    console.log(`    Signature: ${result.signature}`);
    console.log(`    Input: ${result.inputAmount} SOL`);
    console.log(`    Output: ${result.outputAmount} tokens`);
    console.log('  PASS\n');
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${e}\n`);
    failed++;
  }

  // Wait for fees to update
  await new Promise(r => setTimeout(r, 3000));

  // ═══════════════════════════════════════════════════════════════
  // Test 5: Verify fees increased after buy
  // ═══════════════════════════════════════════════════════════════
  console.log('Test 5: Verify fees increased after buy');
  try {
    const fees = await getPoolFeeMetrics(connection, WISE_MINT);

    const partnerFeesAfterBuy = fees.partnerClaimableLamports;
    const creatorFeesAfterBuy = fees.creatorClaimableLamports;

    const partnerFeeIncrease = partnerFeesAfterBuy - initialPartnerFees;
    const creatorFeeIncrease = creatorFeesAfterBuy - initialCreatorFees;

    console.log('  Fee Changes:');
    console.log(`    Partner fee increase: ${Number(partnerFeeIncrease) / LAMPORTS_PER_SOL} SOL`);
    console.log(`    Creator fee increase: ${Number(creatorFeeIncrease) / LAMPORTS_PER_SOL} SOL`);

    if (partnerFeeIncrease > 0n) {
      console.log('  PASS: Partner (apps.fun) fees increased - FEES ARE BEING COLLECTED\n');
      passed++;
    } else {
      console.log('  FAIL: Partner fees did not increase\n');
      failed++;
    }

    // Update for next comparison
    initialPartnerFees = partnerFeesAfterBuy;
    initialCreatorFees = creatorFeesAfterBuy;
  } catch (e) {
    console.log(`  FAIL: ${e}\n`);
    failed++;
  }

  // ═══════════════════════════════════════════════════════════════
  // Test 6: Check token balance with TokenGate
  // ═══════════════════════════════════════════════════════════════
  console.log('Test 6: TokenGate check after buy');
  try {
    const gate = new TokenGate({
      tokenMint: new PublicKey(WISE_MINT),
      minAmount: BigInt(1000000), // 1 token
      connection,
    });

    const result = await gate.check(wallet.publicKey.toBase58());

    console.log(`  Balance: ${result.balance}`);
    console.log(`  Allowed: ${result.allowed}`);

    if (result.allowed && result.balance > BigInt(0)) {
      console.log('  PASS\n');
      passed++;
    } else {
      console.log('  FAIL: Should have tokens and be allowed\n');
      failed++;
    }
  } catch (e) {
    console.log(`  FAIL: ${e}\n`);
    failed++;
  }

  // ═══════════════════════════════════════════════════════════════
  // Test 7: Sell tokens using SDK direct method
  // ═══════════════════════════════════════════════════════════════
  console.log('Test 7: Sell tokens using sellTokenDirect (1000 tokens)');
  try {
    const result = await sellTokenDirect(connection, {
      tokenMint: WISE_MINT,
      amount: 1000, // 1000 tokens
      wallet,
      slippageBps: 200,
    });

    console.log('  Sell Result:');
    console.log(`    Signature: ${result.signature}`);
    console.log(`    Input: ${result.inputAmount} tokens`);
    console.log(`    Output: ${result.outputAmount} SOL`);
    console.log('  PASS\n');
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${e}\n`);
    failed++;
  }

  // Wait for fees to update
  await new Promise(r => setTimeout(r, 3000));

  // ═══════════════════════════════════════════════════════════════
  // Test 8: Verify fees increased after sell
  // ═══════════════════════════════════════════════════════════════
  console.log('Test 8: Verify fees increased after sell');
  try {
    const fees = await getPoolFeeMetrics(connection, WISE_MINT);

    const partnerFeesAfterSell = fees.partnerClaimableLamports;
    const creatorFeesAfterSell = fees.creatorClaimableLamports;

    const partnerFeeIncrease = partnerFeesAfterSell - initialPartnerFees;
    const creatorFeeIncrease = creatorFeesAfterSell - initialCreatorFees;

    console.log('  Fee Changes:');
    console.log(`    Partner fee increase: ${Number(partnerFeeIncrease) / LAMPORTS_PER_SOL} SOL`);
    console.log(`    Creator fee increase: ${Number(creatorFeeIncrease) / LAMPORTS_PER_SOL} SOL`);
    console.log('');
    console.log('  Total Claimable Fees:');
    console.log(`    Partner (apps.fun): ${fees.partnerClaimableSol.toFixed(9)} SOL`);
    console.log(`    Creator: ${fees.creatorClaimableSol.toFixed(9)} SOL`);

    if (partnerFeeIncrease > 0n) {
      console.log('  PASS: Partner (apps.fun) fees increased\n');
      passed++;
    } else {
      console.log('  FAIL: Partner fees did not increase\n');
      failed++;
    }

    initialPartnerFees = partnerFeesAfterSell;
    initialCreatorFees = creatorFeesAfterSell;
  } catch (e) {
    console.log(`  FAIL: ${e}\n`);
    failed++;
  }

  // ═══════════════════════════════════════════════════════════════
  // Test 9: Burn tokens using SDK direct method
  // ═══════════════════════════════════════════════════════════════
  console.log('Test 9: Burn tokens using burnTokenDirect (1 token)');
  try {
    const balanceBefore = await getTokenBalance(connection, new PublicKey(WISE_MINT), wallet.publicKey);

    const result = await burnTokenDirect(connection, {
      tokenMint: WISE_MINT,
      amount: 1, // 1 token
      wallet,
    });

    console.log('  Burn Result:');
    console.log(`    Signature: ${result.signature}`);
    console.log(`    Burned: ${result.burnedAmount} tokens`);

    // Verify balance decreased
    await new Promise(r => setTimeout(r, 2000));
    const balanceAfter = await getTokenBalance(connection, new PublicKey(WISE_MINT), wallet.publicKey);

    if (balanceAfter < balanceBefore) {
      console.log(`    Balance before: ${balanceBefore}`);
      console.log(`    Balance after: ${balanceAfter}`);
      console.log('  PASS: Tokens burned successfully\n');
      passed++;
    } else {
      console.log('  FAIL: Balance did not decrease\n');
      failed++;
    }
  } catch (e) {
    console.log(`  FAIL: ${e}\n`);
    failed++;
  }

  // ═══════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║              SDK Direct Methods Test Results               ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Passed: ${passed.toString().padStart(2)}                                                 ║`);
  console.log(`║  Failed: ${failed.toString().padStart(2)}                                                 ║`);
  console.log(`║  Total:  ${(passed + failed).toString().padStart(2)}                                                 ║`);
  console.log('╠════════════════════════════════════════════════════════════╣');

  if (failed === 0) {
    console.log('║  STATUS: ALL TESTS PASSED                                  ║');
    console.log('║  FEES: Verified collecting to apps.fun fee claimer         ║');
  } else {
    console.log('║  STATUS: SOME TESTS FAILED                                 ║');
  }

  console.log('╚════════════════════════════════════════════════════════════╝');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
