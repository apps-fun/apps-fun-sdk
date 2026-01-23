import { PublicKey } from '@solana/web3.js';

// Program ID (update this after deployment)
export const PROGRAM_ID = new PublicKey(
  process.env.APPS_FUN_PROGRAM_ID || 'GdAjWuq53tC4GgSYf8yTWawhRiYeA8sDYg8HwGXbMCL7'
);

// PDA version for migrations
export const PDA_VERSION = 1;

// API base URL (domain only, paths include /api/v1/)
export const API_BASE_URL =
  process.env.APPS_FUN_API_URL || 'https://apps.fun';

// Native SOL mint (Wrapped SOL)
export const NATIVE_SOL_MINT = new PublicKey(
  'So11111111111111111111111111111111111111112'
);

// ═══════════════════════════════════════════════════════════════════════════
// APPS.FUN METEORA CONFIGURATION
// These are the official apps.fun Meteora DBC configs. Token launches through
// the SDK MUST use these configs to ensure fees go to the apps.fun platform.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apps.fun fee claimer wallet address
 * This wallet receives the platform's share of trading fees from all
 * tokens launched through apps.fun.
 *
 * SECURITY: This address is verified on-chain during token launch.
 * Changing this without updating the Meteora config will cause launches to fail.
 */
export const APPS_FUN_FEE_CLAIMER = new PublicKey(
  process.env.APPS_FUN_FEE_CLAIMER || '6RbHZRAb5wLDKPaXSPLYd7RDGzeaeVVhQst2X9UwyGqb'
);

/**
 * Meteora DBC config addresses by supply tier
 * Each config is created once and defines:
 * - Fee structure (trading fees, fee split)
 * - Fee claimer (apps.fun platform wallet)
 * - Migration parameters (graduation threshold, AMM migration)
 *
 * SECURITY: Only these configs are allowed for token launches through the SDK.
 * This ensures all fees go to the apps.fun platform.
 */
export const APPS_FUN_METEORA_CONFIGS: Record<string, PublicKey> = {
  // Default config (1B supply) - used if no supply specified
  DEFAULT: new PublicKey(
    process.env.METEORA_CONFIG_ADDRESS || '2jt7jAcbJdBzLETUFnCYTfLZiixGBhPRavP7KedNESJL'
  ),
  // Supply tier specific configs
  '1M': new PublicKey(
    process.env.METEORA_CONFIG_ADDRESS_1M || '2jt7jAcbJdBzLETUFnCYTfLZiixGBhPRavP7KedNESJL'
  ),
  '10M': new PublicKey(
    process.env.METEORA_CONFIG_ADDRESS_10M || '2jt7jAcbJdBzLETUFnCYTfLZiixGBhPRavP7KedNESJL'
  ),
  '100M': new PublicKey(
    process.env.METEORA_CONFIG_ADDRESS_100M || '2jt7jAcbJdBzLETUFnCYTfLZiixGBhPRavP7KedNESJL'
  ),
  '1B': new PublicKey(
    process.env.METEORA_CONFIG_ADDRESS_1B || '2jt7jAcbJdBzLETUFnCYTfLZiixGBhPRavP7KedNESJL'
  ),
  '10B': new PublicKey(
    process.env.METEORA_CONFIG_ADDRESS_10B || '2jt7jAcbJdBzLETUFnCYTfLZiixGBhPRavP7KedNESJL'
  ),
};

/**
 * Default trading fee in basis points (1% = 100 bps)
 */
export const DEFAULT_TRADING_FEE_BPS = 100;

/**
 * Default slippage in basis points (1% = 100 bps)
 */
export const DEFAULT_SLIPPAGE_BPS = 100;

/**
 * Token decimals (standard SPL token decimals)
 */
export const TOKEN_DECIMALS = 6;
