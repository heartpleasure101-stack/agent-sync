// Bundle the CLI into two artifacts:
//
//   dist/main.js — the real program (Ink, React, clack, chalk, everything).
//   dist/cli.js  — a tiny launcher holding only the Node version check.
//
// They are separate on purpose. ESM parses a module in full before running a
// single line, so a combined bundle would force an old Node to parse ~1.4MB of
// dependencies before reaching the version check — any syntax it doesn't
// understand would surface as a SyntaxError instead of our upgrade guide.
// Splitting keeps the launcher small enough to parse anywhere, and the esbuild
// pass below guarantees its syntax stays within LAUNCHER_TARGET.
//
// react-devtools-core is Ink's optional peer; not installed at consumer sites.
// We stub it so the ESM resolver never chases the missing package. That only
// concerns the main bundle — the launcher never imports Ink.

import { rm, stat } from 'node:fs/promises';
import { build as esbuild } from 'esbuild';

// Deliberately below package.json's `engines.node` (>=22). The launcher exists
// to serve users whose Node is too old, so it must run on the versions that
// `engines` excludes. Node 16 is EOL, so 18 is the floor worth supporting.
const LAUNCHER_TARGET = 'node18';

const stubReactDevtools = {
  name: 'stub-react-devtools',
  setup(builder) {
    builder.onResolve({ filter: /^react-devtools-core$/ }, () => ({
      path: 'react-devtools-core-stub',
      namespace: 'stub',
    }));
    builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents:
        'export default {};\n' +
        'export const initialize = () => {};\n' +
        'export const connectToDevTools = () => {};\n',
      loader: 'js',
    }));
  },
};

function reportAndExit(label, logs) {
  console.error(`build: FAIL — ${label}`);
  for (const log of logs) console.error(log);
  process.exit(1);
}

// 1. Main program. The stub plugin belongs here: react-devtools-core comes in
//    via Ink, which only the main bundle pulls.
const main = await Bun.build({
  entrypoints: ['src/cli-main.tsx'],
  outdir: 'dist',
  naming: '[dir]/main.[ext]',
  target: 'node',
  format: 'esm',
  plugins: [stubReactDevtools],
});

if (!main.success) reportAndExit('main bundle', main.logs);

// 2. Launcher. src/cli.tsx reaches the main bundle through a runtime-resolved
//    URL, so Bun cannot follow the edge and inline it here.
const launcher = await Bun.build({
  entrypoints: ['src/cli.tsx'],
  outdir: 'dist',
  naming: '[dir]/cli.[ext]',
  target: 'node',
  format: 'esm',
});

if (!launcher.success) reportAndExit('launcher bundle', launcher.logs);

// 3. Lower the launcher to LAUNCHER_TARGET.
//
//    Bun cannot do this: `Bun.build` rejects version-pinned targets, accepting
//    only 'browser' | 'node' | 'bun' | 'macro' | 'bun-<target>'. So its output
//    carries no syntax floor at all. esbuild both downlevels what it can and
//    fails on what it cannot, which turns "the launcher happens to parse on old
//    Node" into "the launcher is guaranteed to". Without this step a future
//    edit under src/preflight/ could silently make the version check
//    unreachable — the exact failure this split exists to prevent.
const LAUNCHER_OUT = 'dist/cli.js';
try {
  await esbuild({
    entryPoints: [LAUNCHER_OUT],
    outfile: LAUNCHER_OUT,
    allowOverwrite: true,
    target: LAUNCHER_TARGET,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
    // No `banner` here: esbuild preserves the hashbang Bun already emitted, and
    // adding one produces a second `#!` on line 2 — which is a SyntaxError,
    // precisely the failure this split exists to prevent.
  });
} catch (err) {
  console.error(
    `build: FAIL — launcher 超出語法下限 (${LAUNCHER_TARGET})\n` +
      `  dist/cli.js 必須能被舊版 Node 解析，否則版本檢查根本跑不到，\n` +
      `  使用者會看到 SyntaxError 而不是升級指引。\n` +
      `  請改用 ${LAUNCHER_TARGET} 支援的語法，或調整 build.mjs 的 LAUNCHER_TARGET。\n`,
  );
  for (const e of err?.errors ?? [err]) console.error(e.text ?? e);
  await rm(LAUNCHER_OUT, { force: true });
  process.exit(1);
}

// Report sizes from disk, not from Bun's build result: the launcher's result
// predates the esbuild pass above, and rounding it to MB reads as 0.00.
for (const file of ['dist/main.js', LAUNCHER_OUT]) {
  const { size } = await stat(file);
  const human = size >= 1024 * 1024
    ? `${(size / 1024 / 1024).toFixed(2)} MB`
    : `${(size / 1024).toFixed(1)} KB`;
  console.log(`  ${file}  ${human}`);
}
