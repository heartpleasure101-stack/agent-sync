## ADDED Requirements

### Requirement: 對外識別名稱必須一致

專案的四個對外識別點 —— GitHub repo 名、`package.json` 的 `name`、`package.json` 的 `bin` key、CLI 啟動時顯示的標題 —— SHALL 全部為 `agent-sync`。任一處出現舊名 `dotagents` MUST 視為缺陷。

#### Scenario: 原始碼無殘留舊名
- **WHEN** 對 `src/` 執行 `grep -rIn "dotagents"`
- **THEN** 回傳 0 筆

#### Scenario: 套件宣告一致
- **WHEN** 讀取 `package.json`
- **THEN** `name` 為 `agent-sync`
- **AND** `bin` 只有一個 key，值為 `agent-sync`

#### Scenario: CLI 標題正確
- **WHEN** 使用者啟動 CLI
- **THEN** 畫面標題顯示 `agent-sync`
- **AND** Node 版本不足時的 preflight 訊息也顯示 `agent-sync`

### Requirement: 資料目錄約定不受改名影響

canonical 本源目錄 `~/.agents/`、備份目錄 `.agents/backup/`、以及 Antigravity client 的 `.agent/` 路徑 MUST NOT 因專案改名而變動。既有使用者升級後 SHALL NOT 需要任何遷移動作。

#### Scenario: 既有使用者升級
- **WHEN** 既有使用者已有 `~/.agents/` 與各專案的 symlink，升級到改名後的版本
- **THEN** CLI 仍讀取同一個 `~/.agents/`
- **AND** 既有 symlink 全部有效，不需重建

#### Scenario: Antigravity 路徑不變
- **WHEN** 檢查 `src/core/paths.ts` 的 `antigravityRoot`
- **THEN** 仍為 `path.join(projectRoot, '.agent')`

### Requirement: 上游衍生關係必須明示

`README.md` SHALL 包含一段標示本專案衍生自 `iannuttall/dotagents`（MIT 授權），且 `LICENSE` 中的 `Copyright (c) 2026 Ian Nuttall` MUST NOT 被移除或改寫。

#### Scenario: README 含 credit
- **WHEN** 讀取 `README.md`
- **THEN** 存在一段提及上游專案名稱與其 MIT 授權

#### Scenario: LICENSE 保留原版權人
- **WHEN** 讀取 `LICENSE`
- **THEN** 含 `Copyright (c) 2026 Ian Nuttall`

### Requirement: README 不得標示無憑據的狀態徽章

`README.md` MUST NOT 顯示指向 CI 結果的 build badge，除非 repo 內存在對應的 workflow 檔案。

#### Scenario: 無 CI 時不得有 build badge
- **WHEN** `find .github -type f` 不含任何 `workflows/` 下的檔案
- **THEN** `README.md` 不含 build-passing 徽章
