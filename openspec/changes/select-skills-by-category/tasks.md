## 1. Skill 列舉核心

- [x] 1.1 新增 `src/core/list-skills.ts`，export `listSkills(opts?: { scope?: Scope; homeDir?: string; projectRoot?: string }): Promise<SkillEntry[]>`，其中 `SkillEntry = { name: string; category: string | null; dir: string; displayName: string }`。
- [x] 1.2 實作規則：走 canonical `skills/` 底下每個一階子目錄；若該目錄本身含 `SKILL.md` → `category = null, name = basename, dir = 該目錄`；否則視為分類，繼續走它底下每個含 `SKILL.md` 的子目錄，`category = 分類名, name = skill basename, dir = skill 目錄`。優先重用 `src/core/skills.ts` 的 `isSkillDir()`。
- [x] 1.3 `displayName` 規則：`category ? \`\${category}/\${name}\` : name`。
- [x] 1.4 若不同分類出現同 `name`，`displayName` 保留分類前綴，並在回傳結果加 `hasCollision: true` 供上層決策（暫不做特別 UI，只在測試中驗證）。
- [x] 1.5 canonical `skills/` 不存在時回傳 `[]`，不 throw。

## 2. Mappings 支援 subset

- [x] 2.1 `src/core/mappings.ts` 的 `MappingOptions` 新增 `selectedSkills?: string[] | null`（`null` 或 `undefined` = 舊行為「整包 link」，空陣列 `[]` = 「不 link 任何 skill」）。
- [x] 2.2 `getMappings()` 內 `skills` 區塊：當 `selectedSkills` 為 array 時，改用 `listSkills()` 找出對應的 skill dir，展開成多條 `Mapping`（每個 skill 一條，`source = 該 skill dir`，`targets = 每個 client 的 <clientRoot>/skills/<name>`，`kind: 'dir'`），mapping 名維持 `skills`；未選中的 skill 完全不進 mapping。
- [x] 2.3 沒有 client 被勾中 `skills` mapping 時（例：只選 `github` 專案 scope 但不含 skills 條件），維持現行過濾行為。
- [x] 2.4 `selectedSkills = []` 時：不產生任何 `skills` mapping 條目（等同「這輪不動 skills」）。

## 3. CLI 分類 / skill picker

- [x] 3.1 `src/cli.tsx` 新增 `selectSkills(scope: Scope): Promise<string[]>`，回傳 skill `name` 陣列（無分類前綴）。
- [x] 3.2 內部先呼叫 `listSkills({ scope })`；若總數為 0，回傳 `[]` 並 note 提示「未偵測到任何 canonical skill」。
- [x] 3.3 若所有 skill 皆 `category === null`（沒有分類層），跳過分類 picker，直接進 skill picker（含 Select all / Deselect all pseudo-option）。
- [x] 3.4 有分類時：先用 `multiselect` 讓使用者選一個以上分類（options 依 category 名排序），`required: true`。
- [x] 3.5 用選中的分類過濾 `SkillEntry[]`，餵給 skill picker 的 `multiselect`。options 前兩項為 pseudo-option：`{ label: '── Select all ──', value: '__ALL__' }`、`{ label: '── Deselect all ──', value: '__NONE__' }`；其後每個 skill option 用 `displayName` 當 label、`name` 當 value；`initialValues: []`；`required: true`。
- [x] 3.6 攔截 pseudo-option：submit 後若結果包含 `__ALL__` → 記住「當前分類全部 skill 的 name 陣列」為新的 initial 並重跑同 picker；若包含 `__NONE__` → 以 `[]` 為 initial 重跑；同時包含兩者 → 以「最後一個被選」為準（用 pseudo-option 在陣列中的相對位置判斷）。
- [x] 3.7 使用者一般 submit（無 pseudo-option）→ 回傳選中的 skill name 陣列。取消（`isCancel`）比照現有 `exitCancelled()`。
- [x] 3.8 `run()` 在 `clients = await selectClients()` 之後、進 while 之前，加 `let skills = await selectSkills(scope)`；把 `skills` 一路傳給 `getLinkStatus`、`buildLinkPlan`、`runChange` 的 opts（透過 `MappingOptions.selectedSkills`）。
- [x] 3.9 `Overview` note 新增一行：`Skills: <N> selected / <Total> available` 及選中的分類清單（若少於等於 3 則列名字，否則只顯示數量）。
- [x] 3.10 主循環 action list 在 `Change clients` 後加 `Change skills`，行為就是 `skills = await selectSkills(scope)`；`continue`。
- [x] 3.11 `runChange()` 內 `scanMigration` / `buildLinkPlan` 都要傳 `selectedSkills: skills`；migration 目前不受 selectedSkills 影響（migration 是把 client → canonical，永遠處理全部），此點需在程式註解中說明或於 `scanMigration` 忽略 `selectedSkills`。

## 4. Plan / apply / status 驗證

- [ ] 4.1 手跑 `bun run dev`，情境 A：canonical 有 skills、選 2 個分類共 3 個 skill、apply 到全部 client → 檢查每個 `<clientRoot>/skills/<name>` 是 symlink 指向對應 canonical skill dir，且分類目錄本身沒有出現。
- [ ] 4.2 情境 B：舊有 `<clientRoot>/skills` 是整包 symlink → 執行新流程 → 走 `Apply changes + overwrite conflicts` → 舊 symlink 被清、個別 skill symlink 建成功；`Undo last change` 可回滾到舊狀態。
- [ ] 4.3 情境 C：選 0 個 skill（Deselect all 後 submit 應被 `required: true` 擋住；用「取消 Change skills」的方式退出 picker 保留原 skills）→ 確認主循環正常。
- [ ] 4.4 情境 D：canonical 完全沒 skills → `selectSkills` 回傳 `[]`，`Overview` 顯示 `Skills: 0 / 0 available`，`Change skills` 仍可用但一按就提示「無 skill」。

## 5. 測試

- [x] 5.1 `tests/list-skills.test.ts`：用 temp dir mock canonical，覆蓋（a）純分類佈局（b）純扁平舊佈局（c）混合（d）分類與根同名衝突 → `displayName` 有前綴、`hasCollision === true`（e）canonical 不存在 → `[]`。
- [x] 5.2 擴充或新增 `tests/mappings.test.ts`：驗證 `selectedSkills: undefined` 仍走舊「整包 link」；`selectedSkills: ['openspec-propose', 'audio-to-srt']` 展開為兩條 mapping、targets 平坦、client 未勾選則不出現。
- [x] 5.3 `bun test` 全綠、`bun run type-check` 全綠。

## 6. 文件

- [x] 6.1 `README.md`：若有描述舊「整包 skills symlink」行為，改成新版兩段式選擇（先分類、再 skill），並註明第一次執行可能出現 overwrite conflict。
- [ ] 6.2 Release note 或 CHANGELOG（若有）：加 "Skills are now selected per-run by category" 段落，提醒使用者第一次執行的 overwrite 提示是預期行為。
