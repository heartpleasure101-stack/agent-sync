## Context

CLI 目前的第一行是 `#!/usr/bin/env node`，其後直接 `import` chalk / clack / Ink。ESM 靜態 import 在載入階段就會執行到 Ink 內部（Ink 需要 node ≥ 22 才 100% OK — Ink 7 `engines.node = ">=22"`）。

如果我們把 check 寫成一般 module，也用 `import`，check 本身要跑 == import Ink 的機會已經過了。所以 preflight **必須早於**任何 heavy import。

## Goals / Non-Goals

**Goals：**
- Node < 22 時，`stderr` 印出中文可讀訊息 + 平台對應安裝指令 + exit code 1；不留 Ink stack trace。
- Node ≥ 22 時零成本（一次 semver 比對，微秒等級）。
- 訊息符合 CLAUDE.md 語氣（繁中、直接、可執行）。
- pure function 可測試，Ink / clack 都不涉及。

**Non-Goals：**
- 不做自動安裝、不做版本切換。
- 不檢查 npm / git / bun。
- 不處理「Node 完全沒裝」的情境（無法在 JS 內處理）。

## Decisions

**1. preflight 放在 `src/preflight/`，用純 Node built-in。**
- `runtime-check.ts`：只 import `node:process`（或連 process 都不 import，直接接收參數）。純函式 `checkNodeVersion(processLike): CheckResult`。
- `runtime-guide.ts`：純函式 `formatFailureMessage(result): string`，回傳整段可 print 的中文訊息。

替代方案：
- 用 `engines-strict` npm config — 只在 `npm install` 階段生效，`npx github:...` 也吃 install 階段，但只印 warning、不擋。且錯誤訊息是英文技術面。**Rejected**。
- 用 `package.json engines` + 依賴 npm 檢查 — 同上，不擋、訊息差。**Rejected**。

**2. `cli.tsx` 頂端加 preflight import 與 guard，**early return** 在所有其它 import 之前。
```ts
#!/usr/bin/env node
import process from 'node:process';
import { checkNodeVersion } from './preflight/runtime-check.js';
import { formatFailureMessage } from './preflight/runtime-guide.js';
const check = checkNodeVersion(process);
if (!check.ok) {
  process.stderr.write(formatFailureMessage(check) + '\n');
  process.exit(1);
}
// —— 以下才是原本的 CLI import ——
import chalk from 'chalk';
// ...
```
問題：ESM 的 `import` 都是 top-level、**hoisted**、沒辦法保證在 `checkNodeVersion` 之後才執行。準確做法是把重 import **改成 dynamic import**：
```ts
#!/usr/bin/env node
import process from 'node:process';
import { checkNodeVersion } from './preflight/runtime-check.js';
import { formatFailureMessage } from './preflight/runtime-guide.js';
const check = checkNodeVersion(process);
if (!check.ok) {
  process.stderr.write(formatFailureMessage(check) + '\n');
  process.exit(1);
}
const { run } = await import('./cli-main.js');
await run();
```
這需要把現有 `cli.tsx` 的內容搬到 `src/cli-main.tsx`，讓 `cli.tsx` 只剩薄薄的 preflight + 動態 import。

**3. Node 版本比對用 `process.versions.node`。**
現況：`process.versions.node` 型如 `"22.4.1"`。用最簡的 `parseInt(major)` 做比對；不引入 semver 套件（多一個 dep 不值得）。
最低版本從常數 `MINIMUM_NODE_MAJOR = 22` 讀，跟 `package.json engines` 對齊，未來要升上 24 只改常數。

**4. 平台偵測：`process.platform`。**
- `darwin` → 給 `brew install node@22` + 官網下載連結。
- `linux` → 建議 `nvm install 22` + 官網。
- `win32` → 建議 `winget install OpenJS.NodeJS` + 官網。
- 其它 → 只給官網。
所有平台都附 https://nodejs.org 作為 fallback。

**5. Bundle 相容。**
Bun bundle 會把 `src/preflight/*` 打進 `dist/cli.js`；動態 `import('./cli-main.js')` 在 bundle 階段會被 bun 內聯，一樣是同一個檔。Runtime OK。

## Risks / Trade-offs

- **[早期 return 前不能用 clack `note()` 排版]**：只能 `process.stderr.write` 純字串。為此設計了 `formatFailureMessage` 用 ANSI 手工上色（可選，先不用色，優先可讀性）。
- **[改成 dynamic import 增加 boilerplate]**：cli.tsx 拆成 preflight + cli-main 兩檔；改動小，未來新增 preflight（例如 disk 空間、寫入權限）也容易加。
- **[使用者 Node 22 但仍失敗]**：訊息要提示「你已達最低版本但仍失敗，請跑 `node -v` 貼給我們」— 這是本 change 之外的事（一般錯誤處理），不特別做。

## Migration Plan

單 commit；使用者無感（除非本來就是 Node < 22 的人）。Rollback = revert commit + rebuild dist。

## Open Questions

- 訊息語言：這個專案的其他 clack prompt 是中英混用，preflight 一律中文；符合 CLAUDE.md 「使用繁體中文回應，技術術語可保留英文」。實作時保持。
