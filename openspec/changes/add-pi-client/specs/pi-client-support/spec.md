## ADDED Requirements

### Requirement: Pi 根目錄依 scope 解析

`resolveRoots()` SHALL 回傳 `piRoot`。Global scope 下 MUST 為 `path.join(homeDir, '.pi', 'agent')`；project scope 下 MUST 為 `path.join(projectRoot, '.pi')`。其餘 client 的根目錄 MUST NOT 受影響。

#### Scenario: Global scope
- **WHEN** 呼叫 `resolveRoots({ scope: 'global', homeDir: '/Users/x' })`
- **THEN** `piRoot` 等於 `/Users/x/.pi/agent`

#### Scenario: Project scope
- **WHEN** 呼叫 `resolveRoots({ scope: 'project', projectRoot: '/tmp/foo', homeDir: '/Users/x' })`
- **THEN** `piRoot` 等於 `/tmp/foo/.pi`
- **AND** `claudeRoot` 仍為 `/tmp/foo/.claude`

### Requirement: Pi 的 skills 連到 Pi 根目錄下的 skills

勾選 `pi` 時，系統 SHALL 把使用者勾選的每個 skill 以 symlink 連到 `<piRoot>/skills/<skill 目錄名稱>`。未勾選 `pi` 時 MUST NOT 在 `<piRoot>` 建立任何東西。`getSkillRoots()` MUST 是唯一決定此路徑的地方，`getMappings()` 與 `scanInstalledSkills()` 共用。

#### Scenario: Global 連線勾選的 skill
- **WHEN** 使用者在 global scope 勾選 `pi` 與 skill `foo`
- **THEN** `~/.pi/agent/skills/foo` 是指向 canonical 中 `foo` 目錄的 symlink

#### Scenario: Project 連線勾選的 skill
- **WHEN** 使用者在 project scope 勾選 `pi` 與 skill `foo`
- **THEN** `<projectRoot>/.pi/skills/foo` 是指向 canonical 中 `foo` 目錄的 symlink

#### Scenario: 未勾選 Pi
- **WHEN** 使用者只勾選 `claude`
- **THEN** `<piRoot>` 下不產生任何檔案或目錄

#### Scenario: 已安裝狀態可讀回
- **WHEN** `~/.pi/agent/skills/foo` 已連到 canonical 的 `foo`
- **THEN** `scanInstalledSkills()` 回報 `pi` 已安裝 `foo`

### Requirement: Pi 的 AGENTS.md 只在 global scope 連線

Global scope 下勾選 `pi` 時，系統 SHALL 把 canonical 的 `AGENTS.md` 以 symlink 連到 `~/.pi/agent/AGENTS.md`。Project scope 下 MUST NOT 連。來源 MUST 是 `AGENTS.md`，MUST NOT 使用 `CLAUDE.md` 或 `GEMINI.md`。

#### Scenario: Global 連 AGENTS.md
- **WHEN** 使用者在 global scope 勾選 `pi`
- **THEN** `~/.pi/agent/AGENTS.md` 是指向 `~/.agents/AGENTS.md` 的 symlink

#### Scenario: Project 不連 AGENTS.md
- **WHEN** 使用者在 project scope 勾選 `pi`
- **THEN** `<projectRoot>/.pi/AGENTS.md` 不被建立

#### Scenario: 目標已有實體 AGENTS.md
- **WHEN** `~/.pi/agent/AGENTS.md` 已是實體檔
- **THEN** 該目標被標為 conflict，走既有備份流程，不被直接覆蓋

### Requirement: Pi 不連 commands 與 hooks

系統 MUST NOT 把 canonical 的 `commands/` 或 `hooks/` 連到 `<piRoot>` 下任何位置。

#### Scenario: 勾選 Pi 不產生 prompts 或 hooks
- **WHEN** 使用者勾選 `pi`，canonical 內存在 `commands/` 與 `hooks/`
- **THEN** `<piRoot>/prompts` 與 `<piRoot>/hooks` 都不被建立

### Requirement: Migration 可收進 Pi 既有的 skills 與 AGENTS.md

migration 掃描 SHALL 在勾選 `pi` 時，把 `<piRoot>/skills/` 內的實體 skill 目錄列為可收進 `~/.agents/skills/` 的候選；global scope 下 SHALL 把 `~/.pi/agent/AGENTS.md`（若為實體檔）列為 `~/.agents/AGENTS.md` 的候選。已是 symlink 的來源 MUST 被略過。

#### Scenario: Pi 有實體 skill
- **WHEN** `~/.pi/agent/skills/bar/SKILL.md` 為實體檔，且勾選 `pi`
- **THEN** 掃描結果包含來源標籤為 `Pi skills` 的 `bar` 候選

#### Scenario: Pi 的 skills 目錄已是 symlink
- **WHEN** `~/.pi/agent/skills` 本身是 symlink
- **THEN** 不產生任何候選
