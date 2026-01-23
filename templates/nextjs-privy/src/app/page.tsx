'use client';

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useState, useEffect } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  TokenGate,
  prepareDirectBuy,
  prepareDirectSell,
  submitSignedTransaction,
} from '@apps-fun/sdk';

const connection = new Connection(
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
);

const TOKEN_MINT = process.env.NEXT_PUBLIC_TOKEN_MINT!;
const MIN_TOKENS = BigInt(process.env.NEXT_PUBLIC_MIN_TOKENS || '1000000');

export default function Home() {
  const { login, logout, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const [hasAccess, setHasAccess] = useState(false);
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<string>('');

  const wallet = wallets[0];

  // Check token gate
  useEffect(() => {
    async function checkAccess() {
      if (!wallet?.address) return;

      const gate = new TokenGate({
        tokenMint: new PublicKey(TOKEN_MINT),
        minAmount: MIN_TOKENS,
        connection,
      });

      const result = await gate.check(wallet.address);
      setHasAccess(result.allowed);
      setBalance(result.balance);
    }

    checkAccess();
  }, [wallet?.address]);

  // Buy tokens
  async function handleBuy(amount: number) {
    if (!wallet) return;

    setLoading(true);
    setTxStatus('Preparing transaction...');

    try {
      // 1. Prepare unsigned transaction
      const prepared = await prepareDirectBuy(connection, {
        tokenMint: TOKEN_MINT,
        amount, // SOL amount
        walletAddress: wallet.address,
      });

      setTxStatus('Please approve in your wallet...');

      // 2. Sign with Privy wallet
      const provider = await wallet.getEthereumProvider();
      // For Solana wallets in Privy, use signTransaction
      const signedTx = await (wallet as any).signTransaction(
        Buffer.from(prepared.transaction, 'base64')
      );

      setTxStatus('Submitting transaction...');

      // 3. Submit signed transaction
      const signature = await submitSignedTransaction(
        connection,
        Buffer.from(signedTx).toString('base64'),
        prepared.blockhash,
        prepared.lastValidBlockHeight
      );

      setTxStatus(`Success! Signature: ${signature.slice(0, 8)}...`);
    } catch (err) {
      setTxStatus(`Error: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  // Sell tokens
  async function handleSell(amount: number) {
    if (!wallet) return;

    setLoading(true);
    setTxStatus('Preparing transaction...');

    try {
      const prepared = await prepareDirectSell(connection, {
        tokenMint: TOKEN_MINT,
        amount, // Token amount
        walletAddress: wallet.address,
      });

      setTxStatus('Please approve in your wallet...');

      const signedTx = await (wallet as any).signTransaction(
        Buffer.from(prepared.transaction, 'base64')
      );

      setTxStatus('Submitting transaction...');

      const signature = await submitSignedTransaction(
        connection,
        Buffer.from(signedTx).toString('base64'),
        prepared.blockhash,
        prepared.lastValidBlockHeight
      );

      setTxStatus(`Success! Signature: ${signature.slice(0, 8)}...`);
    } catch (err) {
      setTxStatus(`Error: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  if (!authenticated) {
    return (
      <main style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>Token-Gated App</h1>
        <p>Connect your wallet to access exclusive content</p>
        <button onClick={login} style={{ padding: '1rem 2rem', fontSize: '1.2rem' }}>
          Connect Wallet
        </button>
      </main>
    );
  }

  return (
    <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <span>Wallet: {wallet?.address?.slice(0, 6)}...{wallet?.address?.slice(-4)}</span>
        <button onClick={logout}>Disconnect</button>
      </div>

      <div style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #333', borderRadius: '8px' }}>
        <h2>Token Balance</h2>
        <p>{(Number(balance) / 1e6).toLocaleString()} tokens</p>
        <p>Status: {hasAccess ? 'Access Granted' : 'Need more tokens'}</p>
      </div>

      {hasAccess ? (
        <div style={{ padding: '2rem', background: '#1a1a1a', borderRadius: '8px' }}>
          <h2>Exclusive Content</h2>
          <p>Welcome! You have access to this token-gated content.</p>
        </div>
      ) : (
        <div style={{ padding: '1rem', border: '1px solid #333', borderRadius: '8px' }}>
          <h2>Get Tokens</h2>
          <p>You need {(Number(MIN_TOKENS) / 1e6).toLocaleString()} tokens to access.</p>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button
              onClick={() => handleBuy(0.1)}
              disabled={loading}
              style={{ padding: '0.5rem 1rem' }}
            >
              Buy with 0.1 SOL
            </button>
            <button
              onClick={() => handleSell(1000)}
              disabled={loading}
              style={{ padding: '0.5rem 1rem' }}
            >
              Sell 1000 tokens
            </button>
          </div>

          {txStatus && (
            <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#888' }}>
              {txStatus}
            </p>
          )}
        </div>
      )}
    </main>
  );
}
