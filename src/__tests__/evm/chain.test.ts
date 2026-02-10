/**
 * Tests for src/types/chain.ts
 *
 * Public API under test:
 *   - isEVMNetwork(networkId: NetworkId): boolean
 *   - getChainId(networkId: NetworkId): EVMChainId | null
 *   - EVM_CHAIN_IDS: Record<string, EVMChainId>
 *   - TOKEN_DECIMALS_BY_CHAIN: Record<ChainType, number>
 *
 * Behavioral contracts:
 *   - isEVMNetwork returns true for 'base' and 'sepolia', false for 'solana'
 *   - getChainId returns 8453 for 'base', 11155111 for 'sepolia', null for 'solana'
 *   - EVM_CHAIN_IDS maps network names to their actual chain IDs
 *   - TOKEN_DECIMALS_BY_CHAIN maps solana->6, evm->18
 *   - These values are protocol-critical constants; any change is a regression
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  isEVMNetwork,
  getChainId,
  EVM_CHAIN_IDS,
  TOKEN_DECIMALS_BY_CHAIN,
  type NetworkId,
  type ChainType,
} from '../../types/chain';

describe('isEVMNetwork', () => {
  it('returns true for base', () => {
    expect(isEVMNetwork('base')).toBe(true);
  });

  it('returns true for sepolia', () => {
    expect(isEVMNetwork('sepolia')).toBe(true);
  });

  it('returns true for ethereum', () => {
    expect(isEVMNetwork('ethereum')).toBe(true);
  });

  it('returns false for solana', () => {
    expect(isEVMNetwork('solana')).toBe(false);
  });

  // Property: isEVMNetwork and getChainId agree on what is an EVM network
  it('returns true if and only if getChainId returns non-null', () => {
    const networks: NetworkId[] = ['solana', 'base', 'sepolia', 'ethereum'];
    for (const n of networks) {
      expect(isEVMNetwork(n)).toBe(getChainId(n) !== null);
    }
  });
});

describe('getChainId', () => {
  it('returns 8453 for base', () => {
    expect(getChainId('base')).toBe(8453);
  });

  it('returns 11155111 for sepolia', () => {
    expect(getChainId('sepolia')).toBe(11155111);
  });

  it('returns 1 for ethereum', () => {
    expect(getChainId('ethereum')).toBe(1);
  });

  it('returns null for solana', () => {
    expect(getChainId('solana')).toBeNull();
  });

  // The returned chain ID must match EVM_CHAIN_IDS for EVM networks
  it('matches EVM_CHAIN_IDS for every EVM network', () => {
    expect(getChainId('base')).toBe(EVM_CHAIN_IDS['base']);
    expect(getChainId('sepolia')).toBe(EVM_CHAIN_IDS['sepolia']);
    expect(getChainId('ethereum')).toBe(EVM_CHAIN_IDS['ethereum']);
  });
});

describe('EVM_CHAIN_IDS', () => {
  it('contains exactly base, ethereum, and sepolia', () => {
    const keys = Object.keys(EVM_CHAIN_IDS).sort();
    expect(keys).toEqual(['base', 'ethereum', 'sepolia']);
  });

  it('base maps to 8453', () => {
    expect(EVM_CHAIN_IDS['base']).toBe(8453);
  });

  it('sepolia maps to 11155111', () => {
    expect(EVM_CHAIN_IDS['sepolia']).toBe(11155111);
  });

  it('ethereum maps to 1', () => {
    expect(EVM_CHAIN_IDS['ethereum']).toBe(1);
  });

  // Property: all chain IDs are positive integers
  it('all values are positive integers', () => {
    for (const id of Object.values(EVM_CHAIN_IDS)) {
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThan(0);
    }
  });
});

describe('TOKEN_DECIMALS_BY_CHAIN', () => {
  it('solana uses 6 decimals', () => {
    expect(TOKEN_DECIMALS_BY_CHAIN['solana']).toBe(6);
  });

  it('evm uses 18 decimals', () => {
    expect(TOKEN_DECIMALS_BY_CHAIN['evm']).toBe(18);
  });

  it('contains exactly solana and evm', () => {
    const keys = Object.keys(TOKEN_DECIMALS_BY_CHAIN).sort();
    expect(keys).toEqual(['evm', 'solana']);
  });

  // Regression: EVM and Solana decimals must differ (protocol assumption)
  it('evm decimals differ from solana decimals', () => {
    expect(TOKEN_DECIMALS_BY_CHAIN['evm']).not.toBe(TOKEN_DECIMALS_BY_CHAIN['solana']);
  });

  // Property: all decimals are non-negative integers
  it('all values are non-negative integers', () => {
    for (const d of Object.values(TOKEN_DECIMALS_BY_CHAIN)) {
      expect(Number.isInteger(d)).toBe(true);
      expect(d).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('cross-function consistency (property-based)', () => {
  const networkArb = fc.constantFrom<NetworkId>('solana', 'base', 'sepolia', 'ethereum');

  it('isEVMNetwork(n) === (getChainId(n) !== null) for all NetworkId values', () => {
    fc.assert(
      fc.property(networkArb, (n) => {
        return isEVMNetwork(n) === (getChainId(n) !== null);
      }),
    );
  });

  it('getChainId returns value in EVM_CHAIN_IDS or null', () => {
    fc.assert(
      fc.property(networkArb, (n) => {
        const id = getChainId(n);
        if (id === null) return true;
        return Object.values(EVM_CHAIN_IDS).includes(id);
      }),
    );
  });
});
