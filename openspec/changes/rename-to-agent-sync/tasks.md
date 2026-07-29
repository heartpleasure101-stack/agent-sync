## 1. 原始碼字串

- [x] 1.1 `src/cli-main.tsx:21`：`const appTitle = 'dotagents'` → `'agent-sync'`。
- [x] 1.2 `src/preflight/runtime-guide.ts:24`：`'✖ Node.js 版本過舊，dotagents 無法啟動'` → `agent-sync`。
- [x] 1.3 `src/preflight/runtime-guide.ts:36`：`'    $ npx github:heartpleasure101-stack/dotagents'` → `.../agent-sync`。
- [x] 1.4 驗收：`grep -rIn "dotagents" src` 回 0 筆。

## 2. package.json

- [x] 2.1 `name`：`@dean9703111/dotagents` → `agent-sync`（unscoped；`npm view agent-sync version` 已確認為 `E404`）。
- [x] 2.2 `bin`：key `dotagents` → `agent-sync`，value `dist/cli.js` 不變。
- [x] 2.3 不改 `version`（0.1.11）、不改 `description` 中的 `.agents`（那是資料目錄，正確）。
- [x] 2.4 `bun run type-check` 通過。

## 3. Build + smoke

- [x] 3.1 `bun run build` 產出新 `dist/cli.js`。
- [x] 3.2 驗收：`grep -c "dotagents" dist/cli.js` 回 0（改前為 3）。
- [x] 3.3 `bun run smoke` exit code 0。
- [x] 3.4 `bun test` 全綠。

## 4. 測試與註解字串

- [x] 4.1 `tests/linking.test.ts` 16 處 `makeTempDir('dotagents-*')` → `agent-sync-*`。
- [x] 4.2 `tests/migrate.test.ts` 5 處、`tests/undo.test.ts` 1 處、`tests/ensure-canonical.test.ts` 1 處同上。
- [x] 4.3 `tests/runtime-guide.test.ts` 1 處：若斷言字串含 `dotagents`，同步改（會被 1.2 / 1.3 影響）。
- [x] 4.4 `build.mjs:1` 註解、`.gitignore:7` 註解中的 URL。
- [x] 4.5 `bun test` 再跑一次全綠。

## 5. README

- [x] 5.1 標題 `<h1>dotagents</h1>` → `agent-sync`，副標同步（`README.md:2-3`）。
- [x] 5.2 全部 `heartpleasure101-stack/dotagents` URL → `heartpleasure101-stack/agent-sync`（含 actions badge、LICENSE 連結、One-Liner 指令、bunx 指令）。
- [x] 5.3 第 1 節的 ASCII demo 方塊內 `dotagents — 請選擇要設定的 AI 助手` → `agent-sync`。
- [x] 5.4 第 4 節「Zero-npm Deployment」段的 `npx github:owner/repo` 說明保持通用敘述，確認無殘留舊名。
- [x] 5.5 移除 `README.md:6` 的 build-passing badge（`find .github -type f` 只有 `FUNDING.yml`，無 CI 可佐證）。
- [x] 5.6 新增上游 credit 段落於第 5 節 License 附近：說明本專案衍生自 `iannuttall/dotagents`（MIT），版權宣告保留於 `LICENSE`。
- [x] 5.7 **不改** README 中所有 `.agents/`、`~/.agents/`、`.agents/backup/` 字樣（資料目錄約定）。

## 6. npm 佔名（**待使用者拍板，未拍板則跳過整節**）

- [ ] 6.1 確認 `agent-sync` 仍為 `E404`。
- [ ] 6.2 `npm publish --access public` 發佈 0.1.11。
- [ ] 6.3 README 安裝指令補上 `npx agent-sync` 短版。

## 7. openspec 規格同步

- [x] 7.1 `openspec/specs/publishable-cli-artifact/spec.md`：URL 改為 `agent-sync`。
- [x] 7.2 `openspec/specs/canonical-source-resolution/spec.md`、`openspec/specs/client-selection-ux/spec.md`：同上。
- [x] 7.3 **不改** `openspec/changes/archive/` 下 7 處（歷史紀錄）。
- [x] 7.4 `docs/plans/frontmatter-rewrite.md` 6 處：若為現行計畫則改，若為歷史紀錄則保留（實作時判斷）。
- [x] 7.5 驗收：`grep -rIn "heartpleasure101-stack/dotagents" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=archive .` 回 0 筆。

## 8. Commit + push（改名前）

- [x] 8.1 `git add` 全部改動（含 `dist/cli.js`）。`git ls-files dist/cli.js` 有追蹤，`grep -c dotagents dist/cli.js` = 0。
- [x] 8.2 commit message：~~`refactor(naming): rename dotagents to agent-sync`~~ → 實際改為依功能拆成多個 conventional commit（`docs(naming)` / `docs(readme)` / `test(naming)` / `chore(project)`），經 PR #9 merge 為 `7807878`。單一 commit 的原計畫未採用。
- [x] 8.3 push 到 `origin/main`。`git rev-parse HEAD origin/main` 同為 `7807878`，`git log origin/main..HEAD` 無輸出。

## 9. 需要真人做的操作

- [x] 9.1 GitHub → Settings → Repository name → 改為 `agent-sync`。（間接佐證：`git fetch origin main` 對 `agent-sync.git` 成功，代表遠端 repo 已存在於新名稱下。）
- [x] 9.2 `git remote set-url origin https://github.com/heartpleasure101-stack/agent-sync.git`，`git remote -v` 確認 fetch/push 皆已指向 `agent-sync.git`。
- [ ] 9.3 實跑 `npx github:heartpleasure101-stack/agent-sync`，確認進得了 scope picker、標題顯示 `agent-sync`。
- [ ] 9.4 實跑舊 URL `npx github:heartpleasure101-stack/dotagents`，確認 GitHub redirect 仍可用（記錄結果，作為過渡期公告依據）。
- [ ] 9.5 決定 npm 佔名（第 6 節）要不要做。
