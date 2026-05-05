# Spec: Shared Phase Schema (rev. 2)

> **Goal:** one declarative module per phase type that drives the
> validator, the editor's form fields, the AI generator's prompt, and
> the docs — replacing the scattered constants currently maintained
> independently in three places.
>
> **Why:** today the editor (4,358 lines) duplicates the validator's
> rules in JS for inline error display, and the AI generator's prompt
> has its own hand-written description of allowed fields. These
> drift. A single source of truth eliminates a recurring bug class
> (e.g. "validator allows X but editor rejects it" or "AI invents
> field Y because the prompt doesn't list the allow-list").
>
> **Scope:** phase configuration shape only. Does *not* cover
> handler implementation, runtime state, or the engine's resolver.
> Those stay where they are.
>
> **Revision note:** rev. 2 incorporates senior-engineer review
> feedback (`docs/feedback schema.txt`). Major changes from rev. 1:
> declarative schema split from executable behavior; structured
> diagnostic objects from day one; transitions as their own schema
> section; shared resolver grammar; normalizer pipeline step;
> migration order reorganized to land typed-dataflow warnings before
> the editor refactor. See §13 for a change log.

---

## 1. Problem

Today, knowledge about a phase type lives in three places:

| Where | What it knows | Lines (approx) |
|---|---|---|
| `engine/game-loader.js` | Required + optional fields, enum values, type-specific validation | ~15 constants |
| `screens/designer/editor.js` | Form fields, friendly labels, helper text, dropdown options, validation rules | ~1,500 lines of phase-aware UI |
| `services/ai-service.js` | Hand-written prose listing allowed fields per phase | ~120 lines inside the system prompt |

Each adds rules independently. They drift. Three real instances:

- The AI invented `excludeSelf` (caught only because of the strict allow-list added later).
- The editor's `unreachable phase` warning lived only in the editor for months — the server validator didn't have it, so saved-via-API configs slipped through.
- The AI generator's prompt described 9 phase types when there were 12, then 12 when there were 19.

Plus implicit knowledge that exists nowhere structured:
- What does each phase type **output**? (Needed for typed-dataflow validation.)
- What's a **renderable** vs a **structured** field? (Needed to catch `{{X.responses}}` as an error instead of a warning.)
- What are the **friendly labels** for fields? (Today hardcoded in editor.js.)

---

## 2. Architectural Principles (from review)

The schema is the contract; behavior is registered separately.

1. **The schema is declarative data only.** No inline functions, no
   executable validators, no renderer implementations. Anything
   executable is referenced by name and resolved at runtime via a
   registry.
2. **Diagnostics are structured objects, not strings.** Every
   validation failure, every warning, every removed field carries
   `{severity, code, path, phaseId, field, message, suggestion?,
   autofix?}`. Adopted from day one — retrofitting later is much
   harder than adopting up front.
3. **Configuration is normalized before validation.** A separate
   `normalizeConfig()` pass applies defaults, coerces types (form
   strings → numbers/booleans), canonicalizes refs. Validator runs
   on the normalized result.
4. **Transitions are separate from fields.** Graph-level passes
   (reachability, cycle detection) ask the schema for edges instead
   of guessing which fields are transitions. `next` is not a
   universal field; it's a transition declared per-phase.
5. **Mixins, not "universal" fields.** Things like `screenControl`,
   `timer`, `participantSelector` are opt-in capabilities a phase
   declares. Not every phase has them, so they shouldn't appear
   "everywhere by default."
6. **One resolver grammar.** The validator's `{{...}}` parser and
   `engine.resolve()` use the same shared grammar module. Same
   parser; different consumers. No drift between "what the
   validator thinks is a valid token" and "what the engine actually
   resolves."

---

## 3. Module Layout

The schema is shared between server and browser, so it sits in a
neutral location. Reviewer suggested `shared/`; we'll keep it inside
`engine/` for now (we have no build step and no module-resolution
issues across surfaces) but flag it as **browser-safe** by avoiding
Node-only imports. If we hit collisions later, moving to `shared/`
is a rename.

```
engine/
  phase-schemas.js              declarative phase metadata only
  field-types.js                declarative field/type vocabulary
  diagnostics.js                Diagnostic shape + diagnostic codes
  resolver-grammar.js           token/ref grammar shared by validator + engine
  phase-schema-runtime.js       server-side validator hooks, dynamic outputs
  renderers.js                  actual renderer functions (not in the schema)
  normalizer.js                 applies defaults + coercions before validation
  game-loader.js                still owns graph-level passes (reachability, cycles)
```

The schema references behavior by **name**, never by function:

```js
// in phase-schemas.js (declarative, browser-safe)
output: {
  responses: {
    type: 'array',
    capability: 'responseArray',
    renderers: {
      list: 'responseList',
      count: 'arrayCount',
      json: 'jsonPretty'
    }
  }
}

// in renderers.js (engine-side, never imported by the editor unless
// the editor needs to preview the rendered output)
export const RENDERER_REGISTRY = {
  responseList: (arr) => arr.map((r, i) => `${i + 1}. ${r.text}`).join('\n'),
  arrayCount:   (arr) => String(arr.length),
  jsonPretty:   (val) => JSON.stringify(val, null, 2)
};
```

---

## 4. The Schema Shape

```js
export const PHASE_SCHEMAS = {
  collect: {
    label: 'Ask Players',
    icon: '✏️',
    description: 'Players type a free-text response.',
    role: 'input',          // input | display | compute | flow | terminal
    allowedIn: ['topLevel', 'foreach'],

    mixins: ['screenControl', 'timer', 'participantSelector'],

    fields: {
      prompt: {
        type: 'templateString',
        required: true,
        label: 'Question to ask',
        helper: 'What students will see. Can include {{tokens}} from earlier steps.',
        placeholder: 'How are you feeling today?'
      },
      fields: {
        type: 'array',
        item: { type: 'string' },
        optional: true,
        label: 'Multi-field response'
      }
    },

    transitions: {
      next: { required: true, allowedIn: ['topLevel'] }
    },

    output: {
      kind: 'dynamic',
      resolver: 'collectOutput'   // function name in phase-schema-runtime.js
    }
  },

  vote: {
    label: 'Vote',
    icon: '🗳️',
    description: 'Players pick a winner from a set of choices.',
    role: 'compute',
    allowedIn: ['topLevel'],

    mixins: ['timer', 'participantSelector:voters'],

    fields: {
      mode: {
        type: 'enum',
        values: ['pick-one', 'head-to-head'],
        required: true,
        label: 'Voting style'
      },
      candidates: {
        type: 'dataRef',
        accepts: [{ type: 'array', capability: 'candidateSource' }],
        required: true,
        label: 'Choices to vote on'
      },
      question: {
        type: 'templateString',
        optional: true,
        label: 'Voting prompt'
      }
    },

    transitions: {
      next: { required: true }
    },

    output: {
      kind: 'static',
      fields: {
        scores: {
          type: 'scoreMap',
          capability: 'scoreMap',
          renderers: { barChart: 'tallyBarChart', json: 'jsonPretty' }
        },
        votes:      { type: 'array', renderers: { count: 'arrayCount' } },
        winner:     { type: 'string', presence: 'eventualOnce' },
        tied:       { type: 'boolean', presence: 'eventualOnce' },
        totalVotes: { type: 'integer' }
      }
    },

    aliases: {
      // Existing games use {{vote.barChart}} as a shorthand for
      // {{vote.scores.barChart}}. Validator allows both; emits an info-
      // level diagnostic ("prefer canonical form") on the legacy form.
      'barChart': 'scores.barChart'
    }
  }
};
```

### Field types

A small fixed vocabulary. The validator treats each one specifically.

| `type` | What it is |
|---|---|
| `string` | Plain text |
| `templateString` | Plain text with `{{...}}` tokens |
| `integer` | Number with optional `min`/`max` |
| `boolean` | True/false |
| `enum` | One of `values: []` |
| `phaseRef` | Reference to another phase ID |
| `dataRef` | `phaseId.field` reference, with `accepts: [{type, capability?}, ...]` |
| `array` | List of `item: <field>` |
| `object` | Map with explicit shape |
| `oneOf` | Union — `options: [<field>, <field>]`. Used sparingly (today only `wager.options` accepts inline-array OR dataRef). |

### Output types — semantic capabilities, not just shapes

Per the review: `array` is too loose. A `vote.candidates` field should
accept arrays that are *candidate sources*, not any array.

Each output declares both a `type` (structural) and an optional
`capability` (semantic). Each consuming `dataRef` field declares what
capabilities it accepts.

| `type` | Shape | Common `capability` values |
|---|---|---|
| `string` | A single string | `renderable` |
| `array` | Repeated `item: { shape }` | `responseArray`, `candidateSource`, `rankingArray`, `teamArray` |
| `scoreMap` | `{ playerId: number }` | `scoreMap` |
| `object` | `{ shape: {...} }` | (case by case) |
| `boolean` | True/false | — |

**Initial capability vocabulary (keep small):**
- `responseArray` — output of `collect`. Renderable as a list of named contributions.
- `candidateSource` — anything voteable/rankable. `responseArray` is automatically a `candidateSource`; `rankingArray` is too.
- `rankingArray` — output of `rank`. Has positional info.
- `teamArray` — output of `team-split`. Each item is `{teamName, members}`.
- `scoreMap` — `{playerId: number}` produced by `vote`, `wager`, `eliminate`.
- `renderable` — direct-to-template string (subset of `string`).

A field declared with `output.type: 'array'` cannot be inserted into a
`templateString` directly — only via a registered renderer suffix
(`{{phaseId.X.list}}`). Renderers declare which capabilities they
accept; the validator catches a mismatched suffix at save time.

### Output shapes: static vs dynamic

Some phases have output shapes that depend on configuration:

- `ai-process` — outputs `result: string` by default; `result: object|array` when `format: 'json'`; also outputs `byPlayer` when `perPlayer: true`.
- `collect` — output shape changes when `fields: [...]` is set (multi-field responses).

The schema supports both:

```js
// Static — known at config-time
output: {
  kind: 'static',
  fields: { scores: { type: 'scoreMap' }, ... }
}

// Dynamic — resolver computes shape from the phase config
output: {
  kind: 'dynamic',
  resolver: 'aiProcessOutput'    // function name in phase-schema-runtime.js
}
```

The resolver is a named function in `phase-schema-runtime.js`. For docs
and AI prompts, a conservative description is generated:

```
ai-process outputs `result`. If perPlayer is true, also outputs
`byPlayer` and supports `{{phase.mine}}` in player-facing templates.
If format is "json", `result` is the parsed JSON value.
```

### Mixins

Common capability blocks reused across phase types. Declared as
named mixins on the phase entry; the schema compiler merges them in.

```js
const MIXINS = {
  screenControl: {
    fields: {
      hostShow: { type: 'array', item: { type: 'string' }, optional: true, label: 'Host UI elements' },
      playerShow: { type: 'array', item: { type: 'string' }, optional: true, label: 'Player UI elements' },
      hostTemplate: { type: 'templateString', optional: true },
      playerTemplate: { type: 'templateString', optional: true }
    }
  },
  timer: {
    fields: {
      timer: { type: 'integer', min: 1, max: 3600, optional: true, label: 'Time limit (seconds)' }
    }
  },
  participantSelector: {
    // Configurable: defaults to "from", but can be aliased ("voters" on vote).
    fields: {
      from: { type: 'enum', values: ['all', 'remaining', 'eliminated'], default: 'all', label: 'Who can participate' }
    }
  },
  loops: {
    transitions: {
      loopBack: { type: 'phaseRef', optional: true, requires: 'loopCount' },
      loopCount: { type: 'integer', min: 2, max: 100, optional: true }
    }
  }
};
```

A phase like `vote` opts into `participantSelector` but renames its
field to `voters`:

```js
mixins: ['timer', 'participantSelector:voters']
```

### Transitions

Declared separately from fields. Graph-level passes ask the schema
for edges:

```js
transitions: {
  next: { required: true },                    // most phases
  approveNext: { required: true },             // preview
  rejectNext: { required: true }               // preview
}

// Terminal phase
transitions: {}                                // end
```

`loopBack`/`loopCount` come in via the `loops` mixin (or are explicit
on phases that always loop, like foreach, if any do).

The state-machine builder reads `transitions` from the schema instead
of scanning all field names for known transition keys. This is also
how the editor knows which arrows to draw on the canvas.

### Diagnostic objects

Every validator returns these:

```js
/**
 * @typedef {Object} Diagnostic
 * @property {'error'|'warning'|'info'} severity
 * @property {string} code           Stable machine code (e.g. INVALID_ENUM_VALUE)
 * @property {string} path           Dotted JSON path: "phases.vote.mode"
 * @property {string} [phaseId]      The phase the diagnostic is about
 * @property {string} [field]        The field within that phase
 * @property {string} message        Human-readable, teacher-friendly
 * @property {string} [suggestion]   Suggested fix (UI can show inline)
 * @property {string} [source]       'validator' | 'normalizer' | 'ai-cleanup'
 * @property {Object} [autofix]      Optional auto-applicable patch
 */
```

Sample diagnostic codes (initial set, expand as needed):

- `MISSING_REQUIRED_FIELD`
- `UNKNOWN_FIELD`
- `INVALID_ENUM_VALUE`
- `INVALID_INTEGER_RANGE`
- `MISSING_PHASE_REF`
- `MISSING_DATA_REF`
- `DATA_REF_TYPE_MISMATCH`
- `RAW_ARRAY_IN_TEMPLATE`
- `UNKNOWN_RENDERER`
- `UNREACHABLE_PHASE`
- `CYCLE_DETECTED`
- `UNKNOWN_FIELD_REMOVED` (from cleanup mode)
- `WAGER_NO_RESOLUTION_BASIS`
- `TEAM_SPLIT_UNUSED`
- `LEGACY_TOKEN_FORM` (from alias resolution; info severity)

---

## 5. Unknown-Field Handling Modes

Reviewer correctly flagged that today's `stripUnknownFields()` silently
drops invented fields. That's fine for AI cleanup but bad for human-
authored configs.

Three explicit modes, selected by the caller of `validate()`:

```
strict mode (default)
  Used by tests, direct API saves, developer tools.
  Unknown fields → error (UNKNOWN_FIELD diagnostic).

ai-cleanup mode
  Used only for AI-generated or AI-revised configs (POST /api/games/generate,
  /revise, /revise-phase).
  Unknown fields → removed, but each removal emits a warning diagnostic
  (UNKNOWN_FIELD_REMOVED) that surfaces in the diff modal so the teacher
  sees what changed.

legacy-import mode
  Used for old saved games on first load after a schema-incompatible change.
  Unknown fields → removed with warnings. Logged for migration tracking.
```

The key word from the review: **silently**. Dropping a field can change
intended behavior. That's only OK if the teacher sees the change before
applying.

---

## 6. The Resolver Grammar

`engine/resolver-grammar.js` exposes a shared parser used by both the
validator and the engine:

```js
/**
 * Parse a template string into a list of token references.
 * Returns array of { raw, ref, range, kind }.
 * kind: 'phaseField' | 'builtin' | 'loopScope' | 'foreachScope' | 'mineScope'
 */
export function parseTemplateTokens(template) { ... }

/**
 * Parse a single ref (e.g. "vote.scores.barChart") into segments
 * with optional renderer suffix.
 */
export function parseRef(ref) { ... }

/**
 * Classify a ref against a schema in a context (for typed-dataflow):
 *   { phase, field, suffix, producedType, capability, isAlias, canonical }
 */
export function classifyRef(ref, schema, context) { ... }
```

Existing engine resolver (`engine.resolve()`) is rewritten to use
`parseRef()` instead of doing its own string splitting. The validator's
template scan uses `parseTemplateTokens()` + `classifyRef()`.

Same grammar; different consumers; no drift. Required for typed-dataflow
checks to work without false positives on advanced tokens like:

- `{{_loop.eliminate.iteration}}`
- `{{_foreach.0.text}}`
- `{{_current.fields.correct}}`
- `{{rank.rankings.0.item}}`
- `{{ai.mine}}`

---

## 7. The Validation Pipeline

```
raw config
  ↓
normalizeConfig(config, schema)
  - apply defaults (e.g. timer absent → omit; from absent → "all")
  - coerce form-string values: "30" → 30, "true" → true (where field type is integer/boolean)
  - canonicalize refs (whitespace, casing on enum values)
  - apply alias resolution (e.g. {{vote.barChart}} → {{vote.scores.barChart}}, with LEGACY_TOKEN_FORM info diagnostic)
  - in ai-cleanup/legacy-import mode: drop unknown fields, emit diagnostics
  ↓
validateConfig(normalizedConfig, schema, mode)
  - per-phase: schema walk (required fields, enum check, type check, schema-level validate hook)
  - graph-level passes: reachability (BFS from lobby), cycle detection (DFS), template scan (typed-dataflow)
  - returns { config: normalizedConfig, diagnostics: Diagnostic[] }
  ↓
caller decides:
  - editor: show diagnostics inline, block save if any error
  - server save: block save if any error in strict mode
  - AI cleanup: surface warnings in diff modal, let teacher accept
```

This is a separate step from validation. Without it, every consumer
(editor, server, AI) re-implements form-string coercion. With it,
the validator's job stays pure: "given a normalized config, find
diagnostics."

---

## 8. Consumer 1: The Validator

`engine/game-loader.js` becomes a schema-walker. Most of its current
720 lines collapse into ~200 (~150 walker + ~50 graph passes that
aren't per-field).

```js
import { PHASE_SCHEMAS, getFields } from './phase-schemas.js';
import { runValidator, runNormalizer } from './phase-schema-runtime.js';
import { Diagnostic } from './diagnostics.js';

export function validate(rawConfig, gameId, options = {}) {
  const mode = options.mode || 'strict';
  const { config, diagnostics: normDiags } = runNormalizer(rawConfig, PHASE_SCHEMAS, mode);
  const validateDiags = runValidator(config, PHASE_SCHEMAS, mode);
  return {
    config,
    diagnostics: [...normDiags, ...validateDiags],
    errors:   validateDiags.filter(d => d.severity === 'error'),
    warnings: validateDiags.filter(d => d.severity === 'warning')
  };
}
```

`runValidator` walks each phase against its schema entry, then runs
graph-level passes (reachability, cycles, design-hole warnings). Each
schema-level `validate` hook is referenced **by name** and resolved
through the runtime registry, not embedded inline.

### What this kills

- `PHASE_REQUIRED_FIELDS`, `PHASE_OPTIONAL_FIELDS`, `SUBPHASE_OPTIONAL_FIELDS`,
  `ENUM_VALUES`, `DATA_REF_FIELDS`, `VALID_HOST_TOGGLES`, `VALID_PLAYER_TOGGLES`
  — all replaced by `PHASE_SCHEMAS[type]` plus mixins.
- ~30 type-specific `if` branches in `validate()` — replaced by one
  schema walker.
- Direct string returns from validator — replaced by Diagnostic objects.

---

## 9. Consumer 2: The Editor

`screens/designer/editor.js` (4,358 lines) currently has hand-written
form rendering for each phase type. ~1,500 of those lines are
"render this field" / "validate this field" / "show this dropdown."

Replace with a schema-driven form builder, but with an **escape
hatch** for complex phases:

```js
function renderFormForPhase(phase) {
  const schema = PHASE_SCHEMAS[phase.type];
  if (schema.editor?.customComponent) {
    return CUSTOM_PHASE_EDITORS[schema.editor.customComponent](phase, schema);
  }
  return renderGenericSchemaForm(phase, schema);
}
```

Custom components (likely needed for `foreach`, `relay`, `rank`, screen
controls) may customize **presentation**, but never redefine validation
rules. Validation always comes from the schema.

`renderGenericSchemaForm` reads `getFields(type)` (fields + mixin fields)
and dispatches per `field.type`. The editor's existing variable chips,
friendly tokens, autocomplete become features of the field types
(`templateString` always gets token autocomplete; `dataRef` always gets
the compatible-sources dropdown).

For data-ref pickers, the schema's capability declarations make the
editor smarter:

```
Choices to vote on:
  ✓ Responses from "Collect Ideas"     (responseArray, capability: candidateSource)
  ✓ Items from "Brainstorm"            (responseArray, capability: candidateSource)
  ✗ Vote scores from "Round 1"         (scoreMap — wrong capability)
```

Instead of exposing raw `phaseId.field` tokens.

---

## 10. Consumer 3: The AI Generator

`services/ai-service.js` builds the system prompt for game generation
by hand. Today it's a 120-line block of Markdown.

Generate it from the schema instead:

```js
function buildPhaseDocsForPrompt() {
  return Object.entries(PHASE_SCHEMAS).map(([type, schema]) => {
    const required = describeRequiredFields(schema);
    const optional = describeOptionalFields(schema);
    const outputs  = describeOutputs(schema);
    return `- ${type}: ${schema.description}\n` +
           `    Required: ${required}\n` +
           `    Optional: ${optional}\n` +
           `    Outputs: ${outputs}`;
  }).join('\n');
}
```

The schema-generated prompt **reduces** invented fields by keeping the
model's phase documentation current. The strict validator remains the
authority: AI-generated configs still go through `ai-cleanup` mode
(strip + warn) and the diff modal. We expect fewer invented fields,
not zero.

---

## 11. Consumer 4: Docs

A small build-time script (`scripts/generate-phase-docs.js`) emits
`docs/PHASE-REFERENCE.md` from the schema, so the docs literally
can't drift.

---

## 12. Migration Plan (incremental, reordered per review)

The reviewer's stronger order: typed-dataflow warnings before the
editor refactor. Bigger classroom-safety win, less UI risk.

### Phase A — define the schema (no behavior change)

1. Create `engine/phase-schemas.js`, `field-types.js`, `mixins.js`,
   `diagnostics.js`. No runtime behavior change.
2. Add agreement test: `every PHASE_SCHEMAS[type] entry agrees with
   the existing constants in game-loader.js`. Asserts no drift
   introduced by the move. (Already passing in the current stub.)
3. Add coverage test: `every phase handler has a schema entry,
   except role === 'abstract'`.

**Ship.** Validator, editor, AI prompt unchanged.

### Phase B — diagnostic objects + normalizer

1. Define the `Diagnostic` shape in `diagnostics.js` and the initial
   diagnostic-code set.
2. Implement `normalizeConfig(rawConfig, schema, mode)`. Runs as
   the first pipeline step. No semantics change yet.
3. Refactor `validate()` to return `{config, diagnostics, errors,
   warnings}`. Old callers get strings via `.errors.map(d => d.message)`
   (a thin compatibility wrapper).
4. Introduce the `mode` parameter (`strict`/`ai-cleanup`/`legacy-import`).
   `stripUnknownFields()` is replaced by ai-cleanup mode emitting
   `UNKNOWN_FIELD_REMOVED` diagnostics; the diff modal in the editor
   shows them.

**Ship.** All 281 tests still pass. Validator's behavior is identical;
only the *shape* of its output is richer.

### Phase C — validator reads from schema

1. Replace `PHASE_REQUIRED_FIELDS` / `PHASE_OPTIONAL_FIELDS` /
   `ENUM_VALUES` lookups in `validate()` with reads from `PHASE_SCHEMAS`.
2. **Side-by-side test:** run both old and new validators in tests,
   diff diagnostic codes. Don't delete the old constants until the
   side-by-side test is green for at least one full release cycle.

```js
// tests/migration/side-by-side.test.js
for (const fixture of allGameFixtures) {
  const oldDiags = oldValidate(fixture);
  const newDiags = newValidate(fixture);
  expect(newDiags.map(d => d.code).sort()).toEqual(oldDiags.map(d => d.code).sort());
}
```

3. Once green, delete the old constants.

**Ship.** Validator reads from schema; tests prove behavior preserved.

### Phase D — AI generator reads from schema

1. Replace the hand-written phase-types prose in `services/ai-service.js`
   with `buildPhaseDocsForPrompt()`.
2. Generate one game with each existing template; smoke-validate.
3. Compare AI output before/after on a handful of canned prompts
   (committed as fixtures).

**Ship.** AI generator constrained by the same allow-list the server
enforces.

### Phase E — typed-dataflow warnings

1. Add output-type declarations to every phase schema entry.
2. Add `engine/resolver-grammar.js`; rewrite `engine.resolve()` and
   the validator's template scan to use it.
3. Implement compatibility aliases (`{{vote.barChart}}` →
   `{{vote.scores.barChart}}`, info-level diagnostic).
4. Implement typed-dataflow check as **warnings** initially:
   - `dataRef` fields warn when source's output capability doesn't
     match `accepts: [...]`.
   - `templateString` fields warn when `{{X.field}}` resolves to a
     non-renderable type without a renderer suffix.

**Ship.** Don't promote to errors yet; existing games may have legacy
forms.

### Phase F — editor reads from schema (per phase type, easy first)

Easy phases first to prove the generic field renderer:
- `announce`, `reveal`, `preview`, `end`, `leaderboard`, `winner`

Medium:
- `collect`, `collect-choice`, `vote`, `rank`, `wager`, `eliminate`

Hard (probably need custom components):
- `ai-process`, `ai-eliminate`, `relay`, `foreach`, `team-split`

One PR per phase type. Custom components for the hard ones land in
the same PR.

### Phase G — promote selected typed-dataflow warnings to errors

After old games are cleaned up (could be teacher-driven or via a
migration script), promote the highest-confidence warnings to errors:
- `RAW_ARRAY_IN_TEMPLATE` — the original `[object Object]` bug class.
- `DATA_REF_TYPE_MISMATCH` — `vote.candidates: someScoreMap` etc.

---

## 13. Effort Estimate (revised)

The reviewer's grouping (easy / medium / hard) is incorporated into
Phase F. Other phases unchanged.

| Phase | Effort | Risk |
|---|---|---|
| A — define schema, no behavior change | 1 day | Very low |
| B — diagnostic objects + normalizer + modes | 2 days | Low |
| C — validator reads from schema (with side-by-side test) | 2 days | Low |
| D — AI prompt reads from schema | 0.5 day | Low |
| E — typed-dataflow warnings + resolver grammar | 3 days | Medium (touches engine.resolve) |
| F — editor migration (easy: 0.5d, medium: 1d, hard: 2d) | ~14 days | Medium per PR; isolated |
| G — promote warnings to errors | 0.5 day per code | Low |

Total to fully complete: ~5 weeks of part-time work, with shippable
checkpoints throughout.

**Highest near-term win for the goal** ("teachers patch together
games with as few errors as possible"): **Phases B + C + E** — the
validator getting structured output, the schema-driven walker, and
typed-dataflow warnings. That's ~7 days of work and addresses the
biggest remaining bug classes (template type errors, AI-invented
fields, editor-engine drift on validation rules) without touching
the editor UI.

---

## 14. Applied Review Feedback (from `feedback schema.txt`)

What was incorporated into rev. 2:

| # | Feedback item | Where it landed |
|---|---|---|
| 1 | Split declarative schema from executable behavior | §3 (module layout), §4 (named renderer/validator refs) |
| 2 | AI overclaim correction | §10 (reduces, not eliminates) |
| 3 | Unknown-field handling needs explicit modes | §5 (three modes documented) |
| 4 | Structured Diagnostic objects from day one | §4 (Diagnostic shape), Phase B |
| 5 | Semantic output capabilities | §4 (capability vocabulary), §9 (editor uses for dropdown filtering) |
| 6 | Renderers per-output, not global | §3 (named registry; per-output declared in schema) |
| 7 | Compatibility aliases for current tokens | §4 (aliases: block); §7 (normalizer applies) |
| 8 | Dynamic outputs first-class | §4 (kind: 'static' | 'dynamic') |
| 9 | Shared resolver grammar | §6 (resolver-grammar.js) |
| 10 | Transitions as their own schema section | §4 (transitions: block); state-machine builder reads from there |
| 11 | Mixins instead of universal block | §4 (mixins; renamed away from "universal") |
| 12 | Foreach sub-phases via context, not flag | §4 (allowedIn: ['topLevel', 'foreach']) |
| 13 | Editor escape hatch for complex phases | §9 (custom components; validation still from schema) |
| 14 | Normalizer as separate pipeline step | §7 (full pipeline diagram), Phase B |
| 15 | Typed dataflow earlier in migration | §12 (Phase E before Phase F editor migration) |
| 16 | Side-by-side validator tests | §12 Phase C |
| 17 | Effort estimate easy/medium/hard for editor | §12 Phase F, §13 |

What was deliberately deferred:

- **Capability vocabulary expansion.** Started small (6 capabilities).
  Expect to add 2-3 more during Phase E as we build the typed-dataflow
  checks. Worth resisting going wild — every capability is something
  to maintain.
- **`shared/` module path.** Deferred until/unless we hit a real
  collision. For now, `engine/` is fine if files stay browser-safe.
- **Schema versioning + migration pipeline.** Real concern for a
  hosted product; out of scope until rooms persist beyond a single
  server lifetime.
- **Recipe/compiler layer above raw phases.** From the original
  senior review (recipe #3). Builds on top of this once it's in place.
- **TypeScript migration.** JSDoc + `// @ts-check` is sufficient and
  matches the current toolchain.

---

## 15. Open Questions (for next reviewer pass)

The reviewer answered the four original open questions; these are new:

1. **Where do mixin-introduced fields rank in the editor's form?**
   `screenControl` and `timer` are common but visually noisy. Should
   they always render at the bottom (advanced section), or follow the
   declaration order in the schema?

2. **`legacy-import` mode trigger.** When does it kick in? On every
   game load (cheap, but fires the alias-info diagnostic on every
   open) or only on save (cleaner UX but old games keep the old
   tokens)?

3. **Capability inheritance.** Should `responseArray` automatically
   imply `candidateSource` (since responses are inherently voteable),
   or should each phase explicitly declare both? Lean toward implicit
   to keep schema entries terse.

4. **Schema-versioning timeline.** Today the schema lives in code; a
   change to schema requires a deploy. If/when configs persist
   (Postgres), we'll need a `configSchemaVersion` and a migration
   path. Is that a Phase H, or a separate project?

5. **Editor custom components — how many is too many?** Reviewer
   suggested 5 phase types likely need them (`ai-process`,
   `ai-eliminate`, `relay`, `foreach`, `team-split`). If more than
   ~7 of 19 phases need custom rendering, the "schema-driven editor"
   value erodes. Worth a stop-and-reassess gate after the first 3
   custom components.
