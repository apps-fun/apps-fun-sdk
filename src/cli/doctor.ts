// SDK doctor: check RPC connectivity, contract addresses, and wallet balance

import { createPublicClient, http, formatEther } from 'viem';
import { base, mainnet, sepolia } from 'viem/chains';
import { getEVMContracts } from '../evm/contracts';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

interface CheckResult {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
}

const EVM_NETWORKS = [
  { id: 'sepolia' as const, chain: sepolia, envVar: 'SEPOLIA_RPC_URL' },
  { id: 'base' as const, chain: base, envVar: 'BASE_RPC_URL' },
  { id: 'ethereum' as const, chain: mainnet, envVar: 'ETHEREUM_RPC_URL' },
];

async function checkEVMRpc(
  networkId: string,
  chain: typeof base | typeof sepolia | typeof mainnet,
  rpcUrl: string | undefined,
): Promise<CheckResult> {
  const name = `EVM RPC (${networkId})`;
  if (!rpcUrl) {
    return { name, status: 'warn', detail: 'No RPC URL configured, using public default' };
  }

  try {
    const client = createPublicClient({ chain, transport: http(rpcUrl) });
    const blockNumber = await client.getBlockNumber();
    return { name, status: 'ok', detail: `Block ${blockNumber}` };
  } catch (err: any) {
    return { name, status: 'fail', detail: err.message || 'Connection failed' };
  }
}

async function checkSolanaRpc(rpcUrl: string | undefined): Promise<CheckResult> {
  const name = 'Solana RPC';
  const url = rpcUrl || 'https://api.mainnet-beta.solana.com';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot' }),
    });
    const data: any = await response.json();
    if (data.result) {
      return { name, status: 'ok', detail: `Slot ${data.result}` };
    }
    return { name, status: 'fail', detail: data.error?.message || 'Unknown error' };
  } catch (err: any) {
    return { name, status: 'fail', detail: err.message || 'Connection failed' };
  }
}

function checkContracts(networkId: 'base' | 'sepolia' | 'ethereum'): CheckResult {
  const name = `Contracts (${networkId})`;
  const contracts = getEVMContracts(networkId)!;

  const isZero = (addr: string) => addr === ZERO_ADDRESS;
  const parts: string[] = [];
  if (isZero(contracts.appsFun)) parts.push('appsFun=zero');
  if (isZero(contracts.feeHolder)) parts.push('feeHolder=zero');
  if (isZero(contracts.multiSend)) parts.push('multiSend=zero');

  if (parts.length > 0) {
    return { name, status: 'warn', detail: `Default addresses: ${parts.join(', ')}` };
  }
  return { name, status: 'ok', detail: `appsFun=${contracts.appsFun.slice(0, 10)}...` };
}

async function checkWalletBalance(
  walletAddress: string,
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  for (const { id, chain, envVar } of EVM_NETWORKS) {
    const rpcUrl = process.env[envVar];
    try {
      const client = createPublicClient({ chain, transport: http(rpcUrl) });
      const balance = await client.getBalance({ address: walletAddress as `0x${string}` });
      results.push({
        name: `Balance (${id})`,
        status: balance > 0n ? 'ok' : 'warn',
        detail: `${formatEther(balance)} ETH`,
      });
    } catch (err: any) {
      results.push({
        name: `Balance (${id})`,
        status: 'fail',
        detail: err.message || 'Failed to check',
      });
    }
  }

  return results;
}

export async function runDoctor(walletAddress?: string): Promise<void> {
  const results: CheckResult[] = [];

  // Check Solana RPC
  results.push(await checkSolanaRpc(process.env.SOLANA_RPC_URL));

  // Check EVM RPCs
  for (const { id, chain, envVar } of EVM_NETWORKS) {
    results.push(await checkEVMRpc(id, chain, process.env[envVar]));
  }

  // Check contract addresses
  results.push(checkContracts('sepolia'));
  results.push(checkContracts('base'));
  results.push(checkContracts('ethereum'));

  // Check wallet balance if provided
  if (walletAddress) {
    const balanceResults = await checkWalletBalance(walletAddress);
    results.push(...balanceResults);
  }

  // Output
  console.log('\n@apps-fun/sdk doctor\n');

  let hasFailure = false;
  for (const r of results) {
    const icon = r.status === 'ok' ? 'OK' : r.status === 'warn' ? 'WARN' : 'FAIL';
    const prefix = `  [${icon}]`;
    console.log(`${prefix.padEnd(10)} ${r.name.padEnd(24)} ${r.detail}`);
    if (r.status === 'fail') hasFailure = true;
  }

  console.log('');
  if (hasFailure) {
    process.exit(1);
  }
}
