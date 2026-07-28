## ADDED Requirements

### Requirement: Skill picker follows client picker

在互動 CLI 中，使用者選完 clients 之後、進入主循環之前，系統 SHALL 呈現一段獨立的技能挑選流程；挑選結果決定該次 session 有哪些 skills 會被 link 到選中的 clients。

#### Scenario: 選完 clients 之後進入 skill 挑選
- **WHEN** 使用者在 `selectClients()` 送出至少一個 client
- **THEN** CLI 進入 skill 挑選流程，不直接進入主循環
- **AND** 此流程可產生一個 `string[]`（selected skill names），為主循環後續 status / plan / apply 使用

#### Scenario: 使用者從主循環重新挑選 skills
- **WHEN** 使用者在主循環選擇 `Change skills` 動作
- **THEN** 進入與初次相同的 skill 挑選流程
- **AND** 送出後主循環下一輪立即反映新的選擇（Overview 統計、Plan changes / conflicts）

### Requirement: Category-first browsing

當 canonical `skills/` 目錄底下存在「分類目錄」（一階子目錄，其本身不含 `SKILL.md`），系統 SHALL 先讓使用者以 multiselect 挑選一個或多個分類，再進入 skill 挑選畫面。

分類 = canonical `skills/` 的一階子目錄，且該目錄本身沒有 `SKILL.md`；有 `SKILL.md` 的一階子目錄視為「無分類的 skill」。

#### Scenario: 混合結構 — 有分類、也有根層 skill
- **WHEN** canonical `skills/` 底下同時存在分類目錄（如 `01_Coding/`）與直接 skill 目錄（如 `git-branch-name/SKILL.md`）
- **THEN** 分類 picker 只列出分類目錄
- **AND** 無分類的 skill 一定會出現在後續 skill picker（不需經分類挑選即可勾）

#### Scenario: 全部 skill 都在根目錄（沒有分類）
- **WHEN** canonical `skills/` 底下沒有任何分類目錄
- **THEN** 系統跳過分類 picker，直接進入 skill picker

#### Scenario: 使用者未選任何分類
- **WHEN** 分類 picker 出現，使用者嘗試 submit 空選擇
- **THEN** 分類 picker 以 `required: true` 擋住，維持在同一步驟

### Requirement: Skill multiselect with select-all / deselect-all

Skill 挑選畫面 SHALL 以 multiselect 呈現，且 SHALL 在選項清單頂端提供兩個 pseudo-option：`Select all` 與 `Deselect all`。命中 pseudo-option 時，系統 MUST NOT 立刻結束 picker，而是以對應的初始集合重跑同一個 picker，讓使用者可再調整後才真正 submit。

#### Scenario: 使用者選 Select all 後 submit
- **WHEN** 使用者勾選 `Select all` pseudo-option 並 submit
- **THEN** 系統以「當前 picker 內所有非 pseudo skill options 全部勾中」為 initial 值重新開啟同一個 picker
- **AND** 使用者可繼續取消部分再 submit

#### Scenario: 使用者選 Deselect all 後 submit
- **WHEN** 使用者勾選 `Deselect all` pseudo-option 並 submit
- **THEN** 系統以空集合為 initial 值重新開啟同一個 picker

#### Scenario: 使用者同時勾了 Select all 與 Deselect all
- **WHEN** 一次 submit 中同時包含兩個 pseudo-option
- **THEN** 以 options 陣列中「後出現者」為準（`Deselect all` 位於 `Select all` 之後 → 以 deselect 為準）
- **AND** picker 重新開啟

#### Scenario: 一般 submit（無 pseudo-option）
- **WHEN** 使用者只勾了真實 skill options 並 submit
- **THEN** picker 結束，回傳勾選的 skill `name` 陣列（不含分類前綴、不含 pseudo-option）

#### Scenario: `required: true` 語意
- **WHEN** 使用者真正 submit 且選中的 skill 陣列為空
- **THEN** picker 以 `required: true` 擋住（與 client picker 一致）
- **AND** 此規則不適用於 pseudo-option 觸發的內部 re-open（re-open 是行為切換，非 submit）

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

這條規則存在的目的是讓非 CLI 呼叫者（測試、未來的 script）可以選擇不啟用新語意。

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
