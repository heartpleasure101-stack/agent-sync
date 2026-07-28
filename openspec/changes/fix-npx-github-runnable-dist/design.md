## Context

`bun build` 的 CLI 支援 `--external <mod>`（將 `<mod>` 保留為 runtime import，不打包），但 CLI 本身沒有 alias / plugin flag。要「把某個 import 替換成內嵌 stub」必須改用 `Bun.build({ plugins: [...] })` 程式化 API（[bun docs](https://bun.sh/docs/bundler)，plugin.onResolve / onLoad）。

Ink 引用 `react-devtools-core` 的位置只有 `node_modules/ink/build/devtools.js:7`，且該檔只被 `reconciler.js` 的 `await import('./devtools.js')` 動態載入、僅在 `process.env['DEV']==='true'` 時觸發。

## Goals / Non-Goals

**Goals：**
- `dist/cli.js` 執行時零外部 optional peer 依賴。
- build 流程可重現、單一指令（`bun run build`）。
- 不新增 runtime dependency 給 end user 額外負擔。

**Non-Goals：**
- 不 fork / 不 patch Ink source。
- 不把 dist 進 npm registry。
- 不寫完整 e2e 測試（smoke test 足以擋住 module not found regression）。

## Decisions

**1. 用 bun build plugin 攔截 `react-devtools-core` 的 resolve。**
```js
plugins: [{
  name: 'stub-react-devtools',
  setup(builder) {
    builder.onResolve({ filter: /^react-devtools-core$/ }, () => ({
      path: 'react-devtools-core-stub',
      namespace: 'stub',
    }));
    builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export default {}; export const initialize = () => {}; export const connectToDevTools = () => {};',
      loader: 'js',
    }));
  },
}]
```
attribution：`onResolve` 命中任何對 `react-devtools-core` 的 import request，把它導向一個虛擬 `stub` namespace；`onLoad` 提供最小可用 API（`initialize`、`connectToDevTools` 兩個 Ink 有可能呼叫的 method 都 no-op）。

替代方案：
- **攔截 `./devtools.js`**（Ink 的相對 path）— 需要判斷 args.importer 是不是 Ink 的 reconciler.js，跨平台 path 比對麻煩；stub `react-devtools-core` 本身更乾淨。
- **`--define process.env.DEV='"false"'`** — 實測不 work（tool 輸出證明），bun 仍會 static-resolve import 才判斷 dead code。
- **手改 `node_modules/ink`** — 每次 `bun install` 都會被沖掉。

**2. 移到 `build.mjs`。**
bun CLI 沒有 plugin flag，必用程式化 API。`build.mjs` 直接 `import { $ } from 'bun'` 也不需要，Bun global 已可用。檔案 6~10 行內結案，維護成本低。

**3. Smoke test 用 `node dist/cli.js` + timeout + 檢查 stderr 不含 ERR_MODULE_NOT_FOUND。**
CLI 是互動式的，不能 wait 到 exit。策略：
- `spawn node dist/cli.js`，讀 stderr 前 500ms。
- 若 500ms 內出現任何 `ERR_MODULE_NOT_FOUND` 字樣 → fail。
- 500ms 後 kill 子程序 → pass。
放在 `scripts/smoke.mjs`，`package.json scripts.smoke = "node scripts/smoke.mjs"`。

**4. 保持 `dist` 在 git 追蹤中。**
上一輪已改 `.gitignore`；本 change 只是重新 build、commit 新的 `dist/cli.js`。

## Risks / Trade-offs

- **[Ink 升到未來版本改變 devtools 呼叫方式]** → stub 若少 method，執行時會炸。Mitigation：stub 至少提供 `default`、`initialize`、`connectToDevTools` 三個 export（Ink 目前用到的全部），未來若 Ink 加新 method，smoke test 應能抓到。
- **[bun API 變動]** → `Bun.build` 尚屬穩定但仍是 Bun-specific；換到別的 runtime 要重寫。可接受，本專案就是 bun-first。
- **[dist size]** → stub 內容極小；不影響 1.4 MB 現況。

## Migration Plan

單 commit：`build.mjs` + `scripts/smoke.mjs` + `package.json` + `dist/cli.js`。使用者感受不到差別，只是「原本壞的 `npx github:...` 現在能跑」。Rollback = revert commit。
