// Chain abstraction types for multichain support

export type ChainType = 'solana' | 'evm';
export type NetworkId = 'solana' | 'base' | 'sepolia' | 'ethereum';
export type EVMChainId = 1 | 8453 | 11155111;

export interface ChainConfig {
  type: ChainType;
  networkId: NetworkId;
  chainId?: EVMChainId;
  rpcUrl?: string;
}

export const EVM_CHAIN_IDS: Record<string, EVMChainId> = {
  base: 8453,
  sepolia: 11155111,
  ethereum: 1,
};

export const TOKEN_DECIMALS_BY_CHAIN: Record<ChainType, number> = {
  solana: 6,
  evm: 18,
};

export function isEVMNetwork(networkId: NetworkId): boolean {
  return networkId === 'base' || networkId === 'sepolia' || networkId === 'ethereum';
}

export function getChainId(networkId: NetworkId): EVMChainId | null {
  if (networkId === 'base') return 8453;
  if (networkId === 'sepolia') return 11155111;
  if (networkId === 'ethereum') return 1;
  return null;
}
