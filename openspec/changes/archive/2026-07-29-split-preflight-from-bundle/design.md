## Context

`src/cli.tsx` 是設計上的 thin shell：檢查 Node 版本 → 不合則印中文指引並 `exit(1)` → 合格才 `await import('./cli-main.js')`。註解（`src/cli.tsx:2-4`）明說用 dynamic import 是為了讓 Ink / clack / chalk 在檢查通過前不碰 runtime。

但 `build.mjs:22-28` 只給 `Bun.build` 一個 entrypoint，Bun 把整棵相依樹（含 `cli-main.tsx`）攤平成單一 `dist/cli.js`：實測 1449346 bytes / 30685 行，`cli-main` 內聯在第 30197 行，`MINIMUM_NODE_MAJOR` 落在第 30628 行。ESM 是**整檔解析後才執行**，所以舊 Node 必須先解析完整包 1.4MB 才會跑到第一行 —— 設計意圖在建置階段被抹平了。

現行約束：

- Bun 1.3.11 的 `Bun.build` 不支援釘版本 target。實測傳 `target:'node20'` 直接拋錯：`Expected target to be one of 'browser', 'node', 'bun', 'macro', or 'bun-<target>'`。現行 `target:'node'` 對輸出語法無版本下限。
- `node_modules` 內無 `acorn`、無 `esbuild`；`devDependencies` 只有 `@types/bun`、`@types/node`、`@types/react`、`typescript`。純 Bun 工具鏈做不到語法下限驗證。
- 本機 `nvm ls` 只有 v24.12.0 / v24.16.0，沒有舊版 Node 可直接驗證解析行為。
- `scripts/smoke.mjs` 目前只 spawn `dist/cli.js` 單檔，且刻意不把 non-zero exit 當失敗（`scripts/smoke.mjs:32-34`，因為非 TTY 環境下 CLI 本來就會報 TTY 錯）。

## Goals / Non-Goals

**Goals:**

- 讓 Node 版本檢查的**執行**不依賴主程式能否被**解析**：舊 Node 只需解析得動一個數 KB 的 launcher。
- 把語法下限的破口在 build 階段擋下，而非流到使用者端。
- 真正落實 `src/cli.tsx:2-4` 註解已經承諾、但建置階段被抹平的設計。
- 清掉 `detect-runtime-and-guide/tasks.md` 6.1 記錄的殘留風險。

**Non-Goals:**

- 不改變最低支援版本（維持 Node 22，對齊 Ink 7 的 `engines.node`）。
- 不改 preflight 的訊息內容、平台判斷邏輯、exit code —— 那些已由 `detect-runtime-and-guide` 驗證完畢（16/16）。
- 不改使用者進入點：`npx github:heartpleasure101-stack/agent-sync` 與 `package.json:7-9` 的 `bin` 都不動。
- 不追求讓主程式 bundle 也相容舊 Node —— 它本來就只在版本檢查通過後才載入。

## Decisions

### D1：用 runtime-resolved URL 讓 bundler 無法靜態追蹤主程式

**決定**：launcher 以 `new URL('./main.js', import.meta.url)` 組出路徑後 `await import(url.href)`，而非字面量 `import('./cli-main.js')`。

**理由（已實測）**：

先試 `Bun.build({ entrypoints:['src/cli.tsx'], external:['./cli-main.js'] })` —— `external` 對相對路徑的 dynamic import **不生效**，Bun 仍追進 `cli-main` 並在解析 `react-devtools-core` 時失敗（證明它確實跟了進去）。

改用 runtime-resolved URL 後單獨打包 launcher：產出 **2065 bytes**，`grep -ciE 'ink|react'` = **0**，`await import(mainUrl.href)` 原樣保留。相較現況的 1449346 bytes，暴露面從整包依賴縮到自己寫的三個檔。

**替代方案**：手寫純 JS launcher 不經 bundler。捨棄理由是 preflight 邏輯已有 TS 實作與 13 個通過的單元測試（`tests/runtime-check.test.ts`、`tests/runtime-guide.test.ts`），手寫會產生第二份需同步維護的真實來源。

### D2：語法下限用 esbuild 做 lowering，而非只做檢查

**決定**：新增 `esbuild` 為 devDependency，build 流程在 Bun 產出 launcher 後，以 `--target=node18` 再過一次 esbuild，輸出才是最終 `dist/cli.js`。

**理由**：Bun 無此能力（見 Context）。而 esbuild 在此有比「檢查」更強的性質 —— 它會把超出 target 的語法**降級**，降不動的才報錯。所以產物是「保證 Node 18 解析得動」，不是「這次剛好沒違規」。日後任何人在 `src/preflight/**` 寫了新語法，build 不會沉默通過。

**替代方案**：

- `acorn` + `ecmaVersion` 純 parse gate：依賴更小，但只擋不修，且 ECMAScript 版本與 Node 版本的對應是近似值，邊界案例會誤判。
- 只掃關鍵字（`using` 宣告等）：零依賴但靠列舉，列漏了就失效 —— 這正是現況的問題，不該用同樣脆弱的方式解。
- 用真實舊版 Node 跑 `--check`：最真實，但需要 CI 拉多版本 Node，本機也沒裝，成本與本 change 規模不符。可留作日後 CI 強化。

### D3：Launcher 語法下限訂在 Node 18，不是 22

**決定**：`--target=node18`，比 `engines.node` 宣告的 `>=22` 更寬。

**理由**：launcher 存在的唯一理由就是服務**不符版本**的使用者。它必須跑得動的環境，恰好是 `engines` 排除的那些。訂 18 涵蓋現實中仍大量存在的 LTS；更舊（16 已 EOL）效益遞減。

### D4：Smoke test 兩個產物都要檢查

**決定**：`scripts/smoke.mjs` 擴充為分別檢查 launcher 與主程式，且錯誤訊息要指出是哪一個。

**理由**：拆檔後 launcher 的 dynamic import 要到版本檢查通過後才發生。若 smoke 只 spawn `dist/cli.js`、又不看 exit code（現行行為），主程式 bundle 的 `ERR_MODULE_NOT_FOUND` 會被完全遮蔽 —— 拆檔反而讓現有防護出現盲區。這是本 change 引入的新風險，必須同步補上。

## Risks / Trade-offs

- **[新增 esbuild devDependency 與 Bun 工具鏈重疊]** → 只用於 build 最後一步的 lowering，不進入 runtime 相依、不影響發佈體積（`package.json` `files` 只含 `dist` / `README.md` / `LICENSE`）。換來的是可驗證的保證而非人工紀律。
- **[拆檔後主程式載入失敗的錯誤體驗變差]** → spec 已要求 `dist/main.js` 缺失時給可辨識訊息而非未處理的 module resolution stack trace；D4 的 smoke 擴充則負責在發佈前擋下。
- **[語法下限訂 Node 18 仍非零風險]** → 若使用者用 Node 16 或更舊，launcher 仍可能解析失敗。屬已知殘留，且 16 已 EOL；要完全消除需 CI 跑真實多版本 Node（見 D2 替代方案）。
- **[本機無舊版 Node，驗證仍靠偽造 `process.versions.node`]** → 偽造可驗行為（訊息、exit code），驗不了解析。D2 的 esbuild lowering 正是用來補這一段：解析能力由 target 保證，不靠實跑。兩者互補後殘留風險才算真正收斂。
- **[`publishable-cli-artifact` 既有 spec 明文寫「產出 dist/cli.js 一個檔案」]** → 已在 delta spec 以 MODIFIED 更新該 scenario，並補上 `dist/main.js` 的對應 requirement，避免原 requirement 對依賴風險的保證在拆檔後落空。

## Migration Plan

1. 先改 `build.mjs` 產出兩個檔並確認 launcher 體積與內容（可用本文件記錄的 2065 bytes / grep = 0 作為基準）。
2. 接上 esbuild lowering，確認 build 仍 exit 0。
3. 擴充 `scripts/smoke.mjs`，確認兩個產物都被涵蓋。
4. 以偽造版本跑完 18 / 20 / 21 / 22.0.0 四組驗收（沿用 `detect-runtime-and-guide` 已建立的 preload 手法）。
5. `bun test` 確認 13 個 preflight 測試仍通過。

**Rollback**：改動集中在 `build.mjs`、`src/cli.tsx`、`scripts/smoke.mjs` 三個檔與一個 devDependency，還原成單 entry 即可回到現況；`bin` 指向全程未變，使用者端無感。

## Open Questions

- ~~主程式產物命名用 `main.js` 還是 `cli-main.js`？~~ **已定案：`dist/main.js`**。spec 與本文件原本就暫用此名，維持可免去同步成本；`dist/` 下只有一個主程式 bundle，不存在歧義。
- esbuild lowering 這一步要不要同時套用到主程式 bundle？目前判斷不必要（它只在 Node 22+ 才被載入），但若日後想讓 `type-check` 與建置目標一致，可再評估。
