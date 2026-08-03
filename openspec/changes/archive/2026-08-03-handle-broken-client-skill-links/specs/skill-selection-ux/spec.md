## MODIFIED Requirements

### Requirement: Reverse scan of installed skills

系統 SHALL 提供 `scanInstalledSkills()`，列舉每個 client 的 skills 根目錄，對每個項目 `readlink` → 絕對路徑化 → 與 canonical skill dir 比對，產出 `installed: Map<skillDir, Set<Client>>`。

比對 MUST 以 readlink 解析結果為準，MUST NOT 以 basename 反推 canonical dir（不同分類同名的 skill 會導致誤判）。

client 端存在但無法對應到任何 canonical skill 的項目（真目錄、指向他處的 symlink、手動安裝的內容）MUST NOT 進入 `installed`，也 MUST NOT 出現在 picker 的可操作列中。

列舉某個 client 的 skills 根目錄失敗時，掃描 MUST 區分「根目錄不存在」與「根目錄是 broken symlink」兩種情況，判定以 `lstat` 為準。前者視為該 client 沒有任何已安裝 skill；後者 MUST 額外回報為需要處理的異常根目錄，MUST NOT 被靜默略過。異常根目錄的回報 MUST NOT 使掃描 throw，也 MUST NOT 讓該 client 在 picker 中呈現為「乾淨的未安裝狀態」。

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
- **AND** 該 client MUST NOT 被回報為異常根目錄

#### Scenario: client skills 目錄是 broken symlink
- **WHEN** `<projectRoot>/.claude/skills` 是指向不存在路徑的 symlink
- **THEN** 掃描 MUST NOT throw
- **AND** claude 沒有任何 skill 進入 `installed`
- **AND** 掃描結果回報 claude 的根目錄為異常，攜帶該路徑與其 link 字串
