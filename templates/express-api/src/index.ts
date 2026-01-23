import express from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { TokenGate, AppsFunClient } from '@apps-fun/sdk';

const app = express();
app.use(express.json());

// Configuration
const PORT = process.env.PORT || 3000;
const TOKEN_MINT = process.env.TOKEN_MINT!;
const MIN_TOKENS = BigInt(process.env.MIN_TOKENS || '1000000');
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// Setup
const connection = new Connection(RPC_URL, 'confirmed');
const gate = new TokenGate({
  tokenMint: new PublicKey(TOKEN_MINT),
  minAmount: MIN_TOKENS,
  connection,
});
const client = new AppsFunClient({ rpc: connection });

// Middleware: Token gate authentication
async function requireTokens(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const wallet = req.headers['x-wallet-address'] as string;

  if (!wallet) {
    res.status(401).json({ error: 'Missing x-wallet-address header' });
    return;
  }

  // Validate address format
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
    res.status(400).json({ error: 'Invalid wallet address format' });
    return;
  }

  try {
    const result = await gate.check(wallet);

    if (!result.allowed) {
      res.status(403).json({
        error: 'Insufficient token balance',
        required: MIN_TOKENS.toString(),
        balance: result.balance.toString(),
        needed: (MIN_TOKENS - result.balance).toString(),
      });
      return;
    }

    // Attach result to request for use in handlers
    (req as any).tokenGate = result;
    next();
  } catch (err) {
    console.error('Token gate error:', err);
    res.status(500).json({ error: 'Failed to verify token balance' });
  }
}

// Public routes

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', tokenMint: TOKEN_MINT });
});

// Check token balance
app.get('/api/check/:wallet', async (req, res) => {
  const { wallet } = req.params;

  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
    res.status(400).json({ error: 'Invalid wallet address' });
    return;
  }

  try {
    const result = await gate.check(wallet);
    res.json({
      wallet,
      balance: result.balance.toString(),
      required: MIN_TOKENS.toString(),
      allowed: result.allowed,
    });
  } catch (err) {
    console.error('Check error:', err);
    res.status(500).json({ error: 'Failed to check balance' });
  }
});

// Get token market data
app.get('/api/market', async (_req, res) => {
  try {
    const data = await client.getMarketData(TOKEN_MINT);
    res.json(data);
  } catch (err) {
    console.error('Market data error:', err);
    res.status(500).json({ error: 'Failed to get market data' });
  }
});

// Get quote
app.get('/api/quote', async (req, res) => {
  const { amount, side } = req.query;

  if (!amount || !side) {
    res.status(400).json({ error: 'Missing amount or side parameter' });
    return;
  }

  try {
    const quote = await client.getQuote({
      mintAddress: TOKEN_MINT,
      amount: parseFloat(amount as string),
      inputMode: side === 'buy' ? 'sol' : 'token',
      side: side as 'buy' | 'sell',
    });
    res.json(quote);
  } catch (err) {
    console.error('Quote error:', err);
    res.status(500).json({ error: 'Failed to get quote' });
  }
});

// Token-gated routes (require minimum token balance)

app.get('/api/protected/content', requireTokens, (req, res) => {
  const gateResult = (req as any).tokenGate;

  res.json({
    message: 'Welcome to the exclusive content!',
    balance: gateResult.balance.toString(),
    data: {
      secret: 'This is only visible to token holders',
      timestamp: new Date().toISOString(),
    },
  });
});

app.post('/api/protected/action', requireTokens, (req, res) => {
  const gateResult = (req as any).tokenGate;
  const { action } = req.body;

  res.json({
    success: true,
    action,
    balance: gateResult.balance.toString(),
    message: `Action "${action}" executed for token holder`,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Token: ${TOKEN_MINT}`);
  console.log(`Min tokens: ${MIN_TOKENS}`);
});
