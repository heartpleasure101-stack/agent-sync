// Smoke test: fail if either build artifact emits ERR_MODULE_NOT_FOUND within
// 500ms of startup. The CLI is interactive so we don't wait for exit — we only
// check the load phase.
//
// Both artifacts are checked on purpose. dist/cli.js only reaches dist/main.js
// through a dynamic import that fires *after* the Node version check passes, so
// spawning the launcher alone would never surface a broken main bundle. Since
// we also (deliberately, see below) ignore exit codes, a main-bundle failure
// would otherwise pass silently.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const ARTIFACTS = [
  { name: 'dist/cli.js', url: new URL('../dist/cli.js', import.meta.url) },
  { name: 'dist/main.js', url: new URL('../dist/main.js', import.meta.url) },
];

for (const artifact of ARTIFACTS) {
  if (!existsSync(artifact.url.pathname)) {
    console.error(`smoke: FAIL — ${artifact.name} missing — run \`bun run build\` first`);
    process.exit(1);
  }
}

// Note: the CLI naturally errors out under non-TTY stdin (e.g. CI, piped shell),
// so we deliberately do NOT treat a non-zero exit code as failure. The only
// contract this smoke test enforces is: no ERR_MODULE_NOT_FOUND during load.
function checkArtifact({ name, url }) {
  return new Promise((resolve) => {
    const child = spawn('node', [url.pathname], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderrBuf = '';
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (!child.killed) child.kill('SIGTERM');
      resolve(result);
    };

    const failFast = () => {
      if (stderrBuf.includes('ERR_MODULE_NOT_FOUND')) {
        child.kill('SIGKILL');
        finish({ ok: false, name, stderr: stderrBuf });
      }
    };

    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
      failFast();
    });

    child.on('error', (err) => {
      finish({ ok: false, name, stderr: `could not spawn node: ${err.message}` });
    });

    setTimeout(() => {
      failFast();
      finish({ ok: true, name });
    }, 500);
  });
}

let failed = false;
for (const artifact of ARTIFACTS) {
  const result = await checkArtifact(artifact);
  if (result.ok) {
    console.log(`smoke: PASS — ${result.name}: no ERR_MODULE_NOT_FOUND in first 500ms`);
  } else {
    failed = true;
    console.error(`smoke: FAIL — ${result.name}: ERR_MODULE_NOT_FOUND during load:\n${result.stderr}`);
  }
}

process.exit(failed ? 1 : 0);
