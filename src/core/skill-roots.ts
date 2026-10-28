import path from 'path';
import type { Client, Scope } from './types.js';
import type { ResolvedRoots } from './paths.js';

export type SkillRoot = {
  client: Client;
  /** The client's skills directory, e.g. ~/.claude/skills */
  root: string;
};

/**
 * Per-client skills directories.
 *
 * Shared by getMappings() (which writes links here) and scanInstalledSkills()
 * (which reads them back). Two copies of this derivation would drift, and a
 * drift means the scanner reports "not installed" for something the installer
 * put somewhere else — the checkbox would silently disagree with the disk.
 *
 * Two clients do not follow the plain `<root>/skills` shape:
 *   - opencode keeps global config separate from project config
 *   - github uses ~/.copilot/skills globally but .github/skills per project
 */
export function getSkillRoots(roots: ResolvedRoots, clients: Iterable<Client>, scope: Scope): SkillRoot[] {
  const set = new Set<Client>(clients);
  const opencodeSkillsRoot = scope === 'global' ? roots.opencodeConfigRoot : roots.opencodeRoot;

  const candidates: Array<[Client, string]> = [
    ['claude', path.join(roots.claudeRoot, 'skills')],
    ['factory', path.join(roots.factoryRoot, 'skills')],
    ['codex', path.join(roots.codexRoot, 'skills')],
    ['opencode', path.join(opencodeSkillsRoot, 'skills')],
    ['cursor', path.join(roots.cursorRoot, 'skills')],
    ['gemini', path.join(roots.geminiRoot, 'skills')],
    ['antigravity', path.join(roots.antigravityRoot, 'skills')],
    ['pi', path.join(roots.piRoot, 'skills')],
    ['github', scope === 'global' ? path.join(roots.copilotRoot, 'skills') : path.join(roots.githubRoot, 'skills')],
  ];

  return candidates.filter(([client]) => set.has(client)).map(([client, root]) => ({ client, root }));
}
