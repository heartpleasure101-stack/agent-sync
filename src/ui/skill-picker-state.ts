import type { SkillEntry } from '../core/list-skills.js';

export const UNCATEGORIZED_KEY = '__uncategorized__';
export const UNCATEGORIZED_LABEL = '(uncategorized)';

export type TabGroup = {
  key: string;
  label: string;
  entries: SkillEntry[];
};

export type PickerState = Map<string, Set<string>>;

export function groupByCategory(entries: SkillEntry[]): TabGroup[] {
  const byCategory = new Map<string, SkillEntry[]>();
  const uncategorized: SkillEntry[] = [];
  for (const e of entries) {
    if (e.category === null) {
      uncategorized.push(e);
      continue;
    }
    const list = byCategory.get(e.category) ?? [];
    list.push(e);
    byCategory.set(e.category, list);
  }
  const groups: TabGroup[] = [...byCategory.keys()]
    .sort()
    .map((cat) => ({ key: cat, label: cat, entries: byCategory.get(cat) ?? [] }));
  if (uncategorized.length > 0) {
    groups.push({ key: UNCATEGORIZED_KEY, label: UNCATEGORIZED_LABEL, entries: uncategorized });
  }
  return groups;
}

export function initState(groups: TabGroup[]): PickerState {
  const state: PickerState = new Map();
  for (const g of groups) state.set(g.key, new Set());
  return state;
}

function cloneWith(state: PickerState, key: string, next: Set<string>): PickerState {
  const copy: PickerState = new Map(state);
  copy.set(key, next);
  return copy;
}

export function toggle(state: PickerState, key: string, dir: string): PickerState {
  const current = state.get(key) ?? new Set<string>();
  const next = new Set(current);
  if (next.has(dir)) next.delete(dir); else next.add(dir);
  return cloneWith(state, key, next);
}

export function selectAllInTab(state: PickerState, group: TabGroup): PickerState {
  return cloneWith(state, group.key, new Set(group.entries.map((e) => e.dir)));
}

export function deselectAllInTab(state: PickerState, key: string): PickerState {
  return cloneWith(state, key, new Set());
}

export function flatten(state: PickerState, groups: TabGroup[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const g of groups) {
    const picks = state.get(g.key);
    if (!picks || picks.size === 0) continue;
    for (const e of g.entries) {
      if (picks.has(e.dir) && !seen.has(e.dir)) {
        seen.add(e.dir);
        result.push(e.dir);
      }
    }
  }
  return result;
}

export function totalSelected(state: PickerState): number {
  let sum = 0;
  for (const set of state.values()) sum += set.size;
  return sum;
}
