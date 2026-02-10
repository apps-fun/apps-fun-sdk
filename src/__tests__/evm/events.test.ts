/**
 * Tests for src/evm/events.ts
 *
 * Public API under test:
 *   - getDistributionLogs(publicClient, networkId, params?): Promise<DistributionLog[]>
 *   - getDistributedETHLogs(publicClient, networkId, params?): Promise<DistributedETHLog[]>
 *   - watchDistributions(publicClient, networkId, appToken, onLog): () => void
 *
 * Behavioral contracts:
 *   - getDistributionLogs queries both ERC20 Distribution and ETH DistributionETH events
 *   - getDistributionLogs merges and sorts results by blockNumber ascending
 *   - getDistributionLogs marks ERC20 logs with isETH=false, ETH logs with isETH=true
 *   - getDistributionLogs sets token=null for ETH distribution logs
 *   - getDistributionLogs passes appToken and distributionId as event args
 *   - getDistributionLogs passes fromBlock/toBlock to getLogs
 *   - getDistributedETHLogs queries DistributedETH events and maps fields
 *   - watchDistributions creates two watchers (ERC20 + ETH) and returns combined unwatch
 *   - All functions throw for unconfigured networks
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../evm/contracts', () => ({
  getEVMContracts: vi.fn(),
}));

vi.mock('../../evm/abis', () => ({
  MULTI_SEND_ABI: [],
}));

import { getEVMContracts } from '../../evm/contracts';
import {
  getDistributionLogs,
  getDistributedETHLogs,
  watchDistributions,
} from '../../evm/events';

const MULTI_SEND = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as `0x${string}`;
const APP_TOKEN = '0x1111111111111111111111111111111111111111' as `0x${string}`;
const PAY_TOKEN = '0x2222222222222222222222222222222222222222' as `0x${string}`;
const USER_A = '0x3333333333333333333333333333333333333333' as `0x${string}`;
const TX_HASH = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`;

function mockContracts() {
  vi.mocked(getEVMContracts).mockReturnValue({
    appsFun: '0x6EF2633D87D5DD63ae1eB5518297093039BC33E6' as `0x${string}`,
    feeHolder: '0x4fF4974Ae5Bfe5E53aCC35E3Aaad919CD599c98d' as `0x${string}`,
    multiSend: MULTI_SEND,
  });
}

function makeERC20Log(overrides?: Partial<{
  app_token: `0x${string}`;
  distribution_id: bigint;
  token: `0x${string}`;
  total: bigint;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
}>) {
  return {
    args: {
      app_token: overrides?.app_token ?? APP_TOKEN,
      distribution_id: overrides?.distribution_id ?? 1n,
      token: overrides?.token ?? PAY_TOKEN,
      total: overrides?.total ?? 5000n,
    },
    blockNumber: overrides?.blockNumber ?? 100n,
    transactionHash: overrides?.transactionHash ?? TX_HASH,
  };
}

function makeETHLog(overrides?: Partial<{
  app_token: `0x${string}`;
  distribution_id: bigint;
  total: bigint;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
}>) {
  return {
    args: {
      app_token: overrides?.app_token ?? APP_TOKEN,
      distribution_id: overrides?.distribution_id ?? 2n,
      total: overrides?.total ?? 3000n,
    },
    blockNumber: overrides?.blockNumber ?? 200n,
    transactionHash: overrides?.transactionHash ?? TX_HASH,
  };
}

function makeDistributedETHLog(overrides?: Partial<{
  app_token: `0x${string}`;
  distribution_id: bigint;
  user: `0x${string}`;
  eth_amount: bigint;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
}>) {
  return {
    args: {
      app_token: overrides?.app_token ?? APP_TOKEN,
      distribution_id: overrides?.distribution_id ?? 1n,
      user: overrides?.user ?? USER_A,
      eth_amount: overrides?.eth_amount ?? 1000n,
    },
    blockNumber: overrides?.blockNumber ?? 100n,
    transactionHash: overrides?.transactionHash ?? TX_HASH,
  };
}

describe('getDistributionLogs', () => {
  let mockPublicClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContracts();
    mockPublicClient = {
      getLogs: vi.fn().mockResolvedValue([]),
    };
  });

  it('throws for unconfigured network', async () => {
    vi.mocked(getEVMContracts).mockReturnValue(null);
    await expect(
      getDistributionLogs(mockPublicClient, 'solana')
    ).rejects.toThrow('EVM contracts not configured for network: solana');
  });

  it('queries both ERC20 and ETH distribution events', async () => {
    await getDistributionLogs(mockPublicClient, 'sepolia');
    expect(mockPublicClient.getLogs).toHaveBeenCalledTimes(2);
  });

  it('passes multiSend address to both getLogs calls', async () => {
    await getDistributionLogs(mockPublicClient, 'sepolia');
    expect(mockPublicClient.getLogs.mock.calls[0][0].address).toBe(MULTI_SEND);
    expect(mockPublicClient.getLogs.mock.calls[1][0].address).toBe(MULTI_SEND);
  });

  it('first call queries Distribution event, second queries DistributionETH', async () => {
    await getDistributionLogs(mockPublicClient, 'sepolia');
    expect(mockPublicClient.getLogs.mock.calls[0][0].event.name).toBe('Distribution');
    expect(mockPublicClient.getLogs.mock.calls[1][0].event.name).toBe('DistributionETH');
  });

  it('Distribution event has correct input definitions', async () => {
    await getDistributionLogs(mockPublicClient, 'sepolia');
    const event = mockPublicClient.getLogs.mock.calls[0][0].event;
    expect(event.type).toBe('event');
    expect(event.inputs).toEqual([
      { name: 'app_token', type: 'address', indexed: true },
      { name: 'distribution_id', type: 'uint256', indexed: true },
      { name: 'token', type: 'address', indexed: false },
      { name: 'total', type: 'uint256', indexed: false },
    ]);
  });

  it('DistributionETH event has correct input definitions', async () => {
    await getDistributionLogs(mockPublicClient, 'sepolia');
    const event = mockPublicClient.getLogs.mock.calls[1][0].event;
    expect(event.type).toBe('event');
    expect(event.inputs).toEqual([
      { name: 'app_token', type: 'address', indexed: true },
      { name: 'distribution_id', type: 'uint256', indexed: true },
      { name: 'total', type: 'uint256', indexed: false },
    ]);
  });

  it('passes appToken and distributionId as args when provided', async () => {
    await getDistributionLogs(mockPublicClient, 'sepolia', {
      appToken: APP_TOKEN,
      distributionId: 5n,
    });
    const args0 = mockPublicClient.getLogs.mock.calls[0][0].args;
    const args1 = mockPublicClient.getLogs.mock.calls[1][0].args;
    expect(args0.app_token).toBe(APP_TOKEN);
    expect(args0.distribution_id).toBe(5n);
    expect(args1.app_token).toBe(APP_TOKEN);
    expect(args1.distribution_id).toBe(5n);
  });

  it('passes undefined args when no params provided', async () => {
    await getDistributionLogs(mockPublicClient, 'sepolia');
    const args = mockPublicClient.getLogs.mock.calls[0][0].args;
    expect(args.app_token).toBeUndefined();
    expect(args.distribution_id).toBeUndefined();
  });

  it('passes fromBlock and toBlock when provided', async () => {
    await getDistributionLogs(mockPublicClient, 'sepolia', {
      fromBlock: 100n,
      toBlock: 200n,
    });
    expect(mockPublicClient.getLogs.mock.calls[0][0].fromBlock).toBe(100n);
    expect(mockPublicClient.getLogs.mock.calls[0][0].toBlock).toBe(200n);
    expect(mockPublicClient.getLogs.mock.calls[1][0].fromBlock).toBe(100n);
    expect(mockPublicClient.getLogs.mock.calls[1][0].toBlock).toBe(200n);
  });

  it('marks ERC20 logs with isETH=false and includes token', async () => {
    mockPublicClient.getLogs
      .mockResolvedValueOnce([makeERC20Log()])
      .mockResolvedValueOnce([]);

    const logs = await getDistributionLogs(mockPublicClient, 'sepolia');
    expect(logs).toHaveLength(1);
    expect(logs[0].isETH).toBe(false);
    expect(logs[0].token).toBe(PAY_TOKEN);
  });

  it('marks ETH logs with isETH=true and token=null', async () => {
    mockPublicClient.getLogs
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeETHLog()]);

    const logs = await getDistributionLogs(mockPublicClient, 'sepolia');
    expect(logs).toHaveLength(1);
    expect(logs[0].isETH).toBe(true);
    expect(logs[0].token).toBeNull();
  });

  it('maps all fields correctly from ERC20 log', async () => {
    mockPublicClient.getLogs
      .mockResolvedValueOnce([makeERC20Log({ distribution_id: 7n, total: 9999n, blockNumber: 50n })])
      .mockResolvedValueOnce([]);

    const logs = await getDistributionLogs(mockPublicClient, 'sepolia');
    expect(logs[0].appToken).toBe(APP_TOKEN);
    expect(logs[0].distributionId).toBe(7n);
    expect(logs[0].total).toBe(9999n);
    expect(logs[0].blockNumber).toBe(50n);
    expect(logs[0].transactionHash).toBe(TX_HASH);
  });

  it('maps all fields correctly from ETH log', async () => {
    mockPublicClient.getLogs
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeETHLog({ distribution_id: 3n, total: 4000n, blockNumber: 75n })]);

    const logs = await getDistributionLogs(mockPublicClient, 'sepolia');
    expect(logs[0].appToken).toBe(APP_TOKEN);
    expect(logs[0].distributionId).toBe(3n);
    expect(logs[0].total).toBe(4000n);
    expect(logs[0].blockNumber).toBe(75n);
  });

  it('merges ERC20 and ETH logs sorted by blockNumber ascending', async () => {
    mockPublicClient.getLogs
      .mockResolvedValueOnce([makeERC20Log({ blockNumber: 300n })])
      .mockResolvedValueOnce([makeETHLog({ blockNumber: 100n })]);

    const logs = await getDistributionLogs(mockPublicClient, 'sepolia');
    expect(logs).toHaveLength(2);
    expect(logs[0].blockNumber).toBe(100n);
    expect(logs[0].isETH).toBe(true);
    expect(logs[1].blockNumber).toBe(300n);
    expect(logs[1].isETH).toBe(false);
  });

  it('returns empty array when no logs found', async () => {
    const logs = await getDistributionLogs(mockPublicClient, 'sepolia');
    expect(logs).toEqual([]);
  });
});

describe('getDistributedETHLogs', () => {
  let mockPublicClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContracts();
    mockPublicClient = {
      getLogs: vi.fn().mockResolvedValue([]),
    };
  });

  it('throws for unconfigured network', async () => {
    vi.mocked(getEVMContracts).mockReturnValue(null);
    await expect(
      getDistributedETHLogs(mockPublicClient, 'solana')
    ).rejects.toThrow('EVM contracts not configured for network: solana');
  });

  it('queries DistributedETH event', async () => {
    await getDistributedETHLogs(mockPublicClient, 'sepolia');
    expect(mockPublicClient.getLogs).toHaveBeenCalledTimes(1);
    expect(mockPublicClient.getLogs.mock.calls[0][0].event.name).toBe('DistributedETH');
  });

  it('DistributedETH event has correct input definitions', async () => {
    await getDistributedETHLogs(mockPublicClient, 'sepolia');
    const event = mockPublicClient.getLogs.mock.calls[0][0].event;
    expect(event.type).toBe('event');
    expect(event.inputs).toEqual([
      { name: 'app_token', type: 'address', indexed: true },
      { name: 'distribution_id', type: 'uint256', indexed: true },
      { name: 'user', type: 'address', indexed: false },
      { name: 'eth_amount', type: 'uint256', indexed: false },
    ]);
  });

  it('passes appToken and distributionId as args', async () => {
    await getDistributedETHLogs(mockPublicClient, 'sepolia', {
      appToken: APP_TOKEN,
      distributionId: 3n,
    });
    const args = mockPublicClient.getLogs.mock.calls[0][0].args;
    expect(args.app_token).toBe(APP_TOKEN);
    expect(args.distribution_id).toBe(3n);
  });

  it('maps all fields correctly', async () => {
    mockPublicClient.getLogs.mockResolvedValue([
      makeDistributedETHLog({ distribution_id: 5n, eth_amount: 7777n, blockNumber: 42n }),
    ]);

    const logs = await getDistributedETHLogs(mockPublicClient, 'sepolia');
    expect(logs).toHaveLength(1);
    expect(logs[0].appToken).toBe(APP_TOKEN);
    expect(logs[0].distributionId).toBe(5n);
    expect(logs[0].user).toBe(USER_A);
    expect(logs[0].ethAmount).toBe(7777n);
    expect(logs[0].blockNumber).toBe(42n);
    expect(logs[0].transactionHash).toBe(TX_HASH);
  });

  it('passes fromBlock and toBlock', async () => {
    await getDistributedETHLogs(mockPublicClient, 'sepolia', {
      fromBlock: 10n,
      toBlock: 20n,
    });
    expect(mockPublicClient.getLogs.mock.calls[0][0].fromBlock).toBe(10n);
    expect(mockPublicClient.getLogs.mock.calls[0][0].toBlock).toBe(20n);
  });

  it('returns empty array when no logs', async () => {
    const logs = await getDistributedETHLogs(mockPublicClient, 'sepolia');
    expect(logs).toEqual([]);
  });

  it('returns multiple logs in order', async () => {
    mockPublicClient.getLogs.mockResolvedValue([
      makeDistributedETHLog({ user: USER_A, eth_amount: 100n }),
      makeDistributedETHLog({ user: '0x4444444444444444444444444444444444444444' as `0x${string}`, eth_amount: 200n }),
    ]);

    const logs = await getDistributedETHLogs(mockPublicClient, 'sepolia');
    expect(logs).toHaveLength(2);
    expect(logs[0].ethAmount).toBe(100n);
    expect(logs[1].ethAmount).toBe(200n);
  });
});

describe('watchDistributions', () => {
  let mockPublicClient: any;
  let unwatchERC20: ReturnType<typeof vi.fn>;
  let unwatchETH: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContracts();
    unwatchERC20 = vi.fn();
    unwatchETH = vi.fn();
    mockPublicClient = {
      watchContractEvent: vi.fn()
        .mockReturnValueOnce(unwatchERC20)
        .mockReturnValueOnce(unwatchETH),
    };
  });

  it('throws for unconfigured network', () => {
    vi.mocked(getEVMContracts).mockReturnValue(null);
    expect(() =>
      watchDistributions(mockPublicClient, 'solana', APP_TOKEN, vi.fn())
    ).toThrow('EVM contracts not configured for network: solana');
  });

  it('creates two watchers (Distribution and DistributionETH)', () => {
    watchDistributions(mockPublicClient, 'sepolia', APP_TOKEN, vi.fn());
    expect(mockPublicClient.watchContractEvent).toHaveBeenCalledTimes(2);
  });

  it('passes multiSend address and appToken to both watchers', () => {
    watchDistributions(mockPublicClient, 'sepolia', APP_TOKEN, vi.fn());
    const call0 = mockPublicClient.watchContractEvent.mock.calls[0][0];
    const call1 = mockPublicClient.watchContractEvent.mock.calls[1][0];
    expect(call0.address).toBe(MULTI_SEND);
    expect(call0.args.app_token).toBe(APP_TOKEN);
    expect(call1.address).toBe(MULTI_SEND);
    expect(call1.args.app_token).toBe(APP_TOKEN);
  });

  it('first watcher is for Distribution, second for DistributionETH', () => {
    watchDistributions(mockPublicClient, 'sepolia', APP_TOKEN, vi.fn());
    const call0 = mockPublicClient.watchContractEvent.mock.calls[0][0];
    const call1 = mockPublicClient.watchContractEvent.mock.calls[1][0];
    expect(call0.eventName).toBe('Distribution');
    expect(call1.eventName).toBe('DistributionETH');
  });

  it('returns a function that calls both unwatch functions', () => {
    const unwatch = watchDistributions(mockPublicClient, 'sepolia', APP_TOKEN, vi.fn());
    expect(unwatchERC20).not.toHaveBeenCalled();
    expect(unwatchETH).not.toHaveBeenCalled();
    unwatch();
    expect(unwatchERC20).toHaveBeenCalledTimes(1);
    expect(unwatchETH).toHaveBeenCalledTimes(1);
  });

  it('ERC20 watcher callback calls onLog with isETH=false', () => {
    const onLog = vi.fn();
    watchDistributions(mockPublicClient, 'sepolia', APP_TOKEN, onLog);

    const erc20Callback = mockPublicClient.watchContractEvent.mock.calls[0][0].onLogs;
    erc20Callback([{
      args: { app_token: APP_TOKEN, distribution_id: 1n, token: PAY_TOKEN, total: 500n },
      blockNumber: 10n,
      transactionHash: TX_HASH,
    }]);

    expect(onLog).toHaveBeenCalledTimes(1);
    expect(onLog).toHaveBeenCalledWith({
      appToken: APP_TOKEN,
      distributionId: 1n,
      token: PAY_TOKEN,
      total: 500n,
      isETH: false,
      blockNumber: 10n,
      transactionHash: TX_HASH,
    });
  });

  it('ETH watcher callback calls onLog with isETH=true and token=null', () => {
    const onLog = vi.fn();
    watchDistributions(mockPublicClient, 'sepolia', APP_TOKEN, onLog);

    const ethCallback = mockPublicClient.watchContractEvent.mock.calls[1][0].onLogs;
    ethCallback([{
      args: { app_token: APP_TOKEN, distribution_id: 2n, total: 300n },
      blockNumber: 20n,
      transactionHash: TX_HASH,
    }]);

    expect(onLog).toHaveBeenCalledTimes(1);
    expect(onLog).toHaveBeenCalledWith({
      appToken: APP_TOKEN,
      distributionId: 2n,
      token: null,
      total: 300n,
      isETH: true,
      blockNumber: 20n,
      transactionHash: TX_HASH,
    });
  });

  it('watcher callback calls onLog for each log in the batch', () => {
    const onLog = vi.fn();
    watchDistributions(mockPublicClient, 'sepolia', APP_TOKEN, onLog);

    const erc20Callback = mockPublicClient.watchContractEvent.mock.calls[0][0].onLogs;
    erc20Callback([
      { args: { app_token: APP_TOKEN, distribution_id: 1n, token: PAY_TOKEN, total: 100n }, blockNumber: 1n, transactionHash: TX_HASH },
      { args: { app_token: APP_TOKEN, distribution_id: 2n, token: PAY_TOKEN, total: 200n }, blockNumber: 2n, transactionHash: TX_HASH },
    ]);

    expect(onLog).toHaveBeenCalledTimes(2);
    expect(onLog.mock.calls[0][0].distributionId).toBe(1n);
    expect(onLog.mock.calls[1][0].distributionId).toBe(2n);
  });
});
