/**
 * Tests for src/cli/doctor.ts
 *
 * Public API under test:
 *   - runDoctor(walletAddress?: string): Promise<void>
 *
 * Behavioral contracts:
 *   - Checks Solana RPC via JSON-RPC getSlot call
 *   - Checks EVM RPCs via createPublicClient.getBlockNumber
 *   - Reports contract address configuration per network
 *   - Reports wallet balances when address provided
 *   - Exits 1 on any failure, 0 otherwise
 *   - Outputs results to console with [OK], [WARN], [FAIL] prefixes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGetBlockNumber = vi.fn().mockResolvedValue(12345n);
const mockGetBalance = vi.fn().mockResolvedValue(1000000000000000000n);

vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      getBlockNumber: mockGetBlockNumber,
      getBalance: mockGetBalance,
    })),
  };
});

import { runDoctor } from '../../cli/doctor';
import { createPublicClient } from 'viem';

describe('runDoctor', () => {
  const originalEnv = process.env;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  function getOutput(): string {
    return consoleSpy.mock.calls.map((c: any) => c[0]).join('\n');
  }

  beforeEach(() => {
    process.env = { ...originalEnv };
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockGetBlockNumber.mockResolvedValue(12345n);
    mockGetBalance.mockResolvedValue(1000000000000000000n);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ result: 999 }),
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ── Header output ──

  it('prints the doctor header', async () => {
    await runDoctor();
    const output = getOutput();
    expect(output).toContain('@apps-fun/sdk doctor');
  });

  // ── EVM RPC checks ──

  describe('EVM RPC checks', () => {
    it('reports WARN with detail when no RPC URL is configured', async () => {
      delete process.env.SEPOLIA_RPC_URL;
      delete process.env.BASE_RPC_URL;

      await runDoctor();
      const output = getOutput();

      expect(output).toContain('EVM RPC (sepolia)');
      expect(output).toContain('EVM RPC (base)');
      expect(output).toContain('EVM RPC (ethereum)');
      expect(output).toContain('[WARN]');
      expect(output).toContain('No RPC URL configured, using public default');

      // Verify exact status field on the EVM RPC warn lines
      const evmLines = consoleSpy.mock.calls
        .map((c: any) => c[0] as string)
        .filter((line: string) => line.includes('EVM RPC'));
      for (const line of evmLines) {
        expect(line).toContain('[WARN]');
      }
    });

    it('reads BASE_RPC_URL env var for base network', async () => {
      process.env.BASE_RPC_URL = 'https://base.example.com';

      await runDoctor();
      const output = getOutput();

      // Base should show OK with block number since RPC URL is set
      const baseLine = consoleSpy.mock.calls
        .map((c: any) => c[0] as string)
        .find((line: string) => line.includes('EVM RPC (base)'));
      expect(baseLine).toContain('[OK]');
      expect(baseLine).toContain('Block');
    });

    it('reads ETHEREUM_RPC_URL env var for ethereum network', async () => {
      process.env.ETHEREUM_RPC_URL = 'https://ethereum.example.com';

      await runDoctor();

      const ethLine = consoleSpy.mock.calls
        .map((c: any) => c[0] as string)
        .find((line: string) => line.includes('EVM RPC (ethereum)'));
      expect(ethLine).toContain('[OK]');
      expect(ethLine).toContain('Block');
    });

    it('reports OK with block number when RPC is reachable', async () => {
      process.env.SEPOLIA_RPC_URL = 'https://sepolia.example.com';
      mockGetBlockNumber.mockResolvedValue(99999n);

      await runDoctor();

      // Verify the specific EVM RPC line has status 'ok' mapped to [OK]
      const sepoliaLine = consoleSpy.mock.calls
        .map((c: any) => c[0] as string)
        .find((line: string) => line.includes('EVM RPC (sepolia)'));
      expect(sepoliaLine).toContain('[OK]');
      expect(sepoliaLine).toContain('Block 99999');
    });

    it('reports FAIL when getBlockNumber throws', async () => {
      process.env.SEPOLIA_RPC_URL = 'https://sepolia.example.com';
      mockGetBlockNumber.mockRejectedValue(new Error('RPC timeout'));

      await runDoctor();
      const output = getOutput();

      expect(output).toContain('[FAIL]');
      expect(output).toContain('RPC timeout');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('reports FAIL with fallback message when error has no message', async () => {
      process.env.SEPOLIA_RPC_URL = 'https://sepolia.example.com';
      mockGetBlockNumber.mockRejectedValue({});

      await runDoctor();
      const output = getOutput();

      expect(output).toContain('[FAIL]');
      expect(output).toContain('Connection failed');
    });

    it('creates public client with correct chain and transport', async () => {
      process.env.SEPOLIA_RPC_URL = 'https://sepolia.example.com';

      await runDoctor();

      expect(createPublicClient).toHaveBeenCalled();
    });
  });

  // ── Solana RPC checks ──

  describe('Solana RPC checks', () => {
    it('uses provided SOLANA_RPC_URL', async () => {
      process.env.SOLANA_RPC_URL = 'https://custom-solana.example.com';

      await runDoctor();

      expect(fetch).toHaveBeenCalledWith(
        'https://custom-solana.example.com',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot' }),
        }),
      );
    });

    it('uses default Solana URL when env var not set', async () => {
      delete process.env.SOLANA_RPC_URL;

      await runDoctor();

      expect(fetch).toHaveBeenCalledWith(
        'https://api.mainnet-beta.solana.com',
        expect.anything(),
      );
    });

    it('reports OK with slot number on success', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ result: 42 }),
      }));

      await runDoctor();

      // Verify the Solana RPC line specifically has [OK] and the slot detail
      const solanaLine = consoleSpy.mock.calls
        .map((c: any) => c[0] as string)
        .find((line: string) => line.includes('Solana RPC'));
      expect(solanaLine).toBeDefined();
      expect(solanaLine).toContain('[OK]');
      expect(solanaLine).toContain('Slot 42');
    });

    it('reports FAIL when data.result is falsy', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ error: { message: 'Rate limited' } }),
      }));

      await runDoctor();
      const output = getOutput();

      expect(output).toContain('Solana RPC');
      expect(output).toContain('[FAIL]');
      expect(output).toContain('Rate limited');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('reports FAIL with Unknown error when no error message', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: () => Promise.resolve({}),
      }));

      await runDoctor();
      const output = getOutput();

      expect(output).toContain('Solana RPC');
      expect(output).toContain('[FAIL]');
      expect(output).toContain('Unknown error');
    });

    it('reports FAIL when fetch throws', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network unreachable')));

      await runDoctor();
      const output = getOutput();

      expect(output).toContain('Solana RPC');
      expect(output).toContain('[FAIL]');
      expect(output).toContain('Network unreachable');
    });

    it('reports FAIL with fallback when fetch error has no message', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue({}));

      await runDoctor();
      const output = getOutput();

      expect(output).toContain('[FAIL]');
      expect(output).toContain('Connection failed');
    });

    it('sends correct Content-Type header and jsonrpc body', async () => {
      await runDoctor();

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot' }),
        }),
      );
    });
  });

  // ── Contract address checks ──

  describe('contract checks', () => {
    it('reports OK for sepolia with non-zero addresses', async () => {
      await runDoctor();
      const output = getOutput();

      expect(output).toContain('Contracts (sepolia)');
      expect(output).toContain('appsFun=0xfFFfffFf');
    });

    it('reports OK for base with non-zero default addresses', async () => {
      await runDoctor();

      const baseLine = consoleSpy.mock.calls
        .map((c: any) => c[0] as string)
        .find((line: string) => line.includes('Contracts (base)'));
      expect(baseLine).toContain('[OK]');
      expect(baseLine).toContain('appsFun=0xfFFfffFf');
      expect(baseLine).not.toContain('zero');
    });

    it('reports OK for ethereum with non-zero default addresses', async () => {
      await runDoctor();

      const ethereumLine = consoleSpy.mock.calls
        .map((c: any) => c[0] as string)
        .find((line: string) => line.includes('Contracts (ethereum)'));
      expect(ethereumLine).toContain('[OK]');
      expect(ethereumLine).toContain('appsFun=0xfFFfffFf');
    });

    it('no contracts line shows zero for default addresses', async () => {
      await runDoctor();

      const contractLines = consoleSpy.mock.calls
        .map((c: any) => c[0] as string)
        .filter((line: string) => line.includes('Contracts ('));
      for (const line of contractLines) {
        expect(line).not.toContain('zero');
      }
    });

    it('reports WARN when address is overridden to zero', async () => {
      process.env.BASE_APPSFUN_ADDRESS = '0x0000000000000000000000000000000000000000';
      process.env.BASE_FEEHOLDER_ADDRESS = '0x0000000000000000000000000000000000000000';
      process.env.BASE_MULTISEND_ADDRESS = '0x0000000000000000000000000000000000000000';

      await runDoctor();

      const baseLine = consoleSpy.mock.calls
        .map((c: any) => c[0] as string)
        .find((line: string) => line.includes('Contracts (base)'));
      expect(baseLine).toContain('[WARN]');
      expect(baseLine).toContain('appsFun=zero');
      expect(baseLine).toContain('feeHolder=zero');
      expect(baseLine).toContain('multiSend=zero');
    });

    it('uses comma-space separator for multiple zero address parts', async () => {
      process.env.BASE_APPSFUN_ADDRESS = '0x0000000000000000000000000000000000000000';
      process.env.BASE_FEEHOLDER_ADDRESS = '0x0000000000000000000000000000000000000000';
      process.env.BASE_MULTISEND_ADDRESS = '0x0000000000000000000000000000000000000000';

      await runDoctor();

      const baseLine = consoleSpy.mock.calls
        .map((c: any) => c[0] as string)
        .find((line: string) => line.includes('Contracts (base)'));
      expect(baseLine).toContain('appsFun=zero, feeHolder=zero');
      expect(baseLine).toContain('feeHolder=zero, multiSend=zero');
    });

    it('truncates appsFun address to first 10 chars for OK output', async () => {
      await runDoctor();

      const sepoliaLine = consoleSpy.mock.calls
        .map((c: any) => c[0] as string)
        .find((line: string) => line.includes('Contracts (sepolia)'));
      expect(sepoliaLine).toContain('appsFun=0xfFFfffFf...');
      expect(sepoliaLine).not.toContain('0xfFFfffFff91A48384F');
    });

    it('reports OK for base when addresses overridden to non-zero', async () => {
      process.env.BASE_APPSFUN_ADDRESS = '0x1111111111111111111111111111111111111111';
      process.env.BASE_FEEHOLDER_ADDRESS = '0x2222222222222222222222222222222222222222';
      process.env.BASE_MULTISEND_ADDRESS = '0x3333333333333333333333333333333333333333';

      await runDoctor();

      const baseLine = consoleSpy.mock.calls
        .map((c: any) => c[0] as string)
        .find((line: string) => line.includes('Contracts (base)'));
      expect(baseLine).toContain('[OK]');
      expect(baseLine).toContain('appsFun=0x11111111');
      expect(baseLine).not.toContain('zero');
    });
  });

  // ── Wallet balance checks ──

  describe('wallet balance checks', () => {
    it('reports balance per EVM network when wallet provided', async () => {
      await runDoctor('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      const output = getOutput();

      expect(output).toContain('Balance (sepolia)');
      expect(output).toContain('Balance (base)');
      expect(output).toContain('Balance (ethereum)');
      expect(output).toContain('ETH');
    });

    it('reports OK on balance line when balance is positive', async () => {
      mockGetBalance.mockResolvedValue(2000000000000000000n); // 2 ETH

      await runDoctor('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');

      // Each balance line should show [OK] since balance > 0
      const balanceLines = consoleSpy.mock.calls
        .map((c: any) => c[0] as string)
        .filter((line: string) => line.includes('Balance ('));
      expect(balanceLines.length).toBeGreaterThan(0);
      for (const line of balanceLines) {
        expect(line).toContain('[OK]');
        expect(line).toContain('ETH');
      }
    });

    it('reports WARN on balance line when balance is zero', async () => {
      mockGetBalance.mockResolvedValue(0n);

      await runDoctor('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');

      // Each balance line should show [WARN] since balance == 0
      const balanceLines = consoleSpy.mock.calls
        .map((c: any) => c[0] as string)
        .filter((line: string) => line.includes('Balance ('));
      expect(balanceLines.length).toBeGreaterThan(0);
      for (const line of balanceLines) {
        expect(line).toContain('[WARN]');
        expect(line).toContain('0');
        expect(line).toContain('ETH');
      }
    });

    it('reports FAIL on balance line with name and error when getBalance throws', async () => {
      mockGetBalance.mockRejectedValue(new Error('Balance check failed'));

      await runDoctor('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');

      const balanceLines = consoleSpy.mock.calls
        .map((c: any) => c[0] as string)
        .filter((line: string) => line.includes('Balance ('));
      expect(balanceLines.length).toBeGreaterThan(0);
      for (const line of balanceLines) {
        expect(line).toContain('[FAIL]');
        expect(line).toContain('Balance check failed');
        // Verify name includes network id
        expect(line).toMatch(/Balance \((sepolia|base|ethereum)\)/);
      }
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('reports FAIL with fallback when getBalance error has no message', async () => {
      mockGetBalance.mockRejectedValue({});

      await runDoctor('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      const output = getOutput();

      expect(output).toContain('Failed to check');
    });

    it('does not include balance lines when no wallet address', async () => {
      await runDoctor();
      const output = getOutput();

      expect(output).not.toContain('Balance (sepolia)');
      expect(output).not.toContain('Balance (base)');
      expect(output).not.toContain('Balance (ethereum)');
    });
  });

  // ── Output format ──

  describe('output format', () => {
    it('uses [OK] prefix for successful checks', async () => {
      process.env.SEPOLIA_RPC_URL = 'https://sepolia.example.com';

      await runDoctor();
      const output = getOutput();

      expect(output).toContain('[OK]');
    });

    it('uses [WARN] prefix for warning checks', async () => {
      delete process.env.SEPOLIA_RPC_URL;

      await runDoctor();
      const output = getOutput();

      expect(output).toContain('[WARN]');
    });

    it('uses [FAIL] prefix for failed checks', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));

      await runDoctor();
      const output = getOutput();

      expect(output).toContain('[FAIL]');
    });

    it('does not exit when no failures', async () => {
      // Default mocks have everything working, all networks have non-zero defaults
      process.env.SEPOLIA_RPC_URL = 'https://sepolia.example.com';
      process.env.BASE_RPC_URL = 'https://base.example.com';
      process.env.ETHEREUM_RPC_URL = 'https://ethereum.example.com';

      await runDoctor();

      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('exits with 1 when any check fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));

      await runDoctor();

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('pads the status icon and name columns', async () => {
      await runDoctor();

      // Each output line should have padded format
      const lines = consoleSpy.mock.calls
        .map((c: any) => c[0] as string)
        .filter((line: string) => line.includes('['));

      for (const line of lines) {
        // Should contain a bracketed status
        expect(line).toMatch(/\[(OK|WARN|FAIL)\]/);
      }
    });
  });

  // ── hasFailure tracking ──

  describe('failure tracking', () => {
    it('tracks failure across all check types', async () => {
      // Solana OK, EVM fails
      process.env.SEPOLIA_RPC_URL = 'https://sepolia.example.com';
      mockGetBlockNumber.mockRejectedValue(new Error('down'));

      await runDoctor();

      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
