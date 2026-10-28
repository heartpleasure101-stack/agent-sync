import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { intro, outro, select, confirm, note, spinner, isCancel, cancel, multiselect } from '@clack/prompts';
import { buildLinkPlan } from './core/plan.js';
import { getLinkStatus } from './core/status.js';
import { applyMigration, scanMigration } from './core/migrate.js';
import { resolveRoots } from './core/paths.js';
import os from 'os';
import { detectInstalledClients, getGlobalClientRoots } from './core/detect-installed.js';
import { listSkills, type SkillEntry } from './core/list-skills.js';
import { scanInstalledSkills } from './core/scan-installed.js';
import { pickSkills, SkillPickerBackError } from './ui/skill-picker.js';
import { createBackupSession, finalizeBackup, backupPath } from './core/backup.js';
import { removePath } from './utils/fs.js';
import { undoLastChange } from './core/undo.js';
import { preflightBackup } from './core/preflight.js';
import type { Client, LinkStatus, Scope, LinkTask } from './core/types.js';
import type { MigrationCandidate } from './core/migrate.js';
import { ensureCanonical } from './core/ensure-canonical.js';
import type { ApplyFailure } from './core/apply.js';

const appTitle = 'agent-sync';

const CLIENT_LABELS: Record<Client, string> = {
  claude: 'Claude',
  factory: 'Factory',
  codex: 'Codex',
  cursor: 'Cursor',
  opencode: 'OpenCode',
  gemini: 'Gemini (gemini 指令)',
  antigravity: 'Antigravity (agy 指令)',
  github: 'GitHub',
  ampcode: 'Ampcode',
  pi: 'Pi',
};

type StatusSummary = { name: string; linked: number; missing: number; conflict: number };

type Action = 'change' | 'status' | 'undo' | 'clients' | 'skills' | 'exit';

type ChangeChoice = 'force' | 'skip' | 'back';

type ScopeChoice = 'global' | 'project' | 'exit';

function exitCancelled() {
  cancel('Cancelled');
  process.exit(0);
}

function mergeAgentStatus(items: LinkStatus[]): LinkStatus[] {
  const claudeEntry = items.find((s) => s.name === 'claude-md') || null;
  const geminiEntry = items.find((s) => s.name === 'gemini-md') || null;
  const agentsEntry = items.find((s) => s.name === 'agents-md') || null;
  if (!claudeEntry && !agentsEntry && !geminiEntry) return items;

  const merged: LinkStatus = {
    name: 'agents-md',
    source: claudeEntry?.source || geminiEntry?.source || agentsEntry?.source || '',
    targets: [
      ...(claudeEntry?.targets || []),
      ...(geminiEntry?.targets || []),
      ...(agentsEntry?.targets || []),
    ],
  };

  const withoutAgents = items.filter((s) => s.name !== 'claude-md' && s.name !== 'gemini-md' && s.name !== 'agents-md');
  return [merged, ...withoutAgents];
}

function displayName(entry: LinkStatus): string {
  if (entry.name === 'agents-md') {
    const sourceFile = path.basename(entry.source);
    if (sourceFile === 'CLAUDE.md') return 'AGENTS.md (Claude override)';
    if (sourceFile === 'GEMINI.md') return 'AGENTS.md (Gemini override)';
    return 'AGENTS.md';
  }
  return entry.name;
}

function buildStatusSummary(status: LinkStatus[]): StatusSummary[] {
  return status.map((s) => {
    const linked = s.targets.filter((t) => t.status === 'linked').length;
    const missing = s.targets.filter((t) => t.status === 'missing').length;
    const conflict = s.targets.filter((t) => t.status === 'conflict').length;
    return { name: displayName(s), linked, missing, conflict };
  });
}

function formatSummaryTable(rows: StatusSummary[]): string[] {
  const header = { name: 'Section', conflict: 'Conflicts', missing: 'Need link', linked: 'Linked' };
  const width = {
    name: Math.max(header.name.length, ...rows.map((r) => r.name.length)),
    conflict: Math.max(header.conflict.length, ...rows.map((r) => String(r.conflict).length)),
    missing: Math.max(header.missing.length, ...rows.map((r) => String(r.missing).length)),
    linked: Math.max(header.linked.length, ...rows.map((r) => String(r.linked).length)),
  };
  const pad = (value: string, len: number) => value.padEnd(len, ' ');
  const lines = [
    `${pad(header.name, width.name)}  ${pad(header.conflict, width.conflict)}  ${pad(header.missing, width.missing)}  ${pad(header.linked, width.linked)}`,
    ...rows.map((r) => `${pad(r.name, width.name)}  ${pad(String(r.conflict), width.conflict)}  ${pad(String(r.missing), width.missing)}  ${pad(String(r.linked), width.linked)}`),
  ];
  return lines;
}

function renderStatusLines(status: LinkStatus[], conflictReasons: Map<string, string>): string[] {
  const lines: string[] = [];
  for (const entry of status) {
    lines.push(chalk.cyan(displayName(entry)));
    for (const target of entry.targets) {
      const icon = target.status === 'linked'
        ? chalk.green('✓')
        : target.status === 'missing'
          ? chalk.yellow('•')
          : chalk.red('⚠');
      const reason = target.status === 'conflict' ? conflictReasons.get(target.path) : undefined;
      lines.push(`  ${icon} ${target.path}${reason ? chalk.dim(` — ${reason}`) : ''}`);
    }
  }
  return lines;
}

async function selectScope(): Promise<Scope> {
  const scope = await select({
    message: 'Choose a workspace',
    options: [
      { label: 'Global (~/.agents)', value: 'global' },
      { label: 'Project (.agents)', value: 'project' },
      { label: 'Exit', value: 'exit' },
    ],
  });
  if (isCancel(scope)) exitCancelled();
  if (scope === 'exit') {
    outro('Bye');
    process.exit(0);
  }
  return scope as Scope;
}

function scopeLabel(scope: Scope): string {
  return scope === 'global' ? 'Global (~/.agents)' : 'Project (.agents)';
}

function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural || `${singular}s`);
}

function formatCount(count: number, singular: string, plural?: string): string {
  return `${count} ${pluralize(count, singular, plural)}`;
}

const BACK_TOKEN = '__BACK__';

async function selectClients(): Promise<Client[] | 'back'> {
  const options: { label: string; value: Client }[] = [
    { label: CLIENT_LABELS.claude, value: 'claude' },
    { label: CLIENT_LABELS.codex, value: 'codex' },
    { label: CLIENT_LABELS.antigravity, value: 'antigravity' },
    { label: CLIENT_LABELS.pi, value: 'pi' },
    { label: CLIENT_LABELS.opencode, value: 'opencode' },
  ];

  let detected: Client[] = [];
  try {
    detected = await detectInstalledClients();
  } catch {
    detected = [];
  }
  const detectedSet = new Set(detected);
  const clientRoots = getGlobalClientRoots();
  const homeDir = os.homedir();
  const displayPath = (p: string): string =>
    p.startsWith(homeDir + path.sep) ? '~' + p.slice(homeDir.length) : p;

  const hint = detected.length > 0
    ? `偵測到下列資料夾：${detected.map((c) => displayPath(clientRoots[c])).join(', ')}`
    : '未偵測到任何 client 資料夾';

  note('space toggle · a toggle-all · enter submit · pick ◀ Back to return · ctrl+c cancel', 'Keys');

  const selected = await multiselect({
    message: `Select clients to manage\n${chalk.dim(hint)}`,
    options: [
      { label: '◀ Back', value: BACK_TOKEN, hint: 'return to scope selection' },
      ...options.map((opt) => ({
        label: opt.label,
        value: opt.value,
        hint: detectedSet.has(opt.value) ? displayPath(clientRoots[opt.value]) : undefined,
      })),
    ] as { label: string; value: string; hint?: string }[],
    initialValues: [] as string[],
    required: true,
  });
  if (isCancel(selected)) exitCancelled();
  const values = selected as string[];
  if (values.includes(BACK_TOKEN)) return 'back';
  return values as Client[];
}

function formatClients(clients: Client[]): string {
  return clients.map((c) => CLIENT_LABELS[c]).join(', ');
}

type SkillSelection = { toInstall: string[]; toRemove: string[] };

async function selectSkills(
  scope: Scope,
  clients: Client[],
  canonicalOverride?: string,
): Promise<SkillSelection | 'back'> {
  let entries: SkillEntry[] = [];
  try {
    entries = await listSkills({ scope, canonicalOverride });
  } catch {
    entries = [];
  }
  if (entries.length === 0) {
    note('未偵測到任何 canonical skill', 'Skills');
    return { toInstall: [], toRemove: [] };
  }

  // Read the disk before opening the picker: the checkboxes represent the
  // desired end state, so they have to start from what is actually installed.
  //
  // Scan every detected client, not just the selected ones. initState() derives
  // the tri-state from the selected subset regardless, but the row annotation
  // for "also installed on a client you didn't pick" can only report clients
  // that were actually looked at — scanning just the selection makes those
  // installs invisible, which is one of the things this change exists to fix.
  let installed = new Map<string, Set<Client>>();
  try {
    let scanClients: Client[] = [];
    try {
      scanClients = await detectInstalledClients();
    } catch {
      scanClients = [];
    }
    const merged = Array.from(new Set<Client>([...scanClients, ...clients]));
    const scanRes = await scanInstalledSkills({ scope, clients: merged, canonicalOverride });
    installed = scanRes.installed;
  } catch {
    installed = new Map();
  }

  try {
    return await pickSkills(entries, { installed, clients });
  } catch (err: unknown) {
    if (err instanceof SkillPickerBackError) return 'back';
    exitCancelled();
    return { toInstall: [], toRemove: [] };
  }
}

/**
 * Two different numbers, deliberately kept apart: what this session is about to
 * change, and what is installed across every client right now. Collapsing them
 * into one count is what made cross-session installs invisible.
 */
function formatSkillsOverview(
  toInstall: string[],
  toRemove: string[],
  allEntries: SkillEntry[],
  installedGlobal: number,
): string {
  const pendingSet = new Set([...toInstall, ...toRemove]);
  const activeCategories = Array.from(
    new Set(
      allEntries
        .filter((e) => pendingSet.has(e.dir) && e.category !== null)
        .map((e) => e.category as string),
    ),
  );
  const catPart = activeCategories.length === 0
    ? ''
    : activeCategories.length <= 3
      ? ` · Categories: ${activeCategories.join(', ')}`
      : ` · Categories: ${activeCategories.length}`;
  const pending = `Skills pending: ${toInstall.length} install · ${toRemove.length} remove`;
  return `${pending} · Installed: ${installedGlobal} / ${allEntries.length}${catPart}`;
}

async function showStatus(
  scope: Scope,
  clients: Client[],
  status: LinkStatus[],
  planConflicts: { target: string; reason: string }[],
  canonicalOverride?: string,
): Promise<void> {
  const conflicts = new Map(planConflicts.map((c) => [c.target, c.reason]));
  // Global scan rather than the session-filtered status: installs made in
  // earlier sessions (other clients, other skills) are otherwise invisible here.
  let globalStatus = status;
  try {
    globalStatus = await getLinkStatus({ scope, clients, canonicalOverride, scanAll: true });
  } catch {
    globalStatus = status;
  }
  const lines = renderStatusLines(mergeAgentStatus(globalStatus), conflicts);
  note(lines.join('\n'), `Status · ${scopeLabel(scope)} · all detected clients`);
}

async function resolveMigrationConflicts(plan: Awaited<ReturnType<typeof scanMigration>>): Promise<Map<string, MigrationCandidate | null> | null> {
  const selections = new Map<string, MigrationCandidate | null>();
  for (let i = 0; i < plan.conflicts.length; i += 1) {
    const conflict = plan.conflicts[i];
    if (!conflict) continue;
    const choice = await select({
      message: `Resolve migration conflict ${i + 1} of ${plan.conflicts.length}: ${conflict.label}`,
      options: conflict.candidates.map((c) => ({ label: c.label, value: c })),
    });
    if (isCancel(choice)) return null;
    selections.set(conflict.targetPath, choice as MigrationCandidate);
  }
  return selections;
}

async function runChange(
  scope: Scope,
  clients: Client[],
  skills: string[],
  removeSkills: string[],
  canonicalOverride?: string,
): Promise<void> {
  const spin = spinner();
  spin.start('Scanning current setup...');
  const roots = resolveRoots({ scope, canonicalOverride });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const migrate = await scanMigration({ scope, clients, canonicalOverride });
  const link = await buildLinkPlan({ scope, clients, selectedSkills: skills, removeSkills, canonicalOverride });
  const backupDir = path.join(roots.canonicalRoot, 'backup', timestamp);
  spin.stop('Scan complete');

  const blockedTasks = link.tasks.filter(
    (t): t is Extract<LinkTask, { type: 'blocked-root' }> => t.type === 'blocked-root',
  );
  const rootsToClean = new Set<string>();

  if (blockedTasks.length > 0) {
    const byBlockedPath = new Map<string, Extract<LinkTask, { type: 'blocked-root' }>[]>();
    for (const task of blockedTasks) {
      const list = byBlockedPath.get(task.blockedPath) || [];
      list.push(task);
      byBlockedPath.set(task.blockedPath, list);
    }

    const isInteractive = Boolean(process.stdout.isTTY);

    for (const [blockedPath, tasks] of byBlockedPath.entries()) {
      const linkTarget = tasks[0]?.link ?? '';
      const count = tasks.length;
      note(
        [
          `壞掉的技能根目錄: ${blockedPath}`,
          `指向目標: ${linkTarget}`,
          `受影響技能數: ${count}`,
          `手動修復指令: rm "${blockedPath}"`,
        ].join('\n'),
        '無效技能根目錄診斷',
      );

      if (isInteractive) {
        const choice = await select({
          message: `技能根目錄 ${blockedPath} 為無效連結，請選擇處置方式：`,
          options: [
            { label: '備份後移除並重建 (推薦)', value: 'clean' },
            { label: '跳過此 client', value: 'skip' },
          ],
        });
        if (!isCancel(choice) && choice === 'clean') {
          rootsToClean.add(blockedPath);
          for (const task of tasks) {
            (task as any).type = 'link';
            (task as any).kind = 'dir';
          }
        }
      }
    }
  }

  const unlinkCount = link.tasks.filter((t) => t.type === 'unlink').length;
  const planSummary = [
    `Migration: ${migrate.auto.length} auto · ${migrate.conflicts.length} conflicts (choose sources)`,
    `Links: ${link.changes.length} changes · ${link.conflicts.length} conflicts (existing files/dirs)`,
    `Removals: ${unlinkCount}`,
    `Backup: ${backupDir}`,
    'Undo: Use "Undo last change" after this completes.',
  ].join('\n');

  note(planSummary, 'Plan summary');

  let overwriteConflicts = true;
  if (link.conflicts.length > 0) {
    const choice = await select({
      message: 'Apply changes',
      options: [
        { label: 'Apply changes + overwrite conflicts', value: 'force' },
        { label: 'Apply changes (leave conflicts)', value: 'skip' },
        { label: 'Back', value: 'back' },
      ],
    });
    if (isCancel(choice)) return;
    if (choice === 'back') return;
    overwriteConflicts = choice === 'force';
  } else {
    const ok = await confirm({ message: 'Apply changes now?' });
    if (isCancel(ok) || !ok) return;
  }

  let selections = new Map<string, MigrationCandidate | null>();
  if (migrate.conflicts.length > 0) {
    const resolved = await resolveMigrationConflicts(migrate);
    if (!resolved) return;
    selections = resolved;
  }

  const applySpinner = spinner();
  applySpinner.start('Applying changes...');
  try {
    const backup = await createBackupSession({
      canonicalRoot: roots.canonicalRoot,
      scope,
      operation: 'change-to-agents',
      timestamp,
    });

    for (const blockedPath of rootsToClean) {
      await backupPath(blockedPath, backup);
      await removePath(blockedPath);
      await fs.promises.mkdir(blockedPath, { recursive: true });
    }

    await preflightBackup({
      backup,
      linkPlan: link,
      migratePlan: migrate,
      selections,
      forceLinks: overwriteConflicts,
    });
    const result = await applyMigration(migrate, selections, { scope, clients, backup, forceLinks: overwriteConflicts, selectedSkills: skills, removeSkills, canonicalOverride });
    await finalizeBackup(backup);
    const migrationSummary = `Migrated ${formatCount(result.copied, 'item')}`;
    const linkSummary = `Linked ${formatCount(result.links.applied, 'path')}`;
    const conflictSummary = result.links.conflicts > 0
      ? overwriteConflicts
        ? `overwrote ${formatCount(result.links.conflicts, 'conflict')}`
        : `left ${formatCount(result.links.conflicts, 'conflict')} untouched`
      : '';
    const pieces = [migrationSummary, linkSummary];
    if (result.links.removed > 0) pieces.push(`removed ${formatCount(result.links.removed, 'link')}`);
    // Surfaced separately from `removed`: backupPath() can decline to act when a
    // parent path was already backed up, and reporting those as removed would
    // claim something is gone while it is still on disk.
    if (result.links.skipped > 0) pieces.push(`skipped ${formatCount(result.links.skipped, 'path')}`);
    if (result.links.failed > 0) pieces.push(`failed ${formatCount(result.links.failed, 'target')}`);
    if (conflictSummary) pieces.push(conflictSummary);
    applySpinner.stop(`${pieces.join(' · ')}. Backup: ${result.backupDir}`);

    if (result.links.failures && result.links.failures.length > 0) {
      const details = result.links.failures
        .map((f: ApplyFailure) => `- Target: ${f.target}\n  Reason: ${f.message}\n  Suggestion: ${f.suggestion ?? 'None'}`)
        .join('\n');
      note(details, 'Apply Failures Detail');
    }
  } catch (err: any) {
    applySpinner.stop('Change failed');
    note(String(err?.message || err), 'Error');
  }
}

async function loadAllSkillEntries(scope: Scope, canonicalOverride?: string): Promise<SkillEntry[]> {
  try {
    return await listSkills({ scope, canonicalOverride });
  } catch {
    return [];
  }
}

async function run(): Promise<void> {
  intro(chalk.cyan(appTitle));

  const canonicalRes = await ensureCanonical();
  const canonicalOverride = canonicalRes.canonicalOverride;
  if (canonicalRes.migrationHint) {
    note(canonicalRes.migrationHint, 'Migration Hint');
  }

  let scope: Scope = 'global';
  let clients: Client[] = [];
  let skills: string[] = [];
  let removeSkills: string[] = [];
  let allSkillEntries: SkillEntry[] = [];

  // Wizard: scope → clients → skills → main. Back from any step rewinds one step.
  let step: 'scope' | 'clients' | 'skills' | 'main' = 'scope';
  wizard: while (true) {
    if (step === 'scope') {
      scope = await selectScope();
      step = 'clients';
      continue;
    }
    if (step === 'clients') {
      const res = await selectClients();
      if (res === 'back') { step = 'scope'; continue; }
      clients = res;
      step = 'skills';
      continue;
    }
    if (step === 'skills') {
      const res = await selectSkills(scope, clients, canonicalOverride);
      if (res === 'back') { step = 'clients'; continue; }
      skills = res.toInstall;
      removeSkills = res.toRemove;
      allSkillEntries = await loadAllSkillEntries(scope, canonicalOverride);
      step = 'main';
      continue;
    }
    break wizard;
  }

  while (true) {
    const status = mergeAgentStatus(await getLinkStatus({ scope, clients, selectedSkills: skills, canonicalOverride }));
    // Counted across all detected clients so the Overview reflects reality, not
    // just what this session happens to have selected.
    let installedGlobalCount = 0;
    try {
      const detected = await detectInstalledClients();
      const { installed: installedMap } = await scanInstalledSkills({
        scope,
        clients: detected.length > 0 ? detected : clients,
        canonicalOverride,
      });
      installedGlobalCount = installedMap.size;
    } catch {
      installedGlobalCount = 0;
    }
    const plan = await buildLinkPlan({ scope, clients, selectedSkills: skills, removeSkills, canonicalOverride });
    const conflicts = plan.conflicts.length || 0;
    const changes = plan.changes.length || 0;
    const summary = buildStatusSummary(status);
    const summaryLines = formatSummaryTable(summary);

    note([
      `Scope: ${scopeLabel(scope)}`,
      `Clients: ${formatClients(clients)}`,
      formatSkillsOverview(skills, removeSkills, allSkillEntries, installedGlobalCount),
      `Pending changes: ${changes} · Conflicts: ${conflicts}`,
      ...summaryLines,
    ].join('\n'), 'Overview');

    const options: { label: string; value: Action }[] = [];
    if (changes > 0 || conflicts > 0) {
      const label = conflicts > 0 && changes === 0
        ? `Resolve ${conflicts} ${pluralize(conflicts, 'conflict')}`
        : `Apply ${changes} ${pluralize(changes, 'change')}`;
      options.push({ label, value: 'change' });
    }
    options.push({ label: 'View status', value: 'status' });
    options.push({ label: 'Change clients', value: 'clients' });
    options.push({ label: 'Change skills', value: 'skills' });
    options.push({ label: 'Undo last change', value: 'undo' });
    options.push({ label: 'Exit', value: 'exit' });

    const action = await select({ message: 'Choose an action', options });
    if (isCancel(action)) exitCancelled();
    if (action === 'exit') break;

    if (action === 'status') {
      await showStatus(scope, clients, status, plan.conflicts, canonicalOverride);
      continue;
    }

    if (action === 'clients') {
      const res = await selectClients();
      if (res !== 'back' && res.join(',') !== clients.join(',')) {
        clients = res;
        // The tri-state boxes are derived relative to the selected clients, so
        // a pending selection made against the old set is meaningless now.
        // Drop it and make the user re-pick against the new frame of reference.
        if (skills.length > 0 || removeSkills.length > 0) {
          note('Client 選擇已變更，先前的 skill 待套用變更已清除，請重新選擇。', 'Skills');
        }
        skills = [];
        removeSkills = [];
      }
      continue;
    }

    if (action === 'skills') {
      const res = await selectSkills(scope, clients, canonicalOverride);
      if (res !== 'back') {
        skills = res.toInstall;
        removeSkills = res.toRemove;
        allSkillEntries = await loadAllSkillEntries(scope, canonicalOverride);
      }
      continue;
    }

    if (action === 'undo') {
      const spin = spinner();
      spin.start('Undoing last change...');
      try {
        const result = await undoLastChange({ scope, canonicalOverride });
        const restoredSummary = `Restored ${formatCount(result.restoredBackups, 'backup')}`;
        const removedSummary = `Removed ${formatCount(result.removedCreated, 'created path')}`;
        const symlinkSummary = result.removedSymlinks > 0
          ? `${formatCount(result.removedSymlinks, 'symlink')} removed`
          : '';
        let totalSummary = '';
        if (result.restoredBackups === 0 && result.removedCreated === 0) {
          totalSummary = 'Nothing to undo.';
        } else if (result.restoredBackups === 0) {
          totalSummary = [removedSummary, symlinkSummary, 'No backups to restore.'].filter(Boolean).join(' · ');
        } else {
          totalSummary = [restoredSummary, removedSummary, symlinkSummary].filter(Boolean).join(' · ');
        }
        spin.stop(`${totalSummary} Reverted: ${result.undoneDir}`);
        note(`Undo backup: ${result.backupDir}\n提示：還原的 symlink 可能本來就是壞的（連至不存在的目標）。`, 'Undo log');
      } catch (err: any) {
        spin.stop('Undo failed');
        note(String(err?.message || err), 'Error');
      }
      continue;
    }

    if (action === 'change') {
      await runChange(scope, clients, skills, removeSkills, canonicalOverride);
    }
  }

  outro('Bye');
}

run().catch((err) => {
  note(String(err?.message || err), 'Fatal error');
  process.exit(1);
});
