import { test, expect } from 'bun:test';
import { formatFailureMessage } from '../src/preflight/runtime-guide.js';
import type { CheckFail } from '../src/preflight/runtime-check.js';

function fail(platform: NodeJS.Platform, current = '20.11.0'): CheckFail {
  return { ok: false, current, minimum: 22, platform };
}

test('macOS message contains brew and official URL', () => {
  const msg = formatFailureMessage(fail('darwin'));
  expect(msg).toContain('brew install node@22');
  expect(msg).toContain('https://nodejs.org');
  expect(msg).not.toContain('nvm install');
  expect(msg).not.toContain('winget');
});

test('Linux message contains nvm and official URL', () => {
  const msg = formatFailureMessage(fail('linux'));
  expect(msg).toContain('nvm install 22');
  expect(msg).toContain('https://nodejs.org');
  expect(msg).not.toContain('brew install');
  expect(msg).not.toContain('winget');
});

test('Windows message contains winget and official URL', () => {
  const msg = formatFailureMessage(fail('win32'));
  expect(msg).toContain('winget install OpenJS.NodeJS');
  expect(msg).toContain('https://nodejs.org');
  expect(msg).not.toContain('brew install');
  expect(msg).not.toContain('nvm install');
});

test('other platforms fall back to official URL only', () => {
  const msg = formatFailureMessage(fail('freebsd' as NodeJS.Platform));
  expect(msg).toContain('https://nodejs.org');
  expect(msg).not.toContain('brew install');
  expect(msg).not.toContain('nvm install');
  expect(msg).not.toContain('winget');
});

test('message shows current and minimum versions', () => {
  const msg = formatFailureMessage(fail('darwin', '20.11.0'));
  expect(msg).toContain('20.11.0');
  expect(msg).toContain('22.0.0');
});

test('message ends with a retry command', () => {
  const msg = formatFailureMessage(fail('linux'));
  expect(msg).toContain('npx github:heartpleasure101-stack/agent-sync');
});
