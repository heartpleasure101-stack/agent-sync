## 1. 反向掃描

- [ ] 1.1 從 `src/core/plan.ts:34-65` 的 `analyzeTarget()` 抽出 symlink 身分判定：`resolveSymlinkTo(target): Promise<string | null>`（lstat 非 symlink → null；readlink → 非絕對路徑則以 `path.dirname(target)` 解析 → 回傳絕對路徑）。放到 `src/core/link-target.ts` 或新的 `src/core/symlink.ts`，`plan.ts` 改為呼叫它，行為不變。
- [ ] 1.2 新增 `src/core/scan-installed.ts`，export `scanInstalledSkills(opts: { scope, clients, homeDir?, canonicalOverride? }): Promise<Map<string, Set<Client>>>`：
  - 對每個 client 取其 skills 根目錄（沿用 `src/core/mappings.ts:87-99` 的路徑推導，注意 `opencode` 在 global/project 走不同 root、`github` 在 global 走 `copilotRoot`、project 走 `githubRoot`）。
  - 目錄不存在 → 跳過，不 throw。
  - 對每個子項目呼叫 1.1 的 helper；解析結果比對 `listSkills()` 產出的 `entry.dir`（`path.resolve` 後比對）。
  - **MUST 以 readlink 結果比對，不可用 basename 反推**（不同分類同名 skill 會誤判）。
- [ ] 1.3 把 `src/core/mappings.ts:87-99` 的 skills 根目錄推導抽成共用函式，避免 `mappings.ts` 與 `scan-installed.ts` 兩份路徑邏輯漂移。
- [ ] 1.4 新增 `tests/scan-installed.test.ts`：指向 canonical 的 symlink 被收錄、真目錄不被收錄、指向他處的 symlink 不被收錄、不同分類同名只認 readlink 對得上的那個、client skills 目錄不存在不 throw、多 client 聚合成同一個 Set。
- [ ] 1.5 `bun test` 全綠。

## 2. Picker state 三態改造

- [ ] 2.1 在 `src/ui/skill-picker-state.ts` 定義三態型別：`type Tri = 'none' | 'partial' | 'all'`，`type RowState = { original: Tri; desired: Tri }`，`PickerState` 改為 `Map<string, Map<string, RowState>>`（tab key → skill dir → 狀態）。
- [ ] 2.2 改寫 `initState(groups, installed: Map<string, Set<Client>>, clients: Client[]): PickerState`：每列依 `installed.get(dir)` 與 `clients` 算交集大小 → `all` / `partial` / `none`，`desired` 初值等於 `original`。
- [ ] 2.3 改寫 `toggle(state, key, dir)`：`original === 'partial'` 走三態循環 `partial → all → none → partial`；否則走兩態 `all ⇄ none`。immutable 回新 Map。
- [ ] 2.4 `selectAllInTab(state, group)` 改為把整個 tab 的 `desired` 設為 `all`。
- [ ] 2.5 新增 `resetTab(state, key)`：整個 tab 的 `desired` 還原為 `original`。移除 `deselectAllInTab`（或改名保留為內部用）。
- [ ] 2.6 `flatten()` 改為 `diff(state, groups): { toInstall: string[]; toRemove: string[] }`：`desired !== original` 時，`desired === 'all'` 進 `toInstall`、`desired === 'none'` 進 `toRemove`；`desired === original` 一律不進（含 `partial` 維持現狀）。順序依 group 順序 → tab 內 entry 原順序，去重。
- [ ] 2.7 `totalSelected()` 改為 `pendingCounts(state): { install: number; remove: number }`。
- [ ] 2.8 新增 `rowMarker(rowState): '+' | '-' | null` 供 UI 用。
- [ ] 2.9 重寫 `tests/skill-picker-state.test.ts`（既有 8 個測試全部作廢）：`groupByCategory` 相關保留；新增 initState 三態推導（全裝 / 部分 / 全無 / installed 有範圍外 client 不影響推導）、toggle 兩態與三態循環（三次回到原點）、selectAllInTab 只影響當前 tab、resetTab 還原、diff 三種情境（含 partial 維持現狀不產生動作）、pendingCounts。
- [ ] 2.10 `bun test` 全綠。

## 3. Picker UI

- [ ] 3.1 `src/ui/skill-picker.tsx` 的 `SkillPicker` props 加 `installed` 與 `clients`；`initState` 呼叫改傳新參數。
- [ ] 3.2 勾選框渲染改三態：`[x]` / `[~]` / `[ ]`（取代 `src/ui/skill-picker.tsx:131` 的二元 `checked ? '[x]' : '[ ]'`）。
- [ ] 3.3 列尾加 pending 標記：`+` / `-` / 無，用顏色區分（`+` 綠、`-` 紅）。
- [ ] 3.4 列尾加範圍外 client 灰字註記：`installed.get(dir)` 扣掉本次 `clients` 後若非空，顯示 `(claude, gemini)`。超過 2 個折成 `(claude +3)`（實際門檻依終端寬度實測調整，見 design.md Open Questions）。
- [ ] 3.5 footer 從 `Total: {total} selected`（`src/ui/skill-picker.tsx:143`）改為 `Pending: {install} install · {remove} remove`。
- [ ] 3.6 `d` 的鍵位處理（`src/ui/skill-picker.tsx:92-95`）從 `deselectAllInTab` 改為 `resetTab`；footer 說明文字從 `d cancel-all` 改為 `d reset`。
- [ ] 3.7 `Enter` 守門條件（`src/ui/skill-picker.tsx:46-49`）從 `totalSelected(state) === 0` 改為 `install === 0 && remove === 0`，錯誤訊息改為「沒有任何待套用的變更」。
- [ ] 3.8 `pickSkills()` 回傳型別從 `Promise<string[]>` 改為 `Promise<{ toInstall: string[]; toRemove: string[] }>`；`SkillPickerBackError` / `SkillPickerCancelError` 流程不動。

## 4. unlink task

- [ ] 4.1 `src/core/types.ts` 的 `LinkTask` 加 `| { type: 'unlink'; source: string; target: string; kind: SourceKind }`。
- [ ] 4.2 `src/core/mappings.ts` 的 `MappingOptions` 加 `removeSkills?: string[]`，為每個要移除的 skill 產出對應的 target 清單（沿用 `mappings.ts:108-127` 的 per-skill 展開邏輯與 basename target 推導）。
- [ ] 4.3 `src/core/plan.ts` 為 `removeSkills` 產生 `unlink` task：**plan 期驗證** target 為 symlink 且解析後等於預期 source（用 1.1 的 helper）；不符者產生 `conflict` task（reason 明確寫出實際型別）。
- [ ] 4.4 `src/core/plan.ts:91-94` 的 `changes` 篩選加入 `unlink`，讓主循環的 `Pending changes` 計數涵蓋移除。
- [ ] 4.5 `src/core/preflight.ts` 的 `needsLinkBackup()` 加 `unlink` 分支（`preflight.ts:17-29` 現行第二行 `if (task.type !== 'link') return false` 會讓 unlink 落空），並確認 `preflightBackup()` 的 `targets` 集合收得到（`preflight.ts:43-49`）。
- [ ] 4.6 `src/core/apply.ts` 的 `applyLinkPlan()` 加 `unlink` 分支：
  - **apply 期再驗一次**（TOCTOU）：不符則計入 conflicts，不移除。
  - `const ok = await backupPath(task.target, backup)`；**`ok === false` 計入 skipped，不可計入 applied**（`hasParentPath` 靜默跳過，見 design.md R2）。
  - 回傳值加 `removed` 計數。
- [ ] 4.7 確認 `src/core/backup.ts` 與 `src/core/undo.ts` **完全不動**；若發現需要改，停下來重新評估 design.md Decision 5。

## 5. Status 全域掃描

- [ ] 5.1 `src/core/status.ts` 的 `getLinkStatus()` 加不受 `clients` / `selectedSkills` 過濾的模式（例如 `opts.scanAll: true`），對所有偵測到的 client 呼叫 `scanInstalledSkills()` 並組出 `LinkStatus[]`。
- [ ] 5.2 `src/cli-main.tsx` 的 `showStatus()`（`cli-main.tsx:243-247`）改用全域模式，讓 `View status` 呈現跨 session 的完整安裝矩陣。
- [ ] 5.3 Overview 的 `formatSkillsOverview()`（`cli-main.tsx:226-241`）文案調整，區分「本次範圍內」與「全域已安裝」兩個數字。

## 6. CLI 串接

- [ ] 6.1 `src/cli-main.tsx` 的 `selectSkills()`（`cli-main.tsx:205-224`）先呼叫 `scanInstalledSkills()`，把 `installed` 與 `clients` 傳進 `pickSkills()`；回傳型別改為 `{ toInstall, toRemove } | 'back'`。
- [ ] 6.2 wizard 的 `skills` step（`cli-main.tsx:379-386`）與主循環的 `action === 'skills'` 分支（`cli-main.tsx:434-441`）改存兩份清單。
- [ ] 6.3 `runChange()`（`cli-main.tsx:264-340`）把 `removeSkills` 傳給 `scanMigration` 以外的 `buildLinkPlan()`；plan summary 加一行 `Removals: N`。
- [ ] 6.4 apply 結果摘要（`cli-main.tsx:326-335`）加入移除筆數與 skipped 筆數。
- [ ] 6.5 `clients` 變更後（`cli-main.tsx:428-432`）MUST 重新掃描並重建 picker 初始狀態 —— 參照系變了，舊的三態推導失效。

## 7. 驗收

- [ ] 7.1 `bun run type-check` 通過。
- [ ] 7.2 `bun test` 全綠。
- [ ] 7.3 `bun run build` 成功。
- [ ] 7.4 手動驗收（`bun run dev`，建議先備份自己的 `~/.agents` 與各 client 目錄）：
  - 全新環境安裝 2 個 skill 到 `claude` → 重啟 CLI 選 `claude` → 兩列顯示 `[x]`。
  - 重啟選 `claude, gemini` → 那兩列顯示 `[~]`，列尾無範圍外註記。
  - 重啟只選 `gemini` → 那兩列顯示 `[ ]`，列尾灰字 `(claude)`。
  - 把一列從 `[x]` 按成 `[ ]` → 標 `-` → 送出套用 → 該 symlink 消失、canonical 完好。
  - 立刻 `Undo last change` → symlink 回來。
  - `[~]` 連按 `Space` 三次回到 `[~]` → footer `Pending: 0 install · 0 remove` → `Enter` 被擋。
  - `d` 按下後回到原始狀態，不是全部移除。
  - 一次同時裝 2 個、移除 1 個 → 單次 undo 全部回捲。
- [ ] 7.5 `openspec validate reflect-installed-skill-state --strict` 通過。
