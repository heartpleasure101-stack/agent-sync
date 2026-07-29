import { test, expect } from 'bun:test';
import {
  groupByCategory,
  initState,
  toggle,
  selectAllInTab,
  resetTab,
  diff,
  pendingCounts,
  rowMarker,
  outOfScopeClients,
  tabSelectedCount,
  UNCATEGORIZED_KEY,
  UNCATEGORIZED_LABEL,
} from '../src/ui/skill-picker-state.js';
import type { SkillEntry } from '../src/core/list-skills.js';
import type { Client } from '../src/core/types.js';

function entry(name: string, category: string | null, dir?: string): SkillEntry {
  const d = dir ?? `/canonical/${category ?? 'flat'}/${name}`;
  return {
    name,
    category,
    dir: d,
    displayName: category ? `${category}/${name}` : name,
    hasCollision: false,
  };
}

function installedMap(pairs: Array<[string, Client[]]>): Map<string, Set<Client>> {
  return new Map(pairs.map(([dir, clients]) => [dir, new Set(clients)]));
}

// --- groupByCategory (unchanged behaviour, kept from the previous suite) ---

test('groupByCategory: pure flat entries → single uncategorized tab', () => {
  const groups = groupByCategory([entry('alpha', null), entry('beta', null)]);
  expect(groups.length).toBe(1);
  expect(groups[0]!.key).toBe(UNCATEGORIZED_KEY);
  expect(groups[0]!.label).toBe(UNCATEGORIZED_LABEL);
  expect(groups[0]!.entries.map((e) => e.name)).toEqual(['alpha', 'beta']);
});

test('groupByCategory: pure categorized → sorted category tabs, no uncategorized', () => {
  const groups = groupByCategory([
    entry('audio-to-srt', '03_Medie'),
    entry('openspec-propose', '01_Coding'),
    entry('proposal-writer', '02_WordProcessing'),
  ]);
  expect(groups.map((g) => g.key)).toEqual(['01_Coding', '02_WordProcessing', '03_Medie']);
  expect(groups.find((g) => g.key === UNCATEGORIZED_KEY)).toBeUndefined();
});

test('groupByCategory: mixed → categories first (asc), uncategorized last', () => {
  const groups = groupByCategory([
    entry('git-branch-name', null),
    entry('openspec-propose', '01_Coding'),
    entry('audio-to-srt', '03_Medie'),
    entry('git-smart-commit', null),
  ]);
  expect(groups.map((g) => g.key)).toEqual(['01_Coding', '03_Medie', UNCATEGORIZED_KEY]);
  const last = groups[groups.length - 1]!;
  expect(last.entries.map((e) => e.name).sort()).toEqual(['git-branch-name', 'git-smart-commit']);
});

// --- initState tri-state derivation ---

test('initState: installed on every selected client → all', () => {
  const groups = groupByCategory([entry('a', 'X')]);
  const s = initState(groups, installedMap([['/canonical/X/a', ['claude', 'gemini']]]), ['claude', 'gemini']);
  expect(s.get('X')!.get('/canonical/X/a')).toEqual({ original: 'all', desired: 'all' });
});

test('initState: installed on some selected clients → partial', () => {
  const groups = groupByCategory([entry('a', 'X')]);
  const s = initState(groups, installedMap([['/canonical/X/a', ['claude']]]), ['claude', 'gemini']);
  expect(s.get('X')!.get('/canonical/X/a')).toEqual({ original: 'partial', desired: 'partial' });
});

test('initState: installed on no selected client → none', () => {
  const groups = groupByCategory([entry('a', 'X')]);
  const s = initState(groups, new Map(), ['claude']);
  expect(s.get('X')!.get('/canonical/X/a')).toEqual({ original: 'none', desired: 'none' });
});

test('initState: out-of-scope client does not affect derivation', () => {
  const groups = groupByCategory([entry('a', 'X')]);
  // Installed only on claude, but this session selected gemini.
  const s = initState(groups, installedMap([['/canonical/X/a', ['claude']]]), ['gemini']);
  expect(s.get('X')!.get('/canonical/X/a')!.original).toBe('none');
});

test('outOfScopeClients reports installs outside the current selection', () => {
  const installed = installedMap([['/canonical/X/a', ['claude', 'gemini']]]);
  expect(outOfScopeClients(installed, '/canonical/X/a', ['gemini'])).toEqual(['claude']);
  expect(outOfScopeClients(installed, '/canonical/X/a', ['claude', 'gemini'])).toEqual([]);
  expect(outOfScopeClients(installed, '/canonical/X/missing', ['claude'])).toEqual([]);
});

// --- toggle ---

test('toggle: row starting none is binary', () => {
  const groups = groupByCategory([entry('a', 'X')]);
  let s = initState(groups, new Map(), ['claude']);
  s = toggle(s, 'X', '/canonical/X/a');
  expect(s.get('X')!.get('/canonical/X/a')!.desired).toBe('all');
  s = toggle(s, 'X', '/canonical/X/a');
  expect(s.get('X')!.get('/canonical/X/a')!.desired).toBe('none');
});

test('toggle: row starting all is binary', () => {
  const groups = groupByCategory([entry('a', 'X')]);
  let s = initState(groups, installedMap([['/canonical/X/a', ['claude']]]), ['claude']);
  s = toggle(s, 'X', '/canonical/X/a');
  expect(s.get('X')!.get('/canonical/X/a')!.desired).toBe('none');
  s = toggle(s, 'X', '/canonical/X/a');
  expect(s.get('X')!.get('/canonical/X/a')!.desired).toBe('all');
});

test('toggle: row starting partial cycles partial → all → none → partial', () => {
  const groups = groupByCategory([entry('a', 'X')]);
  const dir = '/canonical/X/a';
  let s = initState(groups, installedMap([[dir, ['claude']]]), ['claude', 'gemini']);
  expect(s.get('X')!.get(dir)!.desired).toBe('partial');
  s = toggle(s, 'X', dir);
  expect(s.get('X')!.get(dir)!.desired).toBe('all');
  s = toggle(s, 'X', dir);
  expect(s.get('X')!.get(dir)!.desired).toBe('none');
  s = toggle(s, 'X', dir);
  expect(s.get('X')!.get(dir)!.desired).toBe('partial');
});

// --- selectAllInTab / resetTab ---

test('selectAllInTab only affects the target tab', () => {
  const groups = groupByCategory([entry('a', 'X'), entry('b', 'X'), entry('c', 'Y')]);
  let s = initState(groups, new Map(), ['claude']);
  s = selectAllInTab(s, groups.find((g) => g.key === 'X')!);
  expect(tabSelectedCount(s, 'X')).toBe(2);
  expect(tabSelectedCount(s, 'Y')).toBe(0);
});

test('resetTab restores originals and only affects the target tab', () => {
  const groups = groupByCategory([entry('a', 'X'), entry('b', 'X'), entry('c', 'Y')]);
  const installed = installedMap([['/canonical/X/a', ['claude']]]);
  let s = initState(groups, installed, ['claude']);
  s = selectAllInTab(s, groups.find((g) => g.key === 'X')!);
  s = selectAllInTab(s, groups.find((g) => g.key === 'Y')!);

  s = resetTab(s, 'X');
  expect(s.get('X')!.get('/canonical/X/a')!.desired).toBe('all'); // was installed
  expect(s.get('X')!.get('/canonical/X/b')!.desired).toBe('none'); // was not
  expect(s.get('Y')!.get('/canonical/Y/c')!.desired).toBe('all'); // untouched
});

test('resetTab is not uninstall-all', () => {
  const groups = groupByCategory([entry('a', 'X')]);
  const installed = installedMap([['/canonical/X/a', ['claude']]]);
  const s = resetTab(initState(groups, installed, ['claude']), 'X');
  expect(diff(s, groups)).toEqual({ toInstall: [], toRemove: [] });
});

// --- diff ---

test('diff: newly checked rows install, unchecked rows remove', () => {
  const groups = groupByCategory([entry('a', 'X'), entry('b', 'X')]);
  const installed = installedMap([['/canonical/X/b', ['claude']]]);
  let s = initState(groups, installed, ['claude']);
  s = toggle(s, 'X', '/canonical/X/a'); // none -> all
  s = toggle(s, 'X', '/canonical/X/b'); // all -> none
  expect(diff(s, groups)).toEqual({
    toInstall: ['/canonical/X/a'],
    toRemove: ['/canonical/X/b'],
  });
});

test('diff: a row left at partial produces no action', () => {
  const groups = groupByCategory([entry('a', 'X')]);
  const installed = installedMap([['/canonical/X/a', ['claude']]]);
  const s = initState(groups, installed, ['claude', 'gemini']);
  expect(diff(s, groups)).toEqual({ toInstall: [], toRemove: [] });
});

test('diff: partial cycled back to partial produces no action', () => {
  const groups = groupByCategory([entry('a', 'X')]);
  const dir = '/canonical/X/a';
  const installed = installedMap([[dir, ['claude']]]);
  let s = initState(groups, installed, ['claude', 'gemini']);
  s = toggle(s, 'X', dir);
  s = toggle(s, 'X', dir);
  s = toggle(s, 'X', dir);
  expect(diff(s, groups)).toEqual({ toInstall: [], toRemove: [] });
});

test('diff: partial forced to all installs, partial forced to none removes', () => {
  const groups = groupByCategory([entry('a', 'X'), entry('b', 'X')]);
  const installed = installedMap([
    ['/canonical/X/a', ['claude']],
    ['/canonical/X/b', ['claude']],
  ]);
  let s = initState(groups, installed, ['claude', 'gemini']);
  s = toggle(s, 'X', '/canonical/X/a'); // partial -> all
  s = toggle(s, 'X', '/canonical/X/b'); // partial -> all
  s = toggle(s, 'X', '/canonical/X/b'); // all -> none
  expect(diff(s, groups)).toEqual({
    toInstall: ['/canonical/X/a'],
    toRemove: ['/canonical/X/b'],
  });
});

test('diff: ordering follows group order then entry order', () => {
  const groups = groupByCategory([entry('a', 'X'), entry('b', 'X'), entry('c', 'Y'), entry('d', null)]);
  let s = initState(groups, new Map(), ['claude']);
  s = selectAllInTab(s, groups.find((g) => g.key === 'X')!);
  s = selectAllInTab(s, groups.find((g) => g.key === 'Y')!);
  s = toggle(s, UNCATEGORIZED_KEY, '/canonical/flat/d');
  expect(diff(s, groups).toInstall).toEqual([
    '/canonical/X/a',
    '/canonical/X/b',
    '/canonical/Y/c',
    '/canonical/flat/d',
  ]);
});

test('diff: no changes yields two empty lists', () => {
  const groups = groupByCategory([entry('a', 'X')]);
  const s = initState(groups, new Map(), ['claude']);
  expect(diff(s, groups)).toEqual({ toInstall: [], toRemove: [] });
});

// --- pendingCounts / rowMarker ---

test('pendingCounts reports install and remove separately', () => {
  const groups = groupByCategory([entry('a', 'X'), entry('b', 'X')]);
  const installed = installedMap([['/canonical/X/b', ['claude']]]);
  let s = initState(groups, installed, ['claude']);
  expect(pendingCounts(s, groups)).toEqual({ install: 0, remove: 0 });
  s = toggle(s, 'X', '/canonical/X/a');
  s = toggle(s, 'X', '/canonical/X/b');
  expect(pendingCounts(s, groups)).toEqual({ install: 1, remove: 1 });
});

test('rowMarker reflects pending direction', () => {
  expect(rowMarker({ original: 'none', desired: 'all' })).toBe('+');
  expect(rowMarker({ original: 'all', desired: 'none' })).toBe('-');
  expect(rowMarker({ original: 'partial', desired: 'partial' })).toBe(null);
  expect(rowMarker({ original: 'all', desired: 'all' })).toBe(null);
  expect(rowMarker(undefined)).toBe(null);
});
