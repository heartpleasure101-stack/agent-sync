import fs from 'fs';
import path from 'path';
import { getMappings, getRemovalMappings } from './mappings.js';
import type { MappingOptions } from './mappings.js';
import type { LinkPlan, LinkTask, SourceKind, ConflictTask } from './types.js';
import { pathExists } from '../utils/fs.js';
import { getLinkTarget } from './link-target.js';
import { resolveSymlinkTo, isSymlinkPointingTo, describePathKind } from './symlink.js';
import { resolveRoots } from './paths.js';
import { createPathClassifier } from './path-state.js';

async function ensureSourceTask(source: string, kind: SourceKind): Promise<LinkTask[]> {
  const exists = await pathExists(source);
  if (!exists) return [{ type: 'ensure-source', path: source, kind }];
  const stat = await fs.promises.lstat(source);
  if (kind === 'file' && stat.isDirectory()) {
    return [{ type: 'conflict', source, target: source, reason: 'Expected file but found directory', kind }];
  }
  if (kind === 'dir' && !stat.isDirectory()) {
    return [{ type: 'conflict', source, target: source, reason: 'Expected directory but found file', kind }];
  }
  return [];
}

async function analyzeTarget(
  source: string,
  target: string,
  kind: SourceKind,
  opts?: { relinkableSources?: string[] },
): Promise<LinkTask> {
  const exists = await pathExists(target);
  if (!exists) return { type: 'link', source, target, kind };
  const stat = await fs.promises.lstat(target);
  if (stat.isSymbolicLink()) {
    const rawLink = await fs.promises.readlink(target);
    const resolved = await resolveSymlinkTo(target);
    if (resolved && path.resolve(resolved) === path.resolve(source)) {
      const desired = getLinkTarget(source, target, kind);
      if (desired.isRelative && path.isAbsolute(rawLink)) {
        // Migrate absolute links to relative when safe on this platform.
        return { type: 'link', source, target, kind, replaceSymlink: true };
      }
      return { type: 'noop', source, target };
    }
    if (resolved && opts?.relinkableSources) {
      const relinkable = new Set(opts.relinkableSources.map((p) => path.resolve(p)));
      if (relinkable.has(path.resolve(resolved))) {
        return { type: 'link', source, target, kind, replaceSymlink: true };
      }
    }
    const detail = resolved ? `Symlink points elsewhere: ${resolved}` : 'Symlink points elsewhere';
    return { type: 'conflict', source, target, reason: detail, kind };
  }
  const targetKind = stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'path';
  return { type: 'conflict', source, target, reason: `Target exists and is not a symlink (${targetKind})`, kind };
}

/**
 * Decide whether a deselected skill's target can safely be removed.
 *
 * A missing target is simply already gone (noop). Anything present that is not
 * a symlink resolving to our canonical source becomes a conflict rather than an
 * unlink: applyLinkPlan() hands unlink targets to backupPath(), which renames a
 * real directory wholesale into the backup dir. Silently relocating a user's
 * own directory is not an acceptable outcome of unchecking a box.
 */
async function analyzeRemoval(source: string, target: string, kind: SourceKind): Promise<LinkTask> {
  if (!(await pathExists(target))) return { type: 'noop', source, target };
  if (await isSymlinkPointingTo(target, source)) {
    return { type: 'unlink', source, target, kind };
  }
  const actual = await describePathKind(target);
  return {
    type: 'conflict',
    source,
    target,
    reason: `Refusing to remove: expected a symlink to ${source} but found ${actual}`,
    kind,
  };
}

export async function buildLinkPlan(opts: MappingOptions): Promise<LinkPlan> {
  const mappings = await getMappings(opts);
  const tasks: LinkTask[] = [];

  const roots = resolveRoots({
    scope: opts.scope,
    projectRoot: opts.projectRoot,
    homeDir: opts.homeDir,
    canonicalOverride: opts.canonicalOverride,
  });
  const classifier = createPathClassifier(roots.canonicalRoot);

  async function checkBlockedRoot(target: string): Promise<{ blockedPath: string; link: string; reason: string } | null> {
    let curr = path.resolve(target);
    while (curr !== path.dirname(curr)) {
      const state = await classifier.classify(curr);
      if (state.state === 'broken-symlink') {
        const linkStr = state.link ?? '';
        const targetDesc = state.resolved ?? linkStr;
        return {
          blockedPath: curr,
          link: linkStr,
          reason: `Path or parent directory ${curr} is a broken symlink pointing to ${targetDesc}`,
        };
      }
      curr = path.dirname(curr);
    }
    return null;
  }

  for (const mapping of mappings) {
    tasks.push(...await ensureSourceTask(mapping.source, mapping.kind));
    let relinkableSources: string[] | undefined;
    if (mapping.name === 'claude-md') {
      relinkableSources = [
        path.join(path.dirname(mapping.source), 'AGENTS.md'),
        path.join(path.dirname(mapping.source), 'CLAUDE.md'),
      ];
    } else if (mapping.name === 'gemini-md') {
      relinkableSources = [
        path.join(path.dirname(mapping.source), 'AGENTS.md'),
        path.join(path.dirname(mapping.source), 'GEMINI.md'),
      ];
    }

    for (const target of mapping.targets) {
      const blocked = await checkBlockedRoot(target);
      if (blocked) {
        tasks.push({
          type: 'blocked-root',
          source: mapping.source,
          target,
          blockedPath: blocked.blockedPath,
          link: blocked.link,
          reason: blocked.reason,
        });
      } else {
        tasks.push(await analyzeTarget(mapping.source, target, mapping.kind, { relinkableSources }));
      }
    }
  }

  for (const mapping of await getRemovalMappings(opts)) {
    for (const target of mapping.targets) {
      tasks.push(await analyzeRemoval(mapping.source, target, mapping.kind));
    }
  }

  const conflicts = tasks.filter((t) => t.type === 'conflict') as ConflictTask[];
  const changes = tasks.filter(
    (t) => t.type === 'link' || t.type === 'ensure-source' || t.type === 'unlink',
  );

  return { tasks, conflicts, changes };
}

