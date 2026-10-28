## Context

使用者的 Pi 設定為不載入 `~/.agents/skills/`，只讀 `~/.pi/agent/skills/`。Pi 的 skills 文件（套件 `@earendil-works/pi-coding-agent@0.84.2` 的 `docs/skills.md` 第 25–41 行）列出的預設位置是：global `~/.pi/agent/skills/` 與 `~/.agents/skills/`，project `.pi/skills/` 與 `.agents/skills/`。AGENTS.md 的載入位置是 `~/.pi/agent/`、父目錄、目前目錄（pi.dev 首頁與 Pi README），清單裡沒有 `~/.agents/`。

agent-sync 現有 9 個 client，每個 client 的路徑散在多個檔案：

- `src/core/paths.ts`：`ResolvedRoots`，global 與 project 各一份
- `src/core/skill-roots.ts`：skills 目錄，註解說明它被 `getMappings()`（寫）與 `scanInstalledSkills()`（讀）共用，避免兩邊漂移
- `src/core/mappings.ts`：`agentTargets`（AGENTS.md）、commands、hooks 的落點，以及第 70 行預設 client 清單
- `src/core/detect-installed.ts`、`src/core/status.ts`、`src/core/migrate.ts`、`src/cli-main.tsx`：各自寫死一份 client 清單

上一個 change（`handle-broken-client-skill-links`）已讓 client skills 根目錄是 broken symlink 時，在 plan 階段攔截為 `blocked-root`。Pi 只要走 `getSkillRoots()`，應該自動獲得這個保護，這點在 tasks 裡驗證，不假設。

## Goals / Non-Goals

**Goals:**
- 使用者在 agent-sync 勾選 `pi` 後，勾選的 skills 出現在 `<piRoot>/skills/`，global 的 `AGENTS.md` 出現在 `~/.pi/agent/AGENTS.md`。
- 偵測、狀態、migration、選單、README 都認得 Pi，不留下只有部分功能支援的狀況。
- 沿用現有 symlink、備份、undo 機制，不新增任務類型。

**Non-Goals:**
- 不連 commands 到 `~/.pi/agent/prompts/`：Pi prompt template 格式與 canonical `commands/` 是否相容尚未確認。
- 不連 hooks：Pi 使用 TypeScript extensions，格式不同。
- 不讀寫 Pi 的 `settings.json`，不替使用者排除 `~/.agents/skills/`。
- 不把 client 清單重構成資料表（先前討論的方案 B）。目前只多一個 client，重構的好處要等第二個新 client 才出現。

## Decisions

**1. `piRoot` 跟著 scope 變：global `~/.pi/agent`，project `<projectRoot>/.pi`**

Pi 文件中 global 與 project 的 skills 路徑分別是 `~/.pi/agent/skills/` 與 `.pi/skills/`，差一層 `agent`。`paths.ts` 的 global 與 project 兩段本來就各自給每個 client 一個根目錄，所以 `piRoot` 在兩段各給一個值即可，`skill-roots.ts` 不需要像 opencode 那樣開特例。
- 替代方案：global 用 `~/.pi`，再在 `skill-roots.ts` 補 `agent/`。否決，因為偵測是看根目錄存不存在，`~/.pi` 也可能只放 `trust.json` 之類的東西而 Pi 不是主要使用者，用 `~/.pi/agent` 判斷較貼近「Pi 有設定過」。這個判斷是推測，未實測。

**2. AGENTS.md 只在 global scope 連，與現有 `agent-sync` 行為一致**

`mappings.ts` 的 `includeAgentFiles` 只在 global 為真。Pi 加進 `agentTargets` 後自動遵守。來源檔是 canonical 的 `AGENTS.md`，不是 `CLAUDE.md`，因為 `~/.claude/CLAUDE.md` 是 Claude 專用內容。
- 替代方案：Pi 也在 project scope 連 `.pi/AGENTS.md`。否決，Pi 本來就會從 cwd 往上找 `AGENTS.md`，現有 client 也沒有 project 層的 AGENTS.md 連線。

**3. 只做 skills 與 AGENTS.md，其餘留給後續 change**

commands 與 hooks 的格式相容性未驗證，硬連可能讓 Pi 載入壞掉的檔案。範圍小才能在實作後真的用 Pi 驗證一次。

**4. 每個既有清單都補，並用測試鎖住**

因為有 4 份各自寫死的 client 清單，實作時對 `antigravity` 做 grep，逐一對照。tasks 內放一個測試：所有 `Client` 值都出現在 `CLIENT_ORDER`，避免日後再漏。

## Risks / Trade-offs

- [漏改某一份 client 清單，Pi 在某個功能看不到] → 以 `grep -rn antigravity src` 當 checklist，並加一個「`CLIENT_ORDER` 涵蓋全部 `Client`」的測試。
- [Pi 無法正常載入 symlink 目錄的 skill] → 實作完用真的 Pi 手動驗證一次，結果寫回 tasks。
- [使用者已有 `~/.pi/agent/AGENTS.md` 實體檔] → 走現有的 conflict 處理與備份，不另外特殊處理，測試驗證該路徑。
- [project scope 的 `.pi/skills/` 需要 Pi 先信任該專案] → agent-sync 無法控制，只在 README 註明。
- [`~/.pi/agent` 不存在的新使用者] → 偵測不會勾選 Pi，使用者可手動勾選；連線時 `ensureDir` 會建立父目錄（`apply.ts:37`，行為待測試確認）。

## Migration Plan

純新增，既有使用者升級後不需任何動作。既有 9 個 client 的路徑與行為不變。回復方式：現有的 backup / undo。

## Open Questions

- Pi 的 prompt template 是否可直接使用 canonical `commands/` 的檔案？決定後可另開 change 加入。
- 偵測依據用 `~/.pi/agent` 是否合適？需用實際裝過 Pi 的機器確認該目錄在安裝後就會存在。
