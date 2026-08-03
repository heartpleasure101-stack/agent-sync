## 1. 路徑狀態判定

- [x] 1.1 新增 `src/core/path-state.ts`，實作 `classifyPath(p, canonicalRoot)` 回傳 `{ state: 'ok' | 'missing' | 'broken-symlink' | 'foreign-symlink', link?, resolved? }`，判定以 `lstat` 為準，建立在 `src/core/symlink.ts` 既有的 `resolveSymlinkTo()` 之上，不重造 readlink 邏輯
- [x] 1.2 加入以 `blockedPath` 為 key 的 memoize，避免同一 client 根目錄被重複 lstat
- [x] 1.3 新增 `tests/path-state.test.ts`，覆蓋四種狀態各一個 fixture，含 broken symlink 指向不存在路徑的情況

## 2. 掃描端分流

- [x] 2.1 修改 `src/core/scan-installed.ts:55-62`，把 `readdir` 失敗的 catch 從無條件 `continue` 改為呼叫 `classifyPath()` 分流：`missing` 維持現行語意，`broken-symlink` 收集進異常清單
- [x] 2.2 擴充 `scanInstalledSkills()` 回傳型別，除 `installed` 外附帶 `brokenRoots: Array<{ client, path, link }>`，更新所有呼叫端
- [x] 2.3 在 `tests/scan-installed.test.ts` 新增兩個案例：根目錄不存在（不進 brokenRoots）、根目錄是 broken symlink（進 brokenRoots 且不 throw、不產生 installed 條目）

## 3. Plan 階段攔截

- [x] 3.1 在 `src/core/types.ts:12-20` 的 `LinkTask` 聯合型別新增 `{ type: 'blocked-root'; source; target; blockedPath; link; reason }`
- [x] 3.2 修改 `src/core/plan.ts` 的 `buildLinkPlan()`，產出 link task 前檢查 target 的父路徑鏈，命中 `broken-symlink` 時改發 `blocked-root`，並確保 `LinkPlan.changes` / `conflicts` 的分類不被污染
- [x] 3.3 確認未受影響的 client 仍正常產出 link task（單一 client 壞掉不擴散）
- [x] 3.4 在 `tests/linking.test.ts` 新增案例：claude 根目錄 broken、gemini 正常，驗證 plan 中 claude 的 target 全為 `blocked-root`、gemini 照常，且 `buildLinkPlan()` 不 throw

## 4. 診斷訊息與互動清理

- [x] 4.1 在 `src/cli-main.tsx` 新增診斷輸出，以 `blockedPath` 去重，每個壞掉的根目錄一則，內容含絕對路徑、link 目標、被阻塞的 skill 數量、以及 `rm <path>` 修復指令
- [x] 4.2 新增互動 prompt：「備份後移除並重建」／「跳過此 client」，跳過時該 client 的所有 skill 操作被略過且其它 client 照常完成
- [x] 4.3 無 TTY 時預設跳過並印出診斷，MUST NOT 以未攔截例外結束
- [x] 4.4 實作清理路徑：經既有 backup session 備份 `blockedPath`（`src/core/backup.ts:94` 已能判為 `kind: 'symlink'`），移除後 `mkdir` 重建實體目錄，再讓原本被阻塞的 link task 正常套用
- [x] 4.5 確認 `--force` 不會自動清理 `blocked-root`（依 design 決策 5）

## 5. Apply 錯誤收斂

- [x] 5.1 在 `src/core/apply.ts:44-117` 的迴圈加入 per-task try/catch，單一 target 失敗不中止其餘任務
- [x] 5.2 錯誤訊息包含 target 路徑、原始錯誤碼與建議動作，取代裸 `ENOENT` / `EEXIST`
- [x] 5.3 `applyLinkPlan()` 回傳值新增 `failed: number` 與失敗明細
- [x] 5.4 同步更新 `src/cli-main.tsx:544-553` 的摘要組裝，讓失敗計數出現在結果摘要中

## 6. Migration hint 修正

- [x] 6.1 修改 `src/core/ensure-canonical.ts:20-35` 的 `checkMigrationHint()`，symlink 分支改為檢查 link 目標是否存在：存在則維持靜默，不存在則回傳含路徑、目標、`rm` 建議的提示
- [x] 6.2 確認提示 MUST NOT 阻擋主流程，canonical 解析結果不變
- [x] 6.3 在 `tests/ensure-canonical.test.ts` 新增 broken symlink 案例，並確認既有「symlink 到別處」案例仍為靜默

## 7. Undo 與收尾

- [x] 7.1 驗證清理後執行 undo 能還原原本的 symlink 與其 link 字串，backup manifest 格式未變（`tests/undo.test.ts`）
- [x] 7.2 在 undo 摘要中說明「還原的 symlink 可能本來就是壞的」，避免誤判 undo 失敗
- [x] 7.3 執行 `bun test`、`bun run type-check`、`bun run build`、`node scripts/smoke.mjs` 全數通過
- [x] 7.4 以真實情境驗收：在具有 broken `.claude/skills` 的 fixture 專案執行安裝，確認診斷正確、清理後安裝成功、其它 client 不受影響
