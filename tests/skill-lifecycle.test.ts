import fs from 'fs';
import os from 'os';
import path from 'path';
import { test, expect } from 'bun:test';
import { listSkills } from '../src/core/list-skills.js';
import { scanInstalledSkills } from '../src/core/scan-installed.js';
import {
  groupByCategory, initState, toggle, resetTab, diff, pendingCounts, rowMarker, outOfScopeClients,
} from '../src/ui/skill-picker-state.js';
import { buildLinkPlan } from '../src/core/plan.js';
import { applyLinkPlan } from '../src/core/apply.js';
import { createBackupSession, finalizeBackup } from '../src/core/backup.js';
import { undoLastChange } from '../src/core/undo.js';
import type { Client } from '../src/core/types.js';

/**
 * End-to-end lifecycle over the real filesystem: scan -> picker state ->
 * diff -> plan -> apply -> undo. Only the keypress layer is simulated (calling
 * toggle/resetTab directly); everything below it is the production path.
 */

const CLIENTS: Client[] = ['claude', 'gemini'];
const TAB = '01_Coding';

async function makeSkill(dir: string, name: string): Promise<string> {
  const d = path.join(dir, name);
  await fs.promises.mkdir(d, { recursive: true });
  await fs.promises.writeFile(path.join(d, 'SKILL.md'), `---\nname: ${name}\ndescription: x\n---\n`, 'utf8');
  return d;
}

/** alpha installed on both clients, beta on claude only, gamma nowhere. */
async function freshHome() {
  const home = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'skill-lifecycle-'));
  const canonical = path.join(home, '.agents', 'skills', TAB);
  await fs.promises.mkdir(canonical, { recursive: true });
  const alpha = await makeSkill(canonical, 'alpha');
  const beta = await makeSkill(canonical, 'beta');
  const gamma = await makeSkill(canonical, 'gamma');

  const claude = path.join(home, '.claude', 'skills');
  const gemini = path.join(home, '.gemini', 'skills');
  await fs.promises.mkdir(claude, { recursive: true });
  await fs.promises.mkdir(gemini, { recursive: true });
  await fs.promises.symlink(alpha, path.join(claude, 'alpha'));
  await fs.promises.symlink(alpha, path.join(gemini, 'alpha'));
  await fs.promises.symlink(beta, path.join(claude, 'beta'));
  return { home, alpha, beta, gamma, claude, gemini };
}

async function openPicker(home: string, clients: Client[]) {
  const entries = await listSkills({ scope: 'global', homeDir: home });
  // Scan every client, derive against the selected subset — mirrors cli-main.
  const installed = await scanInstalledSkills({ scope: 'global', clients: CLIENTS, homeDir: home });
  const groups = groupByCategory(entries);
  return { groups, installed, state: initState(groups, installed, clients) };
}

async function applyDiff(home: string, clients: Client[], d: { toInstall: string[]; toRemove: string[] }) {
  const plan = await buildLinkPlan({
    scope: 'global', homeDir: home, clients,
    selectedSkills: d.toInstall, removeSkills: d.toRemove,
  });
  const backup = await createBackupSession({
    canonicalRoot: path.join(home, '.agents'), scope: 'global', operation: 'test',
  });
  const res = await applyLinkPlan(plan, { backup });
  await finalizeBackup(backup);
  return res;
}

const isLink = (p: string): boolean => {
  try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; }
};

test('initial tri-state is derived from what is on disk', async () => {
  const { home, alpha, beta, gamma } = await freshHome();
  const { groups, state } = await openPicker(home, CLIENTS);
  const rows = state.get(TAB)!;

  expect(rows.get(alpha)!.original).toBe('all');
  expect(rows.get(beta)!.original).toBe('partial');
  expect(rows.get(gamma)!.original).toBe('none');
  expect(pendingCounts(state, groups)).toEqual({ install: 0, remove: 0 });
});

test('a skill installed only outside the selection shows unchecked plus an annotation', async () => {
  const { home, beta } = await freshHome();
  const { installed, state } = await openPicker(home, ['gemini']);

  expect(state.get(TAB)!.get(beta)!.original).toBe('none');
  expect(outOfScopeClients(installed, beta, ['gemini'])).toEqual(['claude']);
});

test('cycling a partial row three times returns to partial and queues nothing', async () => {
  const { home, beta } = await freshHome();
  const { groups, state } = await openPicker(home, CLIENTS);

  let s = state;
  const seen: string[] = [];
  for (let i = 0; i < 3; i++) {
    s = toggle(s, TAB, beta);
    seen.push(s.get(TAB)!.get(beta)!.desired);
  }

  expect(seen).toEqual(['all', 'none', 'partial']);
  expect(pendingCounts(s, groups)).toEqual({ install: 0, remove: 0 });
});

test('reset restores originals rather than clearing everything', async () => {
  const { home, alpha, beta, gamma } = await freshHome();
  const { groups, state } = await openPicker(home, CLIENTS);

  let s = toggle(state, TAB, alpha);
  s = toggle(s, TAB, gamma);
  expect(pendingCounts(s, groups)).toEqual({ install: 1, remove: 1 });

  s = resetTab(s, TAB);
  expect(pendingCounts(s, groups)).toEqual({ install: 0, remove: 0 });
  expect(s.get(TAB)!.get(alpha)!.desired).toBe('all');
  expect(s.get(TAB)!.get(beta)!.desired).toBe('partial');
});

test('unchecking an installed skill removes both links and undo restores them', async () => {
  const { home, alpha, claude, gemini } = await freshHome();
  const { groups, state } = await openPicker(home, CLIENTS);

  const s = toggle(state, TAB, alpha);
  expect(rowMarker(s.get(TAB)!.get(alpha))).toBe('-');

  const d = diff(s, groups);
  expect(d).toEqual({ toInstall: [], toRemove: [alpha] });

  const res = await applyDiff(home, CLIENTS, d);
  expect(res.removed).toBe(2);
  expect(fs.existsSync(path.join(claude, 'alpha'))).toBe(false);
  expect(fs.existsSync(path.join(gemini, 'alpha'))).toBe(false);
  // Removing a link must never touch the canonical content.
  expect(fs.existsSync(path.join(alpha, 'SKILL.md'))).toBe(true);

  await undoLastChange({ scope: 'global', homeDir: home });
  expect(isLink(path.join(claude, 'alpha'))).toBe(true);
  expect(isLink(path.join(gemini, 'alpha'))).toBe(true);
  expect(path.resolve(fs.readlinkSync(path.join(claude, 'alpha')))).toBe(path.resolve(alpha));
});

test('one apply mixing install and removal is rolled back by a single undo', async () => {
  const { home, alpha, gamma, claude, gemini } = await freshHome();
  const { groups, state } = await openPicker(home, CLIENTS);

  let s = toggle(state, TAB, gamma); // install
  s = toggle(s, TAB, alpha);         // remove
  const d = diff(s, groups);
  expect(d.toInstall).toEqual([gamma]);
  expect(d.toRemove).toEqual([alpha]);

  await applyDiff(home, CLIENTS, d);
  expect(isLink(path.join(claude, 'gamma'))).toBe(true);
  expect(isLink(path.join(gemini, 'gamma'))).toBe(true);
  expect(fs.existsSync(path.join(claude, 'alpha'))).toBe(false);
  expect(fs.existsSync(path.join(gemini, 'alpha'))).toBe(false);

  await undoLastChange({ scope: 'global', homeDir: home });
  expect(fs.existsSync(path.join(claude, 'gamma'))).toBe(false);
  expect(isLink(path.join(claude, 'alpha'))).toBe(true);
  expect(isLink(path.join(gemini, 'alpha'))).toBe(true);
});
