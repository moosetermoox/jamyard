# Classroom Games — Architecture Overview

> A framework for teachers to assemble custom whole-class games by
> wiring together pre-built phase blocks. The design goal is **as few
> errors as possible** between "teacher clicks save" and "30 students
> are playing." Vanilla JS, no build step, ~18K lines.

---

## 1. Goal & Scope

A teacher should be able to build a working classroom game in minutes
without writing code. The framework supplies **21 reusable phase
types** (collect text, multiple choice, vote, AI-process, reveal,
elimination, leaderboard, relay, turn, etc.). Teachers wire them into a
sequence using a visual editor or pick a **recipe** (a parameterized
template that emits a phase graph); the engine plays the result.

The hard part is not the phase types — it's the safety net. Most user
errors are silent: a phase referencing a field that doesn't exist, a
template rendering an array as `[object Object]`, a winner phase with
no `next` leaving the game frozen. The architecture is built around
**catching these errors at save time** rather than at the front of a
classroom.

---

## 2. System Diagram

```
                   +-------------------+
                   |    Teacher        |
                   |  /designer/edit   |  builds & saves config.json
                   +---------+---------+
                             | REST  (PUT /api/games/:id)
                             v
+-------------+        +-----+--------+         +--------------+
|  /host      |<-------+              +-------->|  /player x N |
|  (project   | socket |   server.js  |  socket |  (Chromebook |
|   to class) |        |  + Engine    |         |   or phone)  |
+-------------+        |  + Validator |         +--------------+
                       |  + AI svc    |
                       +-----+--------+
                             | HTTPS
                             v
                       +-----+--------+
                       | Anthropic    |
                       | Claude API   |
                       | (Haiku 4.5,  |
                       |  Sonnet 4.6) |
                       +--------------+
```

**Three browser surfaces**, all served as static HTML/JS by the same
Express server:

- `/designer/edit?game=ID` — drag-and-drop editor (one teacher)
- `/host?code=ABCD` — projected to the class (one teacher)
- `/player?code=ABCD` — each student joins on their device

A fourth surface `/prototype?game=ID` embeds host + N players in
side-by-side iframes for quick playtesting without a real classroom.

**Security:** when `SITE_PASSWORD` is set in the environment, `/host`,
`/designer`, `/prototype`, and all write APIs require HTTP Basic Auth.
Student paths (`/player`, static assets, socket.io) stay open so kids
can join with just a room code. Unset = disabled, so local dev is
unchanged.

---

## 3. Code Map

```
server.js                  2,298 lines  HTTP + socket.io + REST
engine/
  game-engine.js             342       Phase state, data store, template resolver
  game-loader.js             946       Config validation (errors + warnings)
  state-machine.js            46       Strict transitions (throws on invalid)
  player-registry.js         125       Player add/remove/eliminate, reconnect
  room-manager.js             64       Rooms keyed by 4-letter code
  events.js                  105       Socket event name constants
  event-schemas.js           111       Payload type checks for socket events
  hooks-loader.js             32       Dynamic import of per-game JS hooks
  phase-schemas.js         1,217       Declarative schema for all 21 phase types
  resolver-grammar.js        385       Single source of truth for {{...}} syntax
  diagnostics.js             193       Diagnostic shape + codes
  normalizer.js              232       Config normalization pipeline
  content-filter.js          145       Blocklist word-boundary match + mash detect
  moderation.js               41       Pure helpers: responseToText, hide, kick
  video.js                    51       YouTube URL → embed URL parser
  speed-scoring.js            51       Kahoot-style time-decay point formula
  recipe-schema.js           484       Recipe shape + param validation
  recipe-compiler.js         263       ${param} substitution → phase graph
  recipe-loader.js           238       Scans recipes/ + recipes/user/ at startup
  phase-handlers/                      One file per phase type — self-register
    phase-registry.js         19       Map<type, handler> populated on import
    phase-context.js          71       Builds the ctx passed to every handler
    index.js                  34       Imports each handler so they register
    end / announce / reveal / preview / eliminate / winner / leaderboard /
    team-split / ai-process / collect / collect-choice / vote / reveal-one /
    rank / wager / relay / foreach / ai-eliminate / rate / turn   (~70–300 lines each)
  phases/                              Pure-logic helpers (no I/O)
    eliminate-handler.js       54
    vote-handler.js           102      Matchup generation, tally
    winner-handler.js          39
services/
  ai-service.js             1,471      Claude API wrapper + review/fix prompts
screens/
  host/host.js              1,244
  player/player.js          1,473
  designer/editor.js        5,685      The drag-and-drop editor
  prototype/prototype.js      149      Iframe playtester
recipes/
  class-poll.json                      8 built-in recipes (+ user/ for saved ones)
  discussion-starter.json
  creative-vote.json
  elimination-tournament.json
  anonymous-feedback.json
  story-builder.json
  idea-chain.json
  class-critique.json
games/
  {game-id}/config.json              Phase definitions
  {game-id}/hooks.js  (optional)     Custom JS for elimination/scoring rules
tests/
  509 Vitest unit tests              Engine, validator, hooks, recipes; ~1s
```

---

## 4. The Core Abstraction: Phases as a Config-Driven State Machine

Every game is a JSON file:

```json
{
  "name": "Mood Check",
  "phases": {
    "lobby":   { "type": "lobby",      "next": "collect" },
    "collect": { "type": "collect",    "prompt": "How are you?", "next": "ai" },
    "ai":      { "type": "ai-process", "task": "summarize", "input": "collect.responses", "next": "reveal" },
    "reveal":  { "type": "reveal",     "template": "{{ai.result}}", "next": "end" },
    "end":     { "type": "end" }
  }
}
```

Each phase has a `type`, a `next`, and type-specific fields. The
**StateMachine** allows a transition only if `next` (or `approveNext` /
`rejectNext` / `loopBack`) explicitly lists the target. Any other
transition throws.

Phases produce **phase data** keyed by phase ID:

- `collect` → stores `{ responses: [{playerId, name, text}, ...] }`
- `vote` → stores `{ scores: {playerId: count}, winner, votes }`
- `ai-process` → stores `{ result, byPlayer? }`
- `turn` → stores `{ teamScores: {teamName: N}, capturedBy: {teamName: [...]}, itemCount }`
- etc.

Later phases reference earlier data via two mechanisms:

**(a) Field references** in phase fields like `input`, `candidates`, `from`:
```
"candidates": "collect.responses"      → resolves to the responses array
"input": "vote.scores"                 → resolves to the scores map
"from": ["round1.teamScores", "round2.teamScores"]  → array-of-refs summed by leaderboard
```

**(b) Template tokens** in user-facing strings (`prompt`, `message`, `template`):
```
"{{collect.responses.list}}"           → numbered list of submissions
"{{rank.rankings.0.item}}"             → top-ranked item
"{{ai.mine}}"                          → per-player AI output (see §6)
"{{_loop.eliminate.iteration}}"        → "Round 2 of 3" inside a loop
"{{vote.barChart}}"                    → ASCII bar chart of vote tally
```

`engine.resolve(ref)` is the unified resolver. It handles built-ins
(`remaining`, `eliminated`), foreach/loop scope (`_current`,
`_foreach`, `_loop`), nested field access, and synthetic suffixes
(`.list`, `.barChart`, `.mine`). Templates pass through `resolveTemplate`
which substitutes every `{{...}}`.

The grammar for all `{{...}}` syntax lives in **`engine/resolver-grammar.js`**
(`parseRef`, `classifyRef`, `parseTemplateTokens`, `checkDataRefCompat`).
Both the validator and the engine dispatch through this module so they
share one definition of what's a valid token.

### Why a state machine?

Three properties fall out for free:

1. **Strict transitions** — typos in `next` are caught (the SM throws)
   and the validator catches them statically before save.
2. **Explicit loops** — `loopBack` + `loopCount` are the only way to
   repeat. Any cycle in `next` edges is a structural bug, which the
   validator detects via DFS.
3. **Reachability** — BFS from `lobby` flags orphan phases at save
   time (e.g. `winner` with no `next` leaves `end` stranded).

---

## 5. Phase Handler Registry

`handlePhase()` dispatches via a registry:

```js
// engine/phase-handlers/phase-registry.js
const handlers = new Map();
export function registerHandler(type, handler) { handlers.set(type, handler); }

// engine/phase-handlers/index.js — importing each file registers it
import './collect.js';   // calls registerHandler('collect', { onEnter, onReconnect })
import './vote.js';
// ...
```

Each handler module is ~50–300 lines and exports two methods:

```js
registerHandler('collect', {
  async onEnter(ctx) {
    const eligible = ctx.getEligibleVoters(ctx.phase.from);
    const prompt   = ctx.resolveTemplate(ctx.phase.prompt);
    ctx.emitToHost(EVENTS.GAME_STARTED,   { prompt, timer: ctx.phase.timer });
    for (const p of eligible) ctx.emitToPlayer(p.id, EVENTS.GAME_STARTED, { prompt, ... });
  },
  onReconnect(ctx, socket) {
    // Rebuild the current screen for a returning player
  }
});
```

The **context object** (`engine/phase-handlers/phase-context.js`)
gives the handler a clean API surface:

| Field / method | What it does |
|---|---|
| `ctx.phase`, `ctx.engine`, `ctx.room`, `ctx.code` | Identity |
| `ctx.resolveTemplate(tpl)` | Substitute `{{...}}` for current room state |
| `ctx.resolveScreenControl()` | Apply `hostShow`/`playerShow`/`hostTemplate`/`playerTemplate` |
| `ctx.getEligibleVoters(from)` | Resolve `"all"` / `"remaining"` / `"eliminated"` |
| `ctx.getNextPhaseId()` | Honors loops, returns the actual transition target |
| `ctx.emitToHost / emitToPlayer / emitToRoom` | Emit with auto-injected `phaseInstanceId` |
| `ctx.advanceTo(id)` / `ctx.advanceToNext()` | Trigger the next phase recursively |
| `ctx.isStale()` | True if the phase has advanced since the closure captured this ctx |
| `ctx.services` | Escape hatch into server.js for special helpers (foreach, relay) |

This separation is the main extensibility seam. Adding a phase type
means writing one ~80–300-line file; nothing in `server.js` needs to
change.

### Per-phase room state

Phases that need to track in-progress submissions (vote, rank, wager,
relay, foreach, turn) put their state on `room.phaseState`. `handlePhase()`
calls `room.phaseState.cleanup?.()` and resets the bag on every
transition, so timers can't leak across phases.

---

## 6. Phase Types (21 total)

| # | Type | What it does |
|---|---|---|
| 1 | `lobby` | Wait for players to join |
| 2 | `collect` | Gather free-text responses; supports `rotateFrom` for rotation chains and `assign:"pairwise"` for bluffing |
| 3 | `collect-choice` | Multiple choice; `correctAnswer` + `speedBonus` enable Kahoot-style scoring |
| 4 | `ai-process` | Send data to Claude; `perPlayer:true` generates one item per student |
| 5 | `vote` | Head-to-head or pick-one; `matchupsFromPairs` / `excludeAuthors` for bluffing |
| 6 | `eliminate` | Remove bottom-% of players by score |
| 7 | `reveal` | Display content to all |
| 8 | `preview` | Teacher-only review; can approve or reject |
| 9 | `winner` | Declare winner and show standings |
| 10 | `announce` | Show a message to everyone; `video:` plays a YouTube clip on the host screen |
| 11 | `ai-eliminate` | Claude judges answers, eliminates rule-breakers |
| 12 | `leaderboard` | Scores + rankings; `from` accepts a list of refs to sum across rounds |
| 13 | `reveal-one` | Host reveals items one-by-one (countdown style) |
| 14 | `team-split` | Divide players into teams |
| 15 | `rank` | Players reorder a list; aggregated by average position |
| 16 | `wager` | Players bet points; auto or host-resolved |
| 17 | `relay` | Turn-by-turn collaborative input (storytelling, word chains) |
| 18 | `foreach` | Iterate over data running sub-phases per item; pair-mode for human-vs-AI |
| 19 | `rate` | Class scores a target on N custom 1-N scales; bar + pie chart results |
| 20 | `end` | Game over, clean up |
| 21 | `turn` | Charades/describe-it; server-authoritative timer, team rotation, Got It / Skip |

### Bluffing primitives (collect + collect-choice + vote)

Three config options unlock Jackbox-style bluffing as plain config:

- **`collect.assign: "pairwise"` + `pairsFrom`** — pairs players; each pair
  shares one prompt drawn from a prior collect or ai-process result.
- **`vote.matchupsFromPairs` + `excludeAuthors`** — head-to-head matchups built
  from those pairs; authors don't vote on their own entry.
- **`collect-choice.choicePool` + `excludeAuthored` + `shuffle`** — assembles
  a mixed pool from collected responses + literal decoys, hides each player's
  own contribution, shuffles per-recipient.

Games built with these: Quiplash-style (pairwise prompts + H2H vote),
Fibbage/Balderdash-style (trivia bluffing with choicePool + truth injection),
Yes-or-No Bets.

### Turn phase

The `turn` phase models Fishbowl/Charades gameplay:

- **Pool** — items drawn from a prior `collect` step (or an array of
  refs concatenated at enter time).
- **Teams** — from a `team-split` step (`teamsFrom`).
- **Timer** — server-authoritative `setTimeout`; clients show the countdown
  but cannot end the turn themselves.
- **Rotation** — one describer at a time, round-robin within their team,
  alternating teams between turns.
- **Got It / Skip** — Got It scores +1 for the team and removes the item;
  Skip returns it to the bottom of the pool.
- **Output** — `teamScores` + `capturedBy` per team; readable by a downstream
  `leaderboard` (which now accepts an array of refs to sum across rounds).

### Kahoot-style scoring

`collect-choice` with `correctAnswer` + `speedBonus: true` grades each
submission at close time. Points = `pointsCorrect × (1 − elapsed/(2×timer))`,
clamped to 50% minimum. Wrong answers earn 0. Logic lives in
`engine/speed-scoring.js` (pure function, fully tested).

---

## 7. Per-Player Output (the only "fancy" data path)

Most phases broadcast the same content to every player. One pattern
needs per-recipient resolution: AI generating something unique for
each student (a debate topic, a story prompt).

```json
"get-topics": {
  "type": "ai-process",
  "perPlayer": true,
  "instruction": "Generate one debate topic per player. Return a JSON array of strings."
},
"prep": {
  "type": "collect",
  "prompt": "Your debate topic: {{get-topics.mine}}\n\nWrite your argument."
}
```

Engine: when `perPlayer: true`, the `ai-process` handler appends
"generate exactly N items" to the instruction, parses the response as
an array, and stores `{ result, byPlayer: { p1: "...", p2: "..." } }`.

The `{{X.mine}}` token is recognized at the template layer.
`collect`/`collect-choice`/`announce`/`reveal` switch from broadcast
to per-player emit when `.mine` is present and resolve the token using
the recipient's `byPlayer` entry.

The host sees `(each student gets their own)` as a placeholder, so
the teacher's projected screen doesn't show a confusing token.

---

## 8. The Validation Pipeline (the main safety net)

`engine/game-loader.js` `validate()` runs on **every save** (PUT
`/api/games/:id`) and on every game load. It returns `{ errors,
warnings }`; errors block save, warnings show in the editor.

The validator reads its allowed fields, enums, and accepts lists from
**`engine/phase-schemas.js`** — the single source of truth for all
phase type definitions. Adding a new phase to the schema automatically
updates validation, AI prompts, and the editor field list.

| Check | Example bug it catches |
|---|---|
| Required fields per type | `collect` missing `prompt` |
| Strict allow-list per type | AI invented `excludeSelf` field — engine would silently ignore |
| Enum values | `from: "everyone"` (must be `all`/`remaining`/`eliminated`) |
| Timer in 1–3600s | `timer: 9999999` |
| Data ref points to existing phase | `input: "collcet.responses"` (typo) |
| `next` / `approveNext` / `rejectNext` exist | Typo'd transition targets |
| `loopBack` exists, `loopCount` 2–100 | Loop config sanity |
| Foreach: subPhases populated, scoring valid | `scoring.mode: "tally"` requires `pointMap` |
| **Typed dataflow** (`DATA_REF_TYPE_MISMATCH`) | `{{X.result}}` where X is a JSON ai-process — would render `[object Object]` |
| **Cycle detection** (DFS, excludes loopBack/rejectNext) | `winner.next: "phase-16"` looping back into round 1 |
| **Unreachable phases** (BFS from lobby) | Missing `winner.next` strands `end` |
| **Raw-array template warning** | `{{X.responses}}` will render as `[object Object],...` — suggests `.list` |
| **Wager design hole** | `wager` with no `scoresFrom` AND no `correctOption` |
| **Team-split design hole** | `team-split` whose teams aren't referenced anywhere downstream |

`stripUnknownFields()` in `server.js` runs before validation on save.
This is the safety pass that lets the AI generator and "Ask AI to
revise" produce configs with stale invented fields without blocking
the save — unknown fields are dropped, validation still runs against
the cleaned config.

---

## 9. Content Safety Pipeline

Three layers protect student submissions:

**1. Input filter** (`engine/content-filter.js`) — word-boundary blocklist
with leet-speak / repeated-letter / separator normalization (no Scunthorpe
false positives). Also catches response mashing (keyboard spam) and
prompt-injection attempts. Wired into `submit-response`; rejects emit
`RESPONSE_REJECTED` back to the player (text preserved in the input field,
red notice shown).

**2. AI system prompt** — a `SAFETY_RULES` block (content-safety +
anti-prompt-injection instructions) is appended to every game-run system
prompt in `AIService._processReal()`.

**3. Host moderation** (`engine/moderation.js`) — the host screen shows
a collapsible "Moderation" panel on collect phases with live submission
list. Host can:
- **Hide** a response (excluded from AI input and reveal at close, reversible)
- **Kick** a player (blocks rejoin via per-room `kickedTokens`)

Emits: `SUBMISSIONS_UPDATE` (live list to host), `MODERATE_HIDE`,
`MODERATE_KICK`, `KICKED` (to the removed player).

---

## 10. Runtime Safety Nets

The validator catches what it can statically. Three runtime mechanisms
catch the rest.

### Stale-event rejection

Every phase entry increments `room.phaseInstanceId`. Every emit
auto-injects this id; clients echo it back on every action. The
server checks `isStalePhaseEvent(room, clientPhaseInstanceId, eventName)`
and silently drops events from a previous phase.

This fixes a real bug class: a player submits an answer just as the
host clicks "next." Without the check, the late submission would
mutate the next phase's state.

### Stale `setTimeout` guards

Auto-advancing phases (`announce`, `eliminate`, `ai-eliminate`,
`leaderboard`, `winner`, `turn`) set timers to advance after a pause. If the
host skips past the phase manually, the leftover timer would fire
later and call `engine.transition()` from the wrong state — the SM
would throw and crash the process. Each handler now checks
`ctx.isStale()` before transitioning.

### Paused-error recovery

If `handler.onEnter()` throws, `handlePhase()` catches:

1. Logs the error and adds it to the room's journal.
2. Sets `room.paused = true`.
3. Emits `phase-error` to host with `{ canRetry, canSkip, message }`.
4. Emits `phase-paused` to players ("teacher is resolving an issue").

The host UI can then click Retry or Skip. The game doesn't die.

### Per-room journal

`room.journal` is a 100-event ring buffer. `recordEvent(room, type,
data)` logs every phase enter, socket event, error. Exposed via
`GET /api/rooms/:code/journal` for debugging stalls.

### Socket payload validation

`engine/event-schemas.js` defines simple type schemas
(`"string:required"`, `"number:optional"`, `"array:required"`) for
the most-touched events (`submit-response`, `submit-vote`,
`rank-submit`, `wager-submit`, `relay-submit`, `close-*`). Hostile
or malformed payloads are dropped before reaching handler logic.

---

## 11. The Recipe Layer

Non-coder teachers can create games without touching the phase graph
by using **recipes** — parameterized JSON templates that compile into
a complete config.

```
Teacher opens /designer
  └─ Clicks "⭐ Use a Recipe"
  └─ Picks a recipe (8 built-in, plus any saved in recipes/user/)
  └─ Fills 2-5 fields (topic, timer, etc.)
  └─ POST /api/recipes/:id/compile → validated config
  └─ POST /api/games → save game
  └─ Redirect to phase-graph editor (advanced mode)
```

**AI recipe matching** (`POST /api/games/from-description`) — teacher
describes a game in plain English; Haiku picks the closest recipe and
fills reasonable params. Output is ~5 fields, not 200 lines, so JSON
malformation is no longer a failure mode. Cost ~10× cheaper than the
legacy whole-config Sonnet generator.

**Save as Recipe** — the editor toolbar has a "⭐ Save as Recipe"
button. Teacher marks which fields should be parameterizable; the
extractor (`engine/recipe-extractor.js`) generates a recipe draft and
saves it to `recipes/user/`. User recipes appear in the picker with
a delete button. Built-in names are blocked.

**Compatibility check** — at load time, each recipe is compiled with
synthetic defaults. A recipe that fails validation is flagged
`_broken: true` and shown with an orange "⚠ Needs update" badge
instead of silently disappearing.

---

## 12. Editor → Save → Run Lifecycle

```
Teacher opens /designer/edit?game=ID
  └─ GET /api/games/:id              load config
  └─ GET /api/phase-schemas          populate field lists + toggles (schema-driven)
  └─ Render canvas (phase blocks + connections)
  └─ Right sidebar: edit fields for selected phase
  └─ Auto-save fires when user clicks off a phase block

Teacher edits, clicks Save
  └─ Client-side validation (mirror of server rules) — friendly errors inline
  └─ PUT /api/games/:id with config
       └─ stripUnknownFields(config)   drop invented fields, log warnings
       └─ validate(config, gameId)     errors block save, warnings returned
       └─ Write to games/{id}/config.json
  └─ Editor shows "saved" pip

Teacher clicks Test Game
  └─ Save first if dirty
  └─ Open /prototype?game=ID
       └─ Iframe: host (auto-creates room, picks game)
       └─ N iframes: players (auto-join with bot names)
       └─ Bot Fill button posts {type:'bot-fill'} to player iframes
       └─ Skip Timer button posts {type:'prototype-skip'} to host iframe

Teacher uses for real
  └─ Open /host  → click Create Room → projects 4-letter code
  └─ Students open /player → enter code + name
  └─ Teacher clicks Start
       └─ engine.transition('lobby' → first phase)
       └─ handlePhase() dispatches via registry
       └─ Each phase emits to host + players, waits for events or auto-advances
```

---

## 13. Where the AI Sits

Two distinct uses, both via Claude API:

**(a) Game-time AI** — phases of type `ai-process` and `ai-eliminate`
call the Anthropic SDK during gameplay. Results become phase data,
referenced in later phases. Mock mode (no API key) returns plausible
fixtures for tests.

**(b) Editor-time AI** — REST endpoints help the teacher build:

| Endpoint | Purpose | Model |
|---|---|---|
| `POST /api/games/generate-questions` | "What kind of game?" → 2-4 clarifying Qs | Sonnet |
| `POST /api/games/generate` | Generate full config from answers (legacy) | Sonnet |
| `POST /api/games/from-description` | Description → recipe match → compile | Haiku |
| `POST /api/games/review` | Light or deep review of issues | Haiku / Sonnet |
| `POST /api/games/fix-issue` | Apply a single fix to one phase (constrained) | Haiku |
| `POST /api/games/revise` | Plain-English revise of whole game | Sonnet |
| `POST /api/games/revise-phase` | Plain-English revise of one phase | Sonnet |
| `POST /api/games/generate-theme` | Generate a CSS color palette | Haiku |
| `POST /api/recipes/:id/compile` | Compile a recipe with given params | (no AI) |
| `POST /api/games/from-description` | AI picks recipe + fills params | Haiku |

Editor-time AI is a productivity boost, not a runtime dependency.
Every endpoint runs its output through `stripUnknownFields()` +
`validate()` before returning. The "Apply Fix" button shows a diff
modal so the teacher approves the change.

**AI field awareness** — `buildPhaseDocsForPrompt()` in `ai-service.js`
derives field listings from `phase-schemas.js` at runtime, so adding
a new phase to the schema automatically flows into AI generation prompts.

---

## 14. The Three Things That Make This Hard (and How They're Handled)

### Reconnection

Students close laptops. Wifi blips. The 30-second grace period in
`engine/player-registry.js` keeps them in the room. On reconnect, the
registered handler's `onReconnect(ctx, socket)` rebuilds the current
screen (vote options, ranking items, current relay turn, current turn
describer, etc.) from `room.phaseState`.

### Templates that resolve to nothing

`{{nonexistent.field}}` returns the literal token, not undefined, so
the teacher can SEE the broken token instead of getting a blank
screen. The template-scan validator warns about the most common
mistake (raw arrays); the typed-dataflow validator warns about type
mismatches (e.g. wiring an array output into a plain-text slot).

### The N-player ÷ scoring problem

When you eliminate "bottom 35%" of 4 players, that's 1.4 — round to
1 or 2? When 3 players tie for first in a wager, who's "the winner"?
These are answered in `engine/phases/eliminate-handler.js` and
`engine/phases/winner-handler.js` — pure functions, heavily unit-tested
(20+ tests across edge cases).

---

## 15. Testing & Verification

```bash
npm test                              # 509 Vitest unit tests, ~1s
node scripts/test-all-games.js        # smoke validate every game (server running)
node scripts/simulate-corn-story.js   # automated full-game playthrough
```

Tests cover:

- Engine internals (`game-engine`, `state-machine`, `player-registry`,
  `room-manager`)
- Validator rules (~98 tests in `game-loader.test.js`)
- Pure-logic phase helpers (`vote-handler`, `eliminate-handler`,
  `winner-handler`, `speed-scoring`)
- Hooks loader, AI service mock mode, event schemas
- Recipe compilation + integration (every built-in recipe must compile
  cleanly and pass `validate()` with sample params)
- Content filter, video embed parser, diagnostics

Gaps:

- No browser E2E tests. The prototype iframe runner is the closest
  thing — humans drive it.
- Phase handlers (the registry-based ones) are tested indirectly via
  game playthroughs in the prototype, not directly. The handler
  surface is small (`onEnter`, `onReconnect`) so this hasn't bitten
  yet.

---

## 16. What I'd Want Feedback On

1. **Server.js as orchestrator.** It's now 2,298 lines — mostly socket-event
   handlers (~30) and helpers (relay, foreach orchestration, template
   resolvers). Are the remaining socket handlers a candidate for the
   same registry treatment, or is the cost (more files, more indirection)
   worse than the benefit?

2. **`room.phaseState` as a typed bag.** Today it's `any`. Each
   handler stamps its own shape. Worth a per-phase-type type
   declaration (JSDoc, since no TS) to catch field typos in handler
   code?

3. **Validator coverage.** The validator catches structural and most
   semantic errors, including typed-dataflow mismatches. Remaining gap:
   phase-flow design holes more subtle than the current checks (e.g.
   an AI step that produces JSON used in a plain-text reveal). Worth
   pushing further, or diminishing returns?

4. **Editor↔engine drift.** `screens/designer/editor.js` (5,685 lines)
   duplicates some validation logic for inline error display. The
   schema-driven field endpoint (`GET /api/phase-schemas`) closes most
   of the gap but sidebar field rendering is still hardcoded.

5. **Per-game hooks.** A few games (`corn-story`) ship `hooks.js` for
   custom elimination logic. Today it's an escape hatch; should the
   framework absorb common hook patterns (e.g. "eliminate duplicate
   semantic answers") into first-class eliminate methods?

6. **No persistence.** Rooms are in-memory; restarts lose them. Fine
   for a single classroom but blocks scaling to a multi-tenant
   service. If we go that direction, what's the right first step —
   Redis for room state, Postgres for game configs, both?

---

## 17. Running It

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-..." > .env   # optional — runs in mock mode without
npm start                                 # http://localhost:3000
npm test                                  # 509 tests, ~1s
```

| URL | Who | Purpose |
|---|---|---|
| `/` | Anyone | Lobby — pick a game and host |
| `/host` | Teacher | Project to class, runs the game |
| `/player` | Student | Joins via 4-letter code |
| `/designer` | Teacher | Pick a recipe / game to edit / create new |
| `/designer/edit?game=ID` | Teacher | Drag-and-drop editor |
| `/prototype?game=ID` | Teacher | Side-by-side iframes for playtesting |

**Deployed on Render** (free tier, auto-deploys from `master`). Set
`ANTHROPIC_API_KEY` and optionally `SITE_PASSWORD` as environment
variables in the Render dashboard.
