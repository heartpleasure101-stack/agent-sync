## ADDED Requirements

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

### Requirement: Build script 必須把 optional peer stub 掉

`bun run build` SHALL 使用能替換 `react-devtools-core` 為空 stub 的 bundler 設定；不 SHALL 依賴使用者環境中 `react-devtools-core` 的存在。

#### Scenario: 開發者 clone repo 執行 build
- **WHEN** 開發者跑 `bun install && bun run build`
- **THEN** 產出 `dist/cli.js` 一個檔案且無警告 / 錯誤
- **AND** 產物滿足前一個 requirement 的兩個 scenario

### Requirement: Smoke test 阻止 regression

`bun run smoke` SHALL 執行一個非互動 smoke test，確認 `dist/cli.js` 能被 node 載入到至少 500ms 而不觸發 `ERR_MODULE_NOT_FOUND`。

#### Scenario: smoke pass
- **WHEN** dist 是最新且無載入錯誤
- **THEN** `bun run smoke` exit code 為 0

#### Scenario: smoke fail
- **WHEN** dist 含有無法解析的 import（如未 stub 的 optional peer）
- **THEN** `bun run smoke` exit code 非 0
- **AND** stderr 包含具體的 ERR_MODULE_NOT_FOUND 內容
