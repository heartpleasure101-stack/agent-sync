import fs from 'fs';
import path from 'path';
import { test, expect } from 'bun:test';
import { scanInstalledSkills } from '../src/core/scan-installed.js';
import { makeTempDir, createSkill } from './helpers.js';

/**
 * Build a global-scope fixture: <home>/.agents/skills is canonical, and each
 * client reads from <home>/.<client>/skills.
 */
async function setup(prefix: string) {
  const home = await makeTempDir(prefix);
  const canonicalSkills = path.join(home, '.agents', 'skills');
  await fs.promises.mkdir(canonicalSkills, { recursive: true });
  return { home, canonicalSkills };
}

async function clientSkillsDir(home: string, client: 'claude' | 'gemini'): Promise<string> {
  const dir = path.join(home, `.${client}`, 'skills');
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
}

test('collects a symlink that points at a canonical skill', async () => {
  const { home, canonicalSkills } = await setup('scan-installed-basic-');
  const coding = path.join(canonicalSkills, '01_Coding');
  await fs.promises.mkdir(coding, { recursive: true });
  const skillDir = await createSkill(coding, 'git-smart-commit');

  const claudeSkills = await clientSkillsDir(home, 'claude');
  await fs.promises.symlink(skillDir, path.join(claudeSkills, 'git-smart-commit'));

  const installed = await scanInstalledSkills({ scope: 'global', clients: ['claude'], homeDir: home });

  expect(installed.get(skillDir)).toEqual(new Set(['claude']));
});

test('ignores a real directory on the client side', async () => {
  const { home, canonicalSkills } = await setup('scan-installed-realdir-');
  const skillDir = await createSkill(canonicalSkills, 'foo');

  const claudeSkills = await clientSkillsDir(home, 'claude');
  await fs.promises.mkdir(path.join(claudeSkills, 'foo'), { recursive: true });

  const installed = await scanInstalledSkills({ scope: 'global', clients: ['claude'], homeDir: home });

  expect(installed.has(skillDir)).toBe(false);
  expect(installed.size).toBe(0);
});

test('ignores a symlink pointing outside canonical', async () => {
  const { home, canonicalSkills } = await setup('scan-installed-elsewhere-');
  const skillDir = await createSkill(canonicalSkills, 'foo');
  const outside = path.join(home, 'somewhere-else');
  await fs.promises.mkdir(outside, { recursive: true });

  const claudeSkills = await clientSkillsDir(home, 'claude');
  await fs.promises.symlink(outside, path.join(claudeSkills, 'foo'));

  const installed = await scanInstalledSkills({ scope: 'global', clients: ['claude'], homeDir: home });

  expect(installed.has(skillDir)).toBe(false);
  expect(installed.size).toBe(0);
});

test('same basename in different categories resolves to the linked one only', async () => {
  const { home, canonicalSkills } = await setup('scan-installed-collision-');
  const coding = path.join(canonicalSkills, '01_Coding');
  const media = path.join(canonicalSkills, '03_Medie');
  await fs.promises.mkdir(coding, { recursive: true });
  await fs.promises.mkdir(media, { recursive: true });
  const codingFoo = await createSkill(coding, 'foo');
  const mediaFoo = await createSkill(media, 'foo');

  const claudeSkills = await clientSkillsDir(home, 'claude');
  await fs.promises.symlink(codingFoo, path.join(claudeSkills, 'foo'));

  const installed = await scanInstalledSkills({ scope: 'global', clients: ['claude'], homeDir: home });

  expect(installed.get(codingFoo)).toEqual(new Set(['claude']));
  expect(installed.has(mediaFoo)).toBe(false);
});

test('missing client skills directory does not throw', async () => {
  const { home, canonicalSkills } = await setup('scan-installed-missing-');
  await createSkill(canonicalSkills, 'foo');

  const installed = await scanInstalledSkills({ scope: 'global', clients: ['claude', 'gemini'], homeDir: home });

  expect(installed.size).toBe(0);
});

test('aggregates the same skill across multiple clients', async () => {
  const { home, canonicalSkills } = await setup('scan-installed-multi-');
  const skillDir = await createSkill(canonicalSkills, 'shared');

  const claudeSkills = await clientSkillsDir(home, 'claude');
  const geminiSkills = await clientSkillsDir(home, 'gemini');
  await fs.promises.symlink(skillDir, path.join(claudeSkills, 'shared'));
  await fs.promises.symlink(skillDir, path.join(geminiSkills, 'shared'));

  const installed = await scanInstalledSkills({ scope: 'global', clients: ['claude', 'gemini'], homeDir: home });

  expect(installed.get(skillDir)).toEqual(new Set(['claude', 'gemini']));
});

test('only reports clients that were asked for', async () => {
  const { home, canonicalSkills } = await setup('scan-installed-scoped-');
  const skillDir = await createSkill(canonicalSkills, 'shared');

  const claudeSkills = await clientSkillsDir(home, 'claude');
  const geminiSkills = await clientSkillsDir(home, 'gemini');
  await fs.promises.symlink(skillDir, path.join(claudeSkills, 'shared'));
  await fs.promises.symlink(skillDir, path.join(geminiSkills, 'shared'));

  const installed = await scanInstalledSkills({ scope: 'global', clients: ['gemini'], homeDir: home });

  expect(installed.get(skillDir)).toEqual(new Set(['gemini']));
});

test('relative symlinks resolve correctly', async () => {
  const { home, canonicalSkills } = await setup('scan-installed-relative-');
  const skillDir = await createSkill(canonicalSkills, 'rel');

  const claudeSkills = await clientSkillsDir(home, 'claude');
  const linkPath = path.join(claudeSkills, 'rel');
  await fs.promises.symlink(path.relative(path.dirname(linkPath), skillDir), linkPath);

  const installed = await scanInstalledSkills({ scope: 'global', clients: ['claude'], homeDir: home });

  expect(installed.get(skillDir)).toEqual(new Set(['claude']));
});

test('scanning a superset of clients is what makes out-of-scope installs visible', async () => {
  // Regression guard: the picker derives its tri-state from the *selected*
  // clients but annotates rows with installs on clients outside that selection.
  // That annotation is only possible if the scan covered those clients, so
  // callers must scan broadly and narrow afterwards — scanning only the
  // selection silently hides the very state this change exists to surface.
  const { home, canonicalSkills } = await setup('scan-installed-superset-');
  const skillDir = await createSkill(canonicalSkills, 'beta');

  const claudeSkills = await clientSkillsDir(home, 'claude');
  await fs.promises.symlink(skillDir, path.join(claudeSkills, 'beta'));

  const narrow = await scanInstalledSkills({ scope: 'global', clients: ['gemini'], homeDir: home });
  expect(narrow.has(skillDir)).toBe(false); // claude never looked at

  const wide = await scanInstalledSkills({ scope: 'global', clients: ['claude', 'gemini'], homeDir: home });
  expect(wide.get(skillDir)).toEqual(new Set(['claude']));
});

test('returns empty map when no clients are selected', async () => {
  const { home, canonicalSkills } = await setup('scan-installed-noclients-');
  await createSkill(canonicalSkills, 'foo');

  const installed = await scanInstalledSkills({ scope: 'global', clients: [], homeDir: home });

  expect(installed.size).toBe(0);
});
