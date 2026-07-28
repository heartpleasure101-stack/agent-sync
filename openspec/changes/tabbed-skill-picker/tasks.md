## 1. 相依與環境

- [x] 1.1 `bun add ink react` 並在 `package.json` 加 `"ink": "^5"`、`"react": "^18"` 到 `dependencies`。
- [x] 1.2 檢查 `tsconfig.json` 是否已設 `"jsx": "react-jsx"` 與 `"jsxImportSource": "react"`；若未設則加上，並跑 `bun run type-check` 確認 `src/cli.tsx` 沒被誤解析成 JSX 而報錯（現況 cli.tsx 無 JSX，加設定應無影響，需驗證）。
- [x] 1.3 確認 `bun run dev` 與 `bun run build` 都能正常執行（Ink esm import 應相容）。

## 2. Pure state helper

- [x] 2.1 新增 `src/ui/skill-picker-state.ts`，定義：
  - `type TabGroup = { key: string; label: string; entries: SkillEntry[] }`
  - `type PickerState = Map<string, Set<string>>`（key = tab key, value = 該 tab 已勾 skill dir 集合）
- [x] 2.2 export `groupByCategory(entries: SkillEntry[]): TabGroup[]`：分類 tabs 依 category 名 asc；uncategorized 若存在則置於陣列末（key = `__uncategorized__`, label = `(uncategorized)`）。
- [x] 2.3 export `initState(groups: TabGroup[]): PickerState`：每組空 Set。
- [x] 2.4 export `toggle(state, key, dir): PickerState`（immutable 回新 Map）、`selectAllInTab(state, group): PickerState`、`deselectAllInTab(state, key): PickerState`。
- [x] 2.5 export `flatten(state: PickerState): string[]`（順序依 group 順序、tab 內按 entry 原順序，並去重）、`totalSelected(state): number`。

## 3. 單元測試

- [x] 3.1 新增 `tests/skill-picker-state.test.ts`：覆蓋 `groupByCategory`（純扁平 → 只有 uncategorized tab、純分類 → 無 uncategorized tab、混合、排序正確）、`toggle`（開/關）、`selectAllInTab` / `deselectAllInTab`（只影響當前 tab，不動其它 tab）、`flatten`（跨 tab union、去重、順序）。
- [x] 3.2 `bun test` 全綠。

## 4. Ink 元件

- [x] 4.1 新增 `src/ui/skill-picker.tsx`，元件 `<SkillPicker groups initialState onSubmit onCancel />`：
  - Layout：頂 `<TabBar>`（橫向 chips，每個顯示 `label (selected/total)`；當前 tab 反白）→ 中央 `<SkillList>`（該 tab 的 skill list，`>` 指標 + `[x]/[ ]`）→ 底 `<StatusFooter>`（`Total: N/M selected` + 鍵盤 hint）。
  - 使用 `useInput` 綁鍵：`←`/`Shift+Tab` prev tab、`→`/`Tab` next tab、`↑`/`↓` move focus、`space` toggle、`a` selectAllInTab、`d` deselectAllInTab、`return` submit、`escape` cancel。
  - Submit：若 `totalSelected === 0`，footer 顯示紅字 `至少要選 1 個 skill`，不呼叫 onSubmit。
- [x] 4.2 export `pickSkills(entries: SkillEntry[]): Promise<string[]>`：內部 `render(<SkillPicker …/>)`，用 Promise resolve/reject 綁 onSubmit/onCancel；`waitUntilExit()` 後回傳。

## 5. CLI 接線

- [x] 5.1 `src/cli.tsx` 移除 `pickSkillsFromEntries`、`SELECT_ALL_TOKEN` / `DESELECT_ALL_TOKEN` 兩常數，與相關 clack multiselect 迴圈。
- [x] 5.2 `selectSkills(scope)` 保留：先 `listSkills()`，空則 note + `[]`；否則呼叫 `pickSkills(entries)` 回傳。
- [x] 5.3 `run()` 呼叫方式、`Change skills` action、Overview 顯示 — 全部不動。

## 6. 驗證

- [ ] 6.1 `bun run dev` 手動測：分類切換（`←`/`→` / `Tab`）、`Space` 勾選、`a`/`d` 快捷、`Enter` 送出、`Esc` 取消、`Enter` 送出空選會被擋。
- [ ] 6.2 對照 spec：canonical 只有扁平 skill → 只顯示 `(uncategorized)` 一個 tab、行為正常。
- [x] 6.3 `bun test` 全綠、`bun run type-check` 全綠、`bun run build` 成功並比對 `dist/cli.js` size 前後差（記錄於 PR 描述，非阻塞）。實測：38 tests pass、type-check clean、`dist/cli.js = 1.42 MB`（引入 ink+react 前無 dist，僅 tsx 執行）。

## 7. 文件

- [x] 7.1 `README.md`：更新 skill 挑選段落，改述 tabbed picker 與鍵盤 map。
- [x] 7.2 移除 `select-skills-by-category/tasks.md` 內已被本 change 覆蓋的 pseudo-option 說明？— 不移除，那份 change 已 archived-worthy，用歷史保留。
