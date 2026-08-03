## Context

現行資料流是單向的。`listSkills()`（`src/core/list-skills.ts:22-52`）掃 canonical 那一側，使用者選出 `clients[] × skills[]`，`getMappings()`（`src/core/mappings.ts:12-130`）據此展開 mapping，`buildLinkPlan()` 產出 link task，`applyLinkPlan()` 寫進 client 目錄。從來沒有任何一條路徑往回讀。

```
              ┌─────────────────────────┐
              │  canonical 來源側        │
              │  <canonical>/skills/*    │  ← listSkills() 只看這裡
              └───────────┬─────────────┘
                          │
                  這次 session 的選擇
                  clients[] × skills[]
                          │
                          ▼
              ┌─────────────────────────┐
              │  getMappings()          │
              │  → buildLinkPlan()      │
              │  → applyLinkPlan()      │
              └───────────┬─────────────┘
                          │  只寫，只 link
                          ▼
    ~/.claude/skills/  ~/.gemini/skills/  ~/.codex/skills/ ...
              ▲
              │
              ╳  沒有任何一條路徑往回讀
                 （detectInstalledClients 只讀到根目錄那層就停）
```

真實磁碟狀態是一個 skill × client 的矩陣，但程式沒有把它讀回來過：

```
                claude   gemini   codex   cursor
  01-code         ✓        ·        ·       ·      ← 第一次裝的
  02-git          ·        ✓        ·       ·      ← 第二次裝的
  03-review       ·        ·        ·       ·

  第二次開 picker 時 UI 顯示的是：
  01-code       [ ]      [ ]      [ ]     [ ]      ← 全空
  02-git        [ ]      [ ]      [ ]     [ ]
```

## Goals / Non-Goals

**Goals：**
- 補上反向掃描，讓 UI 與磁碟狀態不再脫鉤。
- 勾選框從「這次要裝什麼」升級為「我希望最終長什麼樣」，差集自然產生 install 與 remove。
- 讓使用者看得到範圍外 client 的安裝實況，但不讓 picker 誤刪它們。
- 移除動作全程可 undo，且與安裝共用同一次 backup session。

**Non-Goals：**
- 不做二維矩陣 UI。
- 不修 basename 碰撞（`src/core/mappings.ts:119`）。
- 不修 Windows dir symlink 重建缺 type（`src/core/backup.ts:51`、`src/core/undo.ts:41`）。
- 不持久化選擇；狀態來源永遠是磁碟。
- 不改 wizard 骨架（`src/cli-main.tsx:365-388`）。

## Decisions

### 1. 勾選框的參照系 = 本次選的 clients

wizard 已有獨立的 client 步驟，沿用它當參照系，語意最乾淨且不需改骨架：

```
  [x]  本次選的 client，全部都已安裝
  [~]  本次選的 client，裝了一部分
  [ ]  本次選的 client，都沒裝
```

不在本次選擇範圍內的 client，picker 一律不動它。這讓「不小心刪掉上次裝的東西」變成不可能，除非使用者主動把那個 client 選進來。

**代價**：症狀 3 只解一半，使用者仍看不到範圍外的安裝。用列尾唯讀灰字補上：

```
  Clients: gemini, codex                      ← 本次範圍

  › [ ] 01-code                    (claude)   ← 灰字：範圍外已安裝
    [~] 02-git                                ← gemini 有、codex 沒有
    [x] 03-review
    [ ] 04-docs
```

**替代方案**：參照系改為「所有偵測到的 client」。否決 —— 那會讓 client 選擇步驟失去意義，且任何一次 `d` 都可能波及使用者這次根本沒打算碰的 client。

### 2. `[~]` 三態循環，`[x]` / `[ ]` 兩態

```
   原始狀態          按 space 的循環
   ─────────         ───────────────────────────────
   [ ]               [ ] ⇄ [x]                       兩態
   [x]               [x] ⇄ [ ]                       兩態
   [~]               [~] → [x] → [ ] → [~] → ...     三態
```

`[~]` 必須保留「維持現狀」這個選項，否則一碰就再也回不去原本的部分安裝狀態。三態循環是唯一能同時表達「補滿 / 全清 / 別動」的形式。

原始狀態為 `[x]` / `[ ]` 的列不需要第三態 —— 它們沒有「部分」可以維持。

### 3. UI 必須顯示 original → desired 的 diff

框框代表期望狀態之後，畫面上就有 diff 了，不標出來使用者無法預期 Enter 會發生什麼：

```
  › [x] 01-code          + 要裝到 codex
    [ ] 02-git           - 要從 gemini 移除
    [~] 03-review                              ← 無標記 = 維持現狀
    [x] 04-docs                                ← 無標記 = 本來就裝好了

  Pending: 1 install · 1 remove
```

footer 現行的 `Total: N selected`（`src/ui/skill-picker.tsx:98,143`）在新語意下沒有意義 —— 「選了 12 個」不代表要做 12 件事。

### 4. `d` 改為 reset，不是 uninstall-all

`src/ui/skill-picker.tsx:87-95` 現行：

```ts
if (input === 'a') { setState((s) => selectAllInTab(s, currentGroup)); ... }
if (input === 'd') { setState((s) => deselectAllInTab(s, currentGroup.key)); }
```

`d` 目前無害。改動後它會變成「把這個 tab 底下所有 skill 從所有選定 client 移除」—— 單鍵、無確認。使用者按 `d` 的直覺是「我剛剛亂選、清掉重來」，那個直覺對應的是 reset 而非 uninstall。

- `a` = 當前 tab 全裝
- `d` = 當前 tab 還原成原始狀態
- 真的要全移除，一個一個按

### 5. unlink 沿用既有 backup manifest，零格式改動

`src/core/backup.ts:87-109` 的 `backupPath()` 本來就處理 symlink：

```ts
const kind: BackupEntry['kind'] = stat.isSymbolicLink() ? 'symlink' : ...
if (stat.isSymbolicLink()) {
  await backupSymlink(target, dest);
}
session.entries.push({ originalPath: resolved, backupPath: dest, kind, action: 'backup' });
```

而 `backupSymlink()`（`src/core/backup.ts:48-53`）做的正是「讀出來 → 存起來 → 刪掉」：

```ts
const link = await fs.promises.readlink(target);   // 記住指向哪
await fs.promises.symlink(link, dest);             // 在 backup 目錄重建一份
await fs.promises.unlink(target);                  // 刪掉原本那條
```

還原端 `src/core/undo.ts:37-43` 的 `restoreSymlink()` 是精確的反向操作。

```
   apply unlink                          undo
   ─────────────────                     ────────────────────
   ~/.claude/skills/01-code              backup/<ts>/Users/.../01-code
        │  readlink                           │  readlink
        │  symlink 到 backup dir              │  symlink 回 originalPath
        │  unlink 原路徑                      │  unlink backup 那份
        ▼                                     ▼
   backup/<ts>/Users/.../01-code         ~/.claude/skills/01-code
   manifest: { kind:'symlink',
               action:'backup' }        ← 本來就存在、本來就能還原
```

所以 apply 端大致就是：

```
  case 'unlink': const ok = await backupPath(task.target, backup)
```

`BackupEntry` 不加欄位、`BackupManifest.version` 不升版、`src/core/undo.ts` 一行不改。

**真正的成本不在格式，在「怎麼確認這條 symlink 真的是我們裝的」**。`backupPath()` 對 kind 的判斷是描述性的（它是什麼就備份什麼），不是驗證性的（它該不該被刪）。防護見下節。

### 6. install 與 unlink 共用同一次 backup session

`src/cli-main.tsx:311-316` 在 `runChange()` 裡建立單一 `createBackupSession()`，整次 apply 的所有 entries 寫進同一個 `backup/<timestamp>/manifest.json`。`undoLastChange()`（`src/core/undo.ts:77-114`）回捲最後一個 backup dir。

```
  一次 apply：裝 3 個、移除 2 個
        ↓
  一個 manifest，5 筆 entries
        ↓
  一次 undo → 5 筆全部回捲
```

不會出現「undo 只還原了安裝、沒還原移除」的半吊子狀態。這是現有設計自然給的，不需額外處理。

## Target Data Flow

```
  ┌────────────────────┐         ┌──────────────────────────┐
  │ listSkills()       │         │ scanInstalledSkills()    │ ← 新增
  │ canonical 有什麼   │         │ 掃 <clientRoot>/skills/* │
  └─────────┬──────────┘         │ readlink → resolve       │
            │                    │ 比對 canonical           │
            │                    └───────────┬──────────────┘
            │                                │
            │                  installed: Map<skillDir, Set<Client>>
            │                                │
            ▼                                ▼
       ┌──────────────────────────────────────────┐
       │  initState(groups, installed, clients)   │
       │  每列算出 all / some / none              │
       └────────────────┬─────────────────────────┘
                        │  使用者操作
                        ▼
       ┌──────────────────────────────────────────┐
       │  diff(original, desired)                 │
       │  → { toInstall[], toRemove[] }           │
       └────────────────┬─────────────────────────┘
                        ▼
              getMappings / buildLinkPlan
              link tasks  +  unlink tasks (新)
```

## Risks / Trade-offs

### R1. `backupPath()` 會把真目錄整個搬走

`src/core/backup.ts:92-104` 對非 symlink 走 `backupPathImpl()`，`rename` 整個目錄進 backup。若反向掃描判斷錯誤、或使用者在 plan 與 apply 之間手動把 symlink 換成真目錄，unlink 會搬走使用者真正的 skill 目錄。

**緩解**：`unlink` task 帶前置條件，兩個時間點各驗一次：

```
  plan 期    lstat 是 symlink 且 resolve 後 === 預期的 canonical source
  apply 期   同一組檢查再跑一次
```

plan 到 apply 之間隔了數個 clack prompt（`src/cli-main.tsx:283-306` 的確認流程與 migration conflict 解析），TOCTOU 窗口是真的。不符者降級為 conflict，讓使用者自己看一眼，不要默默刪。

### R2. `hasParentPath()` 造成 unlink 靜默失敗

`src/core/backup.ts:39-46,90`：

```ts
if (hasParentPath(resolved, session._seen)) return false;   // ← 直接 return，沒有刪
```

同 session 裡若先備份了 `<clientRoot>/skills` 父層，再要 unlink `<clientRoot>/skills/01-code`，子路徑會被判定為「父層已處理」而跳過，**原檔還在**。`src/core/mappings.ts:101-107` 的 legacy 路徑（`selectedSkills` 為 null 時整包 link `skills` 目錄）會製造這種父子並存。

**緩解**：`backupPath()` 的 boolean 回傳值當成 success flag。`src/core/apply.ts:31` 已有接（`const backedUp = ...`），unlink 分支同樣要接，`false` 計入 skipped 並顯示，不可回報「已移除」。

### R3. `preflightBackup()` 漏掉 unlink

`src/core/preflight.ts:17-29`：

```ts
if (task.type === 'conflict') return forceLinks && task.target !== task.source;
if (task.type !== 'link') return false;      // ← unlink 落在這裡
```

`unlink` 的 backup 目的地不會進 `src/core/preflight.ts:59-69` 的寫入權限預檢，結果是 apply 跑到一半才發現 backup 目錄不可寫，而前面已經改了一堆。preflight 存在的意義就是避免這個。

### R4. Windows dir symlink 從冷路徑變熱路徑

重建端沒帶 type：

```ts
// src/core/backup.ts:51 與 src/core/undo.ts:41
await fs.promises.symlink(link, dest);      // 沒有第三個參數
```

建立端有：

```ts
// src/core/apply.ts:34,39
const type = kind === 'dir' ? 'junction' : 'file';
await fs.promises.symlink(linkTarget.link, target, type as fs.symlink.Type);
```

而 `src/core/link-target.ts:11-13` 特別為 win32 + dir 走絕對路徑，顯示這個專案有在意 Windows。skill 全是目錄，改動後每次取消安裝與每次 undo 都會踩到這條不對稱路徑。

這是**既有**缺陷，不是本 change 引入 —— 目前只有 force overwrite 與 `replaceSymlink` 遷移會走到，很少。本 change 會把它放大成常態路徑。列為 out-of-scope，建議另開 change 優先處理。未在 Windows 實測，僅從程式碼判定不對稱存在。

### R5. basename 碰撞會浮出水面

`src/core/list-skills.ts:44-50` 算了 `hasCollision`，但 grep `src/` 只命中定義處，UI 完全沒用它。而 `src/core/mappings.ts:119` 用 basename 當 target：

```ts
const basename = path.basename(entry.dir);
targets: skillTargetRoots.map((root) => path.join(root, basename))
```

`01_Coding/foo` 與 `03_Medie/foo` 搶同一個 `<clientRoot>/skills/foo`。反向掃描 readlink 之後只有一個對得上，另一個會被判為未安裝或 conflict —— 使用者會看到「我明明裝了，為什麼顯示沒裝」。

**緩解**：本 change 不修，但反向掃描 MUST 以 readlink 解析結果比對，不可用 basename 反推 canonical dir，否則兩個同名 skill 都會被誤標為已安裝。

## Migration Plan

無資料遷移。`BackupManifest.version` 維持 `1`，既有 backup 目錄不受影響，舊 manifest 仍能被新版 `undoLastChange()` 正確回捲。

## Open Questions

- `[~]` 三態循環在只有一個選定 client 時不可能出現（要嘛裝要嘛沒裝）。是否要在 client 只選一個時隱藏第三態的說明文字，避免 footer 冗長？傾向不特判，保持文案一致。
- 範圍外註記的 client 數量多時（例如 5 個 client 都裝了）列尾會很長。是否超過 2 個就折成 `(claude +3)`？實作時看實際寬度決定。
