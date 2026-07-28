## Why

The interactive client picker in `selectClients()` (`src/cli.tsx:131-151`) pre-checks all 9 clients by default. Users who only use one or two clients must uncheck the rest one by one every run, which is friction on the most common path. There is also no visual cue about which clients the user actually has installed on their machine, so the choice has to be made from memory.

## What Changes

- Change `initialValues` in `selectClients()` from "all selected" to an empty selection (`[]`), so users opt in rather than opt out.
- Add installed-client detection: check each client's canonical config root/file for existence and expose the result as a list of client IDs.
- Show detected clients as a hint on the multiselect prompt (e.g. `已偵測到已安裝：Claude, Gemini`), so users can quickly reproduce the "smart" selection manually.
- Keep `required: true` and every other behaviour of the picker unchanged.

## Capabilities

### New Capabilities
- `client-selection-ux`: interactive selection of which AI-tool clients `dotagents` should manage in one CLI run, including detection of installed clients and how that surfaces in the picker.

### Modified Capabilities
<!-- none — this is the first tracked change and there are no existing specs -->

## Impact

- `src/cli.tsx` — `selectClients()` (initial values, message/hint composition).
- `src/core/detect-installed.ts` (new) — pure detection helper that returns which of the 9 clients look installed, based on config paths from `resolveRoots({ scope: 'global' })` in `src/core/paths.ts`.
- No changes to link/apply/plan behaviour, mappings, or file layout.
- No new runtime dependencies.
- Tests: add unit tests for the detection helper using a fake `homeDir`.
