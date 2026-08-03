## ADDED Requirements

### Requirement: 判定 client skills 根目錄的路徑狀態

系統 SHALL 提供一個路徑狀態判定函式，對任一 client skills 根目錄以 `lstat` 為準回傳四種互斥狀態之一：`ok`（實體目錄）、`missing`（不存在）、`broken-symlink`（是 symlink 但解析後的目標不存在）、`foreign-symlink`（是 symlink 且目標存在但不在 canonical 之下）。

判定 MUST 以 `lstat` 而非 `stat`／`existsSync` 為準，因為 `stat` 會跟隨連結而使 broken symlink 與 missing 無法區分。

判定 MUST NOT 拋出例外，任何檔案系統錯誤都要收斂成上述狀態之一或明確的失敗值。

#### Scenario: 實體目錄
- **WHEN** `<projectRoot>/.claude/skills` 是一個真的目錄
- **THEN** 狀態為 `ok`

#### Scenario: 路徑不存在
- **WHEN** `<projectRoot>/.claude/skills` 不存在
- **THEN** 狀態為 `missing`

#### Scenario: 指向不存在目標的 symlink
- **WHEN** `<projectRoot>/.claude/skills` 是指向 `<projectRoot>/.agents/skills` 的 symlink
- **AND** `<projectRoot>/.agents/skills` 不存在
- **THEN** 狀態為 `broken-symlink`
- **AND** 回傳值包含該 symlink 的原始 link 字串與解析後的絕對路徑

#### Scenario: 指向 canonical 以外既有路徑的 symlink
- **WHEN** `<projectRoot>/.claude/skills` 是指向某個存在但不屬於 canonical 的目錄的 symlink
- **THEN** 狀態為 `foreign-symlink`

### Requirement: Plan 階段攔截 broken 根目錄

`buildLinkPlan()` SHALL 在產出 link task 之前檢查每個 target 的父路徑鏈。若父路徑鏈上存在 `broken-symlink`，該 mapping MUST NOT 產出普通的 `link` task，而 SHALL 產出可辨識的阻塞任務，攜帶壞掉的路徑、link 字串與原因。

Apply 階段 MUST NOT 是第一個發現此問題的地方。

#### Scenario: skills 根目錄是 broken symlink
- **WHEN** 使用者選了 3 個 skill 要裝進 claude
- **AND** `<projectRoot>/.claude/skills` 是 broken symlink
- **THEN** plan 中這 3 個 target MUST NOT 是 `link` task
- **AND** plan 包含一筆指向 `<projectRoot>/.claude/skills` 的阻塞任務
- **AND** 建立 plan 的過程 MUST NOT throw

#### Scenario: 其它 client 不受牽連
- **WHEN** claude 的 skills 根目錄是 broken symlink
- **AND** gemini 的 skills 根目錄正常
- **THEN** gemini 的 link task 照常產生並可 apply

### Requirement: 顯示可讀的診斷訊息

偵測到 broken 根目錄時，CLI SHALL 顯示包含以下三項的訊息：壞掉的絕對路徑、該 symlink 指向的目標、以及一行可直接複製執行的修復指令。

訊息 MUST NOT 只呈現原始的 `ENOENT` 錯誤碼。

#### Scenario: 呈現內容
- **WHEN** `<projectRoot>/.claude/skills -> ../.agents/skills` 為 broken symlink
- **THEN** 訊息包含 `<projectRoot>/.claude/skills`
- **AND** 訊息包含解析後的目標路徑
- **AND** 訊息包含形如 `rm <projectRoot>/.claude/skills` 的修復指令

### Requirement: 互動式清理 broken 根目錄

偵測到 broken 根目錄時，CLI SHALL 提供選項：「備份後移除並重建」或「跳過此 client」。

選擇移除時，該 symlink MUST 經由既有 backup session 備份，並記入 manifest，使 undo 能還原。backup manifest 格式 MUST NOT 改動。

選擇跳過時，該 client 的所有 skill 操作 MUST 被略過，且其它 client 的操作 MUST 照常完成。

非互動環境（無 TTY）MUST 預設為跳過，並印出診斷訊息。

#### Scenario: 使用者選擇移除並重建
- **WHEN** 使用者對 broken 的 `<projectRoot>/.claude/skills` 選擇「備份後移除並重建」
- **THEN** 該 symlink 被寫入 backup manifest，kind 為 `symlink`
- **AND** 原路徑被移除後重建為實體目錄
- **AND** 原本被阻塞的 skill link task 全部成功套用

#### Scenario: 移除後 undo
- **WHEN** 上一情境完成後執行 undo
- **THEN** `<projectRoot>/.claude/skills` 還原為原本的 symlink，link 字串不變

#### Scenario: 使用者選擇跳過
- **WHEN** 使用者對 broken 的 claude 根目錄選擇「跳過此 client」
- **THEN** claude 沒有任何 skill 被安裝
- **AND** 其它已選 client 的安裝照常完成並回報成功

#### Scenario: 非互動環境
- **WHEN** 無 TTY 且偵測到 broken 根目錄
- **THEN** 該 client 被跳過
- **AND** 診斷訊息被印出
- **AND** 行程 MUST NOT 以未攔截例外結束

### Requirement: Apply 階段的檔案系統錯誤包裝

`applyLinkPlan()` 在建立連結時遇到檔案系統錯誤，SHALL 以包含 target 路徑、原始錯誤碼與建議動作的訊息回報，MUST NOT 讓裸的 `ENOENT` / `EEXIST` 冒泡到使用者面前。

單一 target 失敗 MUST NOT 中止整個 plan 的其餘任務，失敗數量 SHALL 併入結果摘要。

#### Scenario: apply 期間目標父路徑被外部破壞
- **WHEN** plan 建立後、apply 之前，某 target 的父目錄被改成 broken symlink
- **THEN** 該 target 回報為失敗，訊息包含路徑與錯誤碼
- **AND** plan 中其餘 target 仍被套用
- **AND** 結果摘要包含失敗計數
