## 1. Preflight 純函式

- [x] 1.1 新增 `src/preflight/runtime-check.ts`。定義 `MINIMUM_NODE_MAJOR = 22`。export `type CheckResult = { ok: true } | { ok: false; current: string; minimum: number; platform: NodeJS.Platform }`。
- [x] 1.2 export `checkNodeVersion(processLike: { versions: { node: string }; platform: NodeJS.Platform })`：解析 `versions.node` 的 major、比對 `MINIMUM_NODE_MAJOR`，回 `CheckResult`。
- [x] 1.3 新增 `src/preflight/runtime-guide.ts`。export `formatFailureMessage(result: Extract<CheckResult, { ok: false }>): string`：
  - 首行明確說「Node.js 版本過舊」。
  - 中段列「目前版本 X → 需要 Y+」。
  - 平台 map：`darwin` / `linux` / `win32` 各給 1 條首選指令（brew / nvm / winget）+ 官網 fallback；其它平台只給官網。
  - 尾行提示：「安裝完成後重開終端機再跑一次 `npx github:heartpleasure101-stack/dotagents`」。

## 2. CLI entry 拆分

- [x] 2.1 把現有 `src/cli.tsx` 除 `#!/usr/bin/env node` 之外的整段搬到 `src/cli-main.tsx`（維持所有 export / import 語意）。
- [x] 2.2 `src/cli.tsx` 改成薄殼：
  ```tsx
  #!/usr/bin/env node
  import process from 'node:process';
  import { checkNodeVersion } from './preflight/runtime-check.js';
  import { formatFailureMessage } from './preflight/runtime-guide.js';
  const check = checkNodeVersion(process);
  if (!check.ok) {
    process.stderr.write(formatFailureMessage(check) + '\n');
    process.exit(1);
  }
  await import('./cli-main.js');
  ```
- [x] 2.3 若 `cli-main.tsx` 是靠頂層 `run().catch(...)` 觸發（現況即是），`await import()` 就會執行 side-effect；不需要額外呼叫。

## 3. 測試

- [x] 3.1 `tests/runtime-check.test.ts`：
  - Node 22.0.0 → ok true。
  - Node 24.5.1 → ok true。
  - Node 20.11.0 → ok false，current 帶 "20.11.0"，minimum 22。
  - Node 18.17.0 → ok false。
  - major 解析失敗（`"invalid"`）→ ok false（fail-safe）。
- [x] 3.2 `tests/runtime-guide.test.ts`：
  - `darwin` → 訊息含 `brew`。
  - `linux` → 訊息含 `nvm`。
  - `win32` → 訊息含 `winget`。
  - 其它（例：`freebsd`）→ 訊息只含官網 URL。
  - 所有平台訊息都含 `https://nodejs.org`。
- [x] 3.3 `bun test` + `bun run type-check` 全綠。

## 4. Build + smoke

- [x] 4.1 `bun run build` — 產出新 dist/cli.js。
- [x] 4.2 `bun run smoke` — 確認新的 dist 仍在 500ms 內不會爆 ERR_MODULE_NOT_FOUND。
- [x] 4.3 手動：`node dist/cli.js` — 在正常環境（node ≥ 22）應該不受影響地進 scope picker。

## 5. README + commit

- [x] 5.1 `README.md` 「Prerequisites」段補一行：若沒裝 Node.js，附 macOS / Windows / Linux 各一條安裝指令；提到 CLI 會自動檢查版本並提示。
- [x] 5.2 git add + commit + push。commit message：`feat(preflight): guard node <22 with an install-guide message`。

## 6. 需要真人做的驗證

- [x] 6.1 ~~在 Node 20 環境（例：`nvm use 20`）跑~~ → **改以偽造 `process.versions.node` 驗證，未使用真實 Node 20 binary**（本機 `nvm ls` 只有 v24.12.0 / v24.16.0，未安裝 Node 20）。

  做法：`node --import <preload> dist/cli.js`，preload 覆寫 `process.versions.node` 與 `process.platform`，跑的是真實 build 產物。

  結果（每組 exit code 皆 = 1，訊息為中文）：

  | 版本 | platform | 指引 |
  |---|---|---|
  | 20.20.2 | darwin | `brew install node@22` |
  | 20.20.2 | win32 | `winget install OpenJS.NodeJS` |
  | 20.20.2 | linux | `nvm install 22` |
  | 18.20.8 | darwin | `brew install node@22` |
  | 21.7.3 | darwin | `brew install node@22` |

  上邊界：22.0.0 未觸發 guard，直接進 app（`grep -c 版本過舊` = 0）。
  單元測試：`bun test tests/runtime-check.test.ts tests/runtime-guide.test.ts` → 13 pass / 0 fail。

  **未覆蓋的殘留風險**：偽造版本無法驗證 Node 20 是否**解析得動** `dist/cli.js`。若 bundle 含 Node 20 不支援的語法，使用者會看到 SyntaxError 而非本指引訊息 —— 正是本 change 要防的情境。目前佐證：`build.mjs:25` 的 target 只寫 `'node'`（未釘版本），但掃 bundle 未發現 `using` 宣告等新語法，亦無 `Object.groupBy` / `Promise.withResolvers` 等 Node 22-only API（0 筆）。要完全排除需在真實 Node 20 跑一次。
- [x] 6.2 在 Node 22+ 環境跑，確認 CLI 正常進 scope picker、無 preflight 訊息。實測 Node `v24.16.0`，`script` 分配 pty 後跑 `node dist/cli.js`，輸出為 `┌ agent-sync` → `◆ Choose a workspace` → `● Global (~/.agents) / ○ Project (.agents) / ○ Exit`；grep `node|版本|upgrade|nvm|brew|winget` 回 0 筆，確認無 preflight 訊息。
