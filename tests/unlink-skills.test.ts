import fs from 'fs';
import path from 'path';
import { test, expect } from 'bun:test';
import { buildLinkPlan } from '../src/core/plan.js';
import { applyLinkPlan } from '../src/core/apply.js';
import { createBackupSession, finalizeBackup } from '../src/core/backup.js';
import { undoLastChange } from '../src/core/undo.js';
import { preflightBackup } from '../src/core/preflight.js';
import { scanMigration } from '../src/core/migrate.js';
import { makeTempDir, createSkill } from './helpers.js';

/**
 * Canonical skill + an installed symlink on one client, which is the starting
 * point for every removal case below.
 */
async function setupInstalled(prefix: string, name = 'demo') {
  const home = await makeTempDir(prefix);
  const canonicalSkills = path.join(home, '.agents', 'skills');
  await fs.promises.mkdir(canonicalSkills, { recursive: true });
  const skillDir = await createSkill(canonicalSkills, name);

  const claudeSkills = path.join(home, '.claude', 'skills');
  await fs.promises.mkdir(claudeSkills, { recursive: true });
  const target = path.join(claudeSkills, name);
  await fs.promises.symlink(skillDir, target);

  return { home, skillDir, target, canonicalRoot: path.join(home, '.agents') };
}

function planOpts(home: string, removeSkills: string[]) {
  return {
    scope: 'global' as const,
    homeDir: home,
    clients: ['claude' as const],
    selectedSkills: [] as string[],
    removeSkills,
  };
}

test('plan emits an unlink task for an installed skill', async () => {
  const { home, skillDir, target } = await setupInstalled('unlink-plan-');

  const plan = await buildLinkPlan(planOpts(home, [skillDir]));
  const unlinks = plan.tasks.filter((t) => t.type === 'unlink');

  expect(unlinks.length).toBe(1);
  expect((unlinks[0] as any).target).toBe(target);
  expect(plan.changes.some((t) => t.type === 'unlink')).toBe(true);
});

test('apply removes the symlink and leaves canonical intact', async () => {
  const { home, skillDir, target, canonicalRoot } = await setupInstalled('unlink-apply-');

  const plan = await buildLinkPlan(planOpts(home, [skillDir]));
  const backup = await createBackupSession({ canonicalRoot, scope: 'global', operation: 'test' });
  const result = await applyLinkPlan(plan, { backup });
  await finalizeBackup(backup);

  expect(result.removed).toBe(1);
  expect(fs.existsSync(target)).toBe(false);
  // The canonical skill must survive — we removed a link, not the content.
  expect(fs.existsSync(path.join(skillDir, 'SKILL.md'))).toBe(true);
});

test('undo restores a removed symlink', async () => {
  const { home, skillDir, target, canonicalRoot } = await setupInstalled('unlink-undo-');

  const plan = await buildLinkPlan(planOpts(home, [skillDir]));
  const backup = await createBackupSession({ canonicalRoot, scope: 'global', operation: 'test' });
  await applyLinkPlan(plan, { backup });
  await finalizeBackup(backup);
  expect(fs.existsSync(target)).toBe(false);

  await undoLastChange({ scope: 'global', homeDir: home });

  const stat = await fs.promises.lstat(target);
  expect(stat.isSymbolicLink()).toBe(true);
  expect(path.resolve(await fs.promises.readlink(target))).toBe(path.resolve(skillDir));
});

test('a real directory is refused, not removed', async () => {
  const home = await makeTempDir('unlink-realdir-');
  const canonicalSkills = path.join(home, '.agents', 'skills');
  await fs.promises.mkdir(canonicalSkills, { recursive: true });
  const skillDir = await createSkill(canonicalSkills, 'demo');

  // User's own directory sitting where our symlink would be.
  const claudeSkills = path.join(home, '.claude', 'skills');
  const target = path.join(claudeSkills, 'demo');
  await fs.promises.mkdir(target, { recursive: true });
  await fs.promises.writeFile(path.join(target, 'mine.txt'), 'precious', 'utf8');

  const plan = await buildLinkPlan(planOpts(home, [skillDir]));
  expect(plan.tasks.some((t) => t.type === 'unlink')).toBe(false);
  const conflict = plan.conflicts.find((c) => c.target === target);
  expect(conflict).toBeDefined();
  expect(conflict!.reason).toContain('directory');

  const backup = await createBackupSession({
    canonicalRoot: path.join(home, '.agents'),
    scope: 'global',
    operation: 'test',
  });
  await applyLinkPlan(plan, { backup });
  await finalizeBackup(backup);

  // Still there, contents untouched.
  expect(fs.existsSync(path.join(target, 'mine.txt'))).toBe(true);
});

test('a symlink pointing elsewhere is refused', async () => {
  const home = await makeTempDir('unlink-elsewhere-');
  const canonicalSkills = path.join(home, '.agents', 'skills');
  await fs.promises.mkdir(canonicalSkills, { recursive: true });
  const skillDir = await createSkill(canonicalSkills, 'demo');

  const elsewhere = path.join(home, 'elsewhere');
  await fs.promises.mkdir(elsewhere, { recursive: true });
  const claudeSkills = path.join(home, '.claude', 'skills');
  await fs.promises.mkdir(claudeSkills, { recursive: true });
  const target = path.join(claudeSkills, 'demo');
  await fs.promises.symlink(elsewhere, target);

  const plan = await buildLinkPlan(planOpts(home, [skillDir]));

  expect(plan.tasks.some((t) => t.type === 'unlink')).toBe(false);
  expect(plan.conflicts.some((c) => c.target === target)).toBe(true);
  expect(fs.existsSync(target)).toBe(true);
});

test('an already-absent target is a noop, not an error', async () => {
  const home = await makeTempDir('unlink-absent-');
  const canonicalSkills = path.join(home, '.agents', 'skills');
  await fs.promises.mkdir(canonicalSkills, { recursive: true });
  const skillDir = await createSkill(canonicalSkills, 'demo');

  const plan = await buildLinkPlan(planOpts(home, [skillDir]));

  expect(plan.tasks.some((t) => t.type === 'unlink')).toBe(false);
  expect(plan.conflicts.length).toBe(0);
});

test('apply re-checks: a target swapped to a real dir after planning is not removed', async () => {
  const { home, skillDir, target, canonicalRoot } = await setupInstalled('unlink-toctou-');

  const plan = await buildLinkPlan(planOpts(home, [skillDir]));
  expect(plan.tasks.some((t) => t.type === 'unlink')).toBe(true);

  // Simulate the user swapping the symlink for a real directory between the
  // plan and the confirmation prompt.
  await fs.promises.unlink(target);
  await fs.promises.mkdir(target, { recursive: true });
  await fs.promises.writeFile(path.join(target, 'mine.txt'), 'precious', 'utf8');

  const backup = await createBackupSession({ canonicalRoot, scope: 'global', operation: 'test' });
  const result = await applyLinkPlan(plan, { backup });
  await finalizeBackup(backup);

  expect(result.removed).toBe(0);
  expect(result.conflicts).toBeGreaterThan(0);
  expect(fs.existsSync(path.join(target, 'mine.txt'))).toBe(true);
});

test('preflight includes unlink targets in its backup precheck', async () => {
  const { home, skillDir, target, canonicalRoot } = await setupInstalled('unlink-preflight-');

  const plan = await buildLinkPlan(planOpts(home, [skillDir]));
  const backup = await createBackupSession({ canonicalRoot, scope: 'global', operation: 'test' });
  const migrate = await scanMigration({ scope: 'global', homeDir: home, clients: ['claude'] });

  const res = await preflightBackup({
    backup,
    linkPlan: plan,
    migratePlan: migrate,
    selections: new Map(),
    forceLinks: false,
  });

  expect(res.targets).toBeGreaterThan(0);
  // Precheck must not have removed anything itself.
  expect(fs.existsSync(target)).toBe(true);
});

test('install and removal in one apply share a single backup session', async () => {
  const home = await makeTempDir('unlink-mixed-');
  const canonicalSkills = path.join(home, '.agents', 'skills');
  await fs.promises.mkdir(canonicalSkills, { recursive: true });
  const keep = await createSkill(canonicalSkills, 'keep');
  const drop = await createSkill(canonicalSkills, 'drop');

  const claudeSkills = path.join(home, '.claude', 'skills');
  await fs.promises.mkdir(claudeSkills, { recursive: true });
  const dropTarget = path.join(claudeSkills, 'drop');
  await fs.promises.symlink(drop, dropTarget);

  const plan = await buildLinkPlan({
    scope: 'global',
    homeDir: home,
    clients: ['claude'],
    selectedSkills: [keep],
    removeSkills: [drop],
  });

  const backup = await createBackupSession({
    canonicalRoot: path.join(home, '.agents'),
    scope: 'global',
    operation: 'test',
  });
  const result = await applyLinkPlan(plan, { backup });
  await finalizeBackup(backup);

  expect(result.removed).toBe(1);
  expect(fs.existsSync(dropTarget)).toBe(false);
  expect(fs.existsSync(path.join(claudeSkills, 'keep'))).toBe(true);

  // One undo rolls back both directions.
  await undoLastChange({ scope: 'global', homeDir: home });
  expect(fs.existsSync(dropTarget)).toBe(true);
  expect(fs.existsSync(path.join(claudeSkills, 'keep'))).toBe(false);
});
