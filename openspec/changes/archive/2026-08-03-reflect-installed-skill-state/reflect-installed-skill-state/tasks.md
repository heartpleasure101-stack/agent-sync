## 1. 反向掃描

- [x] 1.1 新增 `src/core/symlink.ts`，export `resolveSymlinkTo()`（lstat 非 symlink → null，再 readlink + 絕對路徑化）。`plan.ts` 移除私有的 `getLinkTargetAbsolute()` 改呼叫它。另附兩個給後續 unlink 驗證用的 export：`isSymlinkPointingTo()`（驗證用）與 `describePathKind()`（conflict reason 用）。type-check 0、`bun test` 63 pass 不變，行為未動。
- [x] 1.2 新增 `src/core/scan-installed.ts`，export `scanInstalledSkills()`。以 `readdir` 列舉每個 client 的 skills 根目錄，逐項 `resolveSymlinkTo()`，再以 `path.resolve` 後的結果查 `canonicalByResolved` map 回推 canonical entry.dir。目錄不存在 → `catch` 後 `continue`，不 throw。比對全程走 readlink 解析結果，未使用 basename。
- [x] 1.3 抽出 `src/core/skill-roots.ts` 的 `getSkillRoots(roots, clients, scope): SkillRoot[]`，回傳帶 client 標籤的 root（scanner 需要知道是哪個 client，原本 `mappings.ts` 只需要扁平陣列）。`mappings.ts` 改為 `getSkillRoots(...).map(r => r.root)`，同時移除已無用的 `opencodeSkillsRoot` 區域變數。`opencode` 的 global/project 差異與 `github` 的 `copilotRoot`/`githubRoot` 差異都保留在共用函式內。
- [x] 1.4 新增 `tests/scan-installed.test.ts`，**9 個測試**：計畫要求的 6 項，另加「只回報有指定的 client」、「相對路徑 symlink 也能解析」、「clients 為空回空 map」。
- [x] 1.5 `bun test` **72 pass / 0 fail**（原 63 + 新增 9），`bun run type-check` exit 0。

## 2. Picker state 三態改造

- [x] 2.1 定義 `Tri`、`RowState`、`PickerState = Map<string, Map<string, RowState>>`。
- [x] 2.2 `initState(groups, installed, clients)` 以 `triFor()` 算選定 clients 的交集大小推導三態，`desired` 初值 = `original`。`clients` 為空時一律 `none`（避免除以零式的誤判為 `all`）。
- [x] 2.3 `toggle()` 依 `original === 'partial'` 分流：三態循環 `partial → all → none → partial`，否則兩態 `all ⇄ none`。全程 immutable。
- [x] 2.4 `selectAllInTab()` 把整個 tab 的 `desired` 設為 `all`。
- [x] 2.5 新增 `resetTab()`，移除 `deselectAllInTab`。
- [x] 2.6 `flatten()` → `diff(state, groups): SkillDiff`，只有 `desired !== original` 才產生動作，`partial` 維持現狀不進任何清單。順序依 group → entry，兩份清單各自去重。
- [x] 2.7 `totalSelected()` → `pendingCounts(state, groups)`（需要 groups 才能算 diff）。
- [x] 2.8 新增 `rowMarker()`。另補 `outOfScopeClients()`（3.4 要用）與 `tabSelectedCount()`（tab badge 要用，原本靠 `Set.size`，三態化後不再適用）。
- [x] 2.9 重寫 `tests/skill-picker-state.test.ts`：**22 個測試**（原 8 個作廢）。`groupByCategory` 3 個保留；新增 initState 四種推導、`outOfScopeClients`、toggle 三種起始態（含三態循環三次回原點）、`selectAllInTab`/`resetTab` 只影響當前 tab、`resetTab` 不等於全移除、diff 六種情境、`pendingCounts`、`rowMarker`。
- [x] 2.10 `bun test tests/skill-picker-state.test.ts` → 22 pass / 0 fail。

## 3. Picker UI

- [x] 3.1 `SkillPicker` props 加 `installed` / `clients`，`initState` 改傳三參數。另在標題下加一行 `Clients: ...` 顯示當前參照系 —— 三態框的語意依賴「本次選了哪些 client」，畫面上不寫出來使用者無從判讀 `[~]` 是相對於誰。
- [x] 3.2 勾選框改用 `boxFor(desired)` 輸出 `[x]` / `[~]` / `[ ]`。
- [x] 3.3 列尾 pending 標記 `+`（綠）/ `-`（紅），由 `rowMarker()` 決定。
- [x] 3.4 列尾範圍外 client 灰字註記，`formatOutOfScope()` 以 `MAX_SHOWN_CLIENTS = 2` 為門檻，超過折成 `(claude, gemini +3)`。
- [x] 3.5 footer 改為 `Pending: {install} install · {remove} remove`。
- [x] 3.6 `d` 改呼叫 `resetTab()`，footer 文字改 `d reset`。另補 `setError(null)`（原 `d` 分支沒清錯誤訊息，reset 後仍殘留紅字）。
- [x] 3.7 `Enter` 守門改為 `counts.install === 0 && counts.remove === 0`，訊息改為「沒有任何待套用的變更」。
- [x] 3.8 `pickSkills(entries, opts)` 簽章加 `PickSkillsOptions`，回傳型別改 `Promise<SkillDiff>`；Back/Cancel error 流程不動。tab badge 由 `state.get(key)?.size` 改為 `tabSelectedCount()`（三態化後 Map 的 size 是總列數而非已選數，沿用會顯示成 `(5/5)`）。

## 4. unlink task

- [x] 4.1 `LinkTask` 加 `unlink` 分支。
- [x] 4.2 `MappingOptions` 加 `removeSkills?: string[] | null`，並新增**獨立的** `getRemovalMappings()`。**刻意不併進 `getMappings()`**：`buildLinkPlan()` 會對每個 mapping 跑 `ensureSourceTask()`，移除項若走同一條路，會在正要移除的 skill 上把 canonical 來源目錄建回來。
- [x] 4.3 新增 `analyzeRemoval()`：target 不存在 → `noop`；`isSymlinkPointingTo()` 通過 → `unlink`；否則 → `conflict`，reason 由 `describePathKind()` 寫出實際型別（`directory` / `file` / `symlink to X` / `broken symlink`）。
- [x] 4.4 `changes` 篩選加入 `unlink`。
- [x] 4.5 `needsLinkBackup()` 加 `unlink` 分支。**另修一處計畫未列出但同樣會漏的地方**：`preflightBackup()` 內層 `if (task.type === 'link' || task.type === 'conflict')` 也要加 `unlink`，否則就算 `needsLinkBackup()` 回 true，target 仍不會進 `targets` 集合，預檢照樣落空。
- [x] 4.6 `applyLinkPlan()` 加 `unlink` 分支：apply 期以 `isSymlinkPointingTo()` 再驗一次（不符且路徑仍存在 → conflicts，已消失 → skipped）；`backupPath()` 回 `false` 計入 skipped 而非 removed；回傳值加 `removed`。
- [x] 4.7 `git diff --quiet src/core/backup.ts src/core/undo.ts` 通過 —— 兩檔**完全未動**，design.md Decision 5 成立，manifest 格式與 undo 流程零改動。

## 5. Status 全域掃描

- [x] 5.1 `getLinkStatus()` 加 `scanAll?: boolean`（型別擴為 `LinkStatusOptions`）。`withAllSkills()` 以 `detectInstalledClients()` 取得全部 client，再用 `scanInstalledSkills()` 求出「至少裝在某處」的 skill 集合當 `selectedSkills`。**刻意不列出全部 skill × 全部 client**：那會為每個從未安裝的組合產生一列 `missing`，把真正有意義的資料淹掉。
- [x] 5.2 `showStatus()` 改用 `scanAll: true`，標題改為 `all detected clients`；掃描失敗時 fallback 回原本的 session 範圍 status，不讓 View status 直接壞掉。
- [x] 5.3 `formatSkillsOverview()` 改為 `Skills pending: N install · M remove · Installed: X / Y`，兩個數字分開。主循環另計算 `installedGlobalCount`（跨所有偵測到的 client）。

## 6. CLI 串接

- [x] 6.1 `selectSkills(scope, clients, canonicalOverride)` 先跑 `scanInstalledSkills()` 再把 `installed` / `clients` 傳進 `pickSkills()`，回傳 `SkillSelection | 'back'`。掃描失敗時退回空 map（picker 仍可用，只是全部顯示未安裝），不讓整個流程掛掉。

  **實作中抓到的真實 bug**：初版只掃「本次選定的 clients」，導致 spec 的「範圍外 client 以灰字呈現」scenario 完全失效 —— 沒被掃到的 client 不可能出現在註記裡。以 sandbox 實測：clients 只選 `gemini` 時，已裝在 `claude` 的 `beta` 顯示 `[ ]` 但**沒有** `(claude)` 註記。已改為掃 `detectInstalledClients()` 與選定 clients 的聯集；`initState()` 本來就只依選定 clients 推導三態，傳較寬的 map 不影響勾選框。修正後同一 sandbox 輸出 `[ ] 01_Coding/beta (claude)`，符合 spec。已加 regression 測試鎖住此契約。
- [x] 6.2 wizard 的 `skills` step 與主循環的 `action === 'skills'` 分支都改存 `skills` / `removeSkills` 兩份。
- [x] 6.3 `runChange()` 簽章加 `removeSkills`，傳進 `buildLinkPlan()` 與 `applyMigration()`；plan summary 加 `Removals: N`（數的是實際產生的 `unlink` task，不是使用者勾選數 —— 被降級成 conflict 的不該算進去）。另把 `removeSkills` 一路串到 `migrate.ts` 的 `applyMigration` opts 與 `MigrationResult.links.removed`。
- [x] 6.4 apply 摘要加入 `removed N links` 與 `skipped N paths`。skipped 單獨顯示是必要的：`backupPath()` 因父路徑已備份而回 `false` 時，東西其實還在磁碟上，併進 removed 會謊報。
- [x] 6.5 `clients` 變更時比對前後值，真的變了才清空 `skills` / `removeSkills` 並提示使用者重選。**不是重新掃描而是直接作廢**：三態是相對於選定 clients 推導的，舊的 pending diff 在新參照系下沒有意義，沿用會把使用者沒看過的移除動作帶進 apply。

## 7. 驗收

- [x] 7.1 `bun run type-check` exit 0。
- [x] 7.2 `bun test` **95 pass / 0 fail**（13 檔、296 expect）。原 63 → 新增 scan-installed 9、picker-state 由 8 改寫為 22、unlink-skills 9。
- [x] 7.3 `bun run build` exit 0（`dist/main.js` 1.37 MB、`dist/cli.js` 2.6 KB），`bun run smoke` 兩個產物皆 PASS。

- [x] 7.6 **計畫外補上的測試**：第 4 節（unlink）原本沒有任何測試任務，但它是唯一會刪東西的路徑。新增 `tests/unlink-skills.test.ts` 9 個測試：plan 產生 unlink task、apply 移除 symlink 且 canonical 完好、undo 還原、**真目錄被拒絕且內容未動**、指向他處的 symlink 被拒絕、target 已不存在視為 noop、**apply 期 TOCTOU 重驗（plan 後把 symlink 換成真目錄 → 不移除、計入 conflict、使用者檔案完好）**、preflight 涵蓋 unlink target、安裝與移除混用共享單一 backup session 且單次 undo 全部回捲。
- [ ] 7.4 手動驗收（`bun run dev`，建議先備份自己的 `~/.agents` 與各 client 目錄）：
  - 全新環境安裝 2 個 skill 到 `claude` → 重啟 CLI 選 `claude` → 兩列顯示 `[x]`。
  - 重啟選 `claude, gemini` → 那兩列顯示 `[~]`，列尾無範圍外註記。
  - 重啟只選 `gemini` → 那兩列顯示 `[ ]`，列尾灰字 `(claude)`。
  - 把一列從 `[x]` 按成 `[ ]` → 標 `-` → 送出套用 → 該 symlink 消失、canonical 完好。
  - 立刻 `Undo last change` → symlink 回來。
  - `[~]` 連按 `Space` 三次回到 `[~]` → footer `Pending: 0 install · 0 remove` → `Enter` 被擋。
  - `d` 按下後回到原始狀態，不是全部移除。
  - 一次同時裝 2 個、移除 1 個 → 單次 undo 全部回捲。
- [x] 7.5 `openspec validate reflect-installed-skill-state --strict` 通過。
