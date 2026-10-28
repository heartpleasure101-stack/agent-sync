## Why

使用者已把 Pi（`@earendil-works/pi-coding-agent`）設定成不讀 `~/.agents/skills/`，只讀 `~/.pi/agent/skills/`。agent-sync 目前只支援 9 個 client（`src/core/types.ts` 的 `Client`），沒有 Pi，所以使用者在 agent-sync 選好的 skills 與 `AGENTS.md` 到不了 Pi，等於沒辦法在 Pi 上試用。

## What Changes

- 新增 client `pi`，標籤為 `Pi`，出現在 client 選單與已安裝偵測中。
- 新增 Pi 根目錄：global 為 `~/.pi/agent`，project 為 `<projectRoot>/.pi`。
- skills：把勾選的 skill 逐一 symlink 到 `<piRoot>/skills/<skill 名稱>`。global 與 project scope 都支援。
- `AGENTS.md`：global scope 下把 `~/.agents/AGENTS.md` symlink 到 `~/.pi/agent/AGENTS.md`。project scope 不連，和現有 `agents-md` mapping 行為一致。
- 已安裝偵測：`~/.pi/agent` 存在時，視為已安裝 Pi。
- migration：掃描既有的 `<piRoot>/skills/` 與 `~/.pi/agent/AGENTS.md`，讓它們能被收進 `~/.agents/`。
- README 對照表新增 Pi 一列，「9 大 AI 助手」改為 10。
- **不在本次範圍**：
  - commands → `~/.pi/agent/prompts/`。Pi prompt template 的格式和 canonical `commands/` 裡的檔案是否相容，還沒確認。
  - hooks。Pi 用 TypeScript extensions（`~/.pi/agent/extensions/`），和 Claude 的 hooks 格式不同。
  - 修改 Pi 的 `settings.json`。是否排除 `~/.agents/skills/` 由使用者自己設定，agent-sync 不寫入 Pi 設定檔。

## Capabilities

### New Capabilities

- `pi-client-support`：Pi 的根目錄解析，以及 skills 和 `AGENTS.md` 的 symlink 落點、migration 掃描來源。

### Modified Capabilities

- `client-selection-ux`：「Installed-client detection」需求中，支援的 client 從 9 個改成 10 個，加入 `pi`，偵測依據為 `~/.pi/agent` 存在。

## Impact

- 程式碼（每個 client 都會出現的位置）：
  - `src/core/types.ts`：`Client` 加 `'pi'`
  - `src/core/paths.ts`：`ResolvedRoots` 加 `piRoot`，global 與 project 兩段各一筆
  - `src/core/skill-roots.ts`：`candidates` 加 Pi
  - `src/core/mappings.ts`：預設 client 清單、`agentTargets`
  - `src/core/detect-installed.ts`：`CLIENT_ORDER`、`getGlobalClientRoots`
  - `src/core/status.ts`：`ALL_CLIENTS`
  - `src/core/migrate.ts`：預設 client 清單、skills 與 agents 掃描來源
  - `src/cli-main.tsx`：`CLIENT_LABELS`、`selectClients` 選項
- 文件：`README.md` 對照表。
- 測試：`tests/detect-installed.test.ts`、`tests/linking.test.ts`、`tests/migrate.test.ts` 需要補 Pi 的案例。斷言「client 數量是 9」的地方可能要更新（還沒逐一確認）。
- 建置產物：`dist/` 需重新 build。
- 風險：上面有 4 個檔案各自寫死一份 client 清單（`mappings.ts:70`、`migrate.ts:63`、`status.ts:10`、`detect-installed.ts:5`），漏改任何一份，該功能就看不到 Pi。
- 依賴：無新增套件。
- 尚未驗證：Pi 能否正常載入「目錄本身是 symlink」的 skill。要在實作後用真的 Pi 跑一次確認。
