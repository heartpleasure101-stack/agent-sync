## 1. Build script

- [x] 1.1 新增 `build.mjs`（root），內容為 `Bun.build({ entrypoints: ['src/cli.tsx'], outdir: 'dist', target: 'node', format: 'esm', plugins: [<stub-react-devtools>] })`；失敗時 `process.exit(1)` 並印 log。
- [x] 1.2 `plugins` 中 `stub-react-devtools`：`onResolve` 命中 `/^react-devtools-core$/` 導向自訂 namespace；`onLoad` 該 namespace 回 `export default {}; export const initialize = () => {}; export const connectToDevTools = () => {};`。
- [x] 1.3 `package.json`：`scripts.build` 改為 `bun run build.mjs`，移除舊 `--external react-devtools-core` flag。

## 2. Smoke test

- [x] 2.1 新增 `scripts/smoke.mjs`：spawn `node dist/cli.js`；監聽 stderr；若 500ms 內出現 `ERR_MODULE_NOT_FOUND` → `console.error` + `process.exit(1)`；否則 `child.kill('SIGTERM')` + `process.exit(0)`。
- [x] 2.2 `package.json`：`scripts.smoke = "node scripts/smoke.mjs"`。

## 3. 驗證與 rebuild

- [x] 3.1 `bun run build` — 檢查 output 無錯、`dist/cli.js` 存在。
- [x] 3.2 `grep -c "react-devtools-core" dist/cli.js` — 期望 0（stub 已把它從 bundle 中消掉）。
- [x] 3.3 `bun run smoke` — 期望 exit 0，無 ERR_MODULE_NOT_FOUND。
- [x] 3.4 `bun test` + `bun run type-check` 全綠。

## 4. Commit + push

- [ ] 4.1 `git add build.mjs scripts/smoke.mjs package.json dist/cli.js openspec/changes/fix-npx-github-runnable-dist/`。
- [ ] 4.2 commit message：`fix(build): stub react-devtools-core so npx github can run dist/cli.js`。
- [ ] 4.3 `git push`。

## 5. End-to-end confirm（需真人）

- [ ] 5.1 在乾淨資料夾跑 `npx github:heartpleasure101-stack/dotagents`；確認能進到 scope picker，不再拋 ERR_MODULE_NOT_FOUND。
