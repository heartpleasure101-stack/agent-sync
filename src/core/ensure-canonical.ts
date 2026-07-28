import fs from 'fs';
import path from 'path';
import os from 'os';
import { select, text, isCancel } from '@clack/prompts';

export type EnsureCanonicalOptions = {
  homeDir?: string;
  projectRoot?: string;
  // Test helper handlers
  selectFn?: typeof select;
  textFn?: typeof text;
  exitFn?: (code: number) => never;
};

export type EnsureCanonicalResult = {
  canonicalOverride?: string;
  migrationHint?: string;
};

async function checkMigrationHint(projectRoot: string): Promise<string | undefined> {
  const p = path.join(projectRoot, '.agents');
  try {
    const lstat = await fs.promises.lstat(p);
    if (lstat.isSymbolicLink()) return undefined;
    if (lstat.isDirectory()) {
      const files = await fs.promises.readdir(p);
      if (files.length > 0) {
        return `偵測到 ${p} 為實體目錄且非空。新版預設讀取 ~/.agents/。\n若需將專案私有本源遷移至全域，請執行：\n  rsync -a .agents/ ~/.agents/ && rm -rf .agents`;
      }
    }
  } catch {
    // path does not exist
  }
  return undefined;
}

export async function ensureCanonical(opts: EnsureCanonicalOptions = {}): Promise<EnsureCanonicalResult> {
  const homeDir = opts.homeDir || os.homedir();
  const projectRoot = opts.projectRoot || process.cwd();
  const defaultCanonical = path.join(homeDir, '.agents');
  const migrationHint = await checkMigrationHint(projectRoot);

  if (fs.existsSync(defaultCanonical)) {
    return migrationHint ? { migrationHint } : {};
  }

  const selectPrompt = opts.selectFn || select;
  const textPrompt = opts.textFn || text;
  const exitProc = opts.exitFn || ((code: number) => process.exit(code));

  const choice = await selectPrompt({
    message: `Canonical 目錄 (${defaultCanonical}) 不存在，請選擇處理方式：`,
    options: [
      { label: `建立空的 ${defaultCanonical}`, value: 'create' },
      { label: '指定其它資料夾路徑', value: 'custom' },
      { label: '取消', value: 'cancel' },
    ],
  });

  if (isCancel(choice) || choice === 'cancel') {
    exitProc(0);
  }

  let canonicalOverride: string | undefined;

  if (choice === 'create') {
    await fs.promises.mkdir(defaultCanonical, { recursive: true });
  } else if (choice === 'custom') {
    const input = await textPrompt({
      message: '請輸入既有 canonical 目錄的絕對路徑：',
      placeholder: path.join(homeDir, '.agents'),
      validate(val) {
        if (!val || val.trim() === '') return '路徑不能為空';
        const raw = val.trim();
        const resolved = raw.startsWith('~') ? path.join(homeDir, raw.slice(1)) : path.resolve(raw);
        if (!path.isAbsolute(resolved)) return '必須為絕對路徑';
        if (!fs.existsSync(resolved)) return `路徑不存在：${resolved}`;
        try {
          fs.accessSync(resolved, fs.constants.R_OK);
        } catch {
          return `無法讀取路徑：${resolved}`;
        }
      },
    });

    if (isCancel(input)) {
      exitProc(0);
    }

    const raw = (input as string).trim();
    canonicalOverride = raw.startsWith('~') ? path.join(homeDir, raw.slice(1)) : path.resolve(raw);
  }

  const result: EnsureCanonicalResult = {};
  if (canonicalOverride) result.canonicalOverride = canonicalOverride;
  if (migrationHint) result.migrationHint = migrationHint;

  return result;
}
