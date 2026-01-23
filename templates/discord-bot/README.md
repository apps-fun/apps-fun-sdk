# Discord Token Gate Bot

A Discord bot that grants roles based on token holdings using apps.fun SDK.

## Features

- Link Solana wallets to Discord accounts
- Verify token holdings on-chain
- Automatically grant roles to verified holders
- Check token balances

## Setup

1. Create a Discord bot at [Discord Developer Portal](https://discord.com/developers/applications)
   - Enable MESSAGE CONTENT INTENT
   - Copy the bot token

2. Copy this template:
   ```bash
   cp -r templates/discord-bot my-bot
   cd my-bot
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Create `.env` from `.env.example`:
   ```bash
   cp .env.example .env
   ```

5. Configure environment variables:
   - `DISCORD_TOKEN`: Your Discord bot token
   - `HOLDER_ROLE_ID`: Role ID to grant to verified holders
   - `TOKEN_MINT`: Your token mint address from apps.fun
   - `MIN_TOKENS`: Minimum tokens required (with decimals, e.g., 1000000 = 1 token)

6. Invite bot to your server with permissions:
   - Manage Roles
   - Send Messages
   - Read Message Content

7. Run the bot:
   ```bash
   npm start
   ```

## Commands

| Command | Description |
|---------|-------------|
| `!link <wallet>` | Link a Solana wallet to your Discord |
| `!verify` | Verify holdings and get the holder role |
| `!balance` | Check your linked wallet's token balance |
| `!help` | Show available commands |

## User Flow

1. User joins server
2. User runs `!link 7xyz...` with their Solana wallet
3. User runs `!verify`
4. Bot checks on-chain balance
5. If balance >= minimum, bot grants the holder role

## Production Notes

- Replace the in-memory `walletLinks` Map with a database (Redis, PostgreSQL, etc.)
- Add rate limiting to prevent spam
- Consider using slash commands instead of prefix commands
- Add logging and error monitoring
