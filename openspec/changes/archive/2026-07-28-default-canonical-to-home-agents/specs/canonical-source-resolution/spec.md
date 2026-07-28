## ADDED Requirements

### Requirement: Project scope canonical 預設為 `~/.agents/`

在 project scope 下，`resolveRoots()` 回傳的 `canonicalRoot` SHALL 預設為 `path.join(homeDir, '.agents')`。Global scope 行為 MUST 維持不變（仍為 `~/.agents`）。Client folder（`.claude`、`.gemini`、`.codex`、`.opencode`、`.cursor`、`.factory`、`.antigravity` 等）於 project scope 下 MUST 仍以 `projectRoot` 為根。

#### Scenario: Project scope 未傳 canonicalOverride
- **WHEN** 呼叫 `resolveRoots({ scope: 'project', projectRoot: '/tmp/foo', homeDir: '/Users/x' })`
- **THEN** 回傳的 `canonicalRoot` 等於 `/Users/x/.agents`
- **AND** `claudeRoot` 等於 `/tmp/foo/.claude`
- **AND** `geminiRoot` 等於 `/tmp/foo/.gemini`

#### Scenario: Global scope 不受影響
- **WHEN** 呼叫 `resolveRoots({ scope: 'global', homeDir: '/Users/x' })`
- **THEN** 回傳的 `canonicalRoot` 等於 `/Users/x/.agents`
- **AND** 其餘欄位維持既有 global 行為

### Requirement: 支援 session-only canonical override

`RootOptions` SHALL 新增可選欄位 `canonicalOverride?: string`。當 project scope 且此欄位為非空絕對路徑時，`resolveRoots()` 回傳的 `canonicalRoot` MUST 使用該路徑；其它欄位 MUST 不受影響。Global scope 收到 `canonicalOverride` MUST 忽略之。

#### Scenario: Project scope 帶 canonicalOverride
- **WHEN** 呼叫 `resolveRoots({ scope: 'project', projectRoot: '/tmp/foo', homeDir: '/Users/x', canonicalOverride: '/Users/x/Developer/.agents' })`
- **THEN** `canonicalRoot` 等於 `/Users/x/Developer/.agents`
- **AND** `claudeRoot` 仍為 `/tmp/foo/.claude`

#### Scenario: Global scope 帶 canonicalOverride 被忽略
- **WHEN** 呼叫 `resolveRoots({ scope: 'global', homeDir: '/Users/x', canonicalOverride: '/somewhere/else' })`
- **THEN** `canonicalRoot` 等於 `/Users/x/.agents`

### Requirement: CLI 啟動時保證 canonical 可用

CLI 主流程 SHALL 在建立 link plan 之前呼叫 `ensureCanonical()`，確保後續讀取本源不會失敗。若 canonical 預設路徑（`~/.agents/`）不存在（`fs.existsSync` false），CLI MUST 跳出互動 prompt，讓使用者在以下選項中三擇一：
1. **建立空的 `~/.agents/`**（預設高亮）
2. **指定其它資料夾路徑**（輸入絕對路徑，需通過存在性與可讀性驗證）
3. **取消並結束 CLI**

#### Scenario: `~/.agents/` 已存在
- **WHEN** CLI 啟動且 `~/.agents/` 為既有資料夾或有效 symlink
- **THEN** 不顯示任何 canonical 相關 prompt
- **AND** 後續流程使用 `~/.agents/` 作為 canonical

#### Scenario: 使用者選擇建立
- **WHEN** `~/.agents/` 不存在，使用者選「建立空的 `~/.agents/`」
- **THEN** CLI 執行 `mkdir -p ~/.agents`
- **AND** 後續流程使用 `~/.agents/` 作為 canonical

#### Scenario: 使用者指定其它路徑
- **WHEN** `~/.agents/` 不存在，使用者選「指定其它資料夾」並輸入 `/Users/x/Developer/.agents`（存在且可讀）
- **THEN** CLI 不建立 `~/.agents/`
- **AND** 本次 session 使用 `/Users/x/Developer/.agents` 作為 `canonicalOverride`

#### Scenario: 使用者指定不存在或不可讀的路徑
- **WHEN** 使用者輸入的路徑不存在或無讀取權限
- **THEN** CLI 提示錯誤並重新詢問
- **AND** 不進入主流程

#### Scenario: 使用者取消
- **WHEN** 使用者於 prompt 選「取消」
- **THEN** CLI 立即以 exit code 0 結束
- **AND** 檔案系統無任何變更

### Requirement: Canonical override 不持久化

使用者於 prompt 選擇的 `canonicalOverride` MUST 僅存活於當前 CLI process。系統 MUST NOT 將此選擇寫入任何檔案（例如 `~/.dotagentsrc`、`~/.config/dotagents/*` 或專案內設定）。下次啟動 CLI 時，若 `~/.agents/` 仍不存在，MUST 重新詢問。

#### Scenario: 重啟後仍未建立 `~/.agents/`
- **GIVEN** 前一次 session 使用者選擇了 `/Users/x/Developer/.agents` 作為 override
- **WHEN** 使用者結束 CLI 後重新執行
- **AND** `~/.agents/` 仍不存在
- **THEN** CLI 再次顯示相同的 canonical fallback prompt
- **AND** MUST NOT 預填或自動採用上一次的 override 路徑

### Requirement: 偵測既有 `projectRoot/.agents` 實體目錄並提示

若 CLI 啟動時偵測到 `projectRoot/.agents` 為實體目錄（非 symlink）且非空，CLI SHALL 印出一次性的 migration hint，說明新版預設讀 `~/.agents/`，並建議使用者手動搬移或建立 symlink。此提示 MUST NOT 阻擋主流程。

#### Scenario: 專案內有實體 `.agents/` 資料夾
- **WHEN** `process.cwd()/.agents` 存在、為實體目錄、包含至少一個檔案
- **THEN** CLI 印出提示訊息，內容包含建議指令（例如 `rsync -a .agents/ ~/.agents/`）
- **AND** 主流程仍照常進行，canonical 仍為 `~/.agents/`（或使用者選擇的 override）

#### Scenario: 專案內只有 symlink 到別處
- **WHEN** `process.cwd()/.agents` 為 symlink
- **THEN** CLI 不顯示 migration hint（symlink 已表達使用者意圖）
