## Why

我們 push 了 `dist/cli.js` 到 GitHub 讓別人用 `npx github:heartpleasure101-stack/dotagents` 直接執行，但在 node v24 環境下實測失敗：

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'react-devtools-core'
  imported from .../@dean9703111/dotagents/dist/cli.js
```

根因（依 `node_modules/ink/package.json` peerDependenciesMeta、`node_modules/ink/build/reconciler.js:9-25`、`node_modules/ink/build/devtools.js:7`）：

- Ink 把 `react-devtools-core` 列為 optional peer dependency，`npm install ink` **不會**帶進來。
- Ink 內部 `reconciler.js` 只在 `process.env['DEV'] === 'true'` 時 `await import('./devtools.js')`，devtools.js 靜態 `import devtools from 'react-devtools-core'`。
- `package.json` 目前 `build` script 用 `--external react-devtools-core`，意思是「叫 bun 不要打包這個模組但保留 import 字串」。結果就是 `dist/cli.js` 包含一句對 `react-devtools-core` 的 static / dynamic import，node 一 load 就要 resolve → 找不到 → 崩潰。

Ink 的 DEV guard 只在 **runtime** 生效，救不了 **ESM resolver 的 eager resolve**。

## What Changes

- 用 bun build plugin API 攔截 `react-devtools-core` 的 import request，回傳空 stub（`export default {}`），讓 bundle 不再有任何對它的外部參照。
- 從 CLI 一行 `bun build` 改成 `build.mjs`（用 `Bun.build({...})` API），因為 CLI flag 沒有 alias/plugin 支援。
- 更新 `package.json` 的 `build` script 為 `bun run build.mjs`；移除 `--external react-devtools-core` flag（不再需要）。
- 加一個 smoke test script `bun run smoke`：跑 `node dist/cli.js --help` 或 `node dist/cli.js` 並確認沒有 `ERR_MODULE_NOT_FOUND`（非互動路徑；若沒有 --help 就用可靠的立即 exit 判斷）。
- rebuild dist 並 commit 進 git（延用「dist 上 git 供 npx github 執行」的策略）。

## Capabilities

### New Capabilities
- `publishable-cli-artifact`：dist 產物必須能在乾淨 node runtime（無 dev-only optional peers）下執行 `npx github:...`，並定義 build script 產出這樣的 dist 的行為。

## Impact

- 新增 `build.mjs`（root）— bun build 程式化 entry。
- `package.json` — `scripts.build` 改指向 `bun run build.mjs`；`scripts.smoke` 新增。
- `dist/cli.js` — 重新產生、不再包含對 `react-devtools-core` 的參照。
- `.gitignore` — 不動（上一輪已移除 `dist`）。
- 相依：不新增任何 runtime dep（不裝 `react-devtools-core`）。
- 測試：現有 unit tests 不受影響；新增 smoke test。

## Non-Goals

- 不改換 UI 函式庫（Ink 保留）。
- 不做 code splitting / lazy load。
- 不把 CLI 發佈到 npm（維持 GitHub npx 執行路徑）。
