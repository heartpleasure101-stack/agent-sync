import React, { useState } from 'react';
import { Box, Text, render, useApp, useInput } from 'ink';
import type { SkillEntry } from '../core/list-skills.js';
import {
  deselectAllInTab,
  flatten,
  groupByCategory,
  initState,
  selectAllInTab,
  toggle,
  totalSelected,
  type PickerState,
  type TabGroup,
} from './skill-picker-state.js';

type Props = {
  groups: TabGroup[];
  onSubmit: (selected: string[]) => void;
  onCancel: (reason: 'cancel' | 'back') => void;
};

function SkillPicker({ groups, onSubmit, onCancel }: Props): React.JSX.Element {
  const { exit } = useApp();
  const [tabIdx, setTabIdx] = useState(0);
  const [rowIdx, setRowIdx] = useState(0);
  const [state, setState] = useState<PickerState>(() => initState(groups));
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
      if (totalSelected(state) === 0) {
        setError('至少要選 1 個 skill');
        return;
      }
      onSubmit(flatten(state, groups));
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
      setState((s) => deselectAllInTab(s, currentGroup.key));
      return;
    }
  });

  const total = totalSelected(state);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Select skills to link (tabbed)</Text>

      <Box marginTop={1} flexWrap="wrap">
        {groups.map((g, i) => {
          const selectedInTab = state.get(g.key)?.size ?? 0;
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
            const checked = state.get(currentGroup.key)?.has(e.dir) ?? false;
            const pointer = focused ? '›' : ' ';
            const box = checked ? '[x]' : '[ ]';
            return (
              <Text key={e.dir} color={focused ? 'cyan' : undefined}>
                {pointer} {box} {e.displayName}
              </Text>
            );
          })
        )}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          Total: {total} selected · ←/→ tab · ↑/↓ row · space toggle · a select-all · d cancel-all · enter submit · b back · esc cancel
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
  | { type: 'submit'; skills: string[] }
  | { type: 'back' }
  | { type: 'cancel' };

export async function pickSkills(entries: SkillEntry[]): Promise<string[]> {
  const groups = groupByCategory(entries);
  if (groups.length === 0) return [];

  let outcome: PickerOutcome | null = null;

  const app = render(
    <SkillPicker
      groups={groups}
      onSubmit={(selected) => {
        outcome = { type: 'submit', skills: selected };
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
      return settled.skills;
  }
}
