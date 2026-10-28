## 1. 型別與路徑

- [x] 1.1 `src/core/types.ts:3`：`Client` 聯集加入 `'pi'`
- [x] 1.2 `src/core/paths.ts`：`ResolvedRoots` 加 `piRoot`；global 段設為 `~/.pi/agent`，project 段設為 `<projectRoot>/.pi`
- [x] 1.3 在 `tests/` 內既有的 paths 相關測試檔補 `piRoot` 兩個 scope 的案例（先 `grep -rn resolveRoots tests` 找到該放哪個檔）

## 2. skills 與 AGENTS.md 連線

- [x] 2.1 `src/core/skill-roots.ts`：`candidates` 加 `['pi', path.join(roots.piRoot, 'skills')]`，並更新檔頭註解
- [x] 2.2 `src/core/mappings.ts`：第 70 行預設 client 清單加 `'pi'`；`agentTargets` 加 `clients.has('pi') ? path.join(roots.piRoot, 'AGENTS.md') : null`
- [x] 2.3 確認 `commands` 與 `hooks` 兩個 mapping 的 targets **沒有**加 Pi
- [x] 2.4 在 `tests/linking.test.ts` 新增：global 勾選 `pi` 時，`~/.pi/agent/skills` 與 `~/.pi/agent/AGENTS.md` 的 symlink 目標正確；project 勾選 `pi` 時 `.pi/skills` 正確且 `.pi/AGENTS.md` 不存在；`.pi` 下不出現 `prompts`、`hooks`
- [x] 2.5 在 `tests/linking.test.ts` 新增：`~/.pi/agent/AGENTS.md` 已是實體檔時被標為 conflict
- [x] 2.6 確認 `src/core/scan-installed.ts:66` 走 `getSkillRoots()`，Pi 的已安裝狀態可讀回；在 `tests/scan-installed.test.ts` 加一個 Pi 案例
- [x] 2.7 驗證 Pi 的根目錄是 broken symlink 時，會走上一個 change 的 `blocked-root` 攔截；在 `tests/linking.test.ts` 加一個 Pi 案例

## 3. 偵測、狀態、選單

- [x] 3.1 `src/core/detect-installed.ts`：`CLIENT_ORDER` 與 `getGlobalClientRoots` 加 `pi`（根目錄用 `roots.piRoot`）
- [x] 3.2 `src/core/status.ts:10-12`：`ALL_CLIENTS` 加 `'pi'`
- [x] 3.3 `src/cli-main.tsx`：`CLIENT_LABELS` 加 `pi: 'Pi'`，`selectClients` 的 `options` 加 Pi
- [x] 3.4 `tests/detect-installed.test.ts`：新增 `~/.pi/agent` 存在時回傳 `['pi']`，以及只有 `~/.pi` 時不含 `pi`；更新斷言 client 總數的地方
- [x] 3.5 新增測試：`Client` 的每個值都出現在 `CLIENT_ORDER`（避免日後漏改）

## 4. Migration

- [x] 4.1 `src/core/migrate.ts:63`：預設 client 清單加 `'pi'`
- [x] 4.2 `src/core/migrate.ts` 的 `sources.skills` 加 `Pi skills`（`path.join(roots.piRoot, 'skills')`）
- [x] 4.3 `src/core/migrate.ts` 的 `sources.agents` 加 `Pi AGENTS.md`（`path.join(roots.piRoot, 'AGENTS.md')`），確認 `Pi` 不加進 `commands` 與 `hooks` 的來源
- [x] 4.4 `tests/migrate.test.ts`：仿 antigravity 案例（第 107–135 行）新增 Pi skill 與 AGENTS.md 收進 `.agents` 的測試，另加「skills 目錄已是 symlink 時略過」

## 5. 文件與建置

- [x] 5.1 `README.md`：對照表加 Pi 一列（設定位置 `~/.pi/agent/`、規則檔 `AGENTS.md`、指令位置「預設無」、技能位置 `skills/<技能名稱>`）；標題「9 大」改「10 大」；註明 project 模式下 Pi 首次進專案會詢問是否信任
- [x] 5.2 `grep -rn antigravity src` 逐一對照，確認每個出現 antigravity 的地方都已檢查過 Pi（`migrate.ts`、`status.ts`、`detect-installed.ts`、`cli-main.tsx`、`mappings.ts`、`skill-roots.ts`、`paths.ts`、`types.ts`）
- [ ] 5.3 執行 `bun run type-check` 與 `bun test`，全綠
- [x] 5.4 執行 `bun run build` 更新 `dist/`

## 6. 實機驗證

- [ ] 6.1 用 agent-sync 勾選 Pi，連一個 skill，開真的 Pi，確認啟動畫面列出該 skill，且可用 `/skill:<名稱>` 呼叫
- [ ] 6.2 確認 `~/.pi/agent/AGENTS.md` 的內容有被 Pi 載入
- [ ] 6.3 把 6.1、6.2 的結果寫回本檔；若 Pi 不載入 symlink 目錄的 skill，停下來回頭改 design
