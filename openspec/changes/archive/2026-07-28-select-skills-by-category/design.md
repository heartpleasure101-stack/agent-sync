## Context

Canonical skills 目前的實體佈局（`.agents/skills/`）已由使用者手動改成分類制：
- `01_Coding/` — 15 個技能（openspec-*、git-*、gen-test-cases）
- `02_WordProcessing/` — 2 個（course-page-generator、proposal-writer）
- `03_Medie/` — 4 個（audio-to-srt、srt-*）

Client 端（`~/.claude/skills`、`~/.gemini/skills` 等）並不理解「分類」概念，官方 skill 規範也是扁平的 `skills/<name>/SKILL.md`。目前 `src/core/mappings.ts` 為 `skills` 建立 **一條** mapping，把 canonical `skills/` 整包 symlink 過去，因此 client 端會直接看到 `01_Coding` 這種資料夾名，被當成「一個名為 01_Coding 的 skill」— 這既不是分類想達成的效果，也違反 skill 規範。

`src/core/skills.ts` 的 `findSkillDirs()` 本來就允許 skill 存在任意巢狀路徑，只以 `SKILL.md` 為判準；migration 已能正確走訪。但 `mappings.ts` / `plan.ts` / `apply.ts` 這條 link 路徑不會走 `findSkillDirs`，所以整包 link 才會出問題。

## Goals / Non-Goals

**Goals：**
- 讓使用者依分類瀏覽 canonical skills，精準勾選要 link 給 client 的那些。
- 提供 `Select all` / `Deselect all` pseudo-option，避免逐一勾選 20+ 項。
- Client 端 `skills/` 保持扁平（`skills/<skill-name>`），完全與現有 client 規範一致。
- 選擇只存在 session 內；重啟 CLI 時重新問，符合現有 client 選擇模式。

**Non-Goals：**
- 持久化 skill 選擇到 disk（例如寫入 `.agents/config.json`）— 與 [[persist-client-selection]] 一起做，是另一個 change。
- 提供 `--skills` 之類的非互動 CLI flag — 另一個 change。
- 支援 skill 之間的依賴或分組（例如選 `openspec-propose` 自動帶 `openspec-explore`）— 目前無此需求。
- 更改 skills 的實體目錄結構或搬動檔案。

## Decisions

**1. 「分類」= canonical `skills/` 直屬子目錄。**
不引入新的 config 檔或 metadata 標籤。只要目錄裡沒有 `SKILL.md` 就當成分類節點；有 `SKILL.md` 就當成「無分類的 skill」（現有 `.agents/skills/git-branch-name` 這類舊佈局仍可用）。這讓分類「純粹是一個目錄組織方式」，使用者只要 `mkdir` 就能新增分類、`mv` 就能重分類，不必碰程式。
替代方案：在 SKILL.md frontmatter 加 `category:` 欄位 — 被否決，因為要動每個技能檔、且分類會漂到官方 spec 之外。

**2. Client 端仍是扁平 `skills/<skill-name>`。**
分類只是 canonical 端的組織工具，不會外洩到 client。實作上就是把每個選中的 skill dir 個別 symlink 到 `<clientRoot>/skills/<skill-name>`，分類目錄本身不 link。
替代方案：把分類也做成 client 端子目錄（例如 `~/.claude/skills/01_Coding/openspec-propose/`）— 被否決，違反 skill 規範，且 Claude / Codex 等實作對 skills 路徑有預期。

**3. `skills` mapping 從「單一 dir link」改為「多個 dir link，一個 skill 一條」。**
`getMappings()` 目前一條 mapping 對多個 targets（每個 client 一份）。改造後仍是同一條 mapping 名 `skills`，但 `targets` 展開為「每個 client × 每個選中的 skill」= n × m 條目，`source` 也不再是共用的 `skills/` 而是各 skill dir。等於原本一條 mapping 拆成 m 條同名 mapping（每個 skill 一條），或維持一條但 `source/targets` 都攤平。
決定用 **多條同名 mapping**（一個 skill 一條），因為 `Mapping` 型別是 `{ source, targets[], kind }`，每個 mapping 的 source 只能有一個；共用「一個 source → 多個 targets」的形狀在攤平後不成立。
替代方案：在 `Mapping` 型別加 `sources: []` — 被否決，會擴散影響 plan/apply/status/undo/backup 六個模組，改動面過大。

**4. `selectedSkills` 由 CLI 決定，`mappings.ts` 只是消費。**
`getMappings()` 新增 optional `selectedSkills?: string[]`（skill name 陣列，無分類前綴）。CLI 挑完之後傳入；未傳入時保留舊行為（整包目錄 link），維持 `mappings.ts` 對非 CLI 呼叫者（未來若有）的向後相容。
`buildLinkPlan`、`scanMigration`、`getLinkStatus` 皆已將 `opts` 透傳給 `getMappings`，只要在型別上新增欄位即可，無函式簽名破壞。

**5. 「全選 / 全不選」用 pseudo-option 而非額外提示。**
`@clack/prompts` 的 `multiselect` 沒有內建「全選」按鈕，最乾淨的做法是在 options 陣列頭尾插入兩個特殊條目：
```
[ ] ─ Select all (in this category)
[ ] ─ Deselect all
<real skills...>
```
提交後在 handler 判定：若命中 `__all__` 則把該分類全部勾上、若命中 `__none__` 則全部清空，然後**重新顯示**同一個 picker（loop 直到使用者按下真正的 skills 或取消）。
替代方案 A：改用 `select`（單選）先做動作、再進 multiselect — 被否決，多一次按鍵、破壞使用者對 client picker 的肌肉記憶。
替代方案 B：加 keybinding hint（例：按 `a` 全選） — 被否決，clack 沒有公開的擴充點。

**6. 分類階段用 multiselect，讓使用者一次選多個分類。**
只想選 `01_Coding` 就只勾它；想跨分類就都勾。選完後把這些分類底下所有 skill 做聯集，進入 skill picker。若沒有任何分類（或所有 skill 都在根目錄），跳過分類選擇直接進 skill picker。

**7. Skill 名稱衝突處理。**
若不同分類底下出現同名 skill（例：`01_Coding/foo` 與 `03_Medie/foo`），`selectedSkills` 只是名字沒有分類前綴 — 這在現行資料下不會發生（`ls` 驗證過），但為求穩健：`listSkills()` 若偵測到衝突，回傳時 skill 名保留分類前綴（`01_Coding/foo`、`03_Medie/foo`）僅供顯示；實際 symlink target 名字沿用 skill 目錄的 basename，因此 client 端仍會撞名 → 在 plan 階段以 `conflict` 呈現，讓使用者用既有 overwrite 流程處理。此邊界情況先不特別做 UI，只保證不會靜默覆蓋。

**8. 主循環重新選擇。**
比照 `Change clients`，加 `Change skills` action。重新挑選後下一輪 `getLinkStatus`／`buildLinkPlan` 會自動反映。

## Risks / Trade-offs

- **舊的「整包 skills dir symlink」與新的「個別 skill symlinks」在切換當下會衝突**：現有 client 端會有一個舊符號連結指向 canonical `skills/`。新 plan 想在 `<clientRoot>/skills/<name>` 建 symlink 時，會發現 `<clientRoot>/skills` 本身是 symlink 到別的地方 → 落到 `conflict` 分支。Mitigation：依 `run()` 內 `Apply changes + overwrite conflicts` 分支，由使用者一次授權清掉；不做自動遷移程式碼。文件（`README.md` 或 release note）需提示這件事。
- **使用者把某個 skill 從分類 A 移到分類 B**：session 內若已挑選，重跑 CLI 需要重新挑（合理，因為選擇不持久化）。
- **skills 數量很多時 multiselect 難用**：暫可接受；若日後常態超過 40 個再考慮加搜尋。
- **`Select all` pseudo-option 誤觸**：使用者可能誤按空白鍵勾到 `Select all` 就 Enter，導致選了不想要的。Mitigation：`Select all` 動作後 picker 重新顯示（不直接送出），使用者仍有機會取消。

## Migration Plan

單一 release。既有使用者第一次跑會遇到「原本的 `~/.claude/skills` symlink 對不上新結構」的衝突提示，選 `Apply changes + overwrite conflicts` 一次即完成過渡。Rollback = revert commit + 手動重建原本的 `~/.claude/skills` symlink（`ln -s ~/.agents/skills ~/.claude/skills`）。

## Open Questions

- 分類名要不要在 skill picker 顯示前綴（例：`01_Coding/openspec-propose`）？決定：**要**，方便使用者辨識來源；但實際 link 到 client 時取 basename。
- 若使用者只選 `Select all` 就送出，`required: true` 該不該仍生效？決定：`Select all` 動作不 submit picker，會 loop 回同一個 picker 並把該分類全勾好，因此 `required: true` 語意不變（真正 submit 時陣列一定非空）。
