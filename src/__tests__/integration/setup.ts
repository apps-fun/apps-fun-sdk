import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Devnet RPC URL
export const DEVNET_RPC_URL = 'https://api.devnet.solana.com';

// Well-known devnet addresses for testing
export const TEST_ADDRESSES = {
  // System program (always exists)
  SYSTEM_PROGRAM: '11111111111111111111111111111111',
  // Wrapped SOL mint
  WSOL_MINT: 'So11111111111111111111111111111111111111112',
  // Token program
  TOKEN_PROGRAM: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  // A known wallet with WSOL on devnet (Solana faucet related)
  // This is a placeholder - we'll use actual wallets that have tokens
};

// Create a connection to devnet
export function getDevnetConnection(): Connection {
  return new Connection(DEVNET_RPC_URL, 'confirmed');
}

// Check if we can connect to devnet
export async function checkDevnetConnection(): Promise<boolean> {
  try {
    const connection = getDevnetConnection();
    const version = await connection.getVersion();
    console.log(`Connected to Solana devnet: ${version['solana-core']}`);
    return true;
  } catch (error) {
    console.error('Failed to connect to devnet:', error);
    return false;
  }
}

// Get a wallet's SOL balance
export async function getWalletSolBalance(
  connection: Connection,
  wallet: string
): Promise<number> {
  const balance = await connection.getBalance(new PublicKey(wallet));
  return balance / LAMPORTS_PER_SOL;
}

// Find a wallet with SPL tokens for testing (queries token accounts)
export async function findWalletWithTokens(
  connection: Connection,
  tokenMint: string
): Promise<string | null> {
  try {
    // Get largest token accounts for this mint
    const accounts = await connection.getTokenLargestAccounts(
      new PublicKey(tokenMint)
    );

    if (accounts.value.length === 0) {
      return null;
    }

    // Get the account info to find the owner
    const accountInfo = await connection.getParsedAccountInfo(
      accounts.value[0].address
    );

    if (accountInfo.value && 'parsed' in accountInfo.value.data) {
      const parsed = accountInfo.value.data as {
        parsed: { info: { owner: string } };
      };
      return parsed.parsed.info.owner;
    }

    return null;
  } catch {
    return null;
  }
}

// Test configuration from environment
export function getTestConfig() {
  return {
    rpcUrl: process.env.SOLANA_RPC_URL || DEVNET_RPC_URL,
    apiUrl: process.env.APPS_FUN_API_URL || 'http://localhost:3000',
    authToken: process.env.TEST_AUTH_TOKEN || null,
    testWallet: process.env.TEST_WALLET || null,
    testTokenMint: process.env.TEST_TOKEN_MINT || null,
  };
}

// Skip test helper for conditional tests
export function skipIf(condition: boolean, message: string) {
  if (condition) {
    console.log(`SKIPPING: ${message}`);
    return true;
  }
  return false;
}
