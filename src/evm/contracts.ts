// EVM contract addresses and configuration

import type { NetworkId } from '../types/chain';

export interface EVMContractAddresses {
  appsFun: `0x${string}`;
  feeHolder: `0x${string}`;
  multiSend: `0x${string}`;
}

const DEFAULT_APPSFUN = '0xfFFfffFff91A48384F062D43f1672F217C20aB20';
const DEFAULT_FEEHOLDER = '0x36618900De93aAB3a9C765d39BC582F74120F403';
const DEFAULT_MULTISEND = '0xF981Ce18176F39a0E93fed69E34ec54Ef8200aAE';

const ENV_PREFIX: Record<string, string> = {
  sepolia: 'SEPOLIA',
  base: 'BASE',
  ethereum: 'ETHEREUM',
};

// Get contract addresses from environment or use defaults
function getEnvAddress(key: string, fallback: string): `0x${string}` {
  const value = process.env[key];
  if (value && value.startsWith('0x')) {
    return value as `0x${string}`;
  }
  return fallback as `0x${string}`;
}

export function getEVMContracts(networkId: NetworkId): EVMContractAddresses | null {
  const prefix = ENV_PREFIX[networkId];
  if (!prefix) {
    return null;
  }

  return {
    appsFun: getEnvAddress(`${prefix}_APPSFUN_ADDRESS`, DEFAULT_APPSFUN),
    feeHolder: getEnvAddress(`${prefix}_FEEHOLDER_ADDRESS`, DEFAULT_FEEHOLDER),
    multiSend: getEnvAddress(`${prefix}_MULTISEND_ADDRESS`, DEFAULT_MULTISEND),
  };
}
