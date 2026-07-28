import { test, expect } from 'bun:test';
import { checkNodeVersion, MINIMUM_NODE_MAJOR } from '../src/preflight/runtime-check.js';

function fake(node: string, platform: NodeJS.Platform = 'linux') {
  return { versions: { node }, platform };
}

test('MINIMUM_NODE_MAJOR is 22 (aligned with Ink 7 engines)', () => {
  expect(MINIMUM_NODE_MAJOR).toBe(22);
});

test('Node 22.0.0 passes', () => {
  expect(checkNodeVersion(fake('22.0.0'))).toEqual({ ok: true });
});

test('Node 24.5.1 passes', () => {
  expect(checkNodeVersion(fake('24.5.1'))).toEqual({ ok: true });
});

test('Node 20.11.0 fails and reports current + minimum', () => {
  const res = checkNodeVersion(fake('20.11.0', 'darwin'));
  expect(res).toEqual({
    ok: false,
    current: '20.11.0',
    minimum: 22,
    platform: 'darwin',
  });
});

test('Node 18.17.0 fails', () => {
  const res = checkNodeVersion(fake('18.17.0', 'win32'));
  expect(res.ok).toBe(false);
  if (!res.ok) {
    expect(res.current).toBe('18.17.0');
    expect(res.platform).toBe('win32');
  }
});

test('unparsable version fails fail-safe', () => {
  const res = checkNodeVersion(fake('invalid', 'linux'));
  expect(res.ok).toBe(false);
  if (!res.ok) {
    expect(res.current).toBe('invalid');
  }
});

test('empty version string fails fail-safe', () => {
  const res = checkNodeVersion(fake('', 'linux'));
  expect(res.ok).toBe(false);
  if (!res.ok) {
    expect(res.current).toBe('unknown');
  }
});
