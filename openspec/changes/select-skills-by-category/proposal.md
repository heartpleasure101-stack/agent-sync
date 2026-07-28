## Why

`selectClients()` 在 `src/cli.tsx:145-186` 讓使用者針對 client（Claude / Codex / Gemini …）逐次選擇，但技能（skills）的處理是「整包」— `getMappings()` 在 `src/core/mappings.ts:86-103` 一律把 canonical `skills/` 目錄整體 symlink 到每個 client。實務上 `.agents/skills/` 已依用途分成 `01_Coding`、`02_WordProcessing`、`03_Medie` 三個分類，不同專案只用得到其中一小撮技能，卻被迫全部載入，浪費使用者的技能搜尋成本，也讓每個 client 的 `skills/` 目錄比預期更雜。

我們要讓 client 選完之後，多一層「分類 → 技能」的挑選流程，並在多選畫面提供「全部選取 / 全部取消」兩個快捷選項，維持與 client picker 同樣的手感。

## What Changes

- 在 `run()`（`src/cli.tsx:291-370`）client 選完之後、進入主循環之前，新增一段互動：先選分類（多選），再對「聯集後的候選 skill」做多選，並提供「Select all / Deselect all」兩個 pseudo-option。
- 新增 `src/core/list-skills.ts`：讀 canonical `skills/` 目錄，回傳 `{ category: string | null, name: string, dir: string }[]`；分類 = `skills/` 直屬子目錄名（例：`01_Coding`），若某個 skill 直接放在 `skills/` 底下（沒有分類層）則 `category: null`。
- 修改 `getMappings()` 的 `skills` mapping：不再把 `skills/` 目錄整體 link 過去，改成把使用者選中的每一個 skill dir 個別 link 到 `<clientRoot>/skills/<skill-name>`（分類名不會出現在 client 端，維持平坦）。
- 沿用 `required: true`；未選任何 skill 時 apply 不會對 skills 產生任何 change。
- 在主循環的 `Overview` 顯示目前選中的技能數（例：`Skills: 3 / 21 across 2 categories`），並在 action list 新增 `Change skills`（配置改變後可重挑）。

## Capabilities

### New Capabilities
- `skill-selection-ux`：互動選擇 canonical `skills/` 底下要 link 給 client 的技能，含分類瀏覽、全選 / 全不選快捷、以及在主循環顯示與再選擇。

### Modified Capabilities
- `client-selection-ux`：不修改語意，但 `run()` 內兩段選擇的順序被明確定義為「先 client、再 skill」，並在主循環新增 `Change skills` 動作與 `client-selection-ux` 的 `Change clients` 並列。

## Impact

- `src/cli.tsx` — `run()` 新增 skill 挑選流程；新增 `selectSkills()`、`Change skills` 動作；`Overview` 顯示 skill 統計。
- `src/core/list-skills.ts`（新）— 純函式，列 canonical skills 及其分類。
- `src/core/mappings.ts` — `skills` mapping 由「單一目錄 link」改成「多個個別 skill link」，需接收 `selectedSkills: string[]` 參數（skill name 陣列）；未提供時維持舊行為（整包 link），保留 CLI 以外呼叫者的向後相容。
- `src/core/plan.ts` / `src/core/migrate.ts` — 不改語意，但 `mappings` 展開後 targets 會變成多個 file/dir 條目，需確認 plan、migrate、backup 的 loop 仍正確（預期成本：閱讀、加測試，不改函式簽名）。
- 測試：`tests/list-skills.test.ts`（新）、擴充 `tests/mappings.test.ts`（若存在）驗證選 subset 後 targets 正確。
- 無新增 runtime 依賴。
- 現有 symlink 在切換行為時會有一次性「舊的目錄 symlink → 新的個別 skill symlink」的 conflict：交由既有的 `undo` / `overwrite conflicts` 流程處理，不寫特殊 migration。
