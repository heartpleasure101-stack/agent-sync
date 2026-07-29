import type { SkillEntry } from '../core/list-skills.js';
import type { Client } from '../core/types.js';

export const UNCATEGORIZED_KEY = '__uncategorized__';
export const UNCATEGORIZED_LABEL = '(uncategorized)';

export type TabGroup = {
  key: string;
  label: string;
  entries: SkillEntry[];
};

/**
 * How much of the *current* client selection has this skill installed.
 * 'partial' is only reachable when more than one client is selected.
 */
export type Tri = 'none' | 'partial' | 'all';

export type RowState = {
  /** What the disk said when the picker opened. */
  original: Tri;
  /** What the user wants once they hit Enter. */
  desired: Tri;
};

/** tab key -> skill dir -> row state */
export type PickerState = Map<string, Map<string, RowState>>;

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

/**
 * Derive the initial tri-state per row from what is actually on disk.
 *
 * The frame of reference is the clients selected in this session, not every
 * client that exists. Clients outside the selection are reported separately
 * (see outOfScopeClients) and are never touched by the picker — that is what
 * makes it impossible to delete an installation the user did not opt into.
 */
export function initState(
  groups: TabGroup[],
  installed: Map<string, Set<Client>>,
  clients: Client[],
): PickerState {
  const state: PickerState = new Map();
  for (const g of groups) {
    const rows = new Map<string, RowState>();
    for (const e of g.entries) {
      const tri = triFor(installed.get(e.dir), clients);
      rows.set(e.dir, { original: tri, desired: tri });
    }
    state.set(g.key, rows);
  }
  return state;
}

function triFor(installedOn: Set<Client> | undefined, clients: Client[]): Tri {
  if (clients.length === 0) return 'none';
  if (!installedOn || installedOn.size === 0) return 'none';
  let hits = 0;
  for (const c of clients) if (installedOn.has(c)) hits += 1;
  if (hits === 0) return 'none';
  return hits === clients.length ? 'all' : 'partial';
}

/** Clients that have this skill installed but are not in the current selection. */
export function outOfScopeClients(
  installed: Map<string, Set<Client>>,
  dir: string,
  clients: Client[],
): Client[] {
  const installedOn = installed.get(dir);
  if (!installedOn || installedOn.size === 0) return [];
  const inScope = new Set(clients);
  return [...installedOn].filter((c) => !inScope.has(c));
}

function cloneWith(state: PickerState, key: string, next: Map<string, RowState>): PickerState {
  const copy: PickerState = new Map(state);
  copy.set(key, next);
  return copy;
}

function setRow(state: PickerState, key: string, dir: string, next: RowState): PickerState {
  const rows = state.get(key);
  if (!rows) return state;
  const copy = new Map(rows);
  copy.set(dir, next);
  return cloneWith(state, key, copy);
}

/**
 * Rows that started 'partial' cycle through three states so the user can get
 * back to "leave it alone". Rows that started all-or-nothing have no partial
 * state to preserve, so they stay binary.
 */
export function toggle(state: PickerState, key: string, dir: string): PickerState {
  const row = state.get(key)?.get(dir);
  if (!row) return state;

  let desired: Tri;
  if (row.original === 'partial') {
    desired = row.desired === 'partial' ? 'all' : row.desired === 'all' ? 'none' : 'partial';
  } else {
    desired = row.desired === 'all' ? 'none' : 'all';
  }
  return setRow(state, key, dir, { ...row, desired });
}

export function selectAllInTab(state: PickerState, group: TabGroup): PickerState {
  const rows = state.get(group.key);
  if (!rows) return state;
  const copy = new Map<string, RowState>();
  for (const [dir, row] of rows) copy.set(dir, { ...row, desired: 'all' });
  return cloneWith(state, group.key, copy);
}

/**
 * Restore the tab to what was on disk.
 *
 * This replaces the old "deselect all". Under expected-state semantics,
 * clearing every box means "uninstall everything in this tab" — too destructive
 * for a single unconfirmed keypress. Reset matches what a user pressing `d`
 * after some misclicks actually wants.
 */
export function resetTab(state: PickerState, key: string): PickerState {
  const rows = state.get(key);
  if (!rows) return state;
  const copy = new Map<string, RowState>();
  for (const [dir, row] of rows) copy.set(dir, { ...row, desired: row.original });
  return cloneWith(state, key, copy);
}

export type SkillDiff = {
  toInstall: string[];
  toRemove: string[];
};

/**
 * Only rows whose desired state moved away from the original produce work.
 * A row left at 'partial' is explicitly "keep as is" and yields nothing.
 */
export function diff(state: PickerState, groups: TabGroup[]): SkillDiff {
  const toInstall: string[] = [];
  const toRemove: string[] = [];
  const seenInstall = new Set<string>();
  const seenRemove = new Set<string>();

  for (const g of groups) {
    const rows = state.get(g.key);
    if (!rows) continue;
    for (const e of g.entries) {
      const row = rows.get(e.dir);
      if (!row || row.desired === row.original) continue;
      if (row.desired === 'all' && !seenInstall.has(e.dir)) {
        seenInstall.add(e.dir);
        toInstall.push(e.dir);
      } else if (row.desired === 'none' && !seenRemove.has(e.dir)) {
        seenRemove.add(e.dir);
        toRemove.push(e.dir);
      }
    }
  }
  return { toInstall, toRemove };
}

export function pendingCounts(state: PickerState, groups: TabGroup[]): { install: number; remove: number } {
  const d = diff(state, groups);
  return { install: d.toInstall.length, remove: d.toRemove.length };
}

/** Marker shown at the end of a row: '+' will install, '-' will remove. */
export function rowMarker(row: RowState | undefined): '+' | '-' | null {
  if (!row || row.desired === row.original) return null;
  if (row.desired === 'all') return '+';
  if (row.desired === 'none') return '-';
  return null;
}

/** Count of rows in a tab whose desired state is 'all', for the tab badge. */
export function tabSelectedCount(state: PickerState, key: string): number {
  const rows = state.get(key);
  if (!rows) return 0;
  let n = 0;
  for (const row of rows.values()) if (row.desired === 'all') n += 1;
  return n;
}
