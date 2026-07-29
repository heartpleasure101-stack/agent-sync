# Client Selection UX

## Purpose
UX and detection logic for selecting clients in agent-sync CLI.

## Requirements

### Requirement: Client picker defaults to no clients selected

The interactive multiselect prompt shown by `selectClients()` SHALL start with an empty selection. The user MUST explicitly pick each client they want `agent-sync` to manage in this run.

#### Scenario: User opens the client picker
- **WHEN** the CLI reaches the "Select clients to manage" prompt
- **THEN** every client option is rendered unchecked
- **AND** the prompt still requires at least one client before it can be submitted

#### Scenario: User confirms without picking anything
- **WHEN** the user tries to submit the prompt with zero clients selected
- **THEN** the prompt keeps them on the same step (the existing `required: true` behaviour), matching how any other empty required multiselect behaves

### Requirement: Installed-client detection

The system SHALL provide a pure helper that, given a resolved home directory, returns the subset of the 9 supported clients (`claude`, `factory`, `codex`, `cursor`, `opencode`, `gemini`, `antigravity`, `github`, `ampcode`) that appear to be installed on the machine.

A client is considered "installed" when its canonical global config directory (as returned by `resolveRoots({ scope: 'global', homeDir })` in `src/core/paths.ts`) exists on disk. For `github`, existence of `~/.copilot` counts, since that is the global Copilot root already used by `mappings.ts`.

#### Scenario: Some clients are installed
- **WHEN** `~/.claude` and `~/.gemini` exist and no other client root exists
- **THEN** the helper returns exactly `['claude', 'gemini']` in the canonical order defined by the options list

#### Scenario: No clients are installed
- **WHEN** none of the client roots exist under the given home directory
- **THEN** the helper returns an empty array and does not throw

#### Scenario: Helper does not touch the filesystem outside the home directory
- **WHEN** the helper runs with an explicit `homeDir` parameter
- **THEN** it only stats paths under that directory (no writes, no reads of project files)

### Requirement: Detected clients are surfaced on the picker

The multiselect prompt SHALL display a hint listing the clients detected as installed, so the user can reproduce the "smart" default manually.

#### Scenario: At least one client is detected
- **WHEN** the picker renders and detection returned a non-empty list (e.g. `['claude', 'gemini']`)
- **THEN** the prompt shows a hint containing the human-readable labels of those clients (e.g. `已偵測到已安裝：Claude, Gemini`) using the same label mapping as `formatClients()`

#### Scenario: No clients are detected
- **WHEN** detection returned an empty list
- **THEN** the prompt shows a hint indicating that no installed clients were detected, and still lists every client as an option

#### Scenario: Detection failure does not block the picker
- **WHEN** the detection helper throws (e.g. permission error while stat-ing a directory)
- **THEN** the picker still renders with every client available and simply omits the "detected" hint
