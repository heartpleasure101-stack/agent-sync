## 1. Core：`resolveRoots` 支援新預設與 override

- [ ] 1.1 在 `src/core/paths.ts` 的 `RootOptions` 加入 `canonicalOverride?: string`
- [ ] 1.2 修改 `resolveRoots()`：project scope 預設 `canonicalRoot = path.join(homeDir, '.agents')`
- [ ] 1.3 `canonicalOverride` 為非空絕對路徑時，project scope `canonicalRoot` 使用該值；其它欄位不變
- [ ] 1.4 Global scope 無視 `canonicalOverride`（僅記錄警告或直接忽略）
- [ ] 1.5 更新 `src/core/mappings.ts`、`src/core/list-skills.ts`、`src/core/migrate.ts`、`src/core/status.ts` 的 `RootOptions` 傳遞路徑，確保 `canonicalOverride` 端對端可用

## 2. CLI：`ensureCanonical` 與 fallback prompt

- [ ] 2.1 於 `src/core/` 新增 `ensure-canonical.ts`，導出 `ensureCanonical({ homeDir, projectRoot }): Promise<{ canonicalOverride?: string; migrationHint?: string }>`
- [ ] 2.2 `ensureCanonical` 若 `~/.agents/` 存在（含有效 symlink）：直接回傳 `{}`
- [ ] 2.3 `ensureCanonical` 若 `~/.agents/` 不存在：呼叫互動 prompt（clack `select` + `text`），三選一：建立、指定其它路徑、取消
- [ ] 2.4 指定其它路徑時，驗證 `fs.existsSync` + `fs.accessSync(R_OK)`；失敗時重試
- [ ] 2.5 取消時 `process.exit(0)`，不做任何 fs 變更
- [ ] 2.6 額外偵測 `projectRoot/.agents` 為實體目錄且非空時，於回傳中帶 `migrationHint`
- [ ] 2.7 於 `src/cli-main.tsx` 主流程入口（`buildLinkPlan` 之前）呼叫 `ensureCanonical`，將 `canonicalOverride` 併入後續所有 `RootOptions`
- [ ] 2.8 若有 `migrationHint`，用 `note()` 印出一次

## 3. 測試

- [ ] 3.1 `grep -rn "\.agents" tests/` 檢查既有假設，列出需更新的測試
- [ ] 3.2 新增 `tests/paths.test.ts`（若不存在則建立）涵蓋 spec 中 `Requirement: Project scope canonical 預設為 ~/.agents/` 的兩個 scenario
- [ ] 3.3 新增測試涵蓋 `canonicalOverride` 的三個 scenario（project 帶、project 空、global 忽略）
- [ ] 3.4 新增 `tests/ensure-canonical.test.ts` 涵蓋 fallback prompt 五個 scenario（用假 prompt 或注入 mock IO）
- [ ] 3.5 新增測試涵蓋「非持久化」scenario：兩次呼叫之間不讀寫任何檔案
- [ ] 3.6 新增測試涵蓋 migration hint：實體目錄觸發、symlink 不觸發
- [ ] 3.7 更新既有 mappings/list-skills/migrate/status 測試使其接受新預設路徑
- [ ] 3.8 `bun test` 全綠

## 4. 文件與 Migration

- [ ] 4.1 更新 `README.md`：project scope 說明段落改述新預設 + fallback prompt 行為
- [ ] 4.2 於 README 加入「從舊版遷移」段落，示範 `rsync -a .agents/ ~/.agents/ && rm -rf .agents`
- [ ] 4.3 若 `docs/` 內有描述 canonical 位置的檔案，同步更新
- [ ] 4.4 於 change 目錄補一份簡短 release note 草稿（BREAKING 標記）

## 5. Smoke 與最終驗證

- [ ] 5.1 `bun run build` 產出 `dist/cli.js` 無錯
- [ ] 5.2 `bun run smoke` 通過
- [ ] 5.3 手動驗證：於一個沒有 `~/.agents/` 的臨時 HOME 執行 CLI，走過 prompt 三分支各一次
- [ ] 5.4 手動驗證：於既有專案（現有 `專案/.agents` symlink 指向 `~/.agents/`）執行 CLI，結果與舊版一致
- [ ] 5.5 `openspec status --change default-canonical-to-home-agents` 顯示 4/4
