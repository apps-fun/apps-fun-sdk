#!/usr/bin/env node

import { runDoctor } from './doctor';

const args = process.argv.slice(2);
const command = args[0];

if (command === 'doctor') {
  const walletIdx = args.indexOf('--wallet');
  const walletAddress = walletIdx !== -1 ? args[walletIdx + 1] : undefined;
  runDoctor(walletAddress).catch((err) => {
    console.error('Doctor failed:', err.message);
    process.exit(1);
  });
} else {
  console.log('Usage: apps-fun-sdk <command>\n');
  console.log('Commands:');
  console.log('  doctor              Check RPC connections, contracts, and wallet balance');
  console.log('  doctor --wallet 0x  Also check wallet balance on EVM networks');
  process.exit(command ? 1 : 0);
}
