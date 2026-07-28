## Why

`dist/cli.js` 由 Ink 7 打包，Ink 7 `engines.node = ">=22"`（依 `node_modules/ink/package.json` grep）。若使用者的 Node < 22 或 完全沒裝 Node，直接跑 `npx github:heartpleasure101-stack/dotagents` 會怎樣？

- **完全沒 Node**：`npx` 不存在 → shell 報 `command not found`，訊息對非技術使用者不友善。
- **Node < 22**：`npx` 可以起，但 Ink 執行時可能爆奇怪錯（optional chaining、`import.meta` 等新特性都靠 runtime 支援），錯誤訊息埋在 stack trace 深處。
- **`package.json engines` 的警告**：`npm` 只印 warning，不擋執行；`npx` 更不會擋。

現況：CLI 起手（`src/cli.tsx:1-2`）沒有任何 runtime 版本檢查，直接 `import` Ink → 出事再說。使用者體驗差、debug 成本高。

我們要在 CLI 的**最外層 entry**（早於任何 Ink / clack import）做一次快速 runtime 檢查：
- Node 版本 < 22 → 顯示中文提示 + 官方安裝指引 URL（macOS: brew / Windows: winget / Linux: nvm）→ `process.exit(1)`。
- Node 版本 ≥ 22 → 正常進 CLI。
- 完全沒 Node 的情境**無法在 JS 內處理**（因為要有 Node 才跑得到我們的 code），但可以在 README「快速上手」段用截圖 + 一行安裝指令補說明；本 change 只負責 「Node 有但版本不夠」 這一段。

## What Changes

- 新增 `src/preflight/runtime-check.ts`：純函式 `checkNodeVersion(process): { ok: true } | { ok: false; current: string; minimum: string; guides: { platform: string; command: string }[] }`。
- 新增 `src/preflight/runtime-guide.ts`：把 check 結果格式化成一段人類可讀訊息（含平台安裝指引），純函式好測試。
- 修改 `src/cli.tsx`：**在所有其他 import 之前**（除 `node:process`）呼叫 `checkNodeVersion(process)`；若 `ok: false`，把訊息印到 stderr 然後 `process.exit(1)`；若 `ok: true`，才繼續走現有流程。
- 修改 `build.mjs`：確保 preflight 檔案被 bundle 進 dist（Bun 會自動 tree-shake 不會有事）。
- 修改 `README.md`：在「Prerequisites」段補一行「若沒裝 Node.js」的安裝指令（macOS / Windows / Linux 各一條），並註明 CLI 會自動檢查版本並提示。
- 新增 `tests/runtime-check.test.ts` + `tests/runtime-guide.test.ts`：純函式測試。

## Capabilities

### New Capabilities
- `runtime-prereq-check`：CLI 啟動時檢查 Node 版本、不符時以中文訊息 + 安裝指引引導使用者，避免 Ink runtime 深層錯誤。

## Impact

- 新增檔案：`src/preflight/runtime-check.ts`、`src/preflight/runtime-guide.ts`、對應兩份測試。
- 修改：`src/cli.tsx`（頂端加 guard）、`README.md`。
- Dist 需重新 build + push（本 change 完成後另做）。
- 無新增 runtime dependency。
- 沒 Node 的情境**不在本 change 範圍**（技術上做不到）。

## Non-Goals

- 不自動幫使用者安裝 Node（跨平台自動安裝風險高、需要 sudo、破壞使用者系統）。
- 不做「幫你切換 Node 版本」（那是 nvm / fnm 的職責）。
- 不檢查其它 optional 相依（例如 git、npm）— 目前 CLI 不強依這些。
- 不做 Bun 檢查（使用者不需要 Bun）。
