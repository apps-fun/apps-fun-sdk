// Named TokenFlow presets for common payment patterns

import type { NetworkId } from '../types/chain';
import { createTokenFlow, type TokenFlowConfig } from './tokenFlow';

// --- Types ---

export interface PresetConfig {
  token: `0x${string}`;
  network?: NetworkId;
  chargeAmount: bigint;
}

export interface CreatorPresetConfig extends PresetConfig {
  creatorAddress: `0x${string}`;
}

// --- Presets ---

/**
 * 100% burn. Maximum deflationary pressure.
 */
export function deflationaryFlow(config: PresetConfig): TokenFlowConfig {
  return createTokenFlow({
    token: config.token,
    network: config.network ?? 'base',
    chargeAmount: config.chargeAmount,
    splits: [{ action: 'burn', bps: 10000 }],
  });
}

/**
 * 70% to creator, 30% burn. Low-friction monetization with deflation.
 */
export function freemiumFlow(config: CreatorPresetConfig): TokenFlowConfig {
  return createTokenFlow({
    token: config.token,
    network: config.network ?? 'base',
    chargeAmount: config.chargeAmount,
    splits: [
      { action: 'send', bps: 7000, to: config.creatorAddress },
      { action: 'burn', bps: 3000 },
    ],
  });
}

/**
 * 50% to creator, 25% burn, 25% distribute to holders as ETH.
 */
export function revenueShareFlow(config: CreatorPresetConfig): TokenFlowConfig {
  return createTokenFlow({
    token: config.token,
    network: config.network ?? 'base',
    chargeAmount: config.chargeAmount,
    splits: [
      { action: 'send', bps: 5000, to: config.creatorAddress },
      { action: 'burn', bps: 2500 },
      { action: 'distribute', bps: 2500 },
    ],
  });
}

/**
 * 100% to creator. Direct payment, no burn or distribution.
 */
export function payPerUseFlow(config: CreatorPresetConfig): TokenFlowConfig {
  return createTokenFlow({
    token: config.token,
    network: config.network ?? 'base',
    chargeAmount: config.chargeAmount,
    splits: [{ action: 'send', bps: 10000, to: config.creatorAddress }],
  });
}
