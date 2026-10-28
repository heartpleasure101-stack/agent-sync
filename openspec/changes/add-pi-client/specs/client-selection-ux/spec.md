## MODIFIED Requirements

### Requirement: Installed-client detection

The system SHALL provide a pure helper that, given a resolved home directory, returns the subset of the 10 supported clients (`claude`, `factory`, `codex`, `cursor`, `opencode`, `gemini`, `antigravity`, `github`, `ampcode`, `pi`) that appear to be installed on the machine.

A client is considered "installed" when its canonical global config directory (as returned by `resolveRoots({ scope: 'global', homeDir })` in `src/core/paths.ts`) exists on disk. For `github`, existence of `~/.copilot` counts, since that is the global Copilot root already used by `mappings.ts`. For `pi`, existence of `~/.pi/agent` counts.

#### Scenario: Some clients are installed
- **WHEN** `~/.claude` and `~/.gemini` exist and no other client root exists
- **THEN** the helper returns exactly `['claude', 'gemini']` in the canonical order defined by the options list

#### Scenario: Pi is installed
- **WHEN** `~/.pi/agent` exists and no other client root exists
- **THEN** the helper returns exactly `['pi']`

#### Scenario: Only the parent .pi exists
- **WHEN** `~/.pi` exists but `~/.pi/agent` does not
- **THEN** the helper does not include `pi`

#### Scenario: No clients are installed
- **WHEN** none of the client roots exist under the given home directory
- **THEN** the helper returns an empty array and does not throw

#### Scenario: Helper does not touch the filesystem outside the home directory
- **WHEN** the helper runs with an explicit `homeDir` parameter
- **THEN** it only stats paths under that directory (no writes, no reads of project files)
