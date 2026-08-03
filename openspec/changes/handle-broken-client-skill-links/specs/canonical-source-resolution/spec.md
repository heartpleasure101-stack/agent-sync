## MODIFIED Requirements

### Requirement: 偵測既有 `projectRoot/.agents` 實體目錄並提示

若 CLI 啟動時偵測到 `projectRoot/.agents` 為實體目錄（非 symlink）且非空，CLI SHALL 印出一次性的 migration hint，說明新版預設讀 `~/.agents/`，並建議使用者手動搬移或建立 symlink。

若 `projectRoot/.agents` 為 symlink 且其目標存在，CLI SHALL 不顯示提示（symlink 已表達使用者意圖）。若為 symlink 但目標不存在（broken symlink），CLI SHALL 印出提示，內容包含該 symlink 的路徑、它指向的目標、以及移除建議；判定 MUST 以 `lstat` 加上對 link 目標的存在性檢查為準。

上述任何提示 MUST NOT 阻擋主流程，canonical 的解析結果 MUST NOT 因提示而改變。

#### Scenario: 專案內有實體 `.agents/` 資料夾
- **WHEN** `process.cwd()/.agents` 存在、為實體目錄、包含至少一個檔案
- **THEN** CLI 印出提示訊息，內容包含建議指令（例如 `rsync -a .agents/ ~/.agents/`）
- **AND** 主流程仍照常進行，canonical 仍為 `~/.agents/`（或使用者選擇的 override）

#### Scenario: 專案內只有 symlink 到別處
- **WHEN** `process.cwd()/.agents` 為 symlink
- **AND** 該 symlink 的目標存在
- **THEN** CLI 不顯示 migration hint（symlink 已表達使用者意圖）

#### Scenario: 專案內的 `.agents` 是 broken symlink
- **WHEN** `process.cwd()/.agents` 為 symlink
- **AND** 該 symlink 的目標不存在
- **THEN** CLI 印出提示訊息，內容包含該 symlink 路徑、解析後的目標路徑、與形如 `rm <path>` 的移除建議
- **AND** 主流程仍照常進行，canonical 仍為 `~/.agents/`（或使用者選擇的 override）
