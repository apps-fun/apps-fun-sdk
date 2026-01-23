import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { TokenGate, TokenGateConfig } from './token-gate';
import {
  getAppRecord,
  getTokenRecord,
  getFeeEscrow,
  getTokenBalance,
  AppRecord,
  TokenRecord,
  FeeEscrow,
} from './accounts';
import {
  deriveAppRecordPDA,
  deriveTokenRecordPDA,
  deriveFeeEscrowPDA,
  deriveDividendPoolPDA,
  deriveClaimRecordPDA,
} from './pda';
import { API_BASE_URL } from './constants';
import {
  QuoteParams,
  QuoteResult,
  PrepareTradeParams,
  PreparedTransaction,
  SubmitTradeParams,
  TradeResult,
  EarningsResult,
  PrepareClaimParams,
  PreparedClaim,
  SubmitClaimParams,
  ClaimResult,
  MarketData,
  TokenInfo,
  TokenListResult,
  LaunchTokenParams,
  PreparedLaunch,
  SubmitLaunchParams,
  LaunchResult,
  PrepareBurnParams,
  PreparedBurn,
  SubmitBurnParams,
  BurnResult,
  AppsFunError,
  TokenNotFoundError,
  UnauthorizedError,
} from './types';

export interface AppsFunClientConfig {
  /** Solana RPC URL or connection */
  rpc?: string | Connection;
  /** Solana cluster (mainnet-beta, devnet, testnet) */
  cluster?: 'mainnet-beta' | 'devnet' | 'testnet';
  /** API base URL for apps.fun backend */
  apiUrl?: string;
}

export interface AppInfo {
  id: number;
  onChainId: bigint | null;
  name: string;
  description: string | null;
  url: string;
  repoUrl: string | null;
  category: string | null;
  status: string;
  imageUrl: string | null;
  isVerified: boolean;
  token?: {
    mintAddress: string;
    symbol: string;
    name: string;
    graduated: boolean;
  };
}

export interface UserEarnings {
  tokenMint: string;
  appName: string;
  tokenSymbol: string;
  claimable: number;
  claimed: number;
  role: 'owner' | 'holder';
}

/**
 * Main client for interacting with apps.fun
 *
 * @example
 * ```ts
 * const client = new AppsFunClient({
 *   cluster: 'mainnet-beta',
 * });
 *
 * // Create a token gate
 * const gate = client.createTokenGate({
 *   tokenMint: new PublicKey('...'),
 *   minAmount: BigInt(1000000),
 * });
 *
 * // Check access
 * const result = await gate.check(walletAddress);
 * ```
 */
export class AppsFunClient {
  private connection: Connection;
  private apiUrl: string;

  constructor(config: AppsFunClientConfig = {}) {
    if (config.rpc instanceof Connection) {
      this.connection = config.rpc;
    } else {
      const rpcUrl =
        config.rpc ||
        process.env.SOLANA_RPC_URL ||
        clusterApiUrl(config.cluster || 'mainnet-beta');
      this.connection = new Connection(rpcUrl, 'confirmed');
    }

    this.apiUrl = config.apiUrl || API_BASE_URL;
  }

  /**
   * Create a token gate for access control
   */
  createTokenGate(
    config: Omit<TokenGateConfig, 'connection'>
  ): TokenGate {
    return new TokenGate({
      ...config,
      connection: this.connection,
    });
  }

  /**
   * Get the Solana connection
   */
  getConnection(): Connection {
    return this.connection;
  }

  // ============================================================
  // App Information
  // ============================================================

  /**
   * Fetch app info from the API
   */
  async getApp(appId: number): Promise<AppInfo | null> {
    try {
      const response = await fetch(`${this.apiUrl}/api/v1/apps/${appId}`);
      if (!response.ok) return null;

      const data = (await response.json()) as { app: Record<string, unknown> };
      return this.mapAppResponse(data.app);
    } catch {
      return null;
    }
  }

  /**
   * Fetch app by URL
   */
  async getAppByUrl(url: string): Promise<AppInfo | null> {
    try {
      const response = await fetch(
        `${this.apiUrl}/api/v1/apps?url=${encodeURIComponent(url)}`
      );
      if (!response.ok) return null;

      const data = (await response.json()) as {
        apps?: Record<string, unknown>[];
      };
      if (data.apps && data.apps.length > 0) {
        return this.mapAppResponse(data.apps[0]);
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get app record from chain
   */
  async getAppRecord(appId: bigint): Promise<AppRecord | null> {
    return getAppRecord(this.connection, appId);
  }

  // ============================================================
  // Token Information
  // ============================================================

  /**
   * Get tokens created by a specific wallet address
   * No authentication required
   */
  async getTokensByCreator(walletAddress: string): Promise<TokenInfo[]> {
    const url = new URL(`${this.apiUrl}/api/v1/tokens`);
    url.searchParams.set('launcher', walletAddress);

    const response = await fetch(url.toString());

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new AppsFunError(
        (data as { error?: string }).error || 'Failed to get tokens',
        'GET_TOKENS_FAILED',
        response.status
      );
    }

    const result = (await response.json()) as {
      tokens: Array<{
        id: number;
        mint_address: string;
        name: string;
        symbol: string;
        image_url: string | null;
        graduated: boolean;
        graduated_at: string | null;
        created_at: string;
        app: {
          id: number;
          name: string;
          url: string;
          category: string | null;
        } | null;
        launcher: {
          id: string;
          wallet_address: string;
        } | null;
      }>;
    };

    return result.tokens.map((t) => ({
      id: t.id,
      mintAddress: t.mint_address,
      name: t.name,
      symbol: t.symbol,
      imageUrl: t.image_url,
      graduated: t.graduated,
      graduatedAt: t.graduated_at,
      createdAt: t.created_at,
      app: t.app,
      launcher: t.launcher
        ? { id: t.launcher.id, walletAddress: t.launcher.wallet_address }
        : null,
    }));
  }

  /**
   * Get token record from chain
   */
  async getTokenRecord(tokenMint: PublicKey): Promise<TokenRecord | null> {
    return getTokenRecord(this.connection, tokenMint);
  }

  /**
   * Get token balance for a wallet
   */
  async getTokenBalance(
    tokenMint: PublicKey,
    wallet: PublicKey
  ): Promise<bigint> {
    return getTokenBalance(this.connection, tokenMint, wallet);
  }

  /**
   * Check if a token has graduated to AMM
   */
  async isGraduated(tokenMint: PublicKey): Promise<boolean> {
    const record = await this.getTokenRecord(tokenMint);
    return record?.graduated ?? false;
  }

  // ============================================================
  // Trading
  // ============================================================

  /**
   * Get a quote for buying or selling tokens
   */
  async getQuote(params: QuoteParams): Promise<QuoteResult> {
    const url = new URL(`${this.apiUrl}/api/v1/trades/quote`);
    url.searchParams.set('mintAddress', params.mintAddress);
    url.searchParams.set('amount', params.amount.toString());
    url.searchParams.set('inputMode', params.inputMode);
    url.searchParams.set('side', params.side);

    const response = await fetch(url.toString());

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new AppsFunError(
        (data as { error?: string }).error || 'Failed to get quote',
        'QUOTE_FAILED',
        response.status
      );
    }

    return response.json() as Promise<QuoteResult>;
  }

  /**
   * Prepare a trade transaction for signing
   * Returns an unsigned transaction that must be signed by the wallet
   */
  async prepareTrade(
    params: PrepareTradeParams,
    authToken: string
  ): Promise<PreparedTransaction> {
    const response = await fetch(`${this.apiUrl}/api/v1/trades/prepare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        throw new UnauthorizedError();
      }
      throw new AppsFunError(
        (data as { error?: string }).error || 'Failed to prepare trade',
        'PREPARE_TRADE_FAILED',
        response.status
      );
    }

    return response.json() as Promise<PreparedTransaction>;
  }

  /**
   * Submit a signed trade transaction
   */
  async submitTrade(
    params: SubmitTradeParams,
    authToken: string
  ): Promise<TradeResult> {
    const response = await fetch(`${this.apiUrl}/api/v1/trades/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        signedTransaction: params.signedTransaction,
        tokenId: params.tokenMint,
        side: params.side,
        solAmount: params.solAmount,
        tokenAmount: params.tokenAmount,
        pricePerToken: params.pricePerToken,
        walletAddress: params.walletAddress,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        throw new UnauthorizedError();
      }
      throw new AppsFunError(
        (data as { error?: string }).error || 'Failed to submit trade',
        'SUBMIT_TRADE_FAILED',
        response.status
      );
    }

    return response.json() as Promise<TradeResult>;
  }

  // ============================================================
  // Earnings & Dividends
  // ============================================================

  /**
   * Get fee escrow info for a token
   */
  async getFeeEscrow(tokenMint: PublicKey): Promise<FeeEscrow | null> {
    return getFeeEscrow(this.connection, tokenMint);
  }

  /**
   * Get all earnings for the authenticated user
   */
  async getEarnings(authToken: string): Promise<EarningsResult> {
    const response = await fetch(`${this.apiUrl}/api/v1/earnings`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new UnauthorizedError();
      }
      const data = await response.json().catch(() => ({}));
      throw new AppsFunError(
        (data as { error?: string }).error || 'Failed to get earnings',
        'GET_EARNINGS_FAILED',
        response.status
      );
    }

    return response.json() as Promise<EarningsResult>;
  }

  /**
   * Prepare a claim transaction for earnings
   */
  async prepareClaimEarnings(
    params: PrepareClaimParams,
    authToken: string
  ): Promise<PreparedClaim> {
    const response = await fetch(`${this.apiUrl}/api/v1/earnings/claim/prepare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new UnauthorizedError();
      }
      const data = await response.json().catch(() => ({}));
      throw new AppsFunError(
        (data as { error?: string }).error || 'Failed to prepare claim',
        'PREPARE_CLAIM_FAILED',
        response.status
      );
    }

    return response.json() as Promise<PreparedClaim>;
  }

  /**
   * Submit a signed claim transaction
   */
  async submitClaimEarnings(
    params: SubmitClaimParams,
    authToken: string
  ): Promise<ClaimResult> {
    const response = await fetch(`${this.apiUrl}/api/v1/earnings/claim/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new UnauthorizedError();
      }
      const data = await response.json().catch(() => ({}));
      throw new AppsFunError(
        (data as { error?: string }).error || 'Failed to submit claim',
        'SUBMIT_CLAIM_FAILED',
        response.status
      );
    }

    return response.json() as Promise<ClaimResult>;
  }

  /**
   * Get claimable dividends for a wallet and token
   * @deprecated Use getEarnings() for more accurate data
   */
  async getClaimable(
    wallet: PublicKey,
    tokenMint: PublicKey
  ): Promise<bigint> {
    const [balance, escrow] = await Promise.all([
      this.getTokenBalance(tokenMint, wallet),
      this.getFeeEscrow(tokenMint),
    ]);

    if (!escrow || balance === BigInt(0)) {
      return BigInt(0);
    }

    // This is a simplified on-chain calculation
    // For accurate claimable amounts, use getEarnings() with auth token
    return BigInt(0);
  }

  // ============================================================
  // Market Data
  // ============================================================

  /**
   * Get market data for a token (price, volume, market cap)
   */
  async getMarketData(tokenMint: string): Promise<MarketData> {
    const response = await fetch(`${this.apiUrl}/api/v1/tokens/${tokenMint}/market`);

    if (!response.ok) {
      if (response.status === 404) {
        throw new TokenNotFoundError(tokenMint);
      }
      const data = await response.json().catch(() => ({}));
      throw new AppsFunError(
        (data as { error?: string }).error || 'Failed to get market data',
        'GET_MARKET_DATA_FAILED',
        response.status
      );
    }

    return response.json() as Promise<MarketData>;
  }

  // ============================================================
  // Token Launch
  // ============================================================

  /**
   * Prepare a token launch transaction
   * Returns an unsigned transaction and mint keypair that must be signed
   */
  async prepareTokenLaunch(
    params: LaunchTokenParams,
    authToken: string
  ): Promise<PreparedLaunch> {
    const response = await fetch(`${this.apiUrl}/api/v1/tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new UnauthorizedError();
      }
      const data = await response.json().catch(() => ({}));
      throw new AppsFunError(
        (data as { error?: string }).error || 'Failed to prepare token launch',
        'PREPARE_LAUNCH_FAILED',
        response.status
      );
    }

    return response.json() as Promise<PreparedLaunch>;
  }

  /**
   * Submit a signed token launch transaction
   */
  async submitTokenLaunch(
    params: SubmitLaunchParams,
    authToken: string
  ): Promise<LaunchResult> {
    const response = await fetch(`${this.apiUrl}/api/v1/tokens/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        tokenId: params.tokenId,
        token: '',
        signedTransaction: params.signedTransaction,
        mintAddress: params.mintAddress,
        appId: params.appId,
        name: params.name,
        symbol: params.symbol,
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new UnauthorizedError();
      }
      const data = await response.json().catch(() => ({}));
      throw new AppsFunError(
        (data as { error?: string }).error || 'Failed to submit token launch',
        'SUBMIT_LAUNCH_FAILED',
        response.status
      );
    }

    return response.json() as Promise<LaunchResult>;
  }

  // ============================================================
  // Token Burns
  // ============================================================

  /**
   * Prepare a token burn transaction
   */
  async prepareBurn(
    params: PrepareBurnParams,
    authToken: string
  ): Promise<PreparedBurn> {
    const response = await fetch(`${this.apiUrl}/api/v1/tokens/burn/prepare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new UnauthorizedError();
      }
      const data = await response.json().catch(() => ({}));
      throw new AppsFunError(
        (data as { error?: string }).error || 'Failed to prepare burn',
        'PREPARE_BURN_FAILED',
        response.status
      );
    }

    return response.json() as Promise<PreparedBurn>;
  }

  /**
   * Submit a signed burn transaction
   */
  async submitBurn(
    params: SubmitBurnParams,
    authToken: string
  ): Promise<BurnResult> {
    const response = await fetch(`${this.apiUrl}/api/v1/tokens/burn/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new UnauthorizedError();
      }
      const data = await response.json().catch(() => ({}));
      throw new AppsFunError(
        (data as { error?: string }).error || 'Failed to submit burn',
        'SUBMIT_BURN_FAILED',
        response.status
      );
    }

    return response.json() as Promise<BurnResult>;
  }

  // ============================================================
  // PDA Derivation
  // ============================================================

  /**
   * Get PDA for an app record
   */
  getAppRecordPDA(appId: bigint): [PublicKey, number] {
    return deriveAppRecordPDA(appId);
  }

  /**
   * Get PDA for a token record
   */
  getTokenRecordPDA(tokenMint: PublicKey): [PublicKey, number] {
    return deriveTokenRecordPDA(tokenMint);
  }

  /**
   * Get PDA for fee escrow
   */
  getFeeEscrowPDA(tokenMint: PublicKey): [PublicKey, number] {
    return deriveFeeEscrowPDA(tokenMint);
  }

  /**
   * Get PDA for dividend pool
   */
  getDividendPoolPDA(tokenMint: PublicKey): [PublicKey, number] {
    return deriveDividendPoolPDA(tokenMint);
  }

  /**
   * Get PDA for a user's claim record
   */
  getClaimRecordPDA(
    user: PublicKey,
    tokenMint: PublicKey
  ): [PublicKey, number] {
    return deriveClaimRecordPDA(user, tokenMint);
  }

  // ============================================================
  // Helper Functions
  // ============================================================

  /**
   * Check if a wallet has at least the minimum required token balance
   */
  async hasMinBalance(
    tokenMint: string,
    wallet: string,
    minAmount: bigint
  ): Promise<boolean> {
    const balance = await this.getTokenBalance(
      new PublicKey(tokenMint),
      new PublicKey(wallet)
    );
    return balance >= minAmount;
  }

  /**
   * Get the current price of a token in SOL
   */
  async getTokenPrice(tokenMint: string): Promise<number> {
    const marketData = await this.getMarketData(tokenMint);
    return marketData.price;
  }

  /**
   * Get app information by token mint address
   */
  async getAppByToken(tokenMint: string): Promise<AppInfo | null> {
    try {
      const response = await fetch(
        `${this.apiUrl}/api/v1/tokens/${tokenMint}`
      );
      if (!response.ok) return null;

      const data = (await response.json()) as { token?: { app_id?: number } };
      if (!data.token?.app_id) return null;

      return this.getApp(data.token.app_id);
    } catch {
      return null;
    }
  }

  // ============================================================
  // Verification
  // ============================================================

  /**
   * Get verification code for an app
   */
  async getVerificationCode(
    appId: number,
    authToken: string
  ): Promise<{ code: string; method: string } | null> {
    try {
      const response = await fetch(
        `${this.apiUrl}/api/v1/verification?appId=${appId}`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      if (!response.ok) return null;
      return (await response.json()) as { code: string; method: string };
    } catch {
      return null;
    }
  }

  /**
   * Submit verification for an app
   */
  async submitVerification(
    appId: number,
    method: 'git_commit' | 'dns_txt',
    authToken: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.apiUrl}/api/v1/verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ appId, method }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        return { success: false, error: data.error };
      }

      // Trigger verification check
      const verifyResponse = await fetch(
        `${this.apiUrl}/api/v1/verification/${appId}/verify`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      if (!verifyResponse.ok) {
        const data = (await verifyResponse.json()) as { error?: string };
        return { success: false, error: data.error };
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Verification failed',
      };
    }
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  private mapAppResponse(app: Record<string, unknown>): AppInfo {
    return {
      id: app.id as number,
      onChainId: app.on_chain_id ? BigInt(app.on_chain_id as number) : null,
      name: app.name as string,
      description: app.description as string | null,
      url: app.url as string,
      repoUrl: app.repo_url as string | null,
      category: app.category as string | null,
      status: app.status as string,
      imageUrl: app.image_url as string | null,
      isVerified: !!app.verified_owner_id,
      token: app.token
        ? {
            mintAddress: (app.token as Record<string, unknown>)
              .mint_address as string,
            symbol: (app.token as Record<string, unknown>).symbol as string,
            name: (app.token as Record<string, unknown>).name as string,
            graduated: (app.token as Record<string, unknown>)
              .graduated as boolean,
          }
        : undefined,
    };
  }
}
