## 1. 前置決定

- [x] 1.1 決定主程式產物檔名：**`dist/main.js`**。spec 與 design 原本即用此名，無需改動；已在 `design.md` Open Questions 標注定案。
- [x] 1.2 `bun add -d esbuild` → `esbuild@0.28.1`。`git diff package.json` 只有 devDependencies 一行新增，`dependencies` 未被動到。

## 2. Launcher 與主程式拆分

- [x] 2.1 修改 `src/cli.tsx`：改為 `new URL('./main.js', import.meta.url)` → `await import(url.href)`，bundler 無法靜態追蹤。並加上 try/catch 提供可辨識的載入失敗訊息（同時滿足 5.3）。
- [x] 2.2 改寫 `build.mjs`：兩次 `Bun.build`，以 `naming` 分別產出 `dist/main.js`（entry `src/cli-main.tsx`）與 `dist/cli.js`（entry `src/cli.tsx`）。
- [x] 2.3 `stubReactDevtools` 只掛在主程式那次 build 的 `plugins`；launcher 那次不掛（它不 import Ink）。
- [x] 2.4 產物訊息改為讀**磁碟實際大小**並依大小選用 KB/MB。原本沿用 Bun build result 會印出 launcher 的 lowering 前大小，且以 MB 顯示會變成 `0.00 MB`。現輸出：`dist/main.js 1.36 MB` / `dist/cli.js 2.6 KB`。

## 3. 語法下限保證

- [x] 3.1 launcher build 後接 esbuild `target: 'node18'`（`allowOverwrite`），輸出才是最終 `dist/cli.js`。`LAUNCHER_TARGET` 抽為常數並註明為何刻意低於 `engines.node`。
- [x] 3.2 lowering 失敗時印出「launcher 超出語法下限」訊息、`rm` 掉半成品 `dist/cli.js` 後 `exit(1)`，避免留下不可發佈的產物。

  **實作中發現並修掉的真實 bug**：初版在 esbuild 加了 `banner: { js: '#!/usr/bin/env node' }`，但 esbuild 會保留 Bun 已產生的 hashbang，導致第 2 行出現第二個 `#!` —— `node --check dist/cli.js` 直接回 `SyntaxError: Invalid or unexpected token`。這正是本 change 要防的失效模式，卻由建置流程自己製造出來。已移除 banner 並在原處加註說明。
- [x] 3.3 驗證 gate 真的會擋。**原本的預期（build 失敗）只對了一半**，實測 esbuild 有兩種行為：

  1. **可降級的語法 → lowering，不報錯。** 在 `checkNodeVersion` 內塞 `using _probe = { [Symbol.dispose]() {} }`（Node 24+ 語法），build 仍 exit 0，但產物中 `grep -nE '^\s*using '` = 0 筆，改為注入 `__using` / `__callDispose` helper（4 筆），`node --check` 通過，體積 2.6 KB → 4.2 KB。**產物保證可解析**，這比「讓 build 失敗」更符合目的。
  2. **無法降級的語法 → 報錯。** 以 `--target=node12` 對含 top-level await 的產物測試，esbuild 回 `Top-level await is not available in the configured target environment ("node12")` 並以非 0 結束，會走到 `build.mjs` 的 catch 分支。

  另有一個副發現：第一次探針寫成未被呼叫的 `export function __probe()`，被 Bun tree-shake 掉而完全沒進 bundle，gate 自然不會觸發。**gate 只保護實際進入 launcher 產物的程式碼**，這是正確且預期的行為。驗證後探針已完全移除（`git diff src/preflight/runtime-check.ts` 無輸出，產物回到 2670 bytes、`__using` 0 筆）。

## 4. Smoke test 擴充

- [x] 4.1 `scripts/smoke.mjs` 改為以 `ARTIFACTS` 陣列描述兩個產物，開頭逐一檢查存在性，缺任一個即 exit 1。
- [x] 4.2 兩個產物各自 spawn 檢查。**盲區已實證存在**：把 `dist/main.js` 前面插入一個解不到的 import 後，`dist/cli.js` 仍回報 **PASS**（launcher 的 try/catch 把錯誤轉成中文訊息，字串裡沒有 `ERR_MODULE_NOT_FOUND`），只有獨立檢查 `dist/main.js` 才抓得到。若沿用舊版只檢查 launcher，這個故障會完全靜默通過。
- [x] 4.3 失敗訊息前綴產物名稱：`smoke: FAIL — dist/main.js: ERR_MODULE_NOT_FOUND during load:`。
- [x] 4.4 保留既有取捨並在檔頭重新註明：非 TTY 下的 non-zero exit 不算失敗，唯一契約仍是「載入階段不得出現 `ERR_MODULE_NOT_FOUND`」。

## 5. 發佈設定確認

- [x] 5.1 `bin` 仍為 `{"agent-sync": "dist/cli.js"}`，全程未改動。
- [x] 5.2 `npm pack --dry-run` 實測 tarball 含 `dist/cli.js` 2.7kB 與 `dist/main.js` 1.4MB（共 5 個檔），兩個產物都會被發佈。
- [x] 5.3 暫時移走 `dist/main.js` 後於 Node 24 執行 launcher，輸出為中文「主程式載入失敗」+ 預期路徑 + 原因 + 重裝指引，非未處理的 stack trace。

## 6. 驗收

- [x] 6.1 `bun run build` exit 0，產出 `dist/main.js` 1.36 MB 與 `dist/cli.js` **2670 bytes**（門檻 10240）。`grep -ciE 'ink|react' dist/cli.js` = 0；`await import(mainUrl.href)` 保留 1 筆；對主程式的 static import 0 筆。
- [x] 6.2 偽造 `process.versions.node` 跑真實產物，五組皆 exit code = 1 且顯示中文訊息：

  | 版本 / platform | exit | 指引 |
  |---|---|---|
  | 20.20.2 / darwin | 1 | `brew install node@22` |
  | 20.20.2 / linux | 1 | `nvm install 22` |
  | 20.20.2 / win32 | 1 | `winget install OpenJS.NodeJS` |
  | 18.20.8 / darwin | 1 | `brew install node@22` |
  | 21.7.3 / darwin | 1 | `brew install node@22` |

- [x] 6.3 偽造 22.0.0：未觸發 guard（`版本過舊` 0 筆）、未走載入失敗分支（0 筆）、輸出 `┌ agent-sync` 標題代表 `main.js` 已載入並跑起 clack。**未驗**：執行環境非 TTY，止於已知的 `TTY initialization failed`，未實際看到 picker 選項；`script` 分配 pty 的方式在加上 `--import` preload 後三次擷取皆為 0 bytes，已放棄該路徑。
- [x] 6.4 **最強證據**：把 `dist/main.js` 完全移走後，以偽造 Node 20 執行 launcher，仍正常輸出中文升級指引 —— 主程式檔根本不存在也不影響版本檢查，證明版本不符時 `main.js` 自始未被觸碰。
- [x] 6.5 `bun test`：**63 pass / 0 fail**（11 個檔案、232 expect），涵蓋 `runtime-check` 與 `runtime-guide` 的 13 個測試，全專案測試未因拆檔退化。
- [x] 6.6 `bun run smoke` exit 0，兩個產物皆 PASS；刻意在 `dist/main.js` 插入解不到的 import 後 exit code = 1（見 4.2 的盲區實證）。
- [x] 6.7 `bun run type-check`（`tsc --noEmit`）exit 0。

## 7. 收尾

- [x] 7.1 已更新 `detect-runtime-and-guide/tasks.md` 6.1：原殘留風險段落改標為「已由 `split-preflight-from-bundle` 收斂」，並記錄收斂方式與實證。
- [x] 7.2 產物已重建。**發現一個會弄壞發佈的陷阱**：`dist/main.js` 目前是 **untracked**（`git ls-files dist/main.js` = 0 筆），`dist/` 未被 gitignore，但既有 repo 只追蹤過 `dist/cli.js`。若 commit 時只帶已追蹤檔案（如 `git commit -a` 或 `git add -u`），會 push 出一個「launcher 去 import 一個 repo 裡不存在的 main.js」的狀態，`npx github:` 對所有使用者直接壞掉。**commit 時必須顯式 `git add dist/main.js`。**
