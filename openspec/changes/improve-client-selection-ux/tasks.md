## 1. Detection helper

- [x] 1.1 Create `src/core/detect-installed.ts` exporting `detectInstalledClients(opts?: { homeDir?: string }): Promise<Client[]>` that resolves global roots via `resolveRoots({ scope: 'global', homeDir: opts?.homeDir })` and returns the subset of the 9 supported clients whose config root exists (use `pathExists` from `src/utils/fs.ts`). For `github`, check `copilotRoot` (i.e. `~/.copilot`), not the project-local `.github` folder.
- [x] 1.2 Preserve the canonical client order from the picker (`claude, factory, codex, cursor, opencode, gemini, antigravity, github, ampcode`) in the returned array.

## 2. CLI picker changes

- [x] 2.1 In `src/cli.tsx` `selectClients()`, import `detectInstalledClients` and call it inside a `try/catch`; on any error, treat detected list as `[]`.
- [x] 2.2 Extract the existing label map from `formatClients()` into a module-level constant (e.g. `CLIENT_LABELS: Record<Client, string>`) so the picker and the summary share one source of truth.
- [x] 2.3 Change `initialValues: options.map((opt) => opt.value)` to `initialValues: []`.
- [x] 2.4 Build a hint string using `CLIENT_LABELS`: when detected list is non-empty show `已偵測到已安裝：<Label1>, <Label2>, ...`; when empty show `未偵測到已安裝的 client`. Pass it to `multiselect` (via clack's supported hint/help mechanism — verify with the installed `@clack/prompts@^0.7.0` API at implementation time; if no dedicated field, append to `message`).
- [x] 2.5 Leave `required: true` and the rest of `selectClients()` unchanged.

## 3. Tests

- [x] 3.1 Add `tests/detect-installed.test.ts` covering: (a) subset detection with a temp `homeDir` where only `.claude` and `.gemini` exist, (b) empty result when no roots exist, (c) canonical ordering when all roots exist, (d) `github` detection driven by `~/.copilot` existence.
- [x] 3.2 Run `bun test` and `bun run type-check`; fix any failures.

## 4. Verification

- [x] 4.1 `bun run dev` and walk through the picker manually: confirm nothing is pre-checked, the "已偵測到" hint reflects reality on the current machine, and submitting with zero clients keeps you on the prompt.
- [x] 4.2 Update `README.md` if it documents the old "all pre-checked" behaviour (grep first; skip if not mentioned).
