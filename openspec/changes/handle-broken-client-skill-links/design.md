## Context

`src/utils/fs.ts:4-12` 的 `pathExists()` 用 `lstat`，對 broken symlink 回傳 `true`。這個選擇在多數地方是對的（`removePath()` 需要能刪掉 broken symlink），但它讓「路徑在」與「路徑可用」變成同一件事。`src/core/apply.ts:37` 的 `await ensureDir(path.dirname(target))` 就踩在這個縫上：當 `path.dirname(target)` 本身是 broken symlink 時，`mkdir({recursive:true})` 直接 `ENOENT`，而 `applyLinkPlan()`（`src/core/apply.ts:44-117`）的迴圈沒有 per-task try/catch，整批中斷。

另一端，`src/core/scan-installed.ts:55-62` 對 `readdir` 失敗一律 `continue`，註解明寫「Not an error — it simply has nothing installed」。broken symlink 的 `readdir` 也是 `ENOENT`，於是被歸類成「沒裝東西」。兩處合起來的結果就是：picker 顯示乾淨，apply 才炸，錯誤訊息只有 `ENOENT`。

實測確認（node 對 broken symlink 路徑）：`mkdirSync recursive` → `ENOENT`、`symlinkSync` → `ENOENT`、`readdirSync` → `ENOENT`、`lstatSync` → 成功且 `isSymbolicLink() === true`。`lstat` 是唯一能區分 missing 與 broken 的原語。

現場證據來自 `Practice_tibame_Lesson1`：`.claude/commands` 與 `.claude/hooks`（08-03 11:00）指向 `~/.agents/*` 正常，`.claude/skills`（07-28 11:22）指向 `../.agents/skills` 已斷。這是 `2026-07-28-default-canonical-to-home-agents` 那次把 canonical 從 `<projectRoot>/.agents` 改到 `~/.agents` 之後遺留的舊連結。

## Goals / Non-Goals

**Goals:**
- 路徑狀態判定只有一份實作，`scan-installed`、`plan`、`ensure-canonical` 共用。
- 問題在 plan 階段就被看見，apply 不再是第一個發現者。
- 使用者看到的是「哪個檔案壞了、指向哪、怎麼修」，不是 `ENOENT`。
- 清理走既有 backup／undo，manifest 格式不動。
- 單一 client 壞掉不拖累其它 client。

**Non-Goals:**
- 不自動修復所有種類的失效連結。只處理 client skills 根目錄與 `projectRoot/.agents` 這兩個已知的遺留形狀。
- 不改 `pathExists()` 的既有語意。它的 lstat 行為被 `removePath()` 依賴（`src/utils/fs.ts:46-54`）。
- 不做無提示的自動刪除。破壞性動作一律經過確認或明示跳過。
- 不處理 `foreign-symlink` 的清理。它只被分類與回報，不被動到。

## Decisions

**1. 新增 `src/core/path-state.ts`，而不是散在各處判斷**

`classifyPath(p, canonicalRoot)` 回傳 `{ state: 'ok' | 'missing' | 'broken-symlink' | 'foreign-symlink', link?, resolved? }`。

替代方案是在 `scan-installed.ts` 與 `plan.ts` 各自加 lstat 判斷。否決理由與 `src/core/skill-roots.ts` 註解裡寫的是同一條：兩份推導會漂移，而這裡漂移的後果是「掃描說沒事、plan 說有事」，使用者看到互相矛盾的畫面。`src/core/symlink.ts` 已有 `resolveSymlinkTo()` 與 `describePathKind()`（後者已經會回傳 `'broken symlink'` 字串），新模組建立在它們之上，不重造 readlink 邏輯。

**2. `LinkTask` 新增 `blocked-root` 分支，不複用 `conflict`**

現有 `conflict`（`src/core/types.ts:19`）的語意是「target 存在且不是我們的 symlink」，補救動作是備份後覆蓋 target 本身，而且 `--force` 會直接執行覆蓋（`src/core/apply.ts:60-66`）。broken root 的補救對象是 target 的**父路徑**，讓 `--force` 沿用 conflict 路徑會在錯的地方動手，而且照樣 `ENOENT`。

新分支形狀：`{ type: 'blocked-root'; source: string; target: string; blockedPath: string; link: string; reason: string }`。`blockedPath` 是壞掉的那一層，`target` 保留原本想建的位置，讓訊息能同時說明「我本來要裝什麼」與「卡在哪」。

**3. 一個 client 一則診斷，不是一個 skill 一則**

一個 broken 的 `.claude/skills` 會阻塞使用者選的全部 skill。逐 target 印訊息會刷出十幾行講同一件事。plan 產出時對 `blockedPath` 去重，CLI 每個壞掉的根目錄只呈現一次，並附上被阻塞的 skill 數量。

**4. 清理 = backup + unlink + mkdir，全部走既有 session**

`src/core/backup.ts:94` 已經能把 symlink 判成 `kind: 'symlink'`，`backup.ts:49-51` 用 `readlink` + `symlink` 複製連結本身而非跟隨它，`src/core/undo.ts:39-41` 反向還原。broken symlink 走這條路完全成立，因為全程只碰連結不碰目標。所以清理不需要新的備份機制，只需要在 apply 前插入一個「移除 blockedPath 並 mkdir」的步驟。

**5. 非互動預設跳過，不預設清理**

`selectScope()`（`src/cli-main.tsx:121-136`）等互動流程在無 TTY 時本來就走不下去，而 broken root 的清理是破壞性動作。無 TTY 時預設跳過該 client、印出診斷、以非零以外的正常流程結束其餘工作，符合「破壞性動作需要明示授權」的一般原則。

**6. apply 迴圈加 per-task 錯誤收斂**

即使 plan 階段攔截了已知情況，plan 與 apply 之間仍有 TOCTOU 窗口（`src/core/apply.ts:78-81` 的註解已經為 `unlink` 承認過這件事）。`applyLinkPlan()` 的回傳型別增加 `failed: number` 與失敗明細，單一 target 失敗不中止其餘任務。

## Risks / Trade-offs

- **[`--force` 的語意變複雜]** → `blocked-root` 明確不被 `--force` 自動清理。`--force` 的既有意義是「覆蓋衝突的 target」，擴張成「刪掉父路徑的 symlink」會讓一個常用旗標變得比使用者預期更危險。要清理就走互動確認，或未來另開一個專用旗標。
- **[誤判 `foreign-symlink`]** → 有人會刻意把 `.claude/skills` 指到自己管理的目錄。這種情況目標存在、`readdir` 可用，分類為 `foreign-symlink` 後只回報不動作，行為與現況一致。
- **[`applyLinkPlan()` 回傳型別變動]** → `src/cli-main.tsx:544-553` 消費這個結果來組摘要，需要同步更新；`tests/` 中對回傳值做斷言的案例也要跟著改。屬於編譯期可抓到的破壞，不是靜默風險。
- **[清理後 undo 的還原目標仍不存在]** → undo 會把 broken symlink 原樣還原，還原後它依然是壞的。這是正確行為（undo 的契約是回到原狀），但需要在 undo 摘要中說明，避免使用者以為 undo 失敗。
- **[路徑鏈檢查的成本]** → 對每個 target 逐層 lstat 父路徑會放大 syscall 次數。實務上 target 集中在少數幾個 client 根目錄下，以 `blockedPath` 為 key 做 memoize 即可，不需要更複雜的設計。

## Migration Plan

無資料格式遷移。backup manifest 格式不動，既有備份可正常 undo。

已經處在壞狀態的使用者（如 `Practice_tibame_Lesson1`）在升級後第一次執行時會看到診斷與清理選項，不需要事前手動處理。手動修法仍然有效：`rm <projectRoot>/.claude/skills`。

## Open Questions

- 清理選項是否要提供「全部套用到每個壞掉的 client」的批次選擇？目前規格是逐 client 詢問，client 數量多時會很吵。
- `projectRoot/.agents` 的 broken symlink 是只提示（依 spec 現況），還是也納入互動清理？兩者的破壞性不同：`.claude/skills` 清掉會被重建，`.agents` 清掉之後沒有東西會取代它。
