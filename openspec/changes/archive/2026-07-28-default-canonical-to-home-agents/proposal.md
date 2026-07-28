## Why

現有 `resolveRoots()`（`src/core/paths.ts:50`）在 project scope 下把 canonical source 寫死為 `projectRoot/.agents`，逼使用者對每個新專案都要 `ln -s ~/.agents .agents`，才能達到「全電腦共用一份 skill/command/hook 本源」的常態用法。這層 symlink 純屬繁瑣儀式，且新使用者容易忽略、導致每個專案各自產生一份空 `.agents/` 目錄。

## What Changes

- **BREAKING**：`resolveRoots()` 在 project scope 下的預設 `canonicalRoot` 由 `path.join(projectRoot, '.agents')` 改為 `path.join(homeDir, '.agents')`。global scope 行為不變（本來就是 `~/.agents`）。
- Client folder（`.claude`、`.gemini`、`.codex`…）落點不變，仍然是 `projectRoot/*`，維持 project scope 語意（本源共用、目標各自）。
- CLI 啟動時若 `~/.agents/` 不存在，跳出互動 prompt 詢問使用者：
  - 建立空的 `~/.agents/`（預設選項）
  - 指定其它資料夾路徑作為 canonical（輸入絕對路徑，例如 `~/Developer/.agents`）
  - 取消
- 使用者選擇的替代路徑僅套用於當次 session，不寫入設定檔（維持與 skill selection 相同的 non-persistent 原則）。

## Capabilities

### New Capabilities
- `canonical-source-resolution`：定義 canonical source 目錄的解析規則（預設位置、fallback prompt、session-only override）。

### Modified Capabilities
（無 — 現有三個 capability 都不涉及 canonical 路徑的解析行為）

## Impact

- 程式：`src/core/paths.ts`（`resolveRoots` 預設值）、`src/cli-main.tsx`（啟動時 fallback prompt 與 override 傳遞）、`src/core/mappings.ts` 與 `src/core/list-skills.ts` 需接受 `canonicalOverride` 參數。
- 使用者遷移：既有專案內若已有 `專案/.agents/` 實體資料夾或 symlink，需一次性遷移到 `~/.agents/`（提供 migration 提示或文件）。
- 測試：`tests/` 內所有以 `projectRoot/.agents` 為假設的 unit test 需同步更新。
- 文件：README、docs 內描述本源位置的段落需更新。
