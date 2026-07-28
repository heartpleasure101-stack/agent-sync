import { test, expect } from 'bun:test';
import {
  groupByCategory,
  initState,
  toggle,
  selectAllInTab,
  deselectAllInTab,
  flatten,
  totalSelected,
  UNCATEGORIZED_KEY,
  UNCATEGORIZED_LABEL,
} from '../src/ui/skill-picker-state.js';
import type { SkillEntry } from '../src/core/list-skills.js';

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

test('toggle: on then off is a noop over two calls', () => {
  const groups = groupByCategory([entry('a', 'X')]);
  let s = initState(groups);
  s = toggle(s, 'X', '/canonical/X/a');
  expect(s.get('X')!.has('/canonical/X/a')).toBe(true);
  s = toggle(s, 'X', '/canonical/X/a');
  expect(s.get('X')!.has('/canonical/X/a')).toBe(false);
});

test('selectAllInTab only affects the target tab', () => {
  const groups = groupByCategory([
    entry('a', 'X'),
    entry('b', 'X'),
    entry('c', 'Y'),
  ]);
  let s = initState(groups);
  s = toggle(s, 'Y', '/canonical/Y/c');
  const xGroup = groups.find((g) => g.key === 'X')!;
  s = selectAllInTab(s, xGroup);
  expect(s.get('X')!.size).toBe(2);
  expect(s.get('Y')!.size).toBe(1); // untouched
  expect(s.get('Y')!.has('/canonical/Y/c')).toBe(true);
});

test('deselectAllInTab only affects the target tab', () => {
  const groups = groupByCategory([
    entry('a', 'X'),
    entry('b', 'X'),
    entry('c', 'Y'),
  ]);
  let s = initState(groups);
  s = selectAllInTab(s, groups.find((g) => g.key === 'X')!);
  s = selectAllInTab(s, groups.find((g) => g.key === 'Y')!);
  s = deselectAllInTab(s, 'X');
  expect(s.get('X')!.size).toBe(0);
  expect(s.get('Y')!.size).toBe(1); // untouched
});

test('flatten: union across tabs, ordered by group then entry order, deduped', () => {
  const groups = groupByCategory([
    entry('a', 'X'),
    entry('b', 'X'),
    entry('c', 'Y'),
    entry('d', null),
  ]);
  let s = initState(groups);
  s = selectAllInTab(s, groups.find((g) => g.key === 'X')!);
  s = selectAllInTab(s, groups.find((g) => g.key === 'Y')!);
  s = toggle(s, UNCATEGORIZED_KEY, '/canonical/flat/d');
  const flat = flatten(s, groups);
  expect(flat).toEqual([
    '/canonical/X/a',
    '/canonical/X/b',
    '/canonical/Y/c',
    '/canonical/flat/d',
  ]);
});

test('totalSelected sums across tabs', () => {
  const groups = groupByCategory([entry('a', 'X'), entry('b', 'X'), entry('c', 'Y')]);
  let s = initState(groups);
  expect(totalSelected(s)).toBe(0);
  s = selectAllInTab(s, groups.find((g) => g.key === 'X')!);
  expect(totalSelected(s)).toBe(2);
  s = toggle(s, 'Y', '/canonical/Y/c');
  expect(totalSelected(s)).toBe(3);
});
