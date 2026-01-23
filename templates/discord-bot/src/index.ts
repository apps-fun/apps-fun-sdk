import { Client, GatewayIntentBits, Events } from 'discord.js';
import { Connection, PublicKey } from '@solana/web3.js';
import { TokenGate } from '@apps-fun/sdk';

// Configuration from environment
const DISCORD_TOKEN = process.env.DISCORD_TOKEN!;
const TOKEN_MINT = process.env.TOKEN_MINT!;
const MIN_TOKENS = BigInt(process.env.MIN_TOKENS || '1000000');
const HOLDER_ROLE_ID = process.env.HOLDER_ROLE_ID!;
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// In-memory wallet links (use a database in production)
const walletLinks = new Map<string, string>(); // discordId -> walletAddress

// Setup
const connection = new Connection(RPC_URL, 'confirmed');
const gate = new TokenGate({
  tokenMint: new PublicKey(TOKEN_MINT),
  minAmount: MIN_TOKENS,
  connection,
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Bot ready! Logged in as ${c.user.tag}`);
  console.log(`Token: ${TOKEN_MINT}`);
  console.log(`Min tokens: ${MIN_TOKENS}`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();

  // Link wallet: !link <wallet_address>
  if (content.startsWith('!link ')) {
    const walletAddress = message.content.slice(6).trim();

    // Validate Solana address format
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
      await message.reply('Invalid wallet address format.');
      return;
    }

    walletLinks.set(message.author.id, walletAddress);
    await message.reply(`Wallet linked: \`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}\``);
    return;
  }

  // Verify holdings: !verify
  if (content === '!verify') {
    const walletAddress = walletLinks.get(message.author.id);

    if (!walletAddress) {
      await message.reply('No wallet linked. Use `!link <wallet_address>` first.');
      return;
    }

    try {
      const result = await gate.check(walletAddress);

      if (result.allowed) {
        // Grant role
        const member = message.member;
        if (member) {
          await member.roles.add(HOLDER_ROLE_ID);
          await message.reply(
            `Verified! You hold ${(Number(result.balance) / 1e6).toLocaleString()} tokens. Role granted.`
          );
        }
      } else {
        const needed = Number(MIN_TOKENS - result.balance) / 1e6;
        await message.reply(
          `Insufficient tokens. You have ${(Number(result.balance) / 1e6).toLocaleString()}, ` +
          `need ${needed.toLocaleString()} more.`
        );
      }
    } catch (err) {
      console.error('Verification error:', err);
      await message.reply('Error checking token balance. Please try again.');
    }
    return;
  }

  // Check balance: !balance
  if (content === '!balance') {
    const walletAddress = walletLinks.get(message.author.id);

    if (!walletAddress) {
      await message.reply('No wallet linked. Use `!link <wallet_address>` first.');
      return;
    }

    try {
      const result = await gate.check(walletAddress);
      await message.reply(
        `Balance: ${(Number(result.balance) / 1e6).toLocaleString()} tokens\n` +
        `Required: ${(Number(MIN_TOKENS) / 1e6).toLocaleString()} tokens\n` +
        `Status: ${result.allowed ? 'Verified' : 'Not enough tokens'}`
      );
    } catch (err) {
      console.error('Balance check error:', err);
      await message.reply('Error checking balance. Please try again.');
    }
    return;
  }

  // Help: !help
  if (content === '!help') {
    await message.reply(
      '**Token Gate Bot Commands**\n\n' +
      '`!link <wallet>` - Link your Solana wallet\n' +
      '`!verify` - Verify token holdings and get role\n' +
      '`!balance` - Check your token balance\n' +
      '`!help` - Show this message'
    );
    return;
  }
});

// Start bot
client.login(DISCORD_TOKEN);
