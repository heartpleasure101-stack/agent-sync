## Why

`select-skills-by-category` 落地的 skill 挑選流程是「先 clack multiselect 選分類、再 clack multiselect 選 skill」兩個獨立畫面。實測（`bun run dev`）暴露兩個問題：
1. 兩步操作使用者要來回切畫面才知道自己選了哪些分類、又進了哪些 skill；當某分類 skill 很多（例：`01_Coding` 15 個）時，聯集畫面很長且不知道每個 skill 屬於哪一組。
2. 使用者明確表示希望的互動模型是 AskUserQuestion 那種「分類 = tab、方向鍵切 tab、每個 tab 內獨立 multi-select」— 資訊架構跟他們心裡的分類直覺一致，「這個 skill 屬於哪個分類」永遠有視覺定位。

我們要把 skill picker 換成 tabbed UI：一次展示所有分類（chip / tab），使用者用 `←/→` 或 `Tab` 切分類，在當前分類內用 `↑/↓` + `Space` 勾選 skill，`Enter` 送出。每個分類獨立記選擇，跨 tab 保留狀態。仍保留 `Select all` / `Deselect all` 快捷（作用於當前 tab）。

## What Changes

- 新增 `ink` (React for CLI) 為 runtime dependency，並加 `react`（Ink 的 peer dep）。改寫 `selectSkills()` 為 Ink 元件 `<SkillPicker>`：頂部一列 tabs（每個分類一個，含選中數 badge，例：`01_Coding (3/15)`）；中央列該 tab 的 skill list；底部 status/help 行。
- 保留現有 clack prompt（scope、client、action 等）不動；只換 skill picker。
- 「無分類」skill 若存在，作為一個特殊 tab（顯示為 `(uncategorized)` 或依現有 canonical 命名）。
- 支援鍵盤：`←/→` 或 `Tab` / `Shift+Tab` 切分類、`↑/↓` 移 focus、`Space` toggle 當前 skill、`a` = 當前分類 Select all、`d` = 當前分類 Deselect all、`Enter` 送出全部選擇、`Esc` / `Ctrl+C` 取消。
- Overview 顯示格式不變（`Skills: N / Total · Categories: …`）。
- 移除 `Select all` / `Deselect all` pseudo-option（tab UI 已用鍵盤快捷取代）。

## Capabilities

### Modified Capabilities
- `skill-selection-ux`：把 Requirement `Category-first browsing` 與 `Skill multiselect with select-all / deselect-all` 換成新的 `Tabbed picker` requirement；其它 requirement（flat client layout、session-scoped、mapping 層 selectedSkills、empty canonical、overview）不變。

## Impact

- `package.json` — `dependencies` 加 `ink`, `react`（並確認 `@types/react` 走 devDependencies 或用 Ink 內建型別）。node engines 需 ≥ 18（現況即符合）。
- `src/cli.tsx` — `selectSkills()` 與 `pickSkillsFromEntries()` 換成 Ink render 呼叫；改用 `render()` 掛載元件，並用 Promise 包成同 signature 給 `run()` 呼叫，`run()` 其餘不動。
- 新增 `src/ui/skill-picker.tsx` — Ink 元件本體（tabs + list + help footer）。
- `src/core/list-skills.ts`、`src/core/mappings.ts` — 不動。
- 測試：Ink 元件不做 e2e snapshot（成本高、Ink 官方測試工具 `ink-testing-library` 亦需引入），但抽出 pure helper `groupByCategory(entries)`、`toggleSkill(state, dir)`、`selectAllInTab(state, tabDirs)`、`deselectAllInTab(state, tabDirs)`，對它們做單元測試；元件本身靠手動 `bun run dev` 驗收。
- `openspec/changes/select-skills-by-category/specs/skill-selection-ux/spec.md` — 不動（已 archived-worthy 但暫留）；本 change 的 spec 用 `## MODIFIED Requirements` 覆寫上述兩條。
- Build size：Ink 打進 `dist/cli.js` 會顯著變大（估數十 KB → 數百 KB，實測後補）；因 CLI 場景可接受。
- 一致性：其它 clack prompts 保留，避免全面改寫。使用者會感覺「主流程仍是 clack 的問答，skill 挑選這一步換成 tab UI」— 這是刻意設計。

## Non-Goals

- 不引入完整 TUI 框架取代 clack。
- 不做搜尋輸入框（skill 數量現況可接受；未來若超過 40 個再做另一 change）。
- 不做拖曳排序、樹狀展開等進階互動。
- 不改變 selectedSkills 的 identity（仍為 skill dir 絕對路徑）。
