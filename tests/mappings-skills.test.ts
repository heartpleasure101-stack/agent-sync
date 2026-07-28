import path from 'path';
import { test, expect } from 'bun:test';
import { getMappings } from '../src/core/mappings.js';
import { makeTempDir, createSkill } from './helpers.js';

test('selectedSkills undefined falls back to single directory-level skills mapping', async () => {
  const home = await makeTempDir('map-skills-legacy-');
  const skillsRoot = path.join(home, '.agents', 'skills');
  await createSkill(path.join(skillsRoot, '01_Coding'), 'openspec-propose');

  const mappings = await getMappings({ scope: 'global', homeDir: home, clients: ['claude'] });
  const skillMappings = mappings.filter((m) => m.name === 'skills');
  expect(skillMappings.length).toBe(1);
  const only = skillMappings[0]!;
  expect(only.source).toBe(skillsRoot);
  expect(only.targets).toEqual([path.join(home, '.claude', 'skills')]);
});

test('selectedSkills array expands into per-skill mappings with flat client targets', async () => {
  const home = await makeTempDir('map-skills-subset-');
  const skillsRoot = path.join(home, '.agents', 'skills');
  await createSkill(path.join(skillsRoot, '01_Coding'), 'openspec-propose');
  await createSkill(path.join(skillsRoot, '01_Coding'), 'git-smart-commit');
  await createSkill(path.join(skillsRoot, '03_Medie'), 'audio-to-srt');

  const mappings = await getMappings({
    scope: 'global',
    homeDir: home,
    clients: ['claude', 'gemini'],
    selectedSkills: [
      path.join(skillsRoot, '01_Coding', 'openspec-propose'),
      path.join(skillsRoot, '03_Medie', 'audio-to-srt'),
    ],
  });
  const skillMappings = mappings.filter((m) => m.name === 'skills');
  expect(skillMappings.length).toBe(2);

  const bySource = new Map(skillMappings.map((m) => [path.basename(m.source), m]));
  const openspec = bySource.get('openspec-propose')!;
  expect(openspec.source).toBe(path.join(skillsRoot, '01_Coding', 'openspec-propose'));
  expect(openspec.targets.sort()).toEqual([
    path.join(home, '.claude', 'skills', 'openspec-propose'),
    path.join(home, '.gemini', 'skills', 'openspec-propose'),
  ].sort());

  const audio = bySource.get('audio-to-srt')!;
  expect(audio.source).toBe(path.join(skillsRoot, '03_Medie', 'audio-to-srt'));
  expect(audio.targets.sort()).toEqual([
    path.join(home, '.claude', 'skills', 'audio-to-srt'),
    path.join(home, '.gemini', 'skills', 'audio-to-srt'),
  ].sort());

  // Unselected skill must not appear.
  expect(bySource.has('git-smart-commit')).toBe(false);
});

test('selectedSkills empty array produces zero skills mappings', async () => {
  const home = await makeTempDir('map-skills-none-');
  const skillsRoot = path.join(home, '.agents', 'skills');
  await createSkill(path.join(skillsRoot, '01_Coding'), 'openspec-propose');

  const mappings = await getMappings({
    scope: 'global',
    homeDir: home,
    clients: ['claude'],
    selectedSkills: [],
  });
  expect(mappings.filter((m) => m.name === 'skills').length).toBe(0);
});

test('same-basename skills in different categories stay independent by dir identity', async () => {
  const home = await makeTempDir('map-skills-collide-');
  const skillsRoot = path.join(home, '.agents', 'skills');
  await createSkill(skillsRoot, 'openspec-explore'); // flat
  await createSkill(path.join(skillsRoot, '01_Coding'), 'openspec-explore'); // categorized

  const flatDir = path.join(skillsRoot, 'openspec-explore');
  const catDir = path.join(skillsRoot, '01_Coding', 'openspec-explore');

  // Pick only the categorized one — flat must not sneak in.
  const mappings = await getMappings({
    scope: 'global',
    homeDir: home,
    clients: ['claude'],
    selectedSkills: [catDir],
  });
  const skillMappings = mappings.filter((m) => m.name === 'skills');
  expect(skillMappings.length).toBe(1);
  expect(skillMappings[0]!.source).toBe(catDir);
  expect(skillMappings[0]!.source).not.toBe(flatDir);
  // Client target still flat.
  expect(skillMappings[0]!.targets).toEqual([path.join(home, '.claude', 'skills', 'openspec-explore')]);
});
