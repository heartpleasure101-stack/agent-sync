# Frontmatter rewrite (future)

This is a future feature idea for cases where **plain symlinks are not enough**.

## Why this might be necessary

Right now, agent-sync uses symlinks so `.agents` is the canonical source of truth. That works as long as every tool accepts the same frontmatter keys and values. In practice, tools can diverge:

- Some tools support fields that others do not (`model`, `allowed-tools`, etc.).
- Field names may differ (e.g., `argument-hint` vs `argument_hint`).
- Tool names inside `allowed-tools` may not match across ecosystems.

When that happens, **symlinking cannot transform the file contents**. The only way to keep a single canonical source while supporting multiple tool formats is to **generate tool-specific copies**.

## Proposed approach (simple UX, canonical source)

- Keep canonical files in `.agents/commands` (and other `.agents` folders).
- Generate tool-specific views in `.agents/.agent-sync/<tool>/...`.
- Symlink each tool home to its generated view.

Example layout:

```
.agents/commands/              # canonical source
.agents/.agent-sync/claude/commands/
.agents/.agent-sync/factory/commands/
.agents/.agent-sync/codex/prompts/
```

## Task list

- [ ] Define canonical frontmatter schema (tool-agnostic keys)
- [ ] Decide override format (sidecar file vs embedded `agent-sync` block)
- [ ] Add tool-specific mapping tables (key rename + value mapping)
- [ ] Implement renderer that produces tool-specific output folders
- [ ] Add a lightweight config UI in TUI to edit overrides
- [ ] Add sync/refresh command (idempotent)
- [ ] Add tests for key renames and value mapping (model/tool names)
