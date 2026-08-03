import { expect, test } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ensureCanonical } from '../src/core/ensure-canonical.js';

function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `agent-sync-test-${prefix}-`));
}

test('ensureCanonical returns empty object when ~/.agents exists', async () => {
  const home = makeTmpDir('home');
  const project = makeTmpDir('project');
  fs.mkdirSync(path.join(home, '.agents'));

  const res = await ensureCanonical({ homeDir: home, projectRoot: project });
  expect(res).toEqual({});
});

test('fallback prompt option create creates ~/.agents', async () => {
  const home = makeTmpDir('home');
  const project = makeTmpDir('project');

  const res = await ensureCanonical({
    homeDir: home,
    projectRoot: project,
    selectFn: (async () => 'create') as any,
  });

  expect(res).toEqual({});
  expect(fs.existsSync(path.join(home, '.agents'))).toBe(true);
});

test('fallback prompt option custom returns canonicalOverride', async () => {
  const home = makeTmpDir('home');
  const project = makeTmpDir('project');
  const customCanonical = makeTmpDir('custom-agents');

  const res = await ensureCanonical({
    homeDir: home,
    projectRoot: project,
    selectFn: (async () => 'custom') as any,
    textFn: (async () => customCanonical) as any,
  });

  expect(res.canonicalOverride).toBe(customCanonical);
  expect(fs.existsSync(path.join(home, '.agents'))).toBe(false);
});

test('fallback prompt option custom validates input path', async () => {
  const home = makeTmpDir('home');
  const project = makeTmpDir('project');
  let validateErr: string | undefined;

  await ensureCanonical({
    homeDir: home,
    projectRoot: project,
    selectFn: (async () => 'custom') as any,
    textFn: (async (opts: any) => {
      validateErr = opts.validate('/nonexistent/path');
      return home; // valid existing dir
    }) as any,
  });

  expect(validateErr).toContain('路徑不存在');
});

test('fallback prompt option cancel exits with code 0', async () => {
  const home = makeTmpDir('home');
  const project = makeTmpDir('project');
  let exitedCode: number | undefined;

  await ensureCanonical({
    homeDir: home,
    projectRoot: project,
    selectFn: (async () => 'cancel') as any,
    exitFn: ((code: number) => {
      exitedCode = code;
      throw new Error('EXIT');
    }) as any,
  }).catch((err) => {
    if (err.message !== 'EXIT') throw err;
  });

  expect(exitedCode).toBe(0);
});

test('canonical override is non-persistent across calls', async () => {
  const home = makeTmpDir('home');
  const project = makeTmpDir('project');
  const customCanonical = makeTmpDir('custom-agents');

  // Session 1
  const res1 = await ensureCanonical({
    homeDir: home,
    projectRoot: project,
    selectFn: (async () => 'custom') as any,
    textFn: (async () => customCanonical) as any,
  });
  expect(res1.canonicalOverride).toBe(customCanonical);
  expect(fs.existsSync(path.join(home, '.agents'))).toBe(false);

  // Session 2: prompt triggers again because ~/.agents still does not exist
  let promptTriggered = false;
  await ensureCanonical({
    homeDir: home,
    projectRoot: project,
    selectFn: (async () => {
      promptTriggered = true;
      return 'custom';
    }) as any,
    textFn: (async () => customCanonical) as any,
  });

  expect(promptTriggered).toBe(true);
});

test('detects real directory in projectRoot/.agents and returns migrationHint', async () => {
  const home = makeTmpDir('home');
  const project = makeTmpDir('project');
  const projectAgents = path.join(project, '.agents');
  fs.mkdirSync(projectAgents);
  fs.writeFileSync(path.join(projectAgents, 'AGENTS.md'), '# Dummy');
  fs.mkdirSync(path.join(home, '.agents'));

  const res = await ensureCanonical({ homeDir: home, projectRoot: project });
  expect(res.migrationHint).toBeDefined();
  expect(res.migrationHint).toContain('偵測到');
});

test('valid symlink in projectRoot/.agents does not trigger migrationHint', async () => {
  const home = makeTmpDir('home');
  const project = makeTmpDir('project');
  const canonical = path.join(home, '.agents');
  fs.mkdirSync(canonical);
  fs.symlinkSync(canonical, path.join(project, '.agents'));

  const res = await ensureCanonical({ homeDir: home, projectRoot: project });
  expect(res.migrationHint).toBeUndefined();
});

test('broken symlink in projectRoot/.agents triggers migrationHint', async () => {
  const home = makeTmpDir('home');
  const project = makeTmpDir('project');
  fs.mkdirSync(path.join(home, '.agents'));
  const nonExistent = path.join(project, 'non-existent');
  fs.symlinkSync(nonExistent, path.join(project, '.agents'));

  const res = await ensureCanonical({ homeDir: home, projectRoot: project });
  expect(res.migrationHint).toBeDefined();
  expect(res.migrationHint).toContain('無效連結');
});
