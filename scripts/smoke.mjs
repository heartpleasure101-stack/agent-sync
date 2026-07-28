// Smoke test: fail if `node dist/cli.js` emits ERR_MODULE_NOT_FOUND
// within 500ms of startup. CLI is interactive so we don't wait for exit —
// we only check the load phase.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const distPath = new URL('../dist/cli.js', import.meta.url).pathname;
if (!existsSync(distPath)) {
  console.error(`smoke: dist/cli.js missing — run \`bun run build\` first`);
  process.exit(1);
}

const child = spawn('node', [distPath], { stdio: ['ignore', 'pipe', 'pipe'] });

let stderrBuf = '';
child.stderr.on('data', (chunk) => {
  stderrBuf += chunk.toString();
});

const failFast = () => {
  if (stderrBuf.includes('ERR_MODULE_NOT_FOUND')) {
    console.error('smoke: FAIL — ERR_MODULE_NOT_FOUND during load:\n' + stderrBuf);
    child.kill('SIGKILL');
    process.exit(1);
  }
};
child.stderr.on('data', failFast);
child.on('error', (err) => {
  console.error('smoke: FAIL — could not spawn node:', err.message);
  process.exit(1);
});
// Note: the CLI naturally errors out under non-TTY stdin (e.g. CI, piped shell),
// so we deliberately do NOT treat a non-zero exit code as failure. The only
// contract this smoke test enforces is: no ERR_MODULE_NOT_FOUND during load.

setTimeout(() => {
  failFast();
  if (!child.killed) child.kill('SIGTERM');
  console.log('smoke: PASS — no ERR_MODULE_NOT_FOUND in first 500ms');
  process.exit(0);
}, 500);
