## Context

改名觸及四個獨立的命名層，它們目前全部叫 `dotagents`，但**不需要**全部同步改，也不該全部改：

```
Layer 1  GitHub repo 名        heartpleasure101-stack/dotagents   ← 改
Layer 2  npm package name      @dean9703111/dotagents             ← 改（scope 本來就錯）
Layer 3  bin / CLI 指令名       dotagents                          ← 改（使用者肌肉記憶，最痛）
Layer 4  資料目錄約定           ~/.agents/                         ← 不改
         client 自訂路徑        .agent（Antigravity）              ← 不改
```

依據：
- Layer 1 — `git remote -v` → `https://github.com/heartpleasure101-stack/dotagents.git`
- Layer 2 — `cat package.json` → `"name": "@dean9703111/dotagents"`；`npm view @dean9703111/dotagents time --json` 確認該套件在 npm 上真實存在
- Layer 3 — `cat package.json` → `"bin": { "dotagents": "dist/cli.js" }`
- Layer 4 — `grep -rIo "\.agents\?" src` → `ensure-canonical.ts` 7 處、`cli-main.tsx` 4 處、`migrate.ts` 2 處、`paths.ts` 2 處用 `.agents`；`paths.ts` 1 處用 `.agent`

把 Layer 4 跟前三層綁在一起改，是這次改名唯一真正的風險。必須明確切開。

## Goals / Non-Goals

**Goals：**
- Layer 1–3 統一為 `agent-sync`，對外識別一致。
- 既有 `~/.agents/` 使用者升級後零感知、零遷移。
- README 明示上游衍生關係，符合 MIT 精神。
- 順手移除 README 那個沒有 CI 撐腰的 build badge。

**Non-Goals：**
- 不做「舊指令名 `dotagents` 的 alias」相容層。
- 不做自動遷移腳本（沒有資料格式變動，不需要）。
- 不改 archive 內的歷史 openspec 檔案。

## Decisions

**1. 名字選 `agent-sync`，不選 `agentsync` / `Skill-Install`。**

| 候選 | npm 狀態（`npm view <name> version`） | 語意涵蓋 |
|---|---|---|
| `agent-sync` | `E404` — 可用 | symlink 同步 ✅ 備份還原 ✅ |
| `agentsync` | `0.2.0-alpha.23` — **已被佔用** | — |
| `Skill-Install` | 未查 | 只涵蓋 skills，漏掉 workflows、規則檔 fallback、undo |

`Skill-Install` 被否決的實質理由：`ls .agent` 顯示管的是 `skills` **和** `workflows`；`README.md:98-100` 顯示還管 `CLAUDE.md` / `GEMINI.md` / `AGENTS.md` 的 fallback 解析；`README.md:129` 顯示有 backup/undo。「Install」是單向動作，蓋不住「切換 / 還原 / 遷移」。

**2. `~/.agents/` 目錄名維持不變。Rejected 替代方案：一起改成 `~/.agent-sync/`。**

理由：那是**資料**，不是**產品**。改了要寫遷移腳本、要處理 symlink 指向、要處理備份目錄 `.agents/backup/`（`README.md:129`），而且既有使用者的每個專案 symlink 全部要重建。收益只有「名字整齊」。**Rejected**。

**3. npm 發佈策略：先只改 `package.json` 的 `name`，不發佈。**

現況是 zero-npm 路線 —— `.gitignore:7` 的註解明說「dist is committed so `npx github:...` works without a build step」，`git ls-files dist` 確認 `dist/cli.js` 進了版控。改名本身不需要碰 npm。

但 `agent-sync` 這個 unscoped 名字現在空著（`E404`），有先佔價值。這是獨立決策，見 Open Questions。

**4. `bin` key 改為 `agent-sync`，不留 `dotagents` alias。**

替代方案：`"bin": { "agent-sync": "dist/cli.js", "dotagents": "dist/cli.js" }` 雙 key 過渡。**Rejected** —— 這個工具的主要用法是 `npx github:owner/repo`（README 第 2 節的 One-Liner），不是全域安裝的長駐指令。留 alias 只是把舊名字的壽命拖長。

**5. `dist/cli.js` 必須 rebuild，不能手改。**

`grep -o "dotagents[^\"']\{0,40\}" dist/cli.js` 顯示 3 處，其中兩處來自 `src/preflight/runtime-guide.ts`（`'dotagents 無法啟動'` 與 npx URL），一處來自 `src/cli-main.tsx` 的 `appTitle`。改完 src 跑 `bun run build` 即可，手動編輯 bundle 會在下次 build 被覆蓋。

**6. openspec archive 不動，主 specs 動。**

`openspec/changes/archive/` 下 7 處 `dotagents` 是已封存變更的歷史紀錄，改了會讓歷史失真。`openspec/specs/` 下 3 處（`canonical-source-resolution`、`client-selection-ux`、`publishable-cli-artifact`）是現行規格，必須同步。

## Risks / Trade-offs

- **[GitHub redirect 不是永久保證]**：舊 URL `npx github:heartpleasure101-stack/dotagents` 在 GitHub 改名後會 redirect，但若日後有人重新建立同名 repo，redirect 立刻失效。緩解：改名後不要再建 `dotagents` 這個 repo 名。
- **[README 的一行安裝指令散在多處]**：`grep -rIo "heartpleasure101-stack/dotagents" | wc -l` = 14 處完整 URL。漏改一處，使用者就跑到 redirect 路徑。緩解：tasks 內用 `grep -rIn "heartpleasure101-stack/dotagents"` 做完工驗收，必須回 0 筆（archive 除外）。
- **[改名後 npm 上仍留著 `@dean9703111/dotagents@0.1.11`]**：那是舊發佈，改名不會讓它消失，有人可能繼續裝到舊版。緩解：不在本 change 範圍，但值得在 README 註明正式入口。
- **[測試暫存目錄前綴改動幅度大但零風險]**：21 處 `makeTempDir('dotagents-*')`，純字串，改錯最多是暫存資料夾名字怪，不影響斷言。

## Migration Plan

順序有相依性，不能任意調換：

```
1. 改 src/*        →  2. bun run build   →  3. bun test + type-check
                                                    │
4. 改 package.json / README / 註解 / openspec specs ─┘
                          │
5. commit + push（此時 repo 還叫 dotagents）
                          │
6. GitHub Settings → Rename repo → agent-sync
                          │
7. git remote set-url origin .../agent-sync.git
                          │
8. 驗證 npx github:heartpleasure101-stack/agent-sync 可跑
```

第 6 步之前先 push，是為了讓改名瞬間 repo 內容已經是新名字，避免中間狀態。

Rollback：GitHub 可改回舊名（redirect 反向仍有效），code 端 `git revert`。

## Open Questions

- **要不要趁 `agent-sync` 在 npm 還空著時先佔下來？** 佔了的好處是安裝指令從 `npx github:heartpleasure101-stack/agent-sync`（42 字元）縮到 `npx agent-sync`（14 字元）；代價是要維護發佈流程，且 `dist` 已經在版控裡，zero-npm 路線本來就跑得動。**建議：先佔名發一個 0.1.x，之後再決定要不要當主要通道。** 待使用者拍板，拍板前 tasks 第 6 節不執行。
- **README 的 build badge 移除還是補一個真的 CI？** `find .github -type f` 只有 `FUNDING.yml`。專案已有 `bun test`、`bun run type-check`、`bun run smoke` 三個可跑的檢查（依 `package.json` scripts），補一個 workflow 成本不高。本 change 先移除假 badge，補 CI 另開 change。
