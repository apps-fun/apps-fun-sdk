/**
 * Tests for src/evm/presets.ts
 *
 * Public API under test:
 *   - deflationaryFlow(config): TokenFlowConfig
 *   - freemiumFlow(config): TokenFlowConfig
 *   - revenueShareFlow(config): TokenFlowConfig
 *   - payPerUseFlow(config): TokenFlowConfig
 *
 * Behavioral contracts:
 *   - All presets call createTokenFlow with correct splits summing to 10000 bps
 *   - deflationaryFlow: 100% burn (10000 bps)
 *   - freemiumFlow: 70% creator (7000 bps), 30% burn (3000 bps)
 *   - revenueShareFlow: 50% creator (5000 bps), 25% burn (2500 bps), 25% distribute (2500 bps)
 *   - payPerUseFlow: 100% creator (10000 bps)
 *   - All pass token and chargeAmount through
 *   - All default network to 'base' when not provided
 *   - All pass explicit network when provided
 */

import { describe, it, expect } from 'vitest';

import {
  deflationaryFlow,
  freemiumFlow,
  revenueShareFlow,
  payPerUseFlow,
} from '../../evm/presets';

const TOKEN = '0x1111111111111111111111111111111111111111' as `0x${string}`;
const CREATOR = '0x2222222222222222222222222222222222222222' as `0x${string}`;
const CHARGE = 100000000000000000000n; // 100e18

describe('deflationaryFlow', () => {
  it('creates a single burn split at 10000 bps', () => {
    const flow = deflationaryFlow({ token: TOKEN, chargeAmount: CHARGE });
    expect(flow.splits).toHaveLength(1);
    expect(flow.splits[0]).toEqual({ action: 'burn', bps: 10000 });
  });

  it('passes token through', () => {
    const flow = deflationaryFlow({ token: TOKEN, chargeAmount: CHARGE });
    expect(flow.token).toBe(TOKEN);
  });

  it('passes chargeAmount through', () => {
    const flow = deflationaryFlow({ token: TOKEN, chargeAmount: CHARGE });
    expect(flow.chargeAmount).toBe(CHARGE);
  });

  it('defaults network to base', () => {
    const flow = deflationaryFlow({ token: TOKEN, chargeAmount: CHARGE });
    expect(flow.network).toBe('base');
  });

  it('uses explicit network', () => {
    const flow = deflationaryFlow({ token: TOKEN, chargeAmount: CHARGE, network: 'sepolia' });
    expect(flow.network).toBe('sepolia');
  });

  it('splits sum to 10000', () => {
    const flow = deflationaryFlow({ token: TOKEN, chargeAmount: CHARGE });
    const total = flow.splits.reduce((sum, s) => sum + s.bps, 0);
    expect(total).toBe(10000);
  });
});

describe('freemiumFlow', () => {
  it('creates send (7000) and burn (3000) splits', () => {
    const flow = freemiumFlow({ token: TOKEN, chargeAmount: CHARGE, creatorAddress: CREATOR });
    expect(flow.splits).toHaveLength(2);
    expect(flow.splits[0]).toEqual({ action: 'send', bps: 7000, to: CREATOR });
    expect(flow.splits[1]).toEqual({ action: 'burn', bps: 3000 });
  });

  it('passes token through', () => {
    const flow = freemiumFlow({ token: TOKEN, chargeAmount: CHARGE, creatorAddress: CREATOR });
    expect(flow.token).toBe(TOKEN);
  });

  it('passes chargeAmount through', () => {
    const flow = freemiumFlow({ token: TOKEN, chargeAmount: CHARGE, creatorAddress: CREATOR });
    expect(flow.chargeAmount).toBe(CHARGE);
  });

  it('defaults network to base', () => {
    const flow = freemiumFlow({ token: TOKEN, chargeAmount: CHARGE, creatorAddress: CREATOR });
    expect(flow.network).toBe('base');
  });

  it('uses explicit network', () => {
    const flow = freemiumFlow({ token: TOKEN, chargeAmount: CHARGE, creatorAddress: CREATOR, network: 'sepolia' });
    expect(flow.network).toBe('sepolia');
  });

  it('splits sum to 10000', () => {
    const flow = freemiumFlow({ token: TOKEN, chargeAmount: CHARGE, creatorAddress: CREATOR });
    const total = flow.splits.reduce((sum, s) => sum + s.bps, 0);
    expect(total).toBe(10000);
  });

  it('sets creatorAddress as to on send split', () => {
    const flow = freemiumFlow({ token: TOKEN, chargeAmount: CHARGE, creatorAddress: CREATOR });
    const sendSplit = flow.splits.find(s => s.action === 'send');
    expect(sendSplit?.to).toBe(CREATOR);
  });
});

describe('revenueShareFlow', () => {
  it('creates send (5000), burn (2500), distribute (2500) splits', () => {
    const flow = revenueShareFlow({ token: TOKEN, chargeAmount: CHARGE, creatorAddress: CREATOR });
    expect(flow.splits).toHaveLength(3);
    expect(flow.splits[0]).toEqual({ action: 'send', bps: 5000, to: CREATOR });
    expect(flow.splits[1]).toEqual({ action: 'burn', bps: 2500 });
    expect(flow.splits[2]).toEqual({ action: 'distribute', bps: 2500 });
  });

  it('passes token through', () => {
    const flow = revenueShareFlow({ token: TOKEN, chargeAmount: CHARGE, creatorAddress: CREATOR });
    expect(flow.token).toBe(TOKEN);
  });

  it('passes chargeAmount through', () => {
    const flow = revenueShareFlow({ token: TOKEN, chargeAmount: CHARGE, creatorAddress: CREATOR });
    expect(flow.chargeAmount).toBe(CHARGE);
  });

  it('defaults network to base', () => {
    const flow = revenueShareFlow({ token: TOKEN, chargeAmount: CHARGE, creatorAddress: CREATOR });
    expect(flow.network).toBe('base');
  });

  it('uses explicit network', () => {
    const flow = revenueShareFlow({ token: TOKEN, chargeAmount: CHARGE, creatorAddress: CREATOR, network: 'sepolia' });
    expect(flow.network).toBe('sepolia');
  });

  it('splits sum to 10000', () => {
    const flow = revenueShareFlow({ token: TOKEN, chargeAmount: CHARGE, creatorAddress: CREATOR });
    const total = flow.splits.reduce((sum, s) => sum + s.bps, 0);
    expect(total).toBe(10000);
  });
});

describe('payPerUseFlow', () => {
  it('creates a single send split at 10000 bps', () => {
    const flow = payPerUseFlow({ token: TOKEN, chargeAmount: CHARGE, creatorAddress: CREATOR });
    expect(flow.splits).toHaveLength(1);
    expect(flow.splits[0]).toEqual({ action: 'send', bps: 10000, to: CREATOR });
  });

  it('passes token through', () => {
    const flow = payPerUseFlow({ token: TOKEN, chargeAmount: CHARGE, creatorAddress: CREATOR });
    expect(flow.token).toBe(TOKEN);
  });

  it('passes chargeAmount through', () => {
    const flow = payPerUseFlow({ token: TOKEN, chargeAmount: CHARGE, creatorAddress: CREATOR });
    expect(flow.chargeAmount).toBe(CHARGE);
  });

  it('defaults network to base', () => {
    const flow = payPerUseFlow({ token: TOKEN, chargeAmount: CHARGE, creatorAddress: CREATOR });
    expect(flow.network).toBe('base');
  });

  it('uses explicit network', () => {
    const flow = payPerUseFlow({ token: TOKEN, chargeAmount: CHARGE, creatorAddress: CREATOR, network: 'sepolia' });
    expect(flow.network).toBe('sepolia');
  });

  it('splits sum to 10000', () => {
    const flow = payPerUseFlow({ token: TOKEN, chargeAmount: CHARGE, creatorAddress: CREATOR });
    const total = flow.splits.reduce((sum, s) => sum + s.bps, 0);
    expect(total).toBe(10000);
  });

  it('sets creatorAddress as to on send split', () => {
    const flow = payPerUseFlow({ token: TOKEN, chargeAmount: CHARGE, creatorAddress: CREATOR });
    expect(flow.splits[0].to).toBe(CREATOR);
  });
});
