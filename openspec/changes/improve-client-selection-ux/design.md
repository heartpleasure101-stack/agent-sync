## Context

`selectClients()` in `src/cli.tsx:131-151` uses `@clack/prompts`' `multiselect` with `initialValues` set to every option, which pre-checks all 9 clients. The rest of the CLI (mappings, plan, apply) is agnostic to how the client list is chosen — it just consumes a `Client[]`. `resolveRoots({ scope: 'global' })` in `src/core/paths.ts` already knows the canonical global directory for every client, so detection can be a thin wrapper over it.

## Goals / Non-Goals

**Goals:**
- Remove the "uncheck 7 things" friction on the most common path.
- Give users a visual cue of what looks installed on their machine, without silently making the choice for them.
- Keep the change surgical: one new small module, minimal edits in `cli.tsx`, no dependency changes.

**Non-Goals:**
- Persisting the last selection across runs (interesting but separate change).
- Adding `--clients` / non-interactive CLI flags (separate change).
- Making detection authoritative — the user's explicit selection always wins; detection is a hint only.
- Detecting "installed" via binaries on `$PATH` or other heuristics. Config-root existence is the only signal.

## Decisions

**1. Empty default over "smart default" for `initialValues`.**
Pre-checking detected clients would look helpful but hides the change from users who expect the old "all-checked" behaviour and would silently drop clients they wanted. Empty + hint keeps intent explicit. Alternatives considered: (a) pre-check detected clients — rejected for the silent-drop reason; (b) keep "all checked" and just add hint — rejected because it doesn't fix the actual friction.

**2. Detection = "config root exists".**
The mapping layer already treats these paths as the source of truth for where a client's files live (`src/core/paths.ts`, used by `src/core/mappings.ts`). Reusing the same paths keeps a single definition of "where does client X live" and means detection can never disagree with mapping. Alternatives: probing binaries on `$PATH` (fragile, misses GUI-only tools), reading each client's own config file (couples us to their internal formats).

**3. Detection lives in a new `src/core/detect-installed.ts`, not inside `cli.tsx`.**
Keeps `cli.tsx` focused on presentation and lets tests hit the helper without spinning up the prompt. Signature: `detectInstalledClients(opts?: { homeDir?: string }): Promise<Client[]>`. Uses the existing `pathExists` from `src/utils/fs.ts`.

**4. Hint text uses `formatClients()`'s label map.**
Reuse the existing `Record<Client, string>` in `src/cli.tsx:154-164` (or export it) so labels stay consistent between the hint and the confirmation summary. Message text is Traditional Chinese to match project convention seen elsewhere in the CLI (verify at implementation time; fall back to English if the rest of the prompts are English).

**5. Detection errors degrade silently.**
Wrap the call site in a try/catch and treat any throw as "no detected clients". A permission error while stat-ing `~` should never break the interactive picker.

## Risks / Trade-offs

- **[False negative: user has a client installed but its config root doesn't exist yet]** → Mitigation: the hint says "detected", not "available"; the full list of clients is always in the picker so users can still select them. Acceptable — first-run users of a client typically also want dotagents to create the config anyway.
- **[False positive: an empty `~/.claude` directory left over from an uninstall]** → Mitigation: same — hint only. Users can ignore it.
- **[Behaviour change breaks muscle memory of existing users who "Enter through" the prompt expecting all clients]** → Mitigation: mention in the next release note. Low-risk because `required: true` means a mistaken empty submission is blocked, not silently applied.
- **[Detection cost on cold FS]** → 9 stat calls under `$HOME`; negligible.

## Migration Plan

Single release. No data migration. No feature flag — the picker is interactive and the change is immediately visible. Rollback = revert the commit.

## Open Questions

- Should the hint be in Traditional Chinese, English, or match the language of surrounding prompts? Decide at implementation time by reading nearby prompt strings in `src/cli.tsx`.
