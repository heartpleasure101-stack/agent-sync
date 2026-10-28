import { expect, test } from 'bun:test';
import { resolveRoots } from '../src/core/paths.js';

test('project scope canonicalRoot defaults to ~/.agents/', () => {
  const roots = resolveRoots({ scope: 'project', projectRoot: '/tmp/foo', homeDir: '/Users/x' });
  expect(roots.canonicalRoot).toBe('/Users/x/.agents');
  expect(roots.claudeRoot).toBe('/tmp/foo/.claude');
  expect(roots.geminiRoot).toBe('/tmp/foo/.gemini');
});

test('global scope canonicalRoot is ~/.agents/', () => {
  const roots = resolveRoots({ scope: 'global', homeDir: '/Users/x' });
  expect(roots.canonicalRoot).toBe('/Users/x/.agents');
});

test('project scope uses canonicalOverride when provided', () => {
  const roots = resolveRoots({
    scope: 'project',
    projectRoot: '/tmp/foo',
    homeDir: '/Users/x',
    canonicalOverride: '/Users/x/Developer/.agents',
  });
  expect(roots.canonicalRoot).toBe('/Users/x/Developer/.agents');
  expect(roots.claudeRoot).toBe('/tmp/foo/.claude');
});

test('global scope ignores canonicalOverride', () => {
  const roots = resolveRoots({
    scope: 'global',
    homeDir: '/Users/x',
    canonicalOverride: '/somewhere/else',
  });
  expect(roots.canonicalRoot).toBe('/Users/x/.agents');
});

test('global scope piRoot is ~/.pi/agent', () => {
  const roots = resolveRoots({ scope: 'global', homeDir: '/Users/x' });
  expect(roots.piRoot).toBe('/Users/x/.pi/agent');
});

test('project scope piRoot is <project>/.pi', () => {
  const roots = resolveRoots({ scope: 'project', projectRoot: '/tmp/foo', homeDir: '/Users/x' });
  expect(roots.piRoot).toBe('/tmp/foo/.pi');
  expect(roots.claudeRoot).toBe('/tmp/foo/.claude');
});
