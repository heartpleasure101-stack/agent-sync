import React, { useState } from 'react';
import { Box, Text, render, useApp, useInput } from 'ink';
import type { SkillEntry } from '../core/list-skills.js';
import type { Client } from '../core/types.js';
import {
  diff,
  groupByCategory,
  initState,
  outOfScopeClients,
  pendingCounts,
  resetTab,
  rowMarker,
  selectAllInTab,
  tabSelectedCount,
  toggle,
  type PickerState,
  type SkillDiff,
  type TabGroup,
  type Tri,
} from './skill-picker-state.js';

/** How many out-of-scope client names to spell out before collapsing to a count. */
const MAX_SHOWN_CLIENTS = 2;

type Props = {
  groups: TabGroup[];
  installed: Map<string, Set<Client>>;
  clients: Client[];
  onSubmit: (result: SkillDiff) => void;
  onCancel: (reason: 'cancel' | 'back') => void;
};

function boxFor(desired: Tri): string {
  if (desired === 'all') return '[x]';
  if (desired === 'partial') return '[~]';
  return '[ ]';
}

function formatOutOfScope(clients: Client[]): string {
  if (clients.length === 0) return '';
  if (clients.length <= MAX_SHOWN_CLIENTS) return `(${clients.join(', ')})`;
  const shown = clients.slice(0, MAX_SHOWN_CLIENTS).join(', ');
  return `(${shown} +${clients.length - MAX_SHOWN_CLIENTS})`;
}

function SkillPicker({ groups, installed, clients, onSubmit, onCancel }: Props): React.JSX.Element {
  const { exit } = useApp();
  const [tabIdx, setTabIdx] = useState(0);
  const [rowIdx, setRowIdx] = useState(0);
  const [state, setState] = useState<PickerState>(() => initState(groups, installed, clients));
  const [error, setError] = useState<string | null>(null);

  const currentGroup = groups[tabIdx];

  useInput((input, key) => {
    if (!currentGroup) return;

    if (key.escape || (key.ctrl && input === 'c')) {
      onCancel('cancel');
      exit();
      return;
    }

    if (input === 'b') {
      onCancel('back');
      exit();
      return;
    }

    if (key.return) {
      const counts = pendingCounts(state, groups);
      // "Nothing selected" is now a legitimate intent (remove everything), so
      // the gate is on pending changes, not on selection count.
      if (counts.install === 0 && counts.remove === 0) {
        setError('沒有任何待套用的變更');
        return;
      }
      onSubmit(diff(state, groups));
      exit();
      return;
    }

    if (key.leftArrow || (key.shift && key.tab)) {
      setTabIdx((idx) => (idx - 1 + groups.length) % groups.length);
      setRowIdx(0);
      setError(null);
      return;
    }
    if (key.rightArrow || (key.tab && !key.shift)) {
      setTabIdx((idx) => (idx + 1) % groups.length);
      setRowIdx(0);
      setError(null);
      return;
    }

    const entriesCount = currentGroup.entries.length;
    if (key.upArrow) {
      setRowIdx((idx) => (entriesCount === 0 ? 0 : (idx - 1 + entriesCount) % entriesCount));
      return;
    }
    if (key.downArrow) {
      setRowIdx((idx) => (entriesCount === 0 ? 0 : (idx + 1) % entriesCount));
      return;
    }

    if (input === ' ') {
      const target = currentGroup.entries[rowIdx];
      if (target) {
        setState((s) => toggle(s, currentGroup.key, target.dir));
        setError(null);
      }
      return;
    }
    if (input === 'a') {
      setState((s) => selectAllInTab(s, currentGroup));
      setError(null);
      return;
    }
    if (input === 'd') {
      // Reset, not uninstall-all — see design.md Decision 4.
      setState((s) => resetTab(s, currentGroup.key));
      setError(null);
      return;
    }
  });

  const counts = pendingCounts(state, groups);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Select skills to link (tabbed)</Text>
      <Text dimColor>Clients: {clients.length > 0 ? clients.join(', ') : '(none)'}</Text>

      <Box marginTop={1} flexWrap="wrap">
        {groups.map((g, i) => {
          const selectedInTab = tabSelectedCount(state, g.key);
          const label = `${g.label} (${selectedInTab}/${g.entries.length})`;
          const active = i === tabIdx;
          return (
            <Box key={g.key} marginRight={1}>
              <Text
                color={active ? 'black' : undefined}
                backgroundColor={active ? 'cyan' : undefined}
                bold={active}
              >
                {' '}{label}{' '}
              </Text>
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1} flexDirection="column">
        {currentGroup && currentGroup.entries.length === 0 ? (
          <Text dimColor>此 tab 沒有 skill</Text>
        ) : (
          currentGroup?.entries.map((e, i) => {
            const focused = i === rowIdx;
            const row = state.get(currentGroup.key)?.get(e.dir);
            const pointer = focused ? '›' : ' ';
            const box = boxFor(row?.desired ?? 'none');
            const marker = rowMarker(row);
            const elsewhere = formatOutOfScope(outOfScopeClients(installed, e.dir, clients));
            return (
              <Text key={e.dir} color={focused ? 'cyan' : undefined}>
                {pointer} {box} {e.displayName}
                {marker ? <Text color={marker === '+' ? 'green' : 'red'}> {marker}</Text> : null}
                {elsewhere ? <Text dimColor> {elsewhere}</Text> : null}
              </Text>
            );
          })
        )}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          Pending: {counts.install} install · {counts.remove} remove · ←/→ tab · ↑/↓ row · space toggle · a select-all · d reset · enter submit · b back · esc cancel
        </Text>
        {error ? <Text color="red">{error}</Text> : null}
      </Box>
    </Box>
  );
}

export class SkillPickerBackError extends Error {
  constructor() {
    super('back');
    this.name = 'SkillPickerBackError';
  }
}

export class SkillPickerCancelError extends Error {
  constructor() {
    super('cancel');
    this.name = 'SkillPickerCancelError';
  }
}

type PickerOutcome =
  | { type: 'submit'; result: SkillDiff }
  | { type: 'back' }
  | { type: 'cancel' };

export type PickSkillsOptions = {
  installed: Map<string, Set<Client>>;
  clients: Client[];
};

export async function pickSkills(entries: SkillEntry[], opts: PickSkillsOptions): Promise<SkillDiff> {
  const groups = groupByCategory(entries);
  if (groups.length === 0) return { toInstall: [], toRemove: [] };

  let outcome: PickerOutcome | null = null;

  const app = render(
    <SkillPicker
      groups={groups}
      installed={opts.installed}
      clients={opts.clients}
      onSubmit={(result) => {
        outcome = { type: 'submit', result };
      }}
      onCancel={(reason) => {
        outcome = reason === 'back' ? { type: 'back' } : { type: 'cancel' };
      }}
    />,
  );

  // Wait for Ink to fully tear down before returning control, otherwise the
  // next prompt (clack) races Ink for stdin raw mode and appears to "just exit".
  try {
    await app.waitUntilExit();
  } catch {
    if (!outcome) outcome = { type: 'cancel' };
  }

  // Ink unmount calls stdin.unref() (see ink/build/components/App.js:137).
  // Without a live event source between here and the next clack prompt, the
  // process exits when the microtask queue drains. Re-ref + resume stdin.
  if (process.stdin.isTTY) {
    process.stdin.ref();
    process.stdin.resume();
  }

  const settled = (outcome ?? { type: 'cancel' }) as PickerOutcome;
  switch (settled.type) {
    case 'back':
      throw new SkillPickerBackError();
    case 'cancel':
      throw new SkillPickerCancelError();
    case 'submit':
      return settled.result;
  }
}
