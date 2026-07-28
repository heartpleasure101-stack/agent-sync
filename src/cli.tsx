#!/usr/bin/env node
// Thin shell — runs preflight (Node version check) before loading any heavy
// dependency. Uses dynamic import so Ink / clack / chalk never touch the
// runtime until we know the runtime meets Ink's node >=22 requirement.
import process from 'node:process';
import { checkNodeVersion } from './preflight/runtime-check.js';
import { formatFailureMessage } from './preflight/runtime-guide.js';

const check = checkNodeVersion(process);
if (!check.ok) {
  process.stderr.write(formatFailureMessage(check) + '\n');
  process.exit(1);
}

await import('./cli-main.js');
