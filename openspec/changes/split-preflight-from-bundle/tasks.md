## 1. 前置決定

- [ ] 1.1 決定主程式產物檔名（`dist/main.js` 或 `dist/cli-main.js`），並回填 `design.md` Open Questions 與兩份 delta spec 中的暫用名稱。
- [ ] 1.2 `bun add -d esbuild`，確認 `package.json` `devDependencies` 出現 esbuild，且 `dependencies` 未被動到。

## 2. Launcher 與主程式拆分

- [ ] 2.1 修改 `src/cli.tsx`：把 `await import('./cli-main.js')` 改為 runtime-resolved 形式（`new URL('./<主程式檔名>', import.meta.url)` → `await import(url.href)`），使 bundler 無法靜態追蹤。
- [ ] 2.2 修改 `build.mjs`：改為兩次 `Bun.build` —— launcher 由 `src/cli.tsx` 產出 `dist/cli.js`；主程式由 `src/cli-main.tsx` 產出主程式檔。
- [ ] 2.3 確認 `stubReactDevtools` plugin（`build.mjs:5-20`）套用在**主程式**那次 build（`react-devtools-core` 由 Ink 引入，屬主程式）。
- [ ] 2.4 更新 `build.mjs:35-37` 的產物輸出訊息，讓兩個檔的路徑與大小都印出來。

## 3. 語法下限保證

- [ ] 3.1 在 `build.mjs` 的 launcher build 之後，接一道 esbuild `--target=node18` lowering，其輸出才是最終 `dist/cli.js`。
- [ ] 3.2 確認 lowering 失敗時 `build.mjs` 以非 0 exit，且 stderr 訊息明確指出是 launcher 語法下限違規（沿用 `build.mjs:30-33` 的失敗處理風格）。
- [ ] 3.3 驗證 gate 真的會擋：暫時在 `src/preflight/` 塞一段 Node 18 不支援的語法，確認 `bun run build` 失敗；驗證後移除。

## 4. Smoke test 擴充

- [ ] 4.1 修改 `scripts/smoke.mjs`：`dist/` 下兩個產物都要檢查是否存在，缺任一個都要 exit 1。
- [ ] 4.2 主程式 bundle 需被實際載入檢查（launcher 的 dynamic import 只在版本檢查通過後才發生，光 spawn launcher 檢查不到主程式）。
- [ ] 4.3 失敗訊息要指出是哪一個產物出問題。
- [ ] 4.4 保留 `scripts/smoke.mjs:32-34` 記錄的既有取捨：非 TTY 下的 non-zero exit 不算失敗，只認 `ERR_MODULE_NOT_FOUND`。

## 5. 發佈設定確認

- [ ] 5.1 確認 `package.json:7-9` 的 `bin` 仍指向 `dist/cli.js`（不應改動）。
- [ ] 5.2 確認 `package.json:10-14` 的 `files` 含 `dist`，兩個產物都會被發佈；必要時以 `npm pack --dry-run` 列出實際內容佐證。
- [ ] 5.3 確認 `dist/main.js` 缺失時的錯誤訊息可辨識，不是未處理的 module resolution stack trace。

## 6. 驗收

- [ ] 6.1 `bun run build` exit 0，產出兩個檔；`dist/cli.js` 小於 10KB（spike 基準 2065 bytes），`grep -ciE 'ink|react' dist/cli.js` = 0。
- [ ] 6.2 偽造 `process.versions.node` 跑真實產物，18.20.8 / 20.20.2 / 21.7.3 三組皆須顯示中文指引且 exit code = 1；darwin / linux / win32 三平台指引各驗一次。
- [ ] 6.3 偽造 22.0.0 邊界，確認未觸發 guard、正常進入 scope picker。
- [ ] 6.4 版本不符時確認主程式 bundle 自始未被載入（例：暫時移走主程式檔，低版本情境仍應正常顯示中文指引並 exit 1）。
- [ ] 6.5 `bun test` 通過，`tests/runtime-check.test.ts` 與 `tests/runtime-guide.test.ts` 維持 13 pass / 0 fail（注意為 `bun:test`，用 vitest 會失敗）。
- [ ] 6.6 `bun run smoke` exit 0；並確認刻意破壞主程式 bundle 時會 exit 非 0（驗證 4.2 的盲區已補上）。
- [ ] 6.7 `bun run type-check` 通過。

## 7. 收尾

- [ ] 7.1 更新 `openspec/changes/detect-runtime-and-guide/tasks.md` 6.1 的殘留風險註記，指向本 change 已收斂該風險。
- [ ] 7.2 確認 `dist/` 產物已重建並納入 commit（`package.json` `files` 依賴 dist 實體存在）。
