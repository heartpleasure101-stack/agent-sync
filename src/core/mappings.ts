import path from 'path';
import type { Client, Mapping, Scope } from './types.js';
import { resolveRoots, type RootOptions } from './paths.js';
import { pathExists } from '../utils/fs.js';
import { listSkills } from './list-skills.js';
import { getSkillRoots } from './skill-roots.js';

export type MappingOptions = RootOptions & {
  clients?: Client[];
  selectedSkills?: string[] | null;
  /** Skill dirs the user wants gone from the selected clients. */
  removeSkills?: string[] | null;
};

/**
 * Targets to unlink for each skill the user deselected.
 *
 * Deliberately separate from getMappings(): a mapping means "this should exist
 * and be linked", and buildLinkPlan() runs ensureSourceTask() over every one of
 * them. Feeding removals through the same list would create the canonical
 * source directory for a skill we are in the middle of removing.
 */
export async function getRemovalMappings(opts: MappingOptions): Promise<Mapping[]> {
  const removals = opts.removeSkills;
  if (!removals || removals.length === 0) return [];

  const roots = resolveRoots(opts);
  const clients = new Set<Client>(opts.clients ?? []);
  const skillTargetRoots = getSkillRoots(roots, clients, opts.scope).map((r) => r.root);
  if (skillTargetRoots.length === 0) return [];

  const wanted = new Set(removals);
  const entries = await listSkills({
    scope: opts.scope,
    projectRoot: opts.projectRoot,
    homeDir: opts.homeDir,
    canonicalOverride: opts.canonicalOverride,
  });

  const mappings: Mapping[] = [];
  for (const entry of entries) {
    if (!wanted.has(entry.dir)) continue;
    const basename = path.basename(entry.dir);
    mappings.push({
      name: 'skills',
      source: entry.dir,
      targets: skillTargetRoots.map((root) => path.join(root, basename)),
      kind: 'dir',
    });
  }
  return mappings;
}

export async function getMappings(opts: MappingOptions): Promise<Mapping[]> {
  const roots = resolveRoots(opts);
  const canonical = roots.canonicalRoot;
  const claudeOverride = path.join(canonical, 'CLAUDE.md');
  const geminiOverride = path.join(canonical, 'GEMINI.md');
  const agentsFallback = path.join(canonical, 'AGENTS.md');
  const claudeSource = await pathExists(claudeOverride) ? claudeOverride : agentsFallback;
  const geminiSource = await pathExists(geminiOverride) ? geminiOverride : agentsFallback;
  const clients = new Set<Client>(opts.clients ?? ['claude', 'factory', 'codex', 'cursor', 'opencode', 'gemini', 'github', 'ampcode', 'antigravity', 'pi']);

  const mappings: Mapping[] = [];
  const includeAgentFiles = opts.scope === 'global';
  if (includeAgentFiles && clients.has('claude')) {
    mappings.push({
      name: 'claude-md',
      source: claudeSource,
      targets: [path.join(roots.claudeRoot, 'CLAUDE.md')],
      kind: 'file',
    });
  }

  if (includeAgentFiles && clients.has('gemini')) {
    mappings.push({
      name: 'gemini-md',
      source: geminiSource,
      targets: [path.join(roots.geminiRoot, 'GEMINI.md')],
      kind: 'file',
    });
  }

  if (includeAgentFiles) {
    const agentTargets = [
      clients.has('factory') ? path.join(roots.factoryRoot, 'AGENTS.md') : null,
      clients.has('codex') ? path.join(roots.codexRoot, 'AGENTS.md') : null,
      clients.has('opencode') ? path.join(roots.opencodeConfigRoot, 'AGENTS.md') : null,
      clients.has('ampcode') ? path.join(roots.ampcodeConfigRoot, 'AGENTS.md') : null,
      clients.has('pi') ? path.join(roots.piRoot, 'AGENTS.md') : null,
    ].filter(Boolean) as string[];

    if (agentTargets.length > 0) {
      mappings.push({
        name: 'agents-md',
        source: agentsFallback,
        targets: agentTargets,
        kind: 'file',
      });
    }
  }

  mappings.push(
    {
      name: 'commands',
      source: path.join(canonical, 'commands'),
      targets: [
        clients.has('claude') ? path.join(roots.claudeRoot, 'commands') : null,
        clients.has('factory') ? path.join(roots.factoryRoot, 'commands') : null,
        clients.has('codex') ? path.join(roots.codexRoot, 'prompts') : null,
        clients.has('opencode') ? path.join(roots.opencodeRoot, 'commands') : null,
        clients.has('cursor') ? path.join(roots.cursorRoot, 'commands') : null,
        clients.has('gemini') ? path.join(roots.geminiRoot, 'commands') : null,
        clients.has('antigravity') ? path.join(roots.antigravityRoot, 'workflows') : null,
      ].filter(Boolean) as string[],
      kind: 'dir',
    },
    {
      name: 'hooks',
      source: path.join(canonical, 'hooks'),
      targets: [
        clients.has('claude') ? path.join(roots.claudeRoot, 'hooks') : null,
        clients.has('factory') ? path.join(roots.factoryRoot, 'hooks') : null,
      ].filter(Boolean) as string[],
      kind: 'dir',
    },
  );

  // Shared with scanInstalledSkills() so the write side and the read-back side
  // cannot disagree about where a client's skills live.
  const skillTargetRoots: string[] = getSkillRoots(roots, clients, opts.scope).map((r) => r.root);

  if (opts.selectedSkills === undefined || opts.selectedSkills === null) {
    mappings.push({
      name: 'skills',
      source: path.join(canonical, 'skills'),
      targets: skillTargetRoots,
      kind: 'dir',
    });
  } else if (opts.selectedSkills.length > 0 && skillTargetRoots.length > 0) {
    // selectedSkills = list of absolute skill dir paths (unique identity — basenames may collide).
    const wanted = new Set(opts.selectedSkills);
    const entries = await listSkills({
      scope: opts.scope,
      projectRoot: opts.projectRoot,
      homeDir: opts.homeDir,
      canonicalOverride: opts.canonicalOverride,
    });
    for (const entry of entries) {
      if (!wanted.has(entry.dir)) continue;
      const basename = path.basename(entry.dir);
      mappings.push({
        name: 'skills',
        source: entry.dir,
        targets: skillTargetRoots.map((root) => path.join(root, basename)),
        kind: 'dir',
      });
    }
  }

  return mappings;
}
