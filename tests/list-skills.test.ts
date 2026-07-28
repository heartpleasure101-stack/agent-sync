import path from 'path';
import { test, expect } from 'bun:test';
import { listSkills } from '../src/core/list-skills.js';
import { makeTempDir, createSkill } from './helpers.js';

test('returns [] when canonical skills dir does not exist', async () => {
  const home = await makeTempDir('list-skills-empty-');
  const result = await listSkills({ scope: 'global', homeDir: home });
  expect(result).toEqual([]);
});

test('flat layout: skills directly under skills/', async () => {
  const home = await makeTempDir('list-skills-flat-');
  const skillsRoot = path.join(home, '.agents', 'skills');
  await createSkill(skillsRoot, 'alpha');
  await createSkill(skillsRoot, 'beta');

  const result = await listSkills({ scope: 'global', homeDir: home });
  const names = result.map((r) => r.name).sort();
  expect(names).toEqual(['alpha', 'beta']);
  for (const entry of result) {
    expect(entry.category).toBeNull();
    expect(entry.displayName).toBe(entry.name);
    expect(entry.hasCollision).toBe(false);
  }
});

test('category layout: skills under first-level category dirs', async () => {
  const home = await makeTempDir('list-skills-cat-');
  const skillsRoot = path.join(home, '.agents', 'skills');
  await createSkill(path.join(skillsRoot, '01_Coding'), 'openspec-propose');
  await createSkill(path.join(skillsRoot, '03_Medie'), 'audio-to-srt');

  const result = await listSkills({ scope: 'global', homeDir: home });
  const byName = new Map(result.map((r) => [r.name, r]));
  expect(byName.get('openspec-propose')?.category).toBe('01_Coding');
  expect(byName.get('openspec-propose')?.displayName).toBe('01_Coding/openspec-propose');
  expect(byName.get('audio-to-srt')?.category).toBe('03_Medie');
  expect(byName.get('audio-to-srt')?.displayName).toBe('03_Medie/audio-to-srt');
  for (const entry of result) expect(entry.hasCollision).toBe(false);
});

test('mixed layout: category dir + flat skill coexist', async () => {
  const home = await makeTempDir('list-skills-mixed-');
  const skillsRoot = path.join(home, '.agents', 'skills');
  await createSkill(path.join(skillsRoot, '01_Coding'), 'openspec-propose');
  await createSkill(skillsRoot, 'git-branch-name');

  const result = await listSkills({ scope: 'global', homeDir: home });
  const byName = new Map(result.map((r) => [r.name, r]));
  expect(byName.get('git-branch-name')?.category).toBeNull();
  expect(byName.get('openspec-propose')?.category).toBe('01_Coding');
});

test('name collision across categories flags hasCollision', async () => {
  const home = await makeTempDir('list-skills-clash-');
  const skillsRoot = path.join(home, '.agents', 'skills');
  await createSkill(path.join(skillsRoot, '01_Coding'), 'foo');
  await createSkill(path.join(skillsRoot, '03_Medie'), 'foo');

  const result = await listSkills({ scope: 'global', homeDir: home });
  const foos = result.filter((r) => r.name === 'foo');
  expect(foos.length).toBe(2);
  for (const entry of foos) expect(entry.hasCollision).toBe(true);
});
