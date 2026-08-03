## Why

專案 `Practice_tibame_Lesson1` 的 `.claude/skills` 是 7/28 舊制度留下的 symlink，指向 `<projectRoot>/.agents/skills`，而該路徑早已不存在。實測（`fs.mkdirSync` / `fs.symlinkSync` / `fs.readdirSync` 對 broken symlink 路徑）三者全數以 `ENOENT` 失敗，因此 apply 階段在 `ensureDir(path.dirname(target))` 就會拋出未攔截的 `ENOENT`，技能安裝整批失敗。

同一次執行中 `.claude/commands` 與 `.claude/hooks` 都成功重建（時間戳 08-03 11:00），只有 `skills` 停留在 07-28，這正是失敗被 silent 吞掉的證據：`scanInstalledSkills()` 對 `readdir` 失敗一律 `continue`，把「這條路徑是壞的」誤判成「這個 client 沒裝任何 skill」，picker 全部顯示未勾選，使用者按下 apply 才炸，而錯誤訊息只有一個裸的 `ENOENT`，無從得知該刪哪個檔案。

## What Changes

- 新增 broken symlink 偵測層：在 apply 之前判定每個目標 client 的 skills 根目錄狀態（正常目錄／不存在／broken symlink／指向他處的 symlink）。
- 偵測到 broken symlink 根目錄時，CLI 顯示明確診斷：壞掉的路徑、它指向哪裡、為什麼不通，並提供互動選項「備份後移除並重建」或「跳過此 client」。
- 自動清理走既有 backup session，移除的 broken symlink 進 manifest，可經 undo 還原。
- `scanInstalledSkills()` 區分「目錄不存在」與「目錄是 broken symlink」，後者不再靜默 `continue`，而是回報為需要處理的狀態。
- apply 階段的檔案系統錯誤包成可讀訊息：指出失敗的 target、失敗原因、以及建議的修復指令，取代裸 `ENOENT`。
- `checkMigrationHint()` 對 broken 的 `projectRoot/.agents` symlink 給出提示，不再因為「是 symlink」就一律靜默。

## Capabilities

### New Capabilities
- `broken-link-recovery`: 偵測、回報並可選擇性清理由舊版本或手動操作遺留的 broken symlink（client skills 根目錄與 `projectRoot/.agents`），確保 apply 不會因此崩潰。

### Modified Capabilities
- `skill-selection-ux`: `Reverse scan of installed skills` 目前規定「client skills 目錄不存在 → 視為沒有任何已安裝 skill」，需擴充為區分不存在與 broken symlink 兩種情況，後者必須被回報而非靜默略過。
- `canonical-source-resolution`: `偵測既有 projectRoot/.agents 實體目錄並提示` 目前規定「為 symlink 則不顯示 hint」，需修正為 symlink 且 target 不存在時仍顯示提示。

## Impact

- `src/core/scan-installed.ts`：readdir 失敗需分流 ENOENT 與 broken symlink（以 `lstat` 判定）。
- `src/core/plan.ts`：link plan 需為「父目錄是 broken symlink」產出新的任務型別或 conflict 分支，而非放行到 apply 才失敗。
- `src/core/apply.ts`：`createLink()` 的 `ensureDir` 需要錯誤包裝。
- `src/core/ensure-canonical.ts`：`checkMigrationHint()` 的 symlink 分支。
- `src/cli-main.tsx`：新增診斷輸出與清理確認 prompt。
- `src/core/backup.ts` / `src/core/undo.ts`：沿用既有 manifest，不改格式。
- 測試：`tests/` 需新增 broken symlink fixture 情境。
