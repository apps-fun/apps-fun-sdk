/**
 * apps.fun SDK Test Suite
 *
 * Runs all integration tests against devnet
 *
 * Usage:
 *   npm start                     # Run all tests
 *   npm run test:token-gate       # Run TokenGate tests only
 *   npm run test:market           # Run market data tests (requires TEST_TOKEN_MINT)
 *   npm run test:quote            # Run quote tests (requires TEST_TOKEN_MINT)
 *
 * Environment variables:
 *   APPS_FUN_API_URL      - API URL (default: https://apps.fun)
 *   TEST_TOKEN_MINT       - Token mint address for API tests
 *   TEST_WALLET           - Wallet address for balance tests
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runScript(name: string): Promise<{ passed: number; failed: number }> {
  return new Promise((resolve) => {
    const script = join(__dirname, `test-${name}.ts`);
    const child = spawn('npx', ['tsx', script], {
      stdio: 'inherit',
      shell: true,
    });

    child.on('close', (code) => {
      resolve({
        passed: code === 0 ? 1 : 0,
        failed: code !== 0 ? 1 : 0,
      });
    });
  });
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║     apps.fun SDK Integration Tests     ║');
  console.log('╚════════════════════════════════════════╝\n');

  const results: { name: string; passed: boolean }[] = [];

  // Always run TokenGate tests (no external dependencies)
  console.log('\n[1/3] Running TokenGate tests...\n');
  const tokenGateResult = await runScript('token-gate');
  results.push({ name: 'TokenGate', passed: tokenGateResult.failed === 0 });

  // Run market tests if TEST_TOKEN_MINT is set
  console.log('\n[2/3] Running Market Data tests...\n');
  const marketResult = await runScript('market');
  results.push({ name: 'Market Data', passed: marketResult.failed === 0 });

  // Run quote tests if TEST_TOKEN_MINT is set
  console.log('\n[3/3] Running Quote tests...\n');
  const quoteResult = await runScript('quote');
  results.push({ name: 'Quote', passed: quoteResult.failed === 0 });

  // Summary
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║           Test Suite Summary           ║');
  console.log('╠════════════════════════════════════════╣');

  for (const result of results) {
    const status = result.passed ? 'PASS' : 'FAIL';
    const icon = result.passed ? '[x]' : '[ ]';
    console.log(`║ ${icon} ${result.name.padEnd(30)} ${status.padStart(4)} ║`);
  }

  console.log('╚════════════════════════════════════════╝');

  const allPassed = results.every((r) => r.passed);
  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
