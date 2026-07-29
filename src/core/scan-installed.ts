import fs from 'fs';
import path from 'path';
import type { Client, Scope } from './types.js';
import { resolveRoots } from './paths.js';
import { listSkills } from './list-skills.js';
import { getSkillRoots } from './skill-roots.js';
import { resolveSymlinkTo } from './symlink.js';

export type ScanInstalledOptions = {
  scope: Scope;
  clients: Client[];
  projectRoot?: string;
  homeDir?: string;
  canonicalOverride?: string;
};

/**
 * Read the client side back: which canonical skill dirs are currently linked
 * into which clients.
 *
 * This is the only path in the codebase that reads installation state off disk.
 * Everything else flows canonical -> client, which is why the picker used to
 * open with every box empty regardless of what was actually installed.
 *
 * Matching is done on the resolved symlink target, never on basename. Two
 * skills in different categories can share a basename (01_Coding/foo and
 * 03_Medie/foo both land on <clientRoot>/skills/foo), so a basename match would
 * mark both as installed when only one of them actually is.
 */
export async function scanInstalledSkills(opts: ScanInstalledOptions): Promise<Map<string, Set<Client>>> {
  const installed = new Map<string, Set<Client>>();
  if (opts.clients.length === 0) return installed;

  const entries = await listSkills({
    scope: opts.scope,
    projectRoot: opts.projectRoot,
    homeDir: opts.homeDir,
    canonicalOverride: opts.canonicalOverride,
  });
  if (entries.length === 0) return installed;

  // Resolved canonical dir -> the entry.dir we report back to callers.
  const canonicalByResolved = new Map<string, string>();
  for (const entry of entries) canonicalByResolved.set(path.resolve(entry.dir), entry.dir);

  const roots = resolveRoots({
    scope: opts.scope,
    projectRoot: opts.projectRoot,
    homeDir: opts.homeDir,
    canonicalOverride: opts.canonicalOverride,
  });

  for (const { client, root } of getSkillRoots(roots, opts.clients, opts.scope)) {
    let names: string[];
    try {
      names = await fs.promises.readdir(root);
    } catch {
      // Client has never had skills installed (or the whole client dir is
      // absent). Not an error — it simply has nothing installed.
      continue;
    }

    for (const name of names) {
      const resolved = await resolveSymlinkTo(path.join(root, name));
      if (!resolved) continue; // real directory, or not a symlink at all
      const canonicalDir = canonicalByResolved.get(path.resolve(resolved));
      if (!canonicalDir) continue; // symlink points somewhere we don't manage
      let set = installed.get(canonicalDir);
      if (!set) {
        set = new Set<Client>();
        installed.set(canonicalDir, set);
      }
      set.add(client);
    }
  }

  return installed;
}
