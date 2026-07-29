## MODIFIED Requirements

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
