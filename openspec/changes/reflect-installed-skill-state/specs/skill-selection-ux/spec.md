# skill-selection-ux Specification

## MODIFIED Requirements

### Requirement: Session-scoped, non-persistent selection

Skill 選擇的**初始狀態** SHALL 由磁碟實況決定：picker 開啟時對每個選定 client 的 skills 目錄做反向掃描，據此推導每個 skill 的初始勾選態。系統 MUST NOT 從任何設定檔、快取檔或前次 session 的記錄讀入選擇；狀態的唯一來源是磁碟上的 symlink。

使用者在 picker 內的**未送出修改**仍僅存活於當前 session：按 `Esc` 取消或未按 `Enter` 就離開，磁碟狀態不變。

#### Scenario: 重啟 CLI 且先前已安裝過

- **WHEN** 使用者先前已把 `01_Coding/git-smart-commit` 安裝到 `claude`
- **AND** 重新執行 CLI，scope 選 global、clients 選 `claude`
- **THEN** picker 開啟時該列顯示 `[x]`，而非 `[ ]`
- **AND** 系統 MUST NOT 讀取任何持久化的選擇檔案

#### Scenario: 未送出的修改不落地

- **WHEN** 使用者在 picker 內把某個 `[x]` 按成 `[ ]`
- **AND** 按 `Esc` 取消
- **THEN** 磁碟上該 symlink MUST 仍然存在

### Requirement: Tabbed skill picker

Skill 挑選 SHALL 以「tab bar + per-tab 三態勾選」的一頁式互動呈現。每個分類 = 一個 tab，使用者以方向鍵在 tab 間切換；每個 tab 內獨立記住當前狀態；`Enter` 送出時回傳 `{ toInstall, toRemove }` 兩份 skill dir 清單。

勾選框代表**期望狀態**，參照系為本次選定的 clients：

- `[x]` = 本次選定的 client 全部都已安裝（或期望全部安裝）
- `[~]` = 本次選定的 client 只裝了一部分（維持現狀）
- `[ ]` = 本次選定的 client 都沒裝（或期望全部移除）

#### Scenario: Tab bar 呈現所有分類與已勾統計

- **WHEN** picker 開啟且 canonical `skills/` 底下有至少一個分類目錄
- **THEN** 頂端顯示一列 tabs，每個 tab 標籤為 `<CategoryName> (<selectedInTab>/<totalInTab>)`
- **AND** 若同時存在 uncategorized skill，最右邊多一個 tab `(uncategorized)`
- **AND** 當前 tab 以反白樣式呈現

#### Scenario: 方向鍵切換 tab

- **WHEN** 使用者按 `←` 或 `Shift+Tab`
- **THEN** 當前 tab 切到前一個（第一個 tab 時 wrap 到最後）
- **WHEN** 使用者按 `→` 或 `Tab`
- **THEN** 當前 tab 切到下一個（最後 tab 時 wrap 到第一個）
- **AND** 切 tab MUST NOT 影響任何 tab 內的狀態

#### Scenario: 原本未安裝的列 toggle

- **WHEN** 某 skill 在所有選定 client 上都未安裝（原始態 `[ ]`）
- **AND** 使用者按 `Space`
- **THEN** 該列變為 `[x]` 並標記 `+`
- **WHEN** 再按一次 `Space`
- **THEN** 該列回到 `[ ]` 且不帶標記

#### Scenario: 原本全部安裝的列 toggle

- **WHEN** 某 skill 在所有選定 client 上都已安裝（原始態 `[x]`）
- **AND** 使用者按 `Space`
- **THEN** 該列變為 `[ ]` 並標記 `-`
- **WHEN** 再按一次 `Space`
- **THEN** 該列回到 `[x]` 且不帶標記

#### Scenario: 部分安裝的列走三態循環

- **WHEN** 某 skill 只裝在部分選定 client 上（原始態 `[~]`）
- **AND** 使用者連按 `Space` 三次
- **THEN** 狀態依序為 `[x]`（標 `+`）→ `[ ]`（標 `-`）→ `[~]`（無標記）
- **AND** 回到 `[~]` 時該 skill MUST NOT 產生任何 install 或 remove 動作

#### Scenario: 範圍外 client 的安裝以唯讀灰字呈現

- **WHEN** `01_Coding/git-smart-commit` 已安裝於 `claude`
- **AND** 本次 clients 只選了 `gemini`
- **THEN** 該列勾選框顯示 `[ ]`（相對於 `gemini` 未安裝）
- **AND** 列尾以灰字顯示 `(claude)`
- **AND** 任何 picker 操作 MUST NOT 改動 `claude` 上的該 symlink

#### Scenario: Select all 與 Reset 快捷

- **WHEN** 使用者按 `a`
- **THEN** 當前 tab 內所有 skill 的期望狀態設為 `[x]`
- **WHEN** 使用者按 `d`
- **THEN** 當前 tab 內所有 skill 還原成掃描得到的原始狀態（reset），MUST NOT 解讀為「全部移除」
- **AND** 這兩個動作僅影響當前 tab

#### Scenario: Footer 顯示 pending diff 統計

- **WHEN** 使用者標記了 1 個要安裝、2 個要移除
- **THEN** footer 顯示 `Pending: 1 install · 2 remove`
- **AND** MUST NOT 顯示舊有的 `Total: N selected`

#### Scenario: 送出

- **WHEN** 使用者按 `Enter` 且至少有一筆 pending 變更
- **THEN** picker 結束，回傳 `{ toInstall, toRemove }`
- **AND** 兩份清單皆為 skill dir 絕對路徑、去重、順序依 tab 順序 → tab 內 entry 原順序

#### Scenario: 無變更送出被擋

- **WHEN** 使用者按 `Enter` 但所有列都維持原始狀態
- **THEN** picker 不結束、不呼叫 submit callback
- **AND** footer 顯示紅字提示沒有任何待套用的變更
- **AND** 系統 MUST NOT 沿用舊有的「至少要選 1 個 skill」條件（全部移除是合法意圖）

#### Scenario: 取消

- **WHEN** 使用者按 `Esc` 或 `Ctrl+C`
- **THEN** picker 結束，走既有 `exitCancelled()` 流程

## ADDED Requirements

### Requirement: Reverse scan of installed skills

系統 SHALL 提供 `scanInstalledSkills()`，列舉每個 client 的 skills 根目錄，對每個項目 `readlink` → 絕對路徑化 → 與 canonical skill dir 比對，產出 `installed: Map<skillDir, Set<Client>>`。

比對 MUST 以 readlink 解析結果為準，MUST NOT 以 basename 反推 canonical dir（不同分類同名的 skill 會導致誤判）。

client 端存在但無法對應到任何 canonical skill 的項目（真目錄、指向他處的 symlink、手動安裝的內容）MUST NOT 進入 `installed`，也 MUST NOT 出現在 picker 的可操作列中。

#### Scenario: 掃到指向 canonical 的 symlink

- **WHEN** `~/.claude/skills/git-smart-commit` 是指向 `<canonical>/skills/01_Coding/git-smart-commit` 的 symlink
- **THEN** `installed` 中 `<canonical>/skills/01_Coding/git-smart-commit` 的集合包含 `claude`

#### Scenario: 掃到真目錄

- **WHEN** `~/.claude/skills/foo` 是一個真的目錄而非 symlink
- **THEN** 它 MUST NOT 出現在 `installed` 中

#### Scenario: 掃到指向他處的 symlink

- **WHEN** `~/.claude/skills/foo` 是指向 canonical 以外路徑的 symlink
- **THEN** 它 MUST NOT 出現在 `installed` 中

#### Scenario: 不同分類同名 skill

- **WHEN** canonical 同時存在 `01_Coding/foo` 與 `03_Medie/foo`
- **AND** `~/.claude/skills/foo` 指向 `01_Coding/foo`
- **THEN** `installed` 中只有 `01_Coding/foo` 的集合包含 `claude`
- **AND** `03_Medie/foo` MUST NOT 被標記為已安裝於 `claude`

#### Scenario: client skills 目錄不存在

- **WHEN** 某選定 client 的 skills 根目錄不存在
- **THEN** 掃描 MUST NOT throw，該 client 視為沒有任何已安裝 skill

### Requirement: Uninstall via unlink task

`LinkTask` SHALL 新增 `unlink` 分支，代表「移除一條由本工具建立的 symlink」。apply 端 SHALL 以既有的 `backupPath()` 實作，backup manifest 格式與 undo 流程 MUST NOT 改動。

`unlink` task MUST 在 **plan 期與 apply 期各驗證一次**目標路徑：`lstat` 為 symlink 且解析後等於預期的 canonical source。任一時點驗證失敗，MUST 降級為 `conflict` 並停止移除。

`backupPath()` 回傳 `false`（父路徑已於同 session 備份而跳過）時，系統 MUST 將該筆計入 skipped 並向使用者顯示，MUST NOT 回報為已移除。

`preflightBackup()` MUST 把 `unlink` 目標納入 backup 目的地的寫入權限預檢。

#### Scenario: 移除一個已安裝的 skill

- **WHEN** `~/.claude/skills/git-smart-commit` 是指向 canonical 的 symlink
- **AND** 使用者在 picker 把該列從 `[x]` 改為 `[ ]` 並送出、套用
- **THEN** `~/.claude/skills/git-smart-commit` 不再存在
- **AND** backup manifest 出現一筆 `{ kind: 'symlink', action: 'backup' }` 記錄
- **AND** canonical 的 `<canonical>/skills/01_Coding/git-smart-commit` MUST 完好無損

#### Scenario: 移除後 undo

- **WHEN** 承上，使用者接著執行 `Undo last change`
- **THEN** `~/.claude/skills/git-smart-commit` 被還原為原本指向的 symlink

#### Scenario: 同一次 apply 混合安裝與移除

- **WHEN** 一次 apply 同時包含 3 筆 install 與 2 筆 unlink
- **THEN** 5 筆 entries 寫進同一個 `backup/<timestamp>/manifest.json`
- **AND** 單次 `Undo last change` 將 5 筆全部回捲

#### Scenario: apply 期目標已不是 symlink

- **WHEN** plan 產生了某路徑的 `unlink` task
- **AND** 使用者在確認流程期間手動把該 symlink 換成真目錄
- **THEN** apply MUST NOT 移除該路徑
- **AND** 該筆降級為 conflict 並回報給使用者

#### Scenario: 父路徑已備份導致跳過

- **WHEN** 同一 session 中 `<clientRoot>/skills` 父層已被備份
- **AND** 隨後嘗試 unlink `<clientRoot>/skills/foo`
- **THEN** `backupPath()` 回傳 `false`
- **AND** 系統將該筆計入 skipped 並顯示，MUST NOT 回報為已移除

### Requirement: Status 呈現完整安裝矩陣

`getLinkStatus()` SHALL 提供不受本次 `clients` / `selectedSkills` 過濾的全域掃描模式，供 `View status` 與 Overview 使用，讓跨 session 累積的安裝結果可見。

#### Scenario: 跨 session 累積的安裝

- **WHEN** 使用者第一次選 `claude` 安裝 `01_Coding/*`
- **AND** 第二次啟動選 `gemini` 安裝 `02_Git/*`
- **THEN** 第二次的 `View status` MUST 同時列出 `claude` 上的 `01_Coding/*` 與 `gemini` 上的 `02_Git/*`
