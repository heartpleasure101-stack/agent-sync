# Release Notes (Draft) - default-canonical-to-home-agents

## ⚠️ BREAKING CHANGES

- **Project Scope Canonical Default Changed**:
  - `resolveRoots()` 在 project scope 下的預設 `canonicalRoot` 由 `projectRoot/.agents` 改為 `~/.agents/`。
  - 此變更消除在各別專案中手動 `ln -s ~/.agents .agents` 的重複儀式。
  - Client 資料夾（如 `.claude`、`.gemini`、`.codex`…）於 project scope 下仍落在專案目錄下。

## 🚀 New Features & Enhancements

- **Interactive Canonical Fallback Prompt**:
  - CLI 啟動時若 `~/.agents/` 不存在，自動跳出互動 prompt 提供三個選項：
    1. 建立空的 `~/.agents/`（預設選項）
    2. 指定其它資料夾作為 canonical 本源路徑（Session-only，不寫入設定檔）
    3. 取消
- **Migration Hint**:
  - 專案內若含有既有實體 `.agents/` 資料夾且非空，CLI 會印出一字一次性提示，說明新預設路徑並提供遷移指令範例 (`rsync -a .agents/ ~/.agents/ && rm -rf .agents`)。
