## MODIFIED Requirements

### Requirement: Tabbed skill picker

Skill 挑選 SHALL 以「tab bar + per-tab multi-select」的一頁式互動呈現，取代原先「分類 multi-select → 聯集 skill multi-select」的兩步流程與 `Select all` / `Deselect all` pseudo-option。每個分類 = 一個 tab，使用者以方向鍵在 tab 間切換；每個 tab 內獨立記住當前 skill 勾選狀態；`Enter` 送出時把所有 tab 已勾的 skill dir 攤平聯集回傳。

#### Scenario: Tab bar 呈現所有分類與已勾統計
- **WHEN** picker 開啟且 canonical `skills/` 底下有至少一個分類目錄
- **THEN** 頂端顯示一列 tabs，每個 tab 標籤為 `<CategoryName> (<selectedInTab>/<totalInTab>)`
- **AND** 若同時存在 uncategorized skill，最右邊多一個 tab `(uncategorized)`（label 用固定字串，非分類目錄名）
- **AND** 當前 tab 以反白樣式呈現

#### Scenario: 方向鍵切換 tab
- **WHEN** 使用者按 `←` 或 `Shift+Tab`
- **THEN** 當前 tab 切到前一個（第一個 tab 時 wrap 到最後）
- **WHEN** 使用者按 `→` 或 `Tab`
- **THEN** 當前 tab 切到下一個（最後 tab 時 wrap 到第一個）
- **AND** 切 tab 不會影響任何 tab 內已勾的狀態

#### Scenario: 在 tab 內 toggle skill
- **WHEN** 使用者按 `↑` / `↓` 移動 focus 到某個 skill 列
- **AND** 按 `Space`
- **THEN** 該 skill 的勾選狀態 toggle
- **AND** 對應 tab 的 `(selected/total)` badge 立即更新

#### Scenario: Select all / Deselect all 快捷
- **WHEN** 使用者按 `a`
- **THEN** 當前 tab 內所有 skill 被加入該 tab 的已勾集合
- **WHEN** 使用者按 `d`
- **THEN** 當前 tab 的已勾集合被清空
- **AND** 這兩個動作僅影響當前 tab，其它 tab 的狀態不變

#### Scenario: 送出
- **WHEN** 使用者按 `Enter` 且至少一個 tab 有勾選
- **THEN** picker 結束，回傳所有 tab 已勾 skill dir 的聯集（去重、順序依 tab 順序 → tab 內 entry 原順序）

#### Scenario: 空選送出被擋
- **WHEN** 使用者按 `Enter` 但所有 tab 都無勾選
- **THEN** picker 不結束、不呼叫 submit callback
- **AND** footer 顯示紅字提示至少要選 1 個 skill（等同 `required: true` 語意）

#### Scenario: 取消
- **WHEN** 使用者按 `Esc` 或 `Ctrl+C`
- **THEN** picker 結束，走既有 `exitCancelled()` 流程（process.exit(0)）

### Requirement: 只有 uncategorized skill 時的行為

當 canonical `skills/` 底下只有 uncategorized skill（沒有任何分類目錄），系統 SHALL 只顯示一個 tab `(uncategorized)`，其它互動規則不變。

#### Scenario: 純扁平 canonical
- **WHEN** canonical `skills/` 底下只有含 `SKILL.md` 的直接子目錄、沒有分類目錄
- **THEN** tab bar 只有 `(uncategorized)` 一個 tab
- **AND** 使用者仍可用 `↑`/`↓` + `Space` 選、`a`/`d` 全選 / 全不選、`Enter` 送出

## REMOVED Requirements

### Requirement: Category-first browsing
**Reason**: 兩步式的「先選分類 → 進聯集 skill picker」被單一 tab UI 取代；分類選擇隱含於 tab 導航。
**Migration**: 使用者不需任何動作；新 picker 開啟時即看得到所有分類 tab，改用 `←`/`→` 切換代替原本的分類 multiselect。

### Requirement: Skill multiselect with select-all / deselect-all
**Reason**: `Select all` / `Deselect all` pseudo-option 造成需要「勾 → submit → 再看到 re-open」的迂迴體驗；tab UI 已用鍵盤快捷 `a`/`d` 直接對當前 tab 生效，語意更直觀。
**Migration**: 舊 pseudo-option 移除；改按 `a` = 當前 tab 全選、`d` = 當前 tab 全不選。全域 submit 仍需 `Enter`，`required: true` 語意不變。
