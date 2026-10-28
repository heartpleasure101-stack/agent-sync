import type { Client } from './types.js';
import { resolveRoots } from './paths.js';
import { pathExists } from '../utils/fs.js';

export const CLIENT_ORDER: readonly Client[] = [
  'claude',
  'factory',
  'codex',
  'cursor',
  'opencode',
  'gemini',
  'antigravity',
  'github',
  'ampcode',
  'pi',
] as const;

export type DetectInstalledOptions = {
  homeDir?: string;
};

export function getGlobalClientRoots(homeDir?: string): Record<Client, string> {
  const roots = resolveRoots({ scope: 'global', homeDir });
  return {
    claude: roots.claudeRoot,
    factory: roots.factoryRoot,
    codex: roots.codexRoot,
    cursor: roots.cursorRoot,
    opencode: roots.opencodeConfigRoot,
    gemini: roots.geminiRoot,
    antigravity: roots.antigravityRoot,
    github: roots.copilotRoot,
    ampcode: roots.ampcodeConfigRoot,
    pi: roots.piRoot,
  };
}

export async function detectInstalledClients(
  opts: DetectInstalledOptions = {},
): Promise<Client[]> {
  const rootForClient = getGlobalClientRoots(opts.homeDir);
  const checks = await Promise.all(
    CLIENT_ORDER.map(async (client) => ({
      client,
      exists: await pathExists(rootForClient[client]),
    })),
  );
  return checks.filter((c) => c.exists).map((c) => c.client);
}
