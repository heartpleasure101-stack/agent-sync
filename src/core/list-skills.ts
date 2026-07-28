import path from 'path';
import type { Scope } from './types.js';
import { resolveRoots } from './paths.js';
import { listDirs, pathExists } from '../utils/fs.js';
import { isSkillDir } from './skills.js';

export type SkillEntry = {
  name: string;
  category: string | null;
  dir: string;
  displayName: string;
  hasCollision: boolean;
};

export type ListSkillsOptions = {
  scope?: Scope;
  projectRoot?: string;
  homeDir?: string;
  canonicalOverride?: string;
};

export async function listSkills(opts: ListSkillsOptions = {}): Promise<SkillEntry[]> {
  const scope: Scope = opts.scope ?? 'global';
  const roots = resolveRoots({ scope, projectRoot: opts.projectRoot, homeDir: opts.homeDir, canonicalOverride: opts.canonicalOverride });
  const skillsRoot = path.join(roots.canonicalRoot, 'skills');
  if (!(await pathExists(skillsRoot))) return [];

  const firstLevel = await listDirs(skillsRoot);
  const collected: Omit<SkillEntry, 'displayName' | 'hasCollision'>[] = [];

  for (const dir of firstLevel) {
    const base = path.basename(dir);
    if (await isSkillDir(dir)) {
      collected.push({ name: base, category: null, dir });
      continue;
    }
    const children = await listDirs(dir);
    for (const child of children) {
      if (!(await isSkillDir(child))) continue;
      collected.push({ name: path.basename(child), category: base, dir: child });
    }
  }

  const counts = new Map<string, number>();
  for (const c of collected) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);

  return collected.map((c) => {
    const hasCollision = (counts.get(c.name) ?? 0) > 1;
    const displayName = c.category ? `${c.category}/${c.name}` : c.name;
    return { ...c, displayName, hasCollision };
  });
}
