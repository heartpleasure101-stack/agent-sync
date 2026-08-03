import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { classifyPath, createPathClassifier } from '../src/core/path-state';

describe('classifyPath', () => {
  let tmpDir: string;
  let canonicalDir: string;
  let foreignDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'path-state-test-'));
    canonicalDir = path.join(tmpDir, 'canonical');
    foreignDir = path.join(tmpDir, 'foreign');
    await fs.promises.mkdir(canonicalDir, { recursive: true });
    await fs.promises.mkdir(foreignDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  test('returns ok for a real directory', async () => {
    const realDir = path.join(tmpDir, 'real-dir');
    await fs.promises.mkdir(realDir, { recursive: true });

    const result = await classifyPath(realDir, canonicalDir);
    expect(result.state).toBe('ok');
  });

  test('returns missing for non-existent path', async () => {
    const nonExistent = path.join(tmpDir, 'does-not-exist');

    const result = await classifyPath(nonExistent, canonicalDir);
    expect(result.state).toBe('missing');
  });

  test('returns broken-symlink when symlink target does not exist', async () => {
    const symlinkPath = path.join(tmpDir, 'broken-link');
    const targetPath = path.join(tmpDir, 'non-existent-target');

    await fs.promises.symlink(targetPath, symlinkPath);

    const result = await classifyPath(symlinkPath, canonicalDir);
    expect(result.state).toBe('broken-symlink');
    expect(result.link).toBe(targetPath);
    expect(result.resolved).toBe(path.resolve(targetPath));
  });

  test('returns foreign-symlink when symlink target exists outside canonicalRoot', async () => {
    const symlinkPath = path.join(tmpDir, 'foreign-link');
    const foreignTarget = path.join(foreignDir, 'some-skill');
    await fs.promises.mkdir(foreignTarget, { recursive: true });

    await fs.promises.symlink(foreignTarget, symlinkPath);

    const result = await classifyPath(symlinkPath, canonicalDir);
    expect(result.state).toBe('foreign-symlink');
    expect(result.link).toBe(foreignTarget);
    expect(result.resolved).toBe(path.resolve(foreignTarget));
  });

  test('returns ok when symlink target exists inside canonicalRoot', async () => {
    const symlinkPath = path.join(tmpDir, 'valid-link');
    const canonicalTarget = path.join(canonicalDir, 'skills');
    await fs.promises.mkdir(canonicalTarget, { recursive: true });

    await fs.promises.symlink(canonicalTarget, symlinkPath);

    const result = await classifyPath(symlinkPath, canonicalDir);
    expect(result.state).toBe('ok');
    expect(result.link).toBe(canonicalTarget);
    expect(result.resolved).toBe(path.resolve(canonicalTarget));
  });

  test('memoizes classification results when using createPathClassifier', async () => {
    const classifier = createPathClassifier(canonicalDir);
    const realDir = path.join(tmpDir, 'real-dir');
    await fs.promises.mkdir(realDir, { recursive: true });

    const res1 = await classifier.classify(realDir);
    expect(res1.state).toBe('ok');

    // Remove directory physically
    await fs.promises.rmdir(realDir);

    // Memoized result should still be returned
    const res2 = await classifier.classify(realDir);
    expect(res2.state).toBe('ok');

    classifier.clear();
    const res3 = await classifier.classify(realDir);
    expect(res3.state).toBe('missing');
  });
});
