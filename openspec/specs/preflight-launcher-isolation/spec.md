# preflight-launcher-isolation Specification

## Purpose
TBD - created by archiving change split-preflight-from-bundle. Update Purpose after archive.
## Requirements
### Requirement: CLI 進入點與主程式 bundle 實體分離

`bun run build` SHALL 產出兩個獨立檔案：作為 `bin` 進入點的 launcher（`dist/cli.js`）與主程式 bundle（`dist/main.js`）。Launcher MUST NOT 內聯主程式或任何第三方依賴（Ink / React / clack / chalk / gray-matter）；主程式 SHALL 只透過 launcher 在版本檢查通過後的 dynamic import 被載入。

此分離的目的是讓 Node 版本檢查的**執行**不依賴主程式能否被**解析** —— ESM 整檔解析的特性使得單檔 bundle 中的任何新語法都會讓 preflight 失效。

#### Scenario: 建置產出兩個檔案

- **WHEN** 開發者執行 `bun run build`
- **THEN** `dist/` 下同時存在 `cli.js` 與 `main.js`
- **AND** `dist/cli.js` 的體積 SHALL 小於 10KB
- **AND** `dist/main.js` 承載其餘全部程式碼與依賴

#### Scenario: launcher 不含第三方依賴

- **WHEN** 對 `dist/cli.js` 做靜態掃描
- **THEN** 不 SHALL 出現 `ink` / `react` / `@clack/prompts` / `chalk` / `gray-matter` 的實作內容或 static import
- **AND** 對主程式的參照 SHALL 為 dynamic import 形式（`import(...)`），不 SHALL 為 top-level static import

#### Scenario: 版本不符時主程式完全未被載入

- **WHEN** 以低於最低版本的 Node 執行 `dist/cli.js`
- **THEN** stderr 顯示中文升級指引且 exit code = 1
- **AND** `dist/main.js` 自始至終未被解析或執行

### Requirement: Launcher 語法下限與建置期驗證

`dist/cli.js` SHALL 只使用目標舊版 Node（至少 Node 18）解析得動的語法。建置流程 SHALL 包含一道自動驗證，在 launcher 含有超出該語法下限的寫法時讓 build 失敗，不 SHALL 依賴人工檢查或使用者端才發現。

Bun 的 `Bun.build` 不支援釘版本的 target（實測 Bun 1.3.11 只接受 `browser` / `node` / `bun` / `macro` / `bun-<target>`），故此驗證 SHALL 由 Bun 以外的機制達成。

#### Scenario: launcher 語法合規

- **WHEN** launcher 只使用 Node 18 支援的語法
- **THEN** `bun run build` exit code 為 0
- **AND** 產出 `dist/cli.js`

#### Scenario: launcher 含過新語法

- **WHEN** launcher 產物含 Node 18 無法解析的語法
- **THEN** `bun run build` exit code 非 0
- **AND** stderr 指出是 launcher 的語法下限違規，而非一般 bundler 錯誤
- **AND** 不 SHALL 產出可發佈的 `dist/cli.js`

#### Scenario: 語法驗證針對產物而非原始碼

- **WHEN** 執行語法驗證
- **THEN** 檢查對象 SHALL 為建置後的 `dist/cli.js`
- **AND** 不 SHALL 只檢查 `src/cli.tsx`（bundler 可能在輸出階段引入新語法）

### Requirement: 發佈內容須包含兩個產物

`package.json` 的 `files` SHALL 使 `dist/cli.js` 與 `dist/main.js` 都被納入發佈；`bin` SHALL 維持指向 `dist/cli.js`。

#### Scenario: 透過 npx github: 執行

- **WHEN** 使用者跑 `npx github:heartpleasure101-stack/agent-sync`
- **THEN** launcher 與主程式皆可被解析到
- **AND** 於 Node 22+ 環境進入 scope picker
- **AND** stderr 不含 `ERR_MODULE_NOT_FOUND`

#### Scenario: 主程式產物缺失

- **WHEN** `dist/main.js` 不存在而 `dist/cli.js` 存在
- **THEN** 於版本檢查通過後 SHALL 回報可辨識的錯誤訊息
- **AND** 不 SHALL 是未處理的 module resolution stack trace

