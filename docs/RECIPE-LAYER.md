# Recipe Layer

> **Status:** R1 (foundation) shipped. R2–R6 in build order — see
> bottom of this doc.
>
> **Goal:** non-coders build classroom games by picking a pattern and
> filling in 2–5 fields. The phase-graph editor stays as the
> "advanced mode" escape hatch, but it's no longer the front door.

---

## Why this exists

The phase-graph editor is powerful: 19 phase types, mixins, loops,
foreach, typed dataflow. But that power comes at a cost — teachers
have to mentally model phases, data refs, template tokens, and the
rules that bind them.

A recipe collapses the model. A teacher picks "Class Poll" and fills
in `question` and `choices`. The compiler emits a valid phase graph.
The teacher never sees `{{ask.barChart}}` or has to wonder which
`from` value to put on the leaderboard.

**The phase graph is still the runtime.** Recipes don't replace it;
they sit on top.

The reviewer in `docs/feedback.txt` made the case directly: *"make the
system more like a game compiler than a blank visual programming
tool."* This is that compiler.

---

## Architecture

```
┌──────────────────┐       ┌────────────────┐
│ Teacher fills    │       │ AI matches     │
│ recipe params    │       │ description    │
│ via picker UI    │       │ to recipe      │
│      (R2)        │       │      (R4)      │
└────────┬─────────┘       └────────┬───────┘
         │                          │
         └──────────┬───────────────┘
                    ▼
           ┌────────────────────┐
           │ recipe-compiler.js │
           │  - coerce params   │
           │  - apply defaults  │
           │  - validate params │
           │  - substitute      │
           └─────────┬──────────┘
                     ▼
             ┌─────────────┐
             │ game config │
             └──────┬──────┘
                    ▼
           ┌────────────────────┐
           │ game-loader.js     │
           │ validate()         │
           │ (existing)         │
           └─────────┬──────────┘
                     ▼
             saved game,
             playable in /host + /player
```

---

## Recipe file format

Recipes are JSON files in `recipes/`. Built-in recipes live at
`recipes/<id>.json`; user-saved recipes (R5) live at
`recipes/user/<id>.json`.

```json
{
  "id": "class-poll",
  "name": "Class Poll",
  "icon": "📊",
  "description": "Ask the class a multiple-choice question. See results as a bar chart.",
  "tagline": "Perfect for warm-ups and exit tickets.",
  "version": "1",

  "parameters": {
    "question": {
      "type": "templateString",
      "label": "Question to ask the class",
      "required": true,
      "minLength": 3,
      "maxLength": 300
    },
    "choices": {
      "type": "array",
      "item": { "type": "string" },
      "minItems": 2,
      "maxItems": 8,
      "default": ["Got it!", "Mostly got it", "A little confused", "Lost"]
    },
    "timer": {
      "type": "integer",
      "default": 60,
      "min": 10,
      "max": 600
    }
  },

  "template": {
    "name": "Poll: ${question}",
    "phases": {
      "lobby": { "type": "lobby", "next": "ask" },
      "ask": {
        "type": "collect-choice",
        "prompt": "${question}",
        "choices": "${choices}",
        "timer": "${timer}",
        "next": "results"
      },
      "results": {
        "type": "reveal",
        "template": "## Results\n\n${question}\n\n{{ask.barChart}}",
        "next": "end"
      },
      "end": { "type": "end" }
    }
  }
}
```

### Parameter types

| Type | Form widget | Coercion |
|---|---|---|
| `string` | text input | none |
| `templateString` | text input with `{{token}}` autocomplete | none |
| `integer` | number input | `"30"` → `30` |
| `boolean` | checkbox | `"true"`/`"false"` → `true`/`false` |
| `enum` | dropdown (from `values: [...]`) | none |
| `array` | repeater (from `item: {type}`) | per-item coercion |

These mirror the field-type vocabulary in `engine/phase-schemas.js`,
so the editor's existing form-renderer code can render recipe
parameter forms without changes.

### Substitution rules

The compiler walks `template` recursively and replaces `${name}`
placeholders.

**Whole-value substitution** — when a string is exactly `"${name}"`,
the value preserves its native type:

```json
"choices": "${choices}"     // → ["A", "B", "C"]  (array, not string)
"timer":   "${timer}"       // → 60               (number, not "60")
```

**Embedded interpolation** — when a placeholder is surrounded by other
text, the value stringifies:

```json
"name": "Poll: ${question}"     // → "Poll: How are you?"
"prompt": "Round ${n} of ${total}"  // → "Round 1 of 3"
```

**Object keys** — keys can contain placeholders too. Useful for
generating phase IDs:

```json
"phases": {
  "${prefix}-vote": { "type": "vote" }
}
```

**Unknown placeholder** — error. `${typo}` in the template that's not
in `parameters` is a recipe-author bug.

### `${param}` vs `{{token}}`

Two completely separate substitution systems. They never overlap:

- **`${param}`** — recipe compile-time. Replaced before the game saves.
- **`{{phase.field}}`** — engine runtime. Resolved during gameplay.

A recipe template can contain `{{...}}` tokens; they pass through
compilation untouched and get resolved at runtime by the engine.

---

## Compiler pipeline

Defined in `engine/recipe-compiler.js`. The pipeline:

```
raw params (from form/AI)
  │
  ├── coerceParams       form-string "30" → 30, "true" → true
  ├── applyDefaults      fill missing values from spec.default
  ├── validateParams     reject invalid values; return diagnostics
  └── substituteAll      walk template, replace ${name}
                         → game config
```

Output: `{ config, diagnostics }`.

- `config` is a regular game config (the same shape `games/*/config.json`
  uses) or `null` if validation failed.
- `diagnostics` is `Diagnostic[]` from `engine/diagnostics.js` — same
  structured shape every other validator uses.

---

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/recipes` | List all recipes (summaries — no template body) |
| `GET /api/recipes/:id` | One recipe summary |
| `POST /api/recipes/:id/compile` | Compile params → game config |

Compile request body:

```json
{ "params": { "question": "…", "choices": ["…"], "timer": 60 } }
```

Response on success:

```json
{ "config": { /* game config */ }, "diagnostics": [] }
```

Response on parameter validation failure (HTTP 400):

```json
{
  "error": "Recipe parameters did not validate.",
  "diagnostics": [
    { "severity": "error", "code": "PARAM_MISSING_REQUIRED", "field": "question", … }
  ]
}
```

The compile endpoint also runs the resulting config through
`game-loader.validate()` as a safety net. A recipe that compiles but
produces an invalid game config returns HTTP 500 — that's a recipe-
author bug, not a teacher input issue.

---

## Build order (R1 → R6)

| Phase | Status | Description |
|---|---|---|
| **R1** | ✅ Shipped | Foundation: schema, compiler, loader, API, first recipe |
| **R2** | ✅ Shipped | Picker UI in the designer (parameter form, compile + save flow) |
| **R3** | ✅ Shipped | Seed library: 6 hand-built recipes (quiz-show deferred — see below) |
| **R4** | ✅ Shipped | AI as recipe matcher; legacy whole-config generator kept as advanced fallback |
| **R5** | Next | Save-as-recipe (user-extensible recipe library) |
| **R6** | Pending | Polish: recipe analytics, compatibility checks, sharing |

### What's in R1 (this milestone)

- `engine/recipe-schema.js` — Recipe shape, `validateRecipe()`,
  `validateParams()` returning structured Diagnostics
- `engine/recipe-compiler.js` — `compileRecipe()` with coercion,
  defaults, substitution
- `engine/recipe-loader.js` — Scans `recipes/` at startup, caches
- `recipes/class-poll.json` — First recipe (collect-choice → barChart)
- API endpoints in `server.js`
- Full test coverage: schema, compiler, integration

### Seed library (R3 — shipped)

| Recipe | Pattern |
|---|---|
| `class-poll` | Multiple choice → bar chart |
| `discussion-starter` | Open question → AI summarize themes → reveal |
| `creative-vote` | Submit creative responses → show all → pick-one vote → winner |
| `elimination-tournament` | N rounds: collect → vote → eliminate bottom % → loop → winner |
| `anonymous-feedback` | Anonymous collect → AI summarize (paraphrased) → reveal |
| `story-builder` | Relay turns to build a shared story → reveal |

### What's deferred

- **`quiz-show`** — Multi-round MCQ with leaderboard. Needs one of:
  (a) compiler support for array-driven phase generation (the recipe
  declares `questions: [{...}, {...}]` and the compiler emits N
  `collect-choice` phases), or (b) recipe-level use of `foreach`
  over a static question bank, or (c) a custom UI widget for
  authoring "question banks" (array of `{question, choices,
  correctAnswer}`). All three are real work; tracked as a future R3.5.
- **Recipe versioning** — every recipe declares `"version": "1"` but
  there's no migration logic. Will be needed once the schema changes
  in a way that breaks old recipes.
- **Recipe sharing / multi-user** — out of scope until accounts ship.
  See "Future direction" below.

### AI as recipe matcher (R4 — shipped)

The "AI Generate Game" button now calls `POST /api/games/from-description`,
which:

1. Loads all available recipes (built-in + user)
2. Calls Haiku with a small prompt describing each recipe + its
   parameters
3. Asks the model to either pick a recipe and fill params, OR declare
   no-match with a reason and a suggestion
4. Validates the AI's chosen recipe id, runs the compiler, returns the
   compiled game config

**Why this resolves the JSON malformation bug class.** The legacy
`generateGame` flow asked Sonnet to emit a 200-line JSON game config.
At that length, JSON malformation happened in real classroom use — a
bug observed at character 14640 of a `feedback-coach-academy` revise.
The matcher emits ~5 fields. Failure mode is "no match," not parse
error. The compiler turns the small structured output into a
guaranteed-valid game config (per Phase A–C invariants).

**No-match path.** If AI says no recipe fits, the UI shows the reason
+ suggestion and offers two fallbacks:
- *Pick from Recipes* — opens the recipe picker
- *Generate Custom (Advanced)* — opens the legacy whole-config
  generator (renamed `showLegacyAIGenerateModal`, kept as a fallback
  while the seed library is small)

**Cost.** One Haiku call, ~600-token output max. Roughly 10× cheaper
than the old Sonnet `generateGame` + auto-polish path.

### Compiler limitations to revisit

The substitution model handles most patterns, but a few classroom
games need things it can't currently express:

1. **Array-driven phase generation.** A recipe that says "make N
   phases of this shape, one per item in the parameter array."
   Quiz-show is the canonical example.

2. **Conditional template sections.** "If `withScoring` is true,
   append a leaderboard phase." For now, recipes use separate
   variants (`creative-vote` vs `creative-vote-with-scores`) instead
   of branches. Probably keep it that way unless the variant count
   gets out of hand.

3. **Recipe composition / inheritance.** A "story builder with AI
   cleanup" recipe extending `story-builder`. Defer until the seed
   library shows clear duplication.

---

## Future direction

The repo will eventually become an online site where teachers have
accounts and create their own recipes. The current architecture
anticipates that:

- Recipes are JSON, not code → they serialize cleanly to a database
- `recipes/user/` is gitignored → user-content boundary already drawn
- `_source: 'built-in' | 'user'` annotation on loaded recipes → UI can
  distinguish authorship
- The compiler is pure (no I/O, no side effects) → trivially safe to
  run server-side on user-submitted recipes once auth is in place

When that day comes, the migration is approximately:

1. Replace `recipe-loader.js`'s filesystem scan with a database query
2. Add an `ownerId` column on the recipes table
3. Add `POST /api/users/me/recipes` for save-as-recipe
4. Add a sharing model (public/private/shared-with-class)

None of that is needed now. The filesystem-backed v1 is enough to
prove the recipe model with one teacher (you).

---

## Why JSON templates instead of code recipes

A recipe could have been a JS module with a `compile(params)` function:

```js
// hypothetical: recipes/class-poll.js
export default {
  parameters: { ... },
  compile(params) {
    return { phases: { lobby: { ... }, ask: { ... } } };
  }
};
```

That would be more flexible — loops, conditionals, computed phase
IDs. We chose JSON templates instead because:

1. **Save-as-recipe (R5) requires data, not code.** Teachers can't
   write JS. If recipes are code from day one, save-as-recipe means
   serializing structure into a JSON-ish format anyway. Better to
   start there.

2. **Repetition is already handled by the engine.** "3 rounds" doesn't
   need recipe-level templating; it uses `loopBack`/`loopCount` on a
   phase. The recipe sets the `loopCount` parameter, the existing
   engine loop runs the rounds. Same for `foreach`.

3. **JSON is auditable.** Anyone can read a recipe file and see what
   it produces. With code recipes, you'd need to run the function with
   sample params to find out.

4. **Future content moderation.** When recipes become user-generated,
   inspecting JSON is straightforward; inspecting JS for safety is not.

The trade-off: complex compile logic (e.g. "if `withScoring`, append
a leaderboard phase") requires either schema features (`oneOf` field
types, conditional template sections — none of which exist yet) or a
specialized recipe per variant. For v1 that's fine; the seed library
in R3 won't need branching.
