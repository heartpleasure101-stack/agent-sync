// Preflight — MUST only import from node:* built-ins.
// Runs before Ink / clack / chalk are loaded, so any heavy import here
// defeats the point of the guard.

export const MINIMUM_NODE_MAJOR = 22;

export type CheckOk = { ok: true };
export type CheckFail = {
  ok: false;
  current: string;
  minimum: number;
  platform: NodeJS.Platform;
};
export type CheckResult = CheckOk | CheckFail;

type ProcessLike = {
  versions: { node: string };
  platform: NodeJS.Platform;
};

export function checkNodeVersion(processLike: ProcessLike): CheckResult {
  const raw = processLike.versions.node ?? '';
  const majorStr = raw.split('.')[0] ?? '';
  const major = Number.parseInt(majorStr, 10);
  if (!Number.isFinite(major) || major < MINIMUM_NODE_MAJOR) {
    return {
      ok: false,
      current: raw || 'unknown',
      minimum: MINIMUM_NODE_MAJOR,
      platform: processLike.platform,
    };
  }
  return { ok: true };
}
