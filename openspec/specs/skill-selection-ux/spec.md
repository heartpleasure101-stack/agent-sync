# skill-selection-ux Specification

## Purpose
規範 canonical `skills/` 的挑選體驗：以單一 tabbed picker 呈現分類，選擇為 session-scoped 且不持久化，並確保 mapping 層能接收選定結果。

## Requirements
### Requirement: Client-side layout stays flat

被選中的 skills SHALL 以扁平佈局呈現在 client 端，即 `<clientRoot>/skills/<skill-name>`；分類目錄名 MUST NOT 出現在任何 client 端路徑上。

#### Scenario: 選了跨兩個分類的 3 個 skills，apply 給 claude 與 gemini
- **WHEN** 使用者選中 `01_Coding/openspec-propose`、`01_Coding/git-smart-commit`、`03_Medie/audio-to-srt`
- **THEN** apply 後：
  - `~/.claude/skills/openspec-propose`、`~/.claude/skills/git-smart-commit`、`~/.claude/skills/audio-to-srt` 三個 symlink 存在
  - `~/.gemini/skills/openspec-propose`、`~/.gemini/skills/git-smart-commit`、`~/.gemini/skills/audio-to-srt` 三個 symlink 存在
- **AND** `~/.claude/skills/01_Coding` 與 `~/.gemini/skills/03_Medie` 這類分類目錄名 MUST NOT 出現於任一 client 端

#### Scenario: skill 名衝突（不同分類同名）
- **WHEN** canonical 存在 `01_Coding/foo` 與 `03_Medie/foo`，兩者都被選中
- **THEN** plan 階段以 `conflict` 呈現 `<clientRoot>/skills/foo`（因兩個 source 對應同一 target）
- **AND** 系統 MUST NOT 靜默取其一覆蓋另一個
- **AND** 使用者可透過既有的 `Apply changes + overwrite conflicts` / `Undo last change` 流程處理

### Requirement: Session-scoped, non-persistent selection

Skill 選擇 SHALL 僅存活於當前 CLI session。重新啟動 CLI 時系統 MUST 重新詢問，不 SHALL 從任何檔案讀入上次選擇。

#### Scenario: 重啟 CLI
- **WHEN** 使用者離開 CLI 並重新執行
- **THEN** skill picker 重新出現，初始為空選（等同 client picker 的一致性）

### Requirement: Overview 反映已選 skills

主循環的 `Overview` note SHALL 顯示當前選中的 skill 數與可用總數，並在分類 ≤ 3 時列出分類名。

#### Scenario: 選 3 個分類共 12 個 skills
- **WHEN** 使用者選中 `01_Coding, 02_WordProcessing, 03_Medie` 底下共 12 個 skills，總可用 21
- **THEN** Overview 顯示例如 `Skills: 12 / 21 · Categories: 01_Coding, 02_WordProcessing, 03_Medie`

#### Scenario: 選超過 3 個分類
- **WHEN** 使用者選中 4 個以上分類
- **THEN** Overview 僅顯示分類數（例：`Skills: 15 / 21 · Categories: 4`），不逐一列名

### Requirement: Empty canonical skills 不阻塞

canonical `skills/` 目錄不存在或為空時，skill 挑選流程 SHALL 回傳空陣列而不 throw，並 SHALL 讓使用者仍能正常進入主循環處理 commands / hooks / AGENTS.md。

#### Scenario: canonical 沒有 skills 目錄
- **WHEN** canonical `skills/` 不存在
- **THEN** `selectSkills()` 直接回傳 `[]` 並用 `note` 提示「未偵測到任何 canonical skill」
- **AND** 主循環照常運作，`skills` mapping 不產生任何條目

### Requirement: Mapping 層可接收 selectedSkills

`getMappings()` 的選項 SHALL 支援 `selectedSkills?: string[] | null` 欄位：
- `undefined` 或 `null` → 維持舊行為（把整個 canonical `skills/` 目錄當一條 mapping link 過去）
- 陣列（包含空陣列） → 改採「per-skill mapping」展開；未列入的 skill 不進 mapping
- 空陣列 → 該次不產生任何 `skills` mapping 條目

#### Scenario: 未傳 selectedSkills（向後相容）
- **WHEN** 呼叫端沒有傳 `selectedSkills`
- **THEN** `skills` mapping 仍是一條，`source = canonical/skills`, `targets = 每個勾選 client 的 skills 目錄`

#### Scenario: 傳入 selectedSkills 陣列
- **WHEN** 傳入 `selectedSkills: ['openspec-propose', 'audio-to-srt']`
- **THEN** `skills` mapping 被展開為兩條 mapping（各對應一個 skill）；每條的 `targets` 是每個勾選 client 的 `<clientRoot>/skills/<name>`
- **AND** 未列入的 skill 不出現在任何 mapping

#### Scenario: 傳入空陣列
- **WHEN** 傳入 `selectedSkills: []`
- **THEN** `getMappings()` 回傳結果中不包含任何 `name === 'skills'` 的 mapping


### Requirement: Tabbed skill picker

Skill 挑選 SHALL 以「tab bar + per-tab multi-select」的一頁式互動呈現，取代原先「分類 multi-select → 聯集 skill multi-select」的兩步流程與 `Select all` / `Deselect all` pseudo-option。每個分類 = 一個 tab，使用者以方向鍵在 tab 間切換；每個 tab 內獨立記住當前 skill 勾選狀態；`Enter` 送出時把所有 tab 已勾的 skill dir 攤平聯集回傳。

#### Scenario: Tab bar 呈現所有分類與已勾統計
- **WHEN** picker 開啟且 canonical `skills/` 底下有至少一個分類目錄
- **THEN** 頂端顯示一列 tabs，每個 tab 標籤為 `<CategoryName> (<selectedInTab>/<totalInTab>)`
- **AND** 若同時存在 uncategorized skill，最右邊多一個 tab `(uncategorized)`（label 用固定字串，非分類目錄名）
- **AND** 當前 tab 以反白樣式呈現

#### Scenario: 方向鍵切換 tab
- **WHEN** 使用者按 `←` 或 `Shift+Tab`
- **THEN** 當前 tab 切到前一個（第一個 tab 時 wrap 到最後）
- **WHEN** 使用者按 `→` 或 `Tab`
- **THEN** 當前 tab 切到下一個（最後 tab 時 wrap 到第一個）
- **AND** 切 tab 不會影響任何 tab 內已勾的狀態

#### Scenario: 在 tab 內 toggle skill
- **WHEN** 使用者按 `↑` / `↓` 移動 focus 到某個 skill 列
- **AND** 按 `Space`
- **THEN** 該 skill 的勾選狀態 toggle
- **AND** 對應 tab 的 `(selected/total)` badge 立即更新

#### Scenario: Select all / Deselect all 快捷
- **WHEN** 使用者按 `a`
- **THEN** 當前 tab 內所有 skill 被加入該 tab 的已勾集合
- **WHEN** 使用者按 `d`
- **THEN** 當前 tab 的已勾集合被清空
- **AND** 這兩個動作僅影響當前 tab，其它 tab 的狀態不變

#### Scenario: 送出
- **WHEN** 使用者按 `Enter` 且至少一個 tab 有勾選
- **THEN** picker 結束，回傳所有 tab 已勾 skill dir 的聯集（去重、順序依 tab 順序 → tab 內 entry 原順序）

#### Scenario: 空選送出被擋
- **WHEN** 使用者按 `Enter` 但所有 tab 都無勾選
- **THEN** picker 不結束、不呼叫 submit callback
- **AND** footer 顯示紅字提示至少要選 1 個 skill（等同 `required: true` 語意）

#### Scenario: 取消
- **WHEN** 使用者按 `Esc` 或 `Ctrl+C`
- **THEN** picker 結束，走既有 `exitCancelled()` 流程（process.exit(0)）

### Requirement: 只有 uncategorized skill 時的行為

當 canonical `skills/` 底下只有 uncategorized skill（沒有任何分類目錄），系統 SHALL 只顯示一個 tab `(uncategorized)`，其它互動規則不變。

#### Scenario: 純扁平 canonical
- **WHEN** canonical `skills/` 底下只有含 `SKILL.md` 的直接子目錄、沒有分類目錄
- **THEN** tab bar 只有 `(uncategorized)` 一個 tab
- **AND** 使用者仍可用 `↑`/`↓` + `Space` 選、`a`/`d` 全選 / 全不選、`Enter` 送出
