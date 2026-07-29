# runtime-prereq-check Specification

## Purpose
TBD - created by archiving change detect-runtime-and-guide. Update Purpose after archive.
## Requirements
### Requirement: CLI 啟動時檢查 Node 版本

CLI 進入任何 heavy import（Ink、clack、chalk）之前，SHALL 呼叫一個純函式檢查 `process.versions.node`。若解析出的 major < `22`（對齊 Ink 7 的 `engines.node`），SHALL 走「不符流程」；≥ `22` SHALL 走「符合流程」。

#### Scenario: Node 22+
- **WHEN** 使用者以 Node 22 或更高版本執行 `dist/cli.js`
- **THEN** preflight 立刻通過（no output）
- **AND** CLI 進入既有 scope picker

#### Scenario: Node < 22
- **WHEN** 使用者以 Node 20 執行 `dist/cli.js`
- **THEN** stderr 顯示中文「Node.js 版本過舊」訊息
- **AND** 訊息含「目前版本 20.x.x → 需要 22+」對照
- **AND** 訊息含適合當前平台的安裝指令
- **AND** 訊息尾行提示重開終端機再試
- **AND** process exit code = 1
- **AND** Ink / clack 皆未被 import（不會有殘留 stack trace）

#### Scenario: Node 版本解析失敗
- **WHEN** `process.versions.node` 是無法解析的字串
- **THEN** preflight fail-safe 回 `ok: false`
- **AND** 走與 Node < 22 相同的訊息流程

### Requirement: 平台對應安裝指引

`formatFailureMessage` SHALL 依 `process.platform` 提供對應主流安裝方式；所有平台都 SHALL 附上 `https://nodejs.org` 官網作為 fallback。

#### Scenario: macOS 使用者
- **WHEN** platform 為 `darwin`
- **THEN** 訊息含 `brew install node@22`（或等價）
- **AND** 訊息含 `https://nodejs.org`

#### Scenario: Linux 使用者
- **WHEN** platform 為 `linux`
- **THEN** 訊息含 `nvm install 22`（或等價）
- **AND** 訊息含 `https://nodejs.org`

#### Scenario: Windows 使用者
- **WHEN** platform 為 `win32`
- **THEN** 訊息含 `winget install OpenJS.NodeJS`（或等價）
- **AND** 訊息含 `https://nodejs.org`

#### Scenario: 其它平台（例：freebsd）
- **WHEN** platform 為 `darwin` / `linux` / `win32` 以外
- **THEN** 訊息不 SHALL 包含 brew / nvm / winget 指令
- **AND** 訊息只含 `https://nodejs.org` 作為指引

### Requirement: preflight 不 SHALL 引入 heavy dependency

`src/preflight/**` 的所有檔案 SHALL 只 import `node:*` 內建模組（`node:process` 允許），不 SHALL import chalk / clack / Ink / react / gray-matter 或任何 non-builtin。

#### Scenario: preflight import 稽核
- **WHEN** 對 `src/preflight/*.ts` 執行靜態掃描（grep import）
- **THEN** 所有 import 路徑 SHALL 以 `node:` 開頭或為相對路徑（同目錄內）
- **AND** 不 SHALL 出現 `chalk` / `@clack/prompts` / `ink` / `react` / `gray-matter`

