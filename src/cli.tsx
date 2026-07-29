#!/usr/bin/env node
// Thin shell — runs preflight (Node version check) before loading any heavy
// dependency. Uses dynamic import so Ink / clack / chalk never touch the
// runtime until we know the runtime meets Ink's node >=22 requirement.
//
// The main program is resolved at runtime via `new URL(...)` rather than a
// literal specifier: a literal would let the bundler follow the edge and
// inline all of cli-main into this file. ESM parses a module in full before
// executing a single line, so an inlined main would force old Node to parse
// ~1.4MB of dependencies before reaching the check below — any syntax it
// doesn't understand would surface as a SyntaxError instead of our guide.
// Keeping this opaque to the bundler is what makes the check reachable.
import process from 'node:process';
import { checkNodeVersion } from './preflight/runtime-check.js';
import { formatFailureMessage } from './preflight/runtime-guide.js';

const check = checkNodeVersion(process);
if (!check.ok) {
  process.stderr.write(formatFailureMessage(check) + '\n');
  process.exit(1);
}

const mainUrl = new URL('./main.js', import.meta.url);
try {
  await import(mainUrl.href);
} catch (err) {
  // Most likely dist/main.js is missing or unreadable. Surface something
  // actionable instead of a raw module-resolution stack trace.
  const detail = err instanceof Error ? err.message : String(err);
  process.stderr.write(
    `✖ agent-sync 主程式載入失敗\n\n` +
      `  預期路徑：${mainUrl.pathname}\n` +
      `  原因：${detail}\n\n` +
      `  這通常表示安裝不完整或建置產物缺少 main.js。\n` +
      `  請重新安裝後再試：\n` +
      `    $ npx github:heartpleasure101-stack/agent-sync\n`,
  );
  process.exit(1);
}
