# Express Token-Gated API

A REST API with token-gated endpoints using apps.fun SDK.

## Features

- Public endpoints for checking balances and getting quotes
- Token-gated endpoints that require minimum token holdings
- Middleware for easy protection of any route
- Market data integration

## Setup

1. Copy this template:
   ```bash
   cp -r templates/express-api my-api
   cd my-api
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env` from `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Configure environment variables:
   - `PORT`: Server port (default 3000)
   - `TOKEN_MINT`: Your token mint address from apps.fun
   - `MIN_TOKENS`: Minimum tokens required (with decimals)

5. Run the server:
   ```bash
   npm start
   ```

## Endpoints

### Public

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /api/check/:wallet` | Check wallet's token balance |
| `GET /api/market` | Get token market data |
| `GET /api/quote?amount=X&side=buy` | Get trade quote |

### Token-Gated

Pass wallet address in `x-wallet-address` header.

| Endpoint | Description |
|----------|-------------|
| `GET /api/protected/content` | Get exclusive content |
| `POST /api/protected/action` | Execute protected action |

## Usage

### Check balance
```bash
curl http://localhost:3000/api/check/7xyzWalletAddress...
```

### Access protected endpoint
```bash
curl http://localhost:3000/api/protected/content \
  -H "x-wallet-address: 7xyzWalletAddress..."
```

### Get quote
```bash
curl "http://localhost:3000/api/quote?amount=0.1&side=buy"
```

## Adding Protected Routes

Use the `requireTokens` middleware:

```typescript
app.get('/api/protected/my-route', requireTokens, (req, res) => {
  const gateResult = (req as any).tokenGate;
  // gateResult.balance - user's token balance
  // gateResult.allowed - always true (middleware checks this)

  res.json({ message: 'Only token holders can see this' });
});
```

## Production Notes

- Add rate limiting
- Add request logging
- Use HTTPS
- Add CORS configuration for web clients
- Consider caching token gate results briefly
