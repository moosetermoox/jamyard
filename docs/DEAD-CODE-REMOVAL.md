# Dead-code removal — 2026-06-30

A careful cleanup pass. Every item below was verified **unused at runtime**
by a repo-wide usage search (excluding `node_modules`) before removal, and the
full test suite (720 tests) was re-run after each step. Nothing student-facing
or gameplay-affecting changed — these were unreferenced exports, helpers, and
one superseded file.

This note exists so each removal can be understood and reversed (`git revert`
or restore from history) if anything turns out to be needed after all.

## What was kept (flagged but deliberately NOT removed)
- `engine/event-bus.js` — nothing imports it, but it's the concrete form of the
  documented "Events, Not Direct Calls" architecture principle. Left in place.
- `preview-edit` socket event, `GET /api/rooms/:code/journal`,
  `GET /api/ai-budget` — reachable-by-design scaffolding / manual debug/ops
  endpoints. Left in place.

## Removed

### 1. The `validate:`-hook subsystem (never invoked)
A declarative schema-validator mechanism that was wired up but never called.
The only consumer, `getValidatorHook`, had zero callers; nothing reads a
schema entry's `.validate` property anywhere; and the same validation rules are
independently enforced in `engine/game-loader.js` (e.g. the "rate needs ≥1
scale" and wager-no-resolution checks). So this was a dead parallel copy.

- `engine/phase-schema-runtime.js`: removed `export const VALIDATOR_HOOKS`
  (~157 lines) and `export function getValidatorHook`, plus the matching
  header-comment bullet. (`DYNAMIC_OUTPUT_RESOLVERS` / `resolveOutputSpec` in
  the same file are live and untouched.)
- `engine/phase-schemas.js`: removed the 7 now-dangling `validate: '...'` keys
  (eliminate, preview, reveal, team-split, wager, rate, foreach) and the
  `VALIDATOR_HOOKS` mention in the file header.
- Verification: `getValidatorHook` had no callers; `grep '\.validate\b'` across
  engine/services/server = none; rules still enforced by game-loader.js.

### 2. `engine/renderers.js` (whole file, 89 lines)
Migration scaffolding for "Phase E" of the phase-schema spec. Phase E actually
shipped via `engine/resolver-grammar.js` (`classifyRef` / `KNOWN_SUFFIXES`),
so this registry was superseded and never imported. Half its functions were
empty `return ''` stubs.

- Deleted the file.
- Updated the two stale doc-comments that referenced it
  (`engine/phase-schemas.js` header, `engine/resolver-grammar.js` comment).
- Verification: `RENDERER_REGISTRY` / `getRendererFn` /
  `getRegisteredRendererNames` referenced only inside `renderers.js` itself
  plus two prose comments; no `import` of the file anywhere.

### 3. Unused exports in `engine/diagnostics.js`
- `asDiagnostic` and `asMessages` — exported helpers with zero callers
  repo-wide (only their own definitions/JSDoc).

### 4. Unused exports in `engine/phase-schemas.js`
- `getSubPhaseTypes` and `isCompatible` — exported getters with zero callers
  repo-wide. (Runtime compatibility checks go through
  `resolver-grammar.js`'s `checkDataRefCompat` instead.)

### 5. `hideAllSections()` in the screen clients
- `screens/host/host.js` and `screens/player/player.js` — defined once each,
  never called. Superseded by `showSection()`, which clears all sections then
  activates one.

### 6. `escapeHtmlForPreview()` in `screens/designer/editor.js`
- Defined once, never called. The live `escapeHtml()` in the same file is the
  one the preview/diff code actually uses.
