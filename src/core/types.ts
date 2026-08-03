export type Scope = 'global' | 'project';
export type SourceKind = 'file' | 'dir';
export type Client = 'claude' | 'factory' | 'codex' | 'cursor' | 'opencode' | 'gemini' | 'github' | 'ampcode' | 'antigravity';

export type Mapping = {
  name: string;
  source: string;
  targets: string[];
  kind: SourceKind;
};

export type LinkTask =
  | { type: 'ensure-source'; path: string; kind: SourceKind }
  | { type: 'link'; source: string; target: string; kind: SourceKind; replaceSymlink?: boolean }
  // Remove a symlink this tool created. Only ever emitted for a target that was
  // verified to be a symlink resolving to `source`; anything else becomes a
  // conflict, because backupPath() would otherwise move a real directory.
  | { type: 'unlink'; source: string; target: string; kind: SourceKind }
  | { type: 'conflict'; source: string; target: string; reason: string; kind?: SourceKind }
  | { type: 'blocked-root'; source: string; target: string; blockedPath: string; link: string; reason: string }
  | { type: 'noop'; source: string; target: string };

export type ConflictTask = Extract<LinkTask, { type: 'conflict' }>;

export type LinkPlan = {
  tasks: LinkTask[];
  changes: LinkTask[];
  conflicts: ConflictTask[];
};

export type LinkStatus = {
  name: string;
  source: string;
  targets: { path: string; status: 'linked' | 'missing' | 'conflict' }[];
};
