import fs from 'fs';
import path from 'path';
import type { LinkPlan, LinkTask, SourceKind } from './types.js';
import { getLinkTarget } from './link-target.js';
import { ensureDir, ensureFile, removePath, pathExists } from '../utils/fs.js';
import type { BackupSession } from './backup.js';
import { backupPath, recordCreatedPath } from './backup.js';
import { isSymlinkPointingTo } from './symlink.js';

const DEFAULT_AGENTS = `# AGENTS\n\nAdd shared agent instructions here.\n`;

export type ApplyFailure = {
  target: string;
  code?: string;
  message: string;
  suggestion?: string;
};

export type ApplyResult = {
  applied: number;
  skipped: number;
  conflicts: number;
  failed: number;
  failures: ApplyFailure[];
  backupDir: string;
  backedUp: number;
  removed: number;
};

async function createSource(task: Extract<LinkTask, { type: 'ensure-source' }>): Promise<void> {
  if (task.kind === 'dir') {
    await ensureDir(task.path);
    return;
  }
  await ensureFile(task.path, DEFAULT_AGENTS);
}

async function createLink(
  source: string,
  target: string,
  kind: SourceKind,
  overwrite: boolean,
  backup?: BackupSession,
): Promise<{ created: boolean; backedUp: boolean }> {
  const linkTarget = getLinkTarget(source, target, kind);

  if (await pathExists(target)) {
    if (!overwrite) return { created: false, backedUp: false };
    const backedUp = backup ? await backupPath(target, backup) : false;
    if (await pathExists(target)) await removePath(target);
    await ensureDir(path.dirname(target));
    const type = kind === 'dir' ? 'junction' : 'file';
    await fs.promises.symlink(linkTarget.link, target, type as fs.symlink.Type);
    return { created: true, backedUp };
  }
  await ensureDir(path.dirname(target));
  const type = kind === 'dir' ? 'junction' : 'file';
  await fs.promises.symlink(linkTarget.link, target, type as fs.symlink.Type);
  return { created: true, backedUp: false };
}

export async function applyLinkPlan(
  plan: LinkPlan,
  opts: { force?: boolean; backup: BackupSession },
): Promise<ApplyResult> {
  const force = !!opts?.force;
  const backup = opts.backup;
  if (!backup) throw new Error('Backup session required.');
  let applied = 0;
  let skipped = 0;
  let conflicts = 0;
  let failed = 0;
  let backedUp = 0;
  let removed = 0;
  const failures: ApplyFailure[] = [];

  for (const task of plan.tasks) {
    if (task.type === 'blocked-root') {
      skipped += 1;
      continue;
    }
    if (task.type === 'conflict') {
      conflicts += 1;
      if (force && task.target !== task.source && task.kind) {
        try {
          const result = await createLink(task.source, task.target, task.kind, true, backup);
          if (result.backedUp) backedUp += 1;
          applied += 1;
        } catch (err: any) {
          failed += 1;
          const code = err?.code;
          failures.push({
            target: task.target,
            code,
            message: err?.message || String(err),
            suggestion: code === 'ENOENT'
              ? `Check parent path or run: rm "${path.dirname(task.target)}"`
              : `Inspect ${task.target}`,
          });
        }
      }
      continue;
    }
    if (task.type === 'noop') {
      skipped += 1;
      continue;
    }
    if (task.type === 'ensure-source') {
      try {
        await createSource(task);
        recordCreatedPath(task.path, task.kind, backup);
        applied += 1;
      } catch (err: any) {
        failed += 1;
        failures.push({
          target: task.path,
          code: err?.code,
          message: err?.message || String(err),
          suggestion: `Ensure directory or permissions for ${task.path}`,
        });
      }
      continue;
    }
    if (task.type === 'unlink') {
      try {
        if (!(await isSymlinkPointingTo(task.target, task.source))) {
          if (await pathExists(task.target)) conflicts += 1;
          else skipped += 1;
          continue;
        }
        const ok = await backupPath(task.target, backup);
        if (ok) {
          removed += 1;
          backedUp += 1;
        } else {
          skipped += 1;
        }
      } catch (err: any) {
        failed += 1;
        failures.push({
          target: task.target,
          code: err?.code,
          message: err?.message || String(err),
          suggestion: `Inspect permissions for ${task.target}`,
        });
      }
      continue;
    }
    if (task.type === 'link') {
      try {
        const before = await pathExists(task.target);
        let useForce = force;
        if (!useForce && task.replaceSymlink && before) {
          try {
            const stat = await fs.promises.lstat(task.target);
            if (stat.isSymbolicLink()) useForce = true;
          } catch {}
        }
        const result = await createLink(task.source, task.target, task.kind, useForce, backup);
        if (result.backedUp) backedUp += 1;
        if (!before && result.created) {
          recordCreatedPath(task.target, 'symlink', backup);
        }
        if (before && !useForce) skipped += 1; else applied += 1;
      } catch (err: any) {
        failed += 1;
        const code = err?.code;
        failures.push({
          target: task.target,
          code,
          message: `Failed to link target ${task.target}: ${err?.message || String(err)}`,
          suggestion: code === 'ENOENT'
            ? `Parent directory may be a broken symlink. Run: rm "${path.dirname(task.target)}"`
            : `Inspect permissions for ${task.target}`,
        });
      }
    }
  }

  return { applied, skipped, conflicts, failed, failures, backupDir: backup.dir, backedUp, removed };
}
