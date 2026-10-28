import fs from 'fs';
import path from 'path';
import { test, expect } from 'bun:test';
import { detectInstalledClients, CLIENT_ORDER, getGlobalClientRoots } from '../src/core/detect-installed.js';
import type { Client } from '../src/core/types.js';
import { makeTempDir } from './helpers.js';

async function mkdirs(home: string, subs: string[]): Promise<void> {
  for (const sub of subs) {
    await fs.promises.mkdir(path.join(home, sub), { recursive: true });
  }
}

test('returns only clients whose global config root exists', async () => {
  const home = await makeTempDir('detect-installed-subset-');
  await mkdirs(home, ['.claude', '.gemini']);

  const result = await detectInstalledClients({ homeDir: home });
  expect(result).toEqual(['claude', 'gemini']);
});

test('returns empty array when no client roots exist', async () => {
  const home = await makeTempDir('detect-installed-empty-');

  const result = await detectInstalledClients({ homeDir: home });
  expect(result).toEqual([]);
});

test('preserves canonical order when all roots exist', async () => {
  const home = await makeTempDir('detect-installed-all-');
  await mkdirs(home, [
    '.claude',
    '.factory',
    '.codex',
    '.cursor',
    '.config/opencode',
    '.gemini',
    '.gemini/antigravity',
    '.copilot',
    '.config/amp',
    '.pi/agent',
  ]);

  const result = await detectInstalledClients({ homeDir: home });
  expect(result).toEqual([
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
  ]);
});

test('github is detected via ~/.copilot, not project .github', async () => {
  const home = await makeTempDir('detect-installed-github-');
  await mkdirs(home, ['.copilot']);

  const result = await detectInstalledClients({ homeDir: home });
  expect(result).toEqual(['github']);
});

test('pi is detected via ~/.pi/agent', async () => {
  const home = await makeTempDir('detect-installed-pi-');
  await mkdirs(home, ['.pi/agent']);

  const result = await detectInstalledClients({ homeDir: home });
  expect(result).toEqual(['pi']);
});

test('pi is not detected when only ~/.pi exists', async () => {
  const home = await makeTempDir('detect-installed-pi-parent-');
  await mkdirs(home, ['.pi']);

  const result = await detectInstalledClients({ homeDir: home });
  expect(result).toEqual([]);
});

test('CLIENT_ORDER covers every client that has a global root', () => {
  const rootKeys = (Object.keys(getGlobalClientRoots('/Users/x')) as Client[]).sort();
  expect([...CLIENT_ORDER].sort()).toEqual(rootKeys);
});
