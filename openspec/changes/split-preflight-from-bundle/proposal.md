## Why

`src/cli.tsx:2-4` 宣告的設計意圖是「用 dynamic import，讓 Ink / clack / chalk 在 Node 版本檢查通過前不碰到 runtime」，但 `build.mjs:22-28` 的 `Bun.build` 把 `cli-main.tsx` 攤平內聯，產出單一 `dist/cli.js`（1.4MB / 30685 行），preflight 落在第 30628 行、`cli-main` 在第 30197 行。ESM 是整檔解析後才執行，所以舊版 Node 必須先解析完這 1.4MB 才會跑到版本檢查 —— 只要整包（含所有第三方依賴）任一處出現舊 Node 不支援的語法，Node 會在解析階段丟 SyntaxError，`detect-runtime-and-guide` 精心寫的中文升級指引完全不會出現，使用者看到的是原始堆疊訊息。

這正是 `detect-runtime-and-guide` 要防的情境，卻是該 change 的 preflight 本身擋不住的；其 `tasks.md` 6.1 已把此殘留風險列為未覆蓋項。目前掃過 bundle 未發現新語法（尚未實際壞掉），但暴露面是整包依賴而非自己撰寫的少數檔案，且 Bun 無法用釘版本方式收斂：實測 Bun 1.3.11 拒絕 `target:'node20'`，只接受 `browser` / `node` / `bun` / `macro` / `bun-<target>`，現行 `build.mjs:25` 的 `target:'node'` 對輸出語法沒有版本下限約束。

## What Changes

- **BREAKING（對建置產物結構）**：`bun run build` 從產出單一 `dist/cli.js` 改為產出兩個檔案 —— `dist/cli.js`（極小的 launcher）與獨立的主程式 bundle（例：`dist/main.js`）。
- `dist/cli.js` 只包含：Node 版本檢查、平台對應中文指引、`process.exit(1)`、以及通過後才執行的 dynamic import。其語法須保守到目標舊版 Node（至少 18 / 20）解析得動。
- 主程式（Ink / clack / chalk / React 及全部依賴）移入獨立 bundle，僅在版本檢查通過後才被 import，真正落實 `src/cli.tsx` 註解承諾的設計。
- `build.mjs` 改為建置兩個 entry；launcher 需確保不被 Bun 以新語法降級/改寫，必要時獨立產生而非交由 bundler 內聯。
- 新增建置後驗證：確認 `dist/cli.js` 在舊版 Node 語法層級解析得動，讓破口在 build 階段就被擋下而非流到使用者端。
- `scripts/smoke.mjs` 需涵蓋新的雙檔結構（目前只檢查 `dist/cli.js` 單檔）。
- `package.json:7-9` 的 `bin` 維持指向 `dist/cli.js`；`package.json:10-14` 的 `files` 已含 `dist`，須確認兩個檔案都會被發佈。

## Capabilities

### New Capabilities

- `preflight-launcher-isolation`: 規範 CLI 進入點必須與主程式 bundle 實體分離，使版本檢查的執行不依賴主程式能否被解析；並規範 launcher 的語法下限與其建置期驗證方式。

### Modified Capabilities

- `publishable-cli-artifact`: 現行 spec 的「Build script 必須把 optional peer stub 掉」requirement 下，scenario 明文要求「產出 `dist/cli.js` 一個檔案」；本 change 改為兩個檔案，該 scenario 需更新。「Smoke test 阻止 regression」requirement 亦需擴及主程式 bundle，否則主 bundle 的 `ERR_MODULE_NOT_FOUND` 會漏檢。

### 排程相依（非 capability，但影響本 change 的 spec 落點）

`runtime-prereq-check` 尚未進入 `openspec/specs/`，仍留在 `detect-runtime-and-guide/specs/` 內（該 change 16/16 已完成但未 archive）。其「preflight 不 SHALL 引入 heavy dependency」requirement 只約束 `src/preflight/**` 的 import，並未約束建置產物的實體分離 —— 這正是本 change 要補的缺口。本 change 的新 capability 與其互補而非取代；若 `detect-runtime-and-guide` 先 archive，兩者可並存無衝突。

## Impact

- `build.mjs`：建置流程改為多 entry，新增 launcher 產出與語法驗證。
- `src/cli.tsx`：作為 launcher 來源，須確保只依賴 `node:*` 與相對路徑，且 import 主程式的路徑要對應新的產物檔名。
- `src/cli-main.tsx`：成為獨立 bundle 的 entry。
- `scripts/smoke.mjs`：檢查範圍擴及兩個產物。
- `package.json`：`files` / `bin` 確認；可能新增建置期語法驗證所需的 devDependency（Bun 本身無此能力）。
- `openspec/specs/publishable-cli-artifact/spec.md`：單檔產出的 scenario 需改寫。
- 既有測試 `tests/runtime-check.test.ts`、`tests/runtime-guide.test.ts`（`bun:test`，須以 `bun test` 執行，vitest 會因找不到 `bun:test` 而失敗）須維持通過。
- 對使用者行為無 breaking change：`npx github:heartpleasure101-stack/agent-sync` 進入點不變。
