#!/usr/bin/env node
import { spawn } from 'node:child_process';

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = ['-y', '@playwright/test', 'test', 'scripts/multiplayer-ui-regression.spec.cjs', '--reporter=line'];

const child = spawn(command, args, {
  stdio: 'inherit',
});

child.once('error', (error) => {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
    console.warn('[multiplayer-ui-regression] npx not available; skipping UI regression.');
    process.exit(0);
    return;
  }
  console.error('[multiplayer-ui-regression] Failed to launch test runner:', error);
  process.exit(1);
});

child.once('close', (code, signal) => {
  if (code !== null && code !== 0) {
    const signalSuffix = signal ? ` (signal: ${signal})` : '';
    console.error(`[multiplayer-ui-regression] Playwright regression failed with exit code ${code}${signalSuffix}`);
    process.exit(code);
  }
  process.exit(0);
});
