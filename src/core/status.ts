import fs from 'fs';
import path from 'path';
import { getMappings } from './mappings.js';
import type { MappingOptions } from './mappings.js';
import type { Client, LinkStatus } from './types.js';
import { pathExists } from '../utils/fs.js';
import { detectInstalledClients } from './detect-installed.js';
import { scanInstalledSkills } from './scan-installed.js';

const ALL_CLIENTS: Client[] = [
  'claude', 'factory', 'codex', 'cursor', 'opencode', 'gemini', 'github', 'ampcode', 'antigravity',
];

/**
 * Widen the options to every detected client, and to every skill that is
 * actually installed somewhere.
 *
 * Restricting to installed skills keeps the report readable: asking for all
 * skills across all clients would emit a 'missing' row for every combination
 * that was never installed, burying the ones that matter.
 */
async function withAllSkills(opts: LinkStatusOptions): Promise<MappingOptions> {
  let clients: Client[];
  try {
    clients = await detectInstalledClients({ homeDir: opts.homeDir });
  } catch {
    clients = [];
  }
  if (clients.length === 0) clients = ALL_CLIENTS;

  const { installed } = await scanInstalledSkills({
    scope: opts.scope,
    clients,
    projectRoot: opts.projectRoot,
    homeDir: opts.homeDir,
    canonicalOverride: opts.canonicalOverride,
  });

  return { ...opts, clients, selectedSkills: [...installed.keys()], removeSkills: null };
}

async function resolveLinkTarget(targetPath: string): Promise<string | null> {
  try {
    const link = await fs.promises.readlink(targetPath);
    if (!path.isAbsolute(link)) return path.resolve(path.dirname(targetPath), link);
    return link;
  } catch {
    return null;
  }
}

export type LinkStatusOptions = MappingOptions & {
  /**
   * Report every skill installed on every detected client, not just the ones
   * matching this session's clients/selectedSkills. Without it, a user who
   * installed to claude yesterday and gemini today sees only today's half.
   */
  scanAll?: boolean;
};

export async function getLinkStatus(opts: LinkStatusOptions): Promise<LinkStatus[]> {
  const mappings = await getMappings(opts.scanAll ? await withAllSkills(opts) : opts);
  const statuses: LinkStatus[] = [];

  for (const mapping of mappings) {
    const targets = [] as LinkStatus['targets'];
    for (const target of mapping.targets) {
      const exists = await pathExists(target);
      if (!exists) {
        targets.push({ path: target, status: 'missing' });
        continue;
      }
      const stat = await fs.promises.lstat(target);
      if (stat.isSymbolicLink()) {
        const resolved = await resolveLinkTarget(target);
        if (resolved && path.resolve(resolved) === path.resolve(mapping.source)) {
          targets.push({ path: target, status: 'linked' });
        } else {
          targets.push({ path: target, status: 'conflict' });
        }
        continue;
      }
      targets.push({ path: target, status: 'conflict' });
    }

    statuses.push({ name: mapping.name, source: mapping.source, targets });
  }

  return statuses;
}
