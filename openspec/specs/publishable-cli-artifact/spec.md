# publishable-cli-artifact Specification

## Purpose
規範透過 `npx github:` 直接執行的建置產物：必須能在只裝了 `dependencies` 的乾淨 node runtime 啟動，不得因 optional peer dependency 缺失而在載入階段失敗，並以 smoke test 阻止 regression。
## Requirements
### Requirement: dist/cli.js 在乾淨 node runtime 可執行

發佈到 GitHub 的 `dist/cli.js` SHALL 能在只安裝了 `package.json` `dependencies` 所列項目、**未**安裝任何 optional peer dependency 的 node runtime 直接啟動；載入階段 MUST NOT 拋出 `ERR_MODULE_NOT_FOUND`。

#### Scenario: 使用者透過 `npx github:` 執行
- **WHEN** 使用者在乾淨環境（沒有預裝 `react-devtools-core`）跑 `npx github:heartpleasure101-stack/agent-sync`
- **THEN** CLI 進入 scope picker（第一個互動 prompt）
- **AND** stderr 不包含 `ERR_MODULE_NOT_FOUND`

#### Scenario: bundle 內不得含 eager import
- **WHEN** 對 `dist/cli.js` 檢查 optional peer 的參照
- **THEN** 不 SHALL 含 `import ... from "react-devtools-core"` 或 `require("react-devtools-core")` 這類 load-time 硬相依
- **AND** 可以殘留 `import.meta.resolve("react-devtools-core")` 這類被 try/catch + `process.env.DEV === 'true'` guard 過的 runtime 探測（不影響載入）

#### Scenario: bundle 內不得殘留舊專案名
- **WHEN** 對 `dist/cli.js` 執行 `grep -c "dotagents"`
- **THEN** 回傳 0

#### Scenario: 舊 GitHub 網址過渡
- **WHEN** 使用者沿用改名前的 `npx github:heartpleasure101-stack/dotagents`
- **THEN** 依賴 GitHub 的 repo rename redirect 仍可取得同一份程式
- **AND** 此路徑僅視為過渡，不 SHALL 出現在任何現行文件中

### Requirement: Build script 必須把 optional peer stub 掉

`bun run build` SHALL 使用能替換 `react-devtools-core` 為空 stub 的 bundler 設定；不 SHALL 依賴使用者環境中 `react-devtools-core` 的存在。

#### Scenario: 開發者 clone repo 執行 build
- **WHEN** 開發者跑 `bun install && bun run build`
- **THEN** 產出 `dist/cli.js`（launcher）與 `dist/main.js`（主程式）兩個檔案且無警告 / 錯誤
- **AND** 產物滿足「dist/cli.js 在乾淨 node runtime 可執行」requirement 的兩個 scenario
- **AND** stub 設定 SHALL 套用於主程式 bundle（`react-devtools-core` 由 Ink 引入，屬主程式而非 launcher）

### Requirement: Smoke test 阻止 regression

`bun run smoke` SHALL 執行一個非互動 smoke test，確認建置產物能被 node 載入到至少 500ms 而不觸發 `ERR_MODULE_NOT_FOUND`。檢查範圍 SHALL 涵蓋 launcher 與主程式兩者 —— 僅檢查 launcher 會漏掉主程式 bundle 的 module resolution 問題，因為 launcher 的 dynamic import 要到版本檢查通過後才發生。

#### Scenario: smoke pass
- **WHEN** dist 是最新且兩個產物皆無載入錯誤
- **THEN** `bun run smoke` exit code 為 0

#### Scenario: smoke fail
- **WHEN** 任一產物含有無法解析的 import（如未 stub 的 optional peer）
- **THEN** `bun run smoke` exit code 非 0
- **AND** stderr 包含具體的 ERR_MODULE_NOT_FOUND 內容
- **AND** stderr 指出是哪一個產物出問題

#### Scenario: 主程式 bundle 的載入問題不得被 launcher 遮蔽
- **WHEN** `dist/cli.js` 可正常載入但 `dist/main.js` 含未解析的 import
- **THEN** `bun run smoke` exit code 非 0
- **AND** 不 SHALL 因 launcher 本身載入成功而回報 PASS

### Requirement: dist/main.js 在乾淨 node runtime 可執行

發佈的 `dist/main.js` SHALL 能在只安裝了 `package.json` `dependencies` 所列項目、**未**安裝任何 optional peer dependency 的 node runtime 被 launcher 動態載入；載入階段 MUST NOT 拋出 `ERR_MODULE_NOT_FOUND`。

此 requirement 承接原「dist/cli.js 在乾淨 node runtime 可執行」的保證 —— 拆檔後實際承載依賴的是 `main.js`，原 requirement 對 `cli.js` 的約束仍成立但已不足以涵蓋依賴風險。

#### Scenario: Node 22+ 環境完整啟動
- **WHEN** 使用者在乾淨環境（沒有預裝 `react-devtools-core`）以 Node 22+ 跑 `npx github:heartpleasure101-stack/agent-sync`
- **THEN** launcher 版本檢查通過並 dynamic import `dist/main.js`
- **AND** CLI 進入 scope picker（第一個互動 prompt）
- **AND** stderr 不包含 `ERR_MODULE_NOT_FOUND`

#### Scenario: main.js 內不得含 eager 的 optional peer import
- **WHEN** 對 `dist/main.js` 檢查 optional peer 的參照
- **THEN** 不 SHALL 含 `import ... from "react-devtools-core"` 或 `require("react-devtools-core")` 這類 load-time 硬相依
- **AND** 可以殘留 `import.meta.resolve("react-devtools-core")` 這類被 try/catch + `process.env.DEV === 'true'` guard 過的 runtime 探測（不影響載入）

