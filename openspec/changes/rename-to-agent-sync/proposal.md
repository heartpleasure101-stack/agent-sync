## Why

專案目前叫 `dotagents`，跟兩個東西撞在一起：

1. **上游血緣**：`git log --reverse` 顯示最早 5 個 commit 全部來自 `ian nuttall <6681919+iannuttall@users.noreply.github.com>`，`LICENSE` 第 3 行是 `Copyright (c) 2026 Ian Nuttall`。這個 repo 是 `iannuttall/dotagents` 的衍生，但 `README.md` 全文沒有一處提到上游。
2. **npm 命名混亂**：`npm view @dean9703111/dotagents time --json` 顯示該套件存在且最後發佈於 2026-04-17（0.1.11），但 `git remote -v` 的 owner 是 `heartpleasure101-stack`。`package.json` 的 `name` 掛在一個對不上的 scope 下。

同時 `dotagents` 這名字描述不到工具實際做的事。`ls .agent` 有 `skills` 與 `workflows` 兩類；`src/core/` 有 `ensure-canonical.ts`、`migrate.ts`、`paths.ts`；`README.md:129` 描述自動備份與 undo。真正的賣點是「單一本源 + symlink 同步 + 可還原」，不是「一堆 agent 設定檔」。

改名為 **`agent-sync`**：語意涵蓋 symlink 同步，且 `npm view agent-sync version` 回 `E404`（unscoped 名字目前無人佔用）。

## What Changes

- **GitHub repo 改名**：`heartpleasure101-stack/dotagents` → `heartpleasure101-stack/agent-sync`（GitHub 自動保留舊網址 redirect）。
- **修改 `package.json`**：`name` 改為 `agent-sync`；`bin` key 由 `dotagents` 改為 `agent-sync`。
- **修改 `src/cli-main.tsx:21`**：`const appTitle = 'dotagents'` → `'agent-sync'`。
- **修改 `src/preflight/runtime-guide.ts`**：第 24 行錯誤訊息中的 `dotagents`、第 36 行的 `npx github:heartpleasure101-stack/dotagents`。
- **修改 `README.md`**：8 處 `dotagents`，含標題、badge URL、安裝指令。
- **修正 README 假 badge**：`README.md:6` 的 build badge 指向 `/actions`，但 `find .github -type f` 只有 `FUNDING.yml`，沒有任何 workflow。移除或改為誠實的靜態說明。
- **新增上游 credit**：README 加一段標示衍生自 `iannuttall/dotagents`（MIT）。
- **重新 build dist**：`grep -c "dotagents" dist/cli.js` = 3，且 `git ls-files dist` 顯示 `dist/cli.js` 有進版控，必須 rebuild + commit。
- **修改測試暫存目錄前綴**：`tests/linking.test.ts` 16 處、`tests/migrate.test.ts` 5 處等的 `makeTempDir('dotagents-*')`。
- **修改註解**：`build.mjs:1`、`.gitignore:7`。
- **openspec 歷史檔案**：12 處散落在 `openspec/specs/` 與 `openspec/changes/archive/`。archive 內的**不改**（歷史紀錄應保持原樣），`openspec/specs/` 下的主要規格檔要同步。

## Capabilities

### New Capabilities
- `project-identity`：專案對外識別（repo 名、套件名、CLI 指令名、應用標題）必須一致，且上游衍生關係必須在 README 中明示。

### Modified Capabilities
- `publishable-cli-artifact`：執行入口 URL 從 `github:heartpleasure101-stack/dotagents` 改為 `github:heartpleasure101-stack/agent-sync`。

## Impact

- **使用者可見的破壞**：既有使用者的 `npx github:heartpleasure101-stack/dotagents` 會走 GitHub redirect（短期可用，不保證長期）。已安裝 `bin` 的人指令名從 `dotagents` 變 `agent-sync`。
- **不影響資料**：`~/.agents/` 目錄約定不動（`grep -rIo "\.agents\?" src` 顯示 `ensure-canonical.ts` 7 處、`paths.ts` 2 處依賴它）。既有使用者無須搬家。
- **不影響 client 路徑**：`src/core/paths.ts:64` 的 `antigravityRoot: path.join(projectRoot, '.agent')` 是 Antigravity 自訂路徑，與本專案命名無關。
- 無新增 / 移除 runtime dependency。

## Non-Goals

- **不改 `~/.agents/` 目錄名**。那是資料本源約定，改了等於強迫所有既有使用者遷移。
- **不改 `.agent`（單數）**。那是 Antigravity client 的路徑。
- **不動 LICENSE 的版權宣告**。MIT 要求保留 `Copyright (c) 2026 Ian Nuttall`。
- **不改寫 `openspec/changes/archive/` 內的歷史檔案**。歷史應反映當時的事實。
- **不在本 change 決定是否發佈到 npm**。見 design.md 的 Open Questions。
