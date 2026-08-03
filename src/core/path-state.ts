import fs from 'fs';
import path from 'path';
import { resolveSymlinkTo } from './symlink';

export type PathState = 'ok' | 'missing' | 'broken-symlink' | 'foreign-symlink';

export interface PathStateResult {
  state: PathState;
  link?: string;
  resolved?: string;
}

function isSubpathOrEqual(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Classifies a path state into 'ok', 'missing', 'broken-symlink', or 'foreign-symlink'.
 * Uses `lstat` so broken symlinks are not confused with missing paths.
 */
export async function classifyPath(
  targetPath: string,
  canonicalRoot?: string,
  cache?: Map<string, PathStateResult | Promise<PathStateResult>>
): Promise<PathStateResult> {
  const abs = path.resolve(targetPath);
  if (cache?.has(abs)) {
    return cache.get(abs)!;
  }

  const promise = (async (): Promise<PathStateResult> => {
    let stat: fs.Stats;
    try {
      stat = await fs.promises.lstat(abs);
    } catch {
      return { state: 'missing' };
    }

    if (!stat.isSymbolicLink()) {
      return { state: 'ok' };
    }

    const link = await fs.promises.readlink(abs).catch(() => undefined);
    const resolved = await resolveSymlinkTo(abs);

    if (!resolved) {
      return { state: 'broken-symlink', link, resolved: undefined };
    }

    let destExists = false;
    try {
      await fs.promises.lstat(resolved);
      destExists = true;
    } catch {
      destExists = false;
    }

    if (!destExists) {
      return { state: 'broken-symlink', link, resolved };
    }

    if (canonicalRoot) {
      const isCanonical = isSubpathOrEqual(canonicalRoot, resolved);
      if (!isCanonical) {
        return { state: 'foreign-symlink', link, resolved };
      }
    }

    return { state: 'ok', link, resolved };
  })();

  if (cache) {
    cache.set(abs, promise);
  }

  return promise;
}

/**
 * Factory for creating a memoized classifier bound to an optional canonicalRoot.
 */
export function createPathClassifier(canonicalRoot?: string) {
  const cache = new Map<string, Promise<PathStateResult>>();
  return {
    classify(p: string): Promise<PathStateResult> {
      return classifyPath(p, canonicalRoot, cache);
    },
    clear() {
      cache.clear();
    }
  };
}
