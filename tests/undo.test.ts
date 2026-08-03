import fs from 'fs';
import path from 'path';
import { test, expect } from 'bun:test';
import { buildLinkPlan } from '../src/core/plan.js';
import { applyLinkPlan } from '../src/core/apply.js';
import { createBackupSession, finalizeBackup, backupPath } from '../src/core/backup.js';
import { undoLastChange } from '../src/core/undo.js';
import { makeTempDir, writeFile } from './helpers.js';

test('undo restores overwritten tool paths', async () => {
  const home = await makeTempDir('agent-sync-home-');
  const codexPrompts = path.join(home, '.codex', 'prompts');
  await writeFile(path.join(codexPrompts, 'keep.md'), '# keep');

  const plan = await buildLinkPlan({ scope: 'global', homeDir: home });
  const backup = await createBackupSession({ canonicalRoot: path.join(home, '.agents'), scope: 'global', operation: 'test' });
  await applyLinkPlan(plan, { force: true, backup });
  await finalizeBackup(backup);

  const undo = await undoLastChange({ scope: 'global', homeDir: home });
  expect(undo.restored).toBeGreaterThan(0);

  const stat = await fs.promises.lstat(codexPrompts);
  expect(stat.isDirectory()).toBe(true);
  expect(stat.isSymbolicLink()).toBe(false);
  expect(fs.existsSync(path.join(codexPrompts, 'keep.md'))).toBe(true);
});

test('undo restores broken symlink with its original link string', async () => {
  const home = await makeTempDir('agent-sync-undo-broken-');
  const canonicalRoot = path.join(home, '.agents');
  await fs.promises.mkdir(canonicalRoot, { recursive: true });

  const claudeDir = path.join(home, '.claude');
  await fs.promises.mkdir(claudeDir, { recursive: true });
  const brokenSymlinkPath = path.join(claudeDir, 'skills');
  const nonExistentTarget = path.join(home, 'non-existent-skills');
  await fs.promises.symlink(nonExistentTarget, brokenSymlinkPath);

  const backup = await createBackupSession({ canonicalRoot, scope: 'global', operation: 'test' });
  await backupPath(brokenSymlinkPath, backup);
  await finalizeBackup(backup);

  // Recreate as real directory (simulating cleaning and installation)
  await fs.promises.mkdir(brokenSymlinkPath, { recursive: true });

  const undo = await undoLastChange({ scope: 'global', homeDir: home });
  expect(undo.restoredBackups).toBe(1);

  const stat = await fs.promises.lstat(brokenSymlinkPath);
  expect(stat.isSymbolicLink()).toBe(true);
  const rawLink = await fs.promises.readlink(brokenSymlinkPath);
  expect(rawLink).toBe(nonExistentTarget);
});
