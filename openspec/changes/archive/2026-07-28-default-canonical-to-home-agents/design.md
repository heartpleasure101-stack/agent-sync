## Context

`resolveRoots()` 目前把 project scope 的 `canonicalRoot` 硬綁 `projectRoot/.agents`（`src/core/paths.ts:50`）。實務上使用者對每個新專案手動 `ln -s ~/.agents .agents`，讓所有專案共用同一份 skill/command/hook 本源。這是普遍模式，不是邊緣用法。

Client folder（`.claude`、`.gemini`、`.codex`…）落在 `projectRoot/*` 是 project scope 的核心意義（見 `paths.ts:51-58`），這一層不動。要動的只有「本源從哪讀」。

## Goals / Non-Goals

**Goals:**
- Project scope 預設從 `~/.agents/` 讀本源，免除 ln -s 儀式。
- `~/.agents/` 不存在時提供互動 fallback（建立、指定其它路徑、取消）。
- 保留使用者本次 session 指定其它 canonical 路徑的能力。
- Global scope 行為完全不變。

**Non-Goals:**
- 不引入設定檔或持久化 canonical override（維持與 skill selection 一致的 non-persistent 原則）。
- 不做既有 `專案/.agents/` 資料的自動 migration（提示即可，實體搬移由使用者決定）。
- 不新增 CLI flag（例如 `--source`）— 留給後續 change 若需要 CI/scripting 場景再處理。

## Decisions

### D1：預設值直接改，不加 legacy flag

`paths.ts:50` 由 `path.join(projectRoot, '.agents')` 改為 `path.join(homeDir, '.agents')`。

**為什麼：** 既有專案裡若已有 `專案/.agents/` symlink 指向 `~/.agents/`，改預設之後 dotagents 直接讀 `~/.agents/`，結果**完全一樣**（symlink 只是同路徑的別名）。若 `專案/.agents/` 是實體資料夾（少見），使用者本來就沒共用，會被 fallback prompt 接住（見 D3）。

**替代方案：** 加 `--legacy-project-canonical` flag 保留舊行為。**否決：** 沒真實使用者需要，徒增複雜度。

### D2：`canonicalOverride` 貫穿 API

`RootOptions` 增加 `canonicalOverride?: string`。`resolveRoots()` 若收到此參數，project scope 的 `canonicalRoot` 用它，其餘欄位不變。`mappings.ts`、`list-skills.ts`、`migrate.ts`、`status.ts` 沿用 `RootOptions`，透明傳遞。

**為什麼：** 一處決定（cli-main.tsx 啟動 prompt），全域生效。避免各層各自判斷 override，狀態發散。

### D3：Fallback prompt 時機與選項

**時機：** `cli-main.tsx` 進入主流程前、`buildLinkPlan` 之前，先呼叫 `ensureCanonical()`：
1. 若 `~/.agents/` 存在（資料夾或 symlink 且能解析），直接使用，不 prompt。
2. 若不存在，跳 prompt：
   - `建立 ~/.agents/`（預設）→ `mkdir` 後使用。
   - `指定其它資料夾`（輸入絕對路徑）→ 驗證存在且可讀 → 作為當次 `canonicalOverride`。
   - `取消`→ `process.exit(0)`，不做任何動作。

**為什麼：** 集中於 CLI 入口，`core/` 層維持純函數。prompt 只在真的沒有時才出現，避免騷擾常態使用者。

### D4：不記憶使用者選擇

Session-only，重啟 CLI 若 `~/.agents/` 仍不存在，重新 prompt。

**為什麼：** 與 `skill-selection-ux` 的 `Session-scoped, non-persistent selection` 原則一致。若使用者長期想用 `~/Developer/.agents`，正確做法是把它 `ln -s ~/.agents` 或直接搬過去，而不是讓 CLI 記住偏好、隱藏實際路徑。

## Risks / Trade-offs

- **[Risk] 既有專案內是實體 `專案/.agents/` 資料夾（非 symlink）** → 改預設後 CLI 讀 `~/.agents/`，該實體資料夾內容變成孤兒。
  **Mitigation：** `ensureCanonical()` 偵測 `process.cwd()/.agents` 存在且為實體目錄時，額外 hint「偵測到 `專案/.agents/` 實體資料夾，新版預設讀 `~/.agents/`，如需保留請手動搬移或建立 symlink」。不阻擋流程。

- **[Risk] 測試假設 canonical = projectRoot/.agents** → grep `tests/` 需系統性檢視。
  **Mitigation：** 明列於 tasks，寫測試前先 `grep -rn "\.agents" tests/`。

- **[Trade-off] 少了「專案私有 skill pool」能力** → 現在單一使用者的實際流程本來就沒用到（都 ln -s 到 `~/.agents/`），視為可接受。未來若需要，再開新 change 加 `--source` flag。

## Migration Plan

1. Release notes 明示 BREAKING：project scope canonical 預設變更。
2. 首次啟動偵測 `process.cwd()/.agents` 為實體目錄時，印一次 migration hint（見 Risk mitigation）。
3. 不提供自動搬移腳本；文件示範 `rsync -a 專案/.agents/ ~/.agents/ && rm -rf 專案/.agents`。

## Open Questions

- 是否要對「`專案/.agents/` 是實體目錄」的情境提供 `Undo` 支援？暫定不做（既有 undo 機制針對 link，非資料搬移）。
