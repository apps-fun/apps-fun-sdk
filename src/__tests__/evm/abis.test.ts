/**
 * Tests for src/evm/abis.ts
 *
 * Public API under test:
 *   - APPS_FUN_ABI: ABI array for AppsFun contract
 *   - FEE_HOLDER_ABI: ABI array for FeeHolder contract
 *   - MULTI_SEND_ABI: ABI array for MultiSend contract
 *   - ERC20_ABI: ABI array for standard ERC20 functions
 *
 * Behavioral contracts:
 *   - Each ABI must contain the specific function names the SDK calls
 *   - Function signatures must match: correct input/output names and types
 *   - State mutability must be correct (view vs nonpayable vs payable)
 *   - These are the interface contracts with deployed Solidity code;
 *     any mismatch causes silent runtime failure on-chain
 */

import { describe, it, expect } from 'vitest';
import {
  APPS_FUN_ABI,
  FEE_HOLDER_ABI,
  MULTI_SEND_ABI,
  ERC20_ABI,
} from '../../evm/abis';

// Helper: find a function entry in an ABI by name
function findFunction(abi: readonly Record<string, unknown>[], name: string) {
  return abi.find(
    (entry) => entry.type === 'function' && entry.name === name,
  ) as Record<string, unknown> | undefined;
}

// Helper: find an event entry in an ABI by name
function findEvent(abi: readonly Record<string, unknown>[], name: string) {
  return abi.find(
    (entry) => entry.type === 'event' && entry.name === name,
  ) as Record<string, unknown> | undefined;
}

describe('APPS_FUN_ABI', () => {
  // --- Signature correctness for every function in the ABI ---

  it('launchToken accepts (address, uint256) and returns address', () => {
    const fn = findFunction(APPS_FUN_ABI, 'launchToken')!;
    expect(fn.stateMutability).toBe('nonpayable');
    const inputs = fn.inputs as { name: string; type: string }[];
    expect(inputs.length).toBe(2);
    expect(inputs[0].type).toBe('address');
    expect(inputs[1].type).toBe('uint256');
    const outputs = fn.outputs as { type: string }[];
    expect(outputs.length).toBe(1);
    expect(outputs[0].type).toBe('address');
  });

  it('getPair is view, accepts address, returns pair and creator addresses', () => {
    const fn = findFunction(APPS_FUN_ABI, 'getPair')!;
    expect(fn.stateMutability).toBe('view');
    const inputs = fn.inputs as { type: string }[];
    expect(inputs.length).toBe(1);
    expect(inputs[0].type).toBe('address');
    const outputs = fn.outputs as { name: string; type: string }[];
    expect(outputs.length).toBe(2);
    expect(outputs[0].name).toBe('pair');
    expect(outputs[1].name).toBe('creator');
  });

  it('canGraduate is view, accepts address, returns bool', () => {
    const fn = findFunction(APPS_FUN_ABI, 'canGraduate')!;
    expect(fn.stateMutability).toBe('view');
    const inputs = fn.inputs as { type: string }[];
    expect(inputs.length).toBe(1);
    expect(inputs[0].type).toBe('address');
    const outputs = fn.outputs as { type: string }[];
    expect(outputs.length).toBe(1);
    expect(outputs[0].type).toBe('bool');
  });

  it('swapExactETHForTokens is payable with 4 inputs', () => {
    const fn = findFunction(APPS_FUN_ABI, 'swapExactETHForTokens')!;
    expect(fn.stateMutability).toBe('payable');
    expect((fn.inputs as unknown[]).length).toBe(4);
  });

  it('swapExactTokensForETH is nonpayable with 5 inputs', () => {
    const fn = findFunction(APPS_FUN_ABI, 'swapExactTokensForETH')!;
    expect(fn.stateMutability).toBe('nonpayable');
    expect((fn.inputs as unknown[]).length).toBe(5);
  });

  it('quoteSwapExactETHForTokens is view with 2 inputs returning uint256', () => {
    const fn = findFunction(APPS_FUN_ABI, 'quoteSwapExactETHForTokens')!;
    expect(fn.stateMutability).toBe('view');
    expect((fn.inputs as unknown[]).length).toBe(2);
    const outputs = fn.outputs as { type: string }[];
    expect(outputs.length).toBe(1);
    expect(outputs[0].type).toBe('uint256');
  });

  it('quoteSwapExactTokensForETH is view with 2 inputs returning uint256', () => {
    const fn = findFunction(APPS_FUN_ABI, 'quoteSwapExactTokensForETH')!;
    expect(fn.stateMutability).toBe('view');
    expect((fn.inputs as unknown[]).length).toBe(2);
    const outputs = fn.outputs as { type: string }[];
    expect(outputs.length).toBe(1);
    expect(outputs[0].type).toBe('uint256');
  });

  it('deployAndLaunch returns pair and token addresses', () => {
    const fn = findFunction(APPS_FUN_ABI, 'deployAndLaunch')!;
    const outputs = fn.outputs as { name: string; type: string }[];
    expect(outputs.length).toBe(2);
    expect(outputs[0].type).toBe('address');
    expect(outputs[1].type).toBe('address');
  });

  it('swapExactETHForTokens input order is amountOutMin, token, to, deadline', () => {
    const fn = findFunction(APPS_FUN_ABI, 'swapExactETHForTokens')!;
    const inputs = fn.inputs as { name: string; type: string }[];
    expect(inputs[0].name).toBe('amountOutMin');
    expect(inputs[1].name).toBe('token');
    expect(inputs[2].name).toBe('to');
    expect(inputs[3].name).toBe('deadline');
  });

  it('swapExactTokensForETH input order is amountIn, amountOutMin, token, to, deadline', () => {
    const fn = findFunction(APPS_FUN_ABI, 'swapExactTokensForETH')!;
    const inputs = fn.inputs as { name: string; type: string }[];
    expect(inputs[0].name).toBe('amountIn');
    expect(inputs[1].name).toBe('amountOutMin');
    expect(inputs[2].name).toBe('token');
    expect(inputs[3].name).toBe('to');
    expect(inputs[4].name).toBe('deadline');
  });
});

describe('FEE_HOLDER_ABI', () => {
  it('contains creatorFees view function', () => {
    const fn = findFunction(FEE_HOLDER_ABI, 'creatorFees')!;
    expect(fn.stateMutability).toBe('view');
    const inputs = fn.inputs as { type: string }[];
    expect(inputs.length).toBe(1);
    expect(inputs[0].type).toBe('address');
  });

  it('contains claimFees nonpayable function with no inputs', () => {
    const fn = findFunction(FEE_HOLDER_ABI, 'claimFees')!;
    expect(fn.stateMutability).toBe('nonpayable');
    expect((fn.inputs as unknown[]).length).toBe(0);
  });

  it('contains claimLPFees nonpayable function with token address input', () => {
    const fn = findFunction(FEE_HOLDER_ABI, 'claimLPFees')!;
    expect(fn.stateMutability).toBe('nonpayable');
    const inputs = fn.inputs as { type: string }[];
    expect(inputs.length).toBe(1);
    expect(inputs[0].type).toBe('address');
  });
});

describe('MULTI_SEND_ABI', () => {
  it('contains batchSendERC20 function with 5 inputs', () => {
    const fn = findFunction(MULTI_SEND_ABI, 'batchSendERC20')!;
    expect(fn.stateMutability).toBe('nonpayable');
    expect((fn.inputs as unknown[]).length).toBe(5);
  });

  it('contains batchSendEther payable function with 4 inputs', () => {
    const fn = findFunction(MULTI_SEND_ABI, 'batchSendEther')!;
    expect(fn.stateMutability).toBe('payable');
    expect((fn.inputs as unknown[]).length).toBe(4);
  });

  it('DistributedETH event has indexed app_token, indexed distribution_id, user, eth_amount', () => {
    const ev = findEvent(MULTI_SEND_ABI, 'DistributedETH')!;
    const inputs = ev.inputs as { name: string; type: string; indexed: boolean }[];
    expect(inputs.length).toBe(4);
    expect(inputs[0]).toEqual({ name: 'app_token', type: 'address', indexed: true });
    expect(inputs[1]).toEqual({ name: 'distribution_id', type: 'uint256', indexed: true });
    expect(inputs[2]).toEqual({ name: 'user', type: 'address', indexed: false });
    expect(inputs[3]).toEqual({ name: 'eth_amount', type: 'uint256', indexed: false });
  });

  it('DistributionETH event has indexed app_token, indexed distribution_id, total', () => {
    const ev = findEvent(MULTI_SEND_ABI, 'DistributionETH')!;
    const inputs = ev.inputs as { name: string; type: string; indexed: boolean }[];
    expect(inputs.length).toBe(3);
    expect(inputs[0]).toEqual({ name: 'app_token', type: 'address', indexed: true });
    expect(inputs[1]).toEqual({ name: 'distribution_id', type: 'uint256', indexed: true });
    expect(inputs[2]).toEqual({ name: 'total', type: 'uint256', indexed: false });
  });

  it('Distribution event has indexed app_token, indexed distribution_id, token, total', () => {
    const ev = findEvent(MULTI_SEND_ABI, 'Distribution')!;
    const inputs = ev.inputs as { name: string; type: string; indexed: boolean }[];
    expect(inputs.length).toBe(4);
    expect(inputs[0]).toEqual({ name: 'app_token', type: 'address', indexed: true });
    expect(inputs[1]).toEqual({ name: 'distribution_id', type: 'uint256', indexed: true });
    expect(inputs[2]).toEqual({ name: 'token', type: 'address', indexed: false });
    expect(inputs[3]).toEqual({ name: 'total', type: 'uint256', indexed: false });
  });
});

describe('ERC20_ABI', () => {
  it('contains balanceOf view function returning uint256', () => {
    const fn = findFunction(ERC20_ABI, 'balanceOf')!;
    expect(fn.stateMutability).toBe('view');
    const outputs = fn.outputs as { type: string }[];
    expect(outputs[0].type).toBe('uint256');
  });

  it('contains approve function with spender and amount', () => {
    const fn = findFunction(ERC20_ABI, 'approve')!;
    expect(fn.stateMutability).toBe('nonpayable');
    const inputs = fn.inputs as { name: string; type: string }[];
    expect(inputs.length).toBe(2);
    expect(inputs[0].name).toBe('spender');
    expect(inputs[1].name).toBe('amount');
  });

  it('contains allowance view function with owner and spender', () => {
    const fn = findFunction(ERC20_ABI, 'allowance')!;
    expect(fn.stateMutability).toBe('view');
    const inputs = fn.inputs as { name: string; type: string }[];
    expect(inputs.length).toBe(2);
    expect(inputs[0].name).toBe('owner');
    expect(inputs[1].name).toBe('spender');
  });

  it('contains decimals view function', () => {
    const fn = findFunction(ERC20_ABI, 'decimals')!;
    expect(fn.stateMutability).toBe('view');
    const outputs = fn.outputs as { type: string }[];
    expect(outputs[0].type).toBe('uint8');
  });

  it('contains totalSupply view function', () => {
    const fn = findFunction(ERC20_ABI, 'totalSupply')!;
    expect(fn.stateMutability).toBe('view');
  });

  it('contains transfer nonpayable function with to and amount', () => {
    const fn = findFunction(ERC20_ABI, 'transfer')!;
    expect(fn.stateMutability).toBe('nonpayable');
    const inputs = fn.inputs as { name: string; type: string }[];
    expect(inputs.length).toBe(2);
    expect(inputs[0].name).toBe('to');
    expect(inputs[0].type).toBe('address');
    expect(inputs[1].name).toBe('amount');
    expect(inputs[1].type).toBe('uint256');
    const outputs = fn.outputs as { type: string }[];
    expect(outputs[0].type).toBe('bool');
  });

  it('contains transferFrom nonpayable function with from, to, and amount', () => {
    const fn = findFunction(ERC20_ABI, 'transferFrom')!;
    expect(fn.stateMutability).toBe('nonpayable');
    const inputs = fn.inputs as { name: string; type: string }[];
    expect(inputs.length).toBe(3);
    expect(inputs[0].name).toBe('from');
    expect(inputs[0].type).toBe('address');
    expect(inputs[1].name).toBe('to');
    expect(inputs[1].type).toBe('address');
    expect(inputs[2].name).toBe('amount');
    expect(inputs[2].type).toBe('uint256');
    const outputs = fn.outputs as { type: string }[];
    expect(outputs[0].type).toBe('bool');
  });

  it('contains Transfer event with indexed from, indexed to, and value', () => {
    const ev = findEvent(ERC20_ABI, 'Transfer')!;
    expect(ev).toBeDefined();
    const inputs = ev.inputs as { name: string; type: string; indexed: boolean }[];
    expect(inputs.length).toBe(3);
    expect(inputs[0].name).toBe('from');
    expect(inputs[0].type).toBe('address');
    expect(inputs[0].indexed).toBe(true);
    expect(inputs[1].name).toBe('to');
    expect(inputs[1].type).toBe('address');
    expect(inputs[1].indexed).toBe(true);
    expect(inputs[2].name).toBe('value');
    expect(inputs[2].type).toBe('uint256');
    expect(inputs[2].indexed).toBe(false);
  });
});
