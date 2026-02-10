/**
 * Tests for src/evm/contracts.ts
 *
 * Public API under test:
 *   - getEVMContracts(networkId: NetworkId): EVMContractAddresses | null
 *
 * Behavioral contracts:
 *   - Returns EVMContractAddresses for 'sepolia', 'base', and 'ethereum'
 *   - Returns null for 'solana'
 *   - All returned addresses start with '0x'
 *   - All EVM networks share the same non-zero default addresses
 *   - Environment variables override default addresses when set with 0x prefix
 *   - Environment variables without 0x prefix are ignored (fallback used)
 *   - Each network has appsFun, feeHolder, and multiSend fields
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getEVMContracts, type EVMContractAddresses } from '../../evm/contracts';
import type { NetworkId } from '../../types/chain';

// Save original env to restore after tests
const SEPOLIA_ENV_KEYS = [
  'SEPOLIA_APPSFUN_ADDRESS',
  'SEPOLIA_FEEHOLDER_ADDRESS',
  'SEPOLIA_MULTISEND_ADDRESS',
] as const;

const BASE_ENV_KEYS = [
  'BASE_APPSFUN_ADDRESS',
  'BASE_FEEHOLDER_ADDRESS',
  'BASE_MULTISEND_ADDRESS',
] as const;

const ETHEREUM_ENV_KEYS = [
  'ETHEREUM_APPSFUN_ADDRESS',
  'ETHEREUM_FEEHOLDER_ADDRESS',
  'ETHEREUM_MULTISEND_ADDRESS',
] as const;

function clearEnvKeys() {
  for (const key of [...SEPOLIA_ENV_KEYS, ...BASE_ENV_KEYS, ...ETHEREUM_ENV_KEYS]) {
    delete process.env[key];
  }
}

describe('getEVMContracts', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {};
    for (const key of [...SEPOLIA_ENV_KEYS, ...BASE_ENV_KEYS, ...ETHEREUM_ENV_KEYS]) {
      savedEnv[key] = process.env[key];
    }
    clearEnvKeys();
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  });

  // --- Network routing ---

  it('returns null for solana', () => {
    expect(getEVMContracts('solana')).toBeNull();
  });

  it('returns non-null for sepolia', () => {
    const result = getEVMContracts('sepolia');
    expect(result).not.toBeNull();
  });

  it('returns non-null for base', () => {
    const result = getEVMContracts('base');
    expect(result).not.toBeNull();
  });

  it('returns non-null for ethereum', () => {
    const result = getEVMContracts('ethereum');
    expect(result).not.toBeNull();
  });

  // --- Shape validation ---

  it('sepolia result has exactly appsFun, feeHolder, multiSend keys', () => {
    const result = getEVMContracts('sepolia')!;
    expect(Object.keys(result).sort()).toEqual(['appsFun', 'feeHolder', 'multiSend']);
  });

  it('base result has exactly appsFun, feeHolder, multiSend keys', () => {
    const result = getEVMContracts('base')!;
    expect(Object.keys(result).sort()).toEqual(['appsFun', 'feeHolder', 'multiSend']);
  });

  it('ethereum result has exactly appsFun, feeHolder, multiSend keys', () => {
    const result = getEVMContracts('ethereum')!;
    expect(Object.keys(result).sort()).toEqual(['appsFun', 'feeHolder', 'multiSend']);
  });

  // --- Address format ---

  it('all sepolia addresses start with 0x', () => {
    const result = getEVMContracts('sepolia')!;
    expect(result.appsFun.startsWith('0x')).toBe(true);
    expect(result.feeHolder.startsWith('0x')).toBe(true);
    expect(result.multiSend.startsWith('0x')).toBe(true);
  });

  it('all base addresses start with 0x', () => {
    const result = getEVMContracts('base')!;
    expect(result.appsFun.startsWith('0x')).toBe(true);
    expect(result.feeHolder.startsWith('0x')).toBe(true);
    expect(result.multiSend.startsWith('0x')).toBe(true);
  });

  it('all ethereum addresses start with 0x', () => {
    const result = getEVMContracts('ethereum')!;
    expect(result.appsFun.startsWith('0x')).toBe(true);
    expect(result.feeHolder.startsWith('0x')).toBe(true);
    expect(result.multiSend.startsWith('0x')).toBe(true);
  });

  // --- Default addresses are the same across all EVM networks ---

  it('sepolia defaults to known appsFun address', () => {
    const result = getEVMContracts('sepolia')!;
    expect(result.appsFun).toBe('0xFfFFfFfffF6469850a0619fDFbA72cf4b4efcd3D');
  });

  it('sepolia defaults to known feeHolder address', () => {
    const result = getEVMContracts('sepolia')!;
    expect(result.feeHolder).toBe('0x4f3fC5CE6Cfa9605faa0a4E9747De460338b1c7c');
  });

  it('sepolia defaults to known multiSend address', () => {
    const result = getEVMContracts('sepolia')!;
    expect(result.multiSend).toBe('0xF981Ce18176F39a0E93fed69E34ec54Ef8200aAE');
  });

  it('base defaults to same addresses as sepolia', () => {
    const base = getEVMContracts('base')!;
    const sepolia = getEVMContracts('sepolia')!;
    expect(base.appsFun).toBe(sepolia.appsFun);
    expect(base.feeHolder).toBe(sepolia.feeHolder);
    expect(base.multiSend).toBe(sepolia.multiSend);
  });

  it('ethereum defaults to same addresses as sepolia', () => {
    const ethereum = getEVMContracts('ethereum')!;
    const sepolia = getEVMContracts('sepolia')!;
    expect(ethereum.appsFun).toBe(sepolia.appsFun);
    expect(ethereum.feeHolder).toBe(sepolia.feeHolder);
    expect(ethereum.multiSend).toBe(sepolia.multiSend);
  });

  // --- Environment variable override ---

  it('env variable overrides sepolia appsFun address', () => {
    process.env.SEPOLIA_APPSFUN_ADDRESS = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const result = getEVMContracts('sepolia')!;
    expect(result.appsFun).toBe('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  });

  it('env variable overrides sepolia feeHolder address', () => {
    process.env.SEPOLIA_FEEHOLDER_ADDRESS = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
    const result = getEVMContracts('sepolia')!;
    expect(result.feeHolder).toBe('0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB');
  });

  it('env variable overrides base appsFun address', () => {
    process.env.BASE_APPSFUN_ADDRESS = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
    const result = getEVMContracts('base')!;
    expect(result.appsFun).toBe('0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC');
  });

  it('env variable overrides sepolia multiSend address', () => {
    process.env.SEPOLIA_MULTISEND_ADDRESS = '0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD';
    const result = getEVMContracts('sepolia')!;
    expect(result.multiSend).toBe('0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD');
  });

  it('env variable overrides base feeHolder address', () => {
    process.env.BASE_FEEHOLDER_ADDRESS = '0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';
    const result = getEVMContracts('base')!;
    expect(result.feeHolder).toBe('0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE');
  });

  it('env variable overrides base multiSend address', () => {
    process.env.BASE_MULTISEND_ADDRESS = '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF';
    const result = getEVMContracts('base')!;
    expect(result.multiSend).toBe('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF');
  });

  it('env variable overrides ethereum appsFun address', () => {
    process.env.ETHEREUM_APPSFUN_ADDRESS = '0x1111111111111111111111111111111111111111';
    const result = getEVMContracts('ethereum')!;
    expect(result.appsFun).toBe('0x1111111111111111111111111111111111111111');
  });

  it('env variable overrides ethereum feeHolder address', () => {
    process.env.ETHEREUM_FEEHOLDER_ADDRESS = '0x2222222222222222222222222222222222222222';
    const result = getEVMContracts('ethereum')!;
    expect(result.feeHolder).toBe('0x2222222222222222222222222222222222222222');
  });

  it('env variable overrides ethereum multiSend address', () => {
    process.env.ETHEREUM_MULTISEND_ADDRESS = '0x3333333333333333333333333333333333333333';
    const result = getEVMContracts('ethereum')!;
    expect(result.multiSend).toBe('0x3333333333333333333333333333333333333333');
  });

  // --- Invalid env values fall back to defaults ---

  it('env value without 0x prefix is ignored, falls back to default', () => {
    process.env.SEPOLIA_APPSFUN_ADDRESS = 'not-a-valid-address';
    const result = getEVMContracts('sepolia')!;
    expect(result.appsFun).toBe('0xFfFFfFfffF6469850a0619fDFbA72cf4b4efcd3D');
  });

  it('empty env value falls back to default', () => {
    process.env.SEPOLIA_APPSFUN_ADDRESS = '';
    const result = getEVMContracts('sepolia')!;
    expect(result.appsFun).toBe('0xFfFFfFfffF6469850a0619fDFbA72cf4b4efcd3D');
  });

  // --- Network isolation: sepolia env does not affect base ---

  it('sepolia env vars do not leak into base contracts', () => {
    process.env.SEPOLIA_APPSFUN_ADDRESS = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const result = getEVMContracts('base')!;
    expect(result.appsFun).not.toBe('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  });

  it('ethereum env vars do not leak into base or sepolia contracts', () => {
    process.env.ETHEREUM_APPSFUN_ADDRESS = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const base = getEVMContracts('base')!;
    const sepolia = getEVMContracts('sepolia')!;
    expect(base.appsFun).not.toBe('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    expect(sepolia.appsFun).not.toBe('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  });

  // --- Each call returns a fresh object ---

  it('returns different object references on successive calls', () => {
    const a = getEVMContracts('sepolia');
    const b = getEVMContracts('sepolia');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
