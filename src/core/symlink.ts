import fs from 'fs';
import path from 'path';

/**
 * Resolve `target` to the absolute path it points at, or null when it is not a
 * symlink at all.
 *
 * The lstat guard matters: callers use a non-null result to decide whether a
 * path is safe to remove. A bare readlink() would also reject real directories,
 * but only by throwing, which makes "not a symlink" indistinguishable from a
 * transient IO error. Checking first keeps the negative case explicit.
 */
export async function resolveSymlinkTo(target: string): Promise<string | null> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.lstat(target);
  } catch {
    return null;
  }
  if (!stat.isSymbolicLink()) return null;
  try {
    const link = await fs.promises.readlink(target);
    if (!path.isAbsolute(link)) {
      return path.resolve(path.dirname(target), link);
    }
    return link;
  } catch {
    return null;
  }
}

/**
 * True when `target` is a symlink resolving to `source`.
 *
 * This is the precondition for removing a link we created. It is deliberately
 * verification-shaped rather than description-shaped: backupPath() will happily
 * rename an entire real directory into the backup dir, so anything that is not
 * provably our own symlink must never reach it.
 */
export async function isSymlinkPointingTo(target: string, source: string): Promise<boolean> {
  const resolved = await resolveSymlinkTo(target);
  if (!resolved) return false;
  return path.resolve(resolved) === path.resolve(source);
}

/** Human-readable description of what `target` actually is, for conflict reasons. */
export async function describePathKind(target: string): Promise<string> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.lstat(target);
  } catch {
    return 'missing';
  }
  if (stat.isSymbolicLink()) {
    const resolved = await resolveSymlinkTo(target);
    return resolved ? `symlink to ${resolved}` : 'broken symlink';
  }
  if (stat.isDirectory()) return 'directory';
  if (stat.isFile()) return 'file';
  return 'path';
}
