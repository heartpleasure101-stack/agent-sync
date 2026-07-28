## Context

現行 `selectSkills()` 用兩個 clack `multiselect`：先選分類、再進聯集 skill picker（頂端有 Select all / Deselect all pseudo-option）。實作在 `src/cli.tsx` `pickSkillsFromEntries` 與 `selectSkills`；已驗證運作但使用者體驗回饋是「不像我心裡的模型」。

Clack 的 prompt 都是「一問一答、垂直流」的形式；沒有 tab、沒有兩軸導航。要做 tabbed UI 只能自己用 raw stdin/stdout 寫（重造輪子），或引入一個能同時處理 rendering + input 的 TUI 函式庫。

Ink 是這類需求的主流選擇：React 元件寫法、有 `useInput()` hook 直接接鍵盤事件、`ink-select-input` 等生態元件成熟、與現有 `.tsx` 副檔名相容（雖然目前無 JSX）。

## Goals / Non-Goals

**Goals：**
- 一頁式介面：使用者一眼看到所有分類與各分類的選中狀態；不需來回切畫面。
- 鍵盤導航貼近 IDE tab：`←/→` 或 `Tab` 切分類、`↑/↓` 移 focus、`Space` toggle、`Enter` 送出、`a`/`d` 快捷全選/全不選（作用於當前 tab）。
- 選擇語意不變：回傳 `string[]` 為 skill dir 絕對路徑；`run()` 呼叫方式不動。
- 其它 prompt 維持 clack，避免整份 CLI 改寫。

**Non-Goals：**
- 不做搜尋 / fuzzy filter。
- 不做 tab 拖曳、樹狀展開。
- 不改變 mapping / plan / apply 任何行為（純 UI）。
- 不寫 Ink 元件的 snapshot / e2e 測試。

## Decisions

**1. UI 函式庫選 Ink。**
評估過三個替代：
- (a) 自己用 raw stdin/stdout — 高風險，光是「rerender 不閃、正確清行、跨終端 escape sequence 相容」就要花不少時間，不值得。
- (b) `enquirer` — 有 `Snippet` / `Toggle` 等元件但沒有 tab；同樣要自幹。
- (c) 換掉 clack 改用 `@inquirer/prompts` 或別的 — 影響面過大，本 change 只想改一步。

Ink 兼顧「React 心智模型（易寫）」、「已有生態元件」、「node ≥ 18 相容」。
新增 runtime deps：`ink`（4.x 起需要 React 18）、`react`（18.x）。build size 上升可接受。

**2. Tab bar 呈現。**
橫向 chip 列，每個 tab 顯示 `<CategoryName> (<selected>/<total>)`。當前 tab 反白，箭頭指標移到 skill list 時 tab bar 仍高亮以維持定位感。
- 排序：按 category 名 asc（與現有實作一致）。
- 「無分類」skill 集合顯示為 tab `(uncategorized)`，永遠列在最右（或最左，實作時挑一）。若沒有無分類 skill，就不出現此 tab。

**3. 每 tab 獨立勾選狀態，全局 union 送出。**
內部 state 是 `Map<categoryKey, Set<skillDir>>`；切 tab 不影響已勾。`Enter` 送出時把所有 Set 攤平成 `string[]`。
- Select all（快捷 `a`）= 把當前 tab 的所有 skill dir 加進該 Set。
- Deselect all（快捷 `d`）= 清空當前 tab 的 Set（不影響其它 tab）。

**4. 鍵盤 map：**
- `←` / `Shift+Tab` — 上一個 tab
- `→` / `Tab` — 下一個 tab
- `↑` / `↓` — 移動當前 tab 內的 skill focus
- `Space` — toggle focus 的 skill
- `a` — 當前 tab Select all
- `d` — 當前 tab Deselect all
- `Enter` — 送出全部選擇
- `Esc` / `Ctrl+C` — 取消（同 `exitCancelled()` 的行為，process.exit(0)）

`Enter` 若全局 union 為空，不送出，並在 footer 顯示紅字提示 `至少要選 1 個 skill`（等同現行 `required: true`）。

**5. 元件檔案位置與匯出。**
新增 `src/ui/skill-picker.tsx`。對外只 export 一個 async function：
```ts
export async function pickSkills(entries: SkillEntry[]): Promise<string[]>;
```
它內部用 `ink` 的 `render()` 啟動 App，並把 Promise 的 resolve/reject 綁到 App 的 onSubmit/onCancel。`cli.tsx` 的 `selectSkills()` 只負責 `listSkills()` + 空集合處理 + 呼叫 `pickSkills(entries)`，介面對 `run()` 完全不變。

**6. Pure helper 抽出便於測試。**
新增 `src/ui/skill-picker-state.ts`：
- `groupByCategory(entries): { key, label, entries }[]` — 分類分組（含 uncategorized）。
- `initState(groups)` — 每組空 Set。
- `toggle(state, key, dir)`、`selectAllInTab(state, key)`、`deselectAllInTab(state, key)`、`flatten(state)`、`totalSelected(state)`。
這些是 pure function，可覆蓋單元測試。Ink 元件只做 rendering + input dispatch。

**7. Bun 環境相容性。**
- `bun run dev` 直接執行 tsx 檔案，Ink 需要 React JSX runtime — 需在 `tsconfig.json` 確認 `"jsx": "react-jsx"` 與 `"jsxImportSource"` 相符（實作時檢查、必要時調整）。
- `bun build` 已 target node、format esm，Ink 支援 esm。

## Risks / Trade-offs

- **[Bundle size 上升]** → Ink + React 一併打進 dist/cli.js，size 增長估數百 KB。CLI 場景可接受，不需 code split。
- **[終端相容性]** → Ink 依賴 ANSI；Windows 舊 cmd 未必良好，但專案面向 macOS / Linux 使用者為主（package.json engines 沒特別限制）。若真的有回報再處理。
- **[Ink 與 clack 混用]** → 兩者不會同時 render；`pickSkills()` 用 `render()` 掛載、`onExit` 卸載後才回 `run()` 繼續呼叫下一個 clack prompt。實作時要確保 Ink 的 `render().waitUntilExit()` 有正確 await，否則會與 clack 搶終端。
- **[JSX 學習曲線]** → 團隊只需寫一個 Ink 元件，複雜度可控；不改變其它任何互動。

## Migration Plan

單一 release。使用者感受到的變化是「skill 挑選畫面變成分頁式」，不需任何資料遷移。舊 CLI 選擇邏輯與 selectedSkills 型別完全不變，rollback = revert commit。

## Open Questions

- `(uncategorized)` tab 放最左還是最右？建議最右（分類 tabs 依名字 asc 排完後再接它），避免破壞 `01_Coding` 這種前綴命名的視覺順序。實作時確認。
- 是否加 hint「按 `?` 顯示 keymap」？—— 可以，footer 一行輕量顯示 keymap，超過螢寬時折行。
