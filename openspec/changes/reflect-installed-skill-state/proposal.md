## Why

目前 CLI 從頭到尾沒有「磁碟上實際安裝了什麼」這個模型，只有「這次 session 你選了什麼」。三個使用者可見的症狀都是這個缺口的不同面向：

1. **已安裝的 skill 不顯示提示**。`src/ui/skill-picker-state.ts:35-39` 的 `initState()` 把每個 tab 的已勾集合初始化為空 Set，picker 開啟時一律是 `[ ]`。`src/core/list-skills.ts` 只掃 canonical 那一側（`<canonical>/skills`），從來沒讀過 client 端目錄；`src/core/detect-installed.ts:36-47` 的偵測粒度是「client 根目錄存不存在」，不是 per-skill。

2. **已安裝的 skill 不能取消**。`src/core/types.ts:11-15` 的 `LinkTask` 只有 `ensure-source | link | conflict | noop`，沒有移除語意；`src/core/plan.ts:91-94` 的 `changes` 只收 `link` 與 `ensure-source`。所以「取消勾選」在計畫層不代表「移除」，只代表「這次不提」。唯一能刪掉 symlink 的路徑是 `Undo last change`，那是時間軸回捲而非狀態宣告。

3. **跨 session 的 client × skill 組合看不出來**。`src/core/mappings.ts:20,110` 用本次選的 `clients` 與 `selectedSkills` 過濾 mapping，而 `getLinkStatus()` 走同一個 `getMappings()`。使用者第一次選 Claude 裝 `01_Coding/*`、第二次選 Gemini 裝 `02_Git/*`，第二次的 status 與 Overview 完全看不到第一次的成果。

本 change 補上缺少的那條反向路徑：從 client 端目錄回讀 symlink，建立 `installed: Map<skillDir, Set<Client>>`，讓 picker 的勾選框從「這次要裝什麼」變成「我希望最終長什麼樣」，並讓差集自然產生安裝與移除兩種動作。

## What Changes

- **新增 `src/core/scan-installed.ts`**：列舉每個 client 的 skills 根目錄，對每個項目 `readlink` → 絕對路徑化 → 與 canonical skill dir 比對，產出 `installed: Map<skillDir, Set<Client>>`。判定邏輯與 `src/core/plan.ts:34-65` 的 `analyzeTarget` 相同，抽出共用。
- **勾選框語意改為期望狀態，參照系是本次選的 clients**：
  - `[x]` = 本次選的 client 全部都已安裝
  - `[~]` = 本次選的 client 裝了一部分
  - `[ ]` = 本次選的 client 都沒裝
  - 不在本次 clients 範圍內的 client，picker 一律不動它。
- **`[~]` 走三態循環**（`[~] → [x] → [ ] → [~]`），保留「維持現狀、不要動它」這個意圖；原始狀態為 `[x]` 或 `[ ]` 的列維持兩態。
- **範圍外安裝以唯讀灰字註記**：某 skill 已裝在本次沒選的 client 上時，該列尾顯示灰字 client 名，解決症狀 3 而不擴大破壞面。
- **列出 pending diff**：每列標 `+`（要裝）/ `-`（要移除）/ 無標記（維持現狀）；footer 從 `Total: N selected` 改為 `Pending: N install · M remove`。
- **`d` 由「全不選」改為「還原成原始狀態」（reset）**。改動後「全不選」等於「全部移除」，單鍵無確認的破壞性操作不可接受；使用者按 `d` 的直覺是「我剛亂選、清掉重來」，對應的是 reset。`a` 保留為「當前 tab 全裝」。
- **`Enter` 守門條件改為「沒有任何 pending 變更」才擋**。`src/ui/skill-picker.tsx:46-49` 現在擋的是 `totalSelected === 0`，但新語意下「一個都不選」是合法意圖（全部移除）。
- **新增 `unlink` LinkTask**，apply 端以既有的 `backupPath()` 實作（`src/core/backup.ts:87-109` 對 symlink 走 `backupSymlink()`：readlink → 在 backup 目錄重建 → unlink 原路徑，正是移除語意）。**manifest 格式與 `src/core/undo.ts` 零改動**。
- **picker 回傳型別改為 `{ toInstall: string[]; toRemove: string[] }`**，`flatten()` 拆成兩份。
- **`getLinkStatus()` 增加不受本次選擇過濾的全域掃描模式**，讓 `View status` 與 Overview 能呈現完整安裝矩陣。

## Capabilities

### Modified Capabilities

- `skill-selection-ux`：
  - `Session-scoped, non-persistent selection` — 現行條文要求「重啟 CLI 時初始為空選」，與本 change 直接衝突，改為「初始狀態由磁碟掃描決定，仍不從任何設定檔讀取上次選擇」。
  - `Tabbed skill picker` — 新增三態勾選框、pending diff 標記、`d` 語意變更、`Enter` 守門條件變更。
  - 新增 `Reverse scan of installed skills`、`Uninstall via unlink task` 兩條 requirement。

## Impact

| 檔案 | 改動 |
|---|---|
| `src/core/scan-installed.ts` | 新增。反向掃描 client skills 目錄 |
| `src/core/types.ts` | `LinkTask` 加 `unlink` 分支 |
| `src/core/plan.ts` | `changes` 納入 `unlink`；`analyzeTarget` 的 symlink 判定抽出共用 |
| `src/core/apply.ts` | `applyLinkPlan` 加 `unlink` 分支，呼叫 `backupPath()` 並接住回傳值 |
| `src/core/preflight.ts` | `needsLinkBackup()` 加 `unlink` 分支（見 Risks） |
| `src/core/status.ts` | 加全域掃描模式 |
| `src/ui/skill-picker-state.ts` | 大改。`initState` 收 installed + clients；`toggle` 三態；`flatten` 拆兩份；新增 `resetTab` |
| `src/ui/skill-picker.tsx` | 三態渲染、diff 標記、範圍外註記、`d` 改 reset、Enter 守門條件 |
| `src/cli-main.tsx` | `selectSkills()` 回傳型別、Overview 文案、傳 installed 給 picker |
| `src/core/backup.ts` / `src/core/undo.ts` | **不動** |
| `tests/skill-picker-state.test.ts` | 8 個既有測試全部重寫 |
| `tests/scan-installed.test.ts` | 新增 |

## Risks

四個已知陷阱，實作時必須逐一處理：

1. **`backupPath()` 不挑食**。`src/core/backup.ts:92-104` 對非 symlink 會走 `backupPathImpl()` 把整個真目錄 `rename` 進 backup。若反向掃描判斷錯誤、或使用者在 plan 與 apply 之間手動把 symlink 換成真目錄，unlink 會搬走使用者真正的 skill 目錄（資料仍可 undo，但不是使用者預期）。`unlink` task MUST 在 **plan 期與 apply 期各驗一次**「lstat 是 symlink 且 resolve 後等於預期 canonical source」，不符者降級為 conflict。plan 到 apply 之間隔了數個 prompt，TOCTOU 窗口是真的。

2. **`hasParentPath()` 會讓 unlink 靜默失敗**。`src/core/backup.ts:39-46,90` 在父路徑已於同 session 備份時直接 `return false` 而不刪除。`src/core/mappings.ts:101-107` 的 legacy 路徑（`selectedSkills` 為 null 時整包 link `skills` 目錄）會製造父子並存。`backupPath()` 的 boolean 回傳值 MUST 當成 success flag，`false` 要計入 skipped 並顯示，不可回報「已移除」。

3. **`preflightBackup()` 漏掉 unlink**。`src/core/preflight.ts:17-29` 的 `needsLinkBackup()` 第二行 `if (task.type !== 'link') return false` 會讓 `unlink` 直接落空，其 backup 目的地不進 `preflight.ts:59-69` 的寫入權限預檢，導致 apply 跑到一半才失敗。

4. **Windows dir symlink 重建缺 type**。`src/core/backup.ts:51` 與 `src/core/undo.ts:41` 重建 symlink 時沒帶第三個參數，但建立端 `src/core/apply.ts:34,39` 明確用 `kind === 'dir' ? 'junction' : 'file'`，且 `src/core/link-target.ts:11-13` 特別為 win32 + dir 走絕對路徑。skill 全是目錄，改動後每次取消安裝與每次 undo 都會踩到這條不對稱路徑。這是**既有缺陷**，目前只有 force overwrite 與 `replaceSymlink` 遷移會走到，本 change 會把它從冷路徑變成熱路徑。列為 out-of-scope 但建議另開 change 優先處理。

## Non-Goals

- **不改 basename 碰撞問題**。`src/core/mappings.ts:119` 用 `path.basename(entry.dir)` 當 target 路徑，`01_Coding/foo` 與 `03_Medie/foo` 會搶同一個 `<clientRoot>/skills/foo`；`src/core/list-skills.ts:44-50` 算出的 `hasCollision` 目前在 `src/` 底下完全沒有被使用（grep 只命中定義處）。這個問題會因為新 UI 而更容易被看見，但屬獨立 change。
- **不修 Windows dir symlink type**（見 Risks 4）。
- **不做二維矩陣 UI**。skill × client 的完整矩陣在終端機寬度下很快就爆版，本 change 採聚合三態框。
- **不持久化選擇到設定檔**。狀態來源永遠是磁碟實況，不是快取檔。
- **不清理 unlink 後留下的空目錄**（例如清空後的 `~/.gemini/skills/`）。純美觀問題，undo 不受影響。
- **不改 `clients` 選擇流程**（`src/cli-main.tsx:365-388` 的 `scope → clients → skills → main` wizard 骨架不動）。
