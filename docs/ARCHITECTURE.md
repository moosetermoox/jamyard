# Classroom Games — Architecture Overview

> A framework for teachers to assemble custom whole-class games by
> wiring together pre-built phase blocks. The design goal is **as few
> errors as possible** between "teacher clicks save" and "30 students
> are playing." Vanilla JS, no build step, ~16K lines.

---

## 1. Goal & Scope

A teacher should be able to build a working classroom game in minutes
without writing code. The framework supplies ~19 reusable **phase
types** (collect text, multiple choice, vote, AI-process, reveal,
elimination, leaderboard, relay, etc.). Teachers wire them into a
sequence using a visual editor; the engine plays the result.

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
                       |  Sonnet 4.5) |
                       +--------------+
```

**Three browser surfaces**, all served as static HTML/JS by the same
Express server:

- `/designer/edit?game=ID` — drag-and-drop editor (one teacher)
- `/host?code=ABCD` — projected to the class (one teacher)
- `/player?code=ABCD` — each student joins on their device

A fourth surface `/prototype?game=ID` embeds host + N players in
side-by-side iframes for quick playtesting without a real classroom.

---

## 3. Code Map

```
server.js                  1,624 lines  HTTP + socket.io + REST
engine/
  game-engine.js             324       Phase state, data store, template resolver
  game-loader.js             776       Config validation (errors + warnings)
  state-machine.js            46       Strict transitions (throws on invalid)
  player-registry.js         125       Player add/remove/eliminate, reconnect
  room-manager.js             64       Rooms keyed by 4-letter code
  events.js                  105       Socket event name constants
  event-schemas.js           111       Payload type checks for socket events
  hooks-loader.js             32       Dynamic import of per-game JS hooks
  phase-handlers/                      One file per phase type — self-register
    phase-registry.js         19       Map<type, handler> populated on import
    phase-context.js          71       Builds the ctx passed to every handler
    index.js                  34       Imports each handler so they register
    end / announce / reveal / preview / eliminate / winner / leaderboard /
    team-split / ai-process / collect / collect-choice / vote / reveal-one /
    rank / wager / relay / foreach / ai-eliminate     (~70 lines each)
  phases/                              Pure-logic helpers (no I/O)
    eliminate-handler.js       54
    vote-handler.js           102      Matchup generation, tally
    winner-handler.js          39
services/
  ai-service.js             1,203      Claude API wrapper + review/fix prompts
screens/
  host/host.js              863
  player/player.js        1,060
  designer/editor.js      4,358        The drag-and-drop editor
  prototype/prototype.js    149        Iframe playtester
games/
  {game-id}/config.json              Phase definitions
  {game-id}/hooks.js  (optional)     Custom JS for elimination/scoring rules
tests/
  281 Vitest unit tests              Engine, validator, hooks; <1s
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
- etc.

Later phases reference earlier data via two mechanisms:

**(a) Field references** in phase fields like `input`, `candidates`, `from`:
```
"candidates": "collect.responses"      → resolves to the responses array
"input": "vote.scores"                 → resolves to the scores map
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

### Why a state machine?

Three properties fall out for free:

1. **Strict transitions** — typos in `next` are caught (the SM throws)
   and the validator catches them statically before save.
2. **Explicit loops** — `loopBack` + `loopCount` are the only way to
   repeat. Any cycle in `next` edges is a structural bug, which the
   validator now detects via DFS.
3. **Reachability** — BFS from `lobby` flags orphan phases at save
   time (e.g. `winner` with no `next` leaves `end` stranded).

---

## 5. Phase Handler Registry

Until recently, `handlePhase()` in `server.js` was a 900-line switch
on phase type. It now dispatches via a registry:

```js
// engine/phase-handlers/phase-registry.js
const handlers = new Map();
export function registerHandler(type, handler) { handlers.set(type, handler); }

// engine/phase-handlers/index.js — importing each file registers it
import './collect.js';   // calls registerHandler('collect', { onEnter, onReconnect })
import './vote.js';
// ...
```

Each handler module is ~50–100 lines and exports two methods:

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
means writing one ~80-line file; nothing in `server.js` needs to
change.

### Per-phase room state

Phases that need to track in-progress submissions (vote, rank, wager,
relay, foreach) put their state on `room.phaseState`. `handlePhase()`
calls `room.phaseState.cleanup?.()` and resets the bag on every
transition, so timers can't leak across phases.

---

## 6. Per-Player Output (the only "fancy" data path)

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

## 7. The Validation Pipeline (the main safety net)

`engine/game-loader.js` `validate()` runs on **every save** (PUT
`/api/games/:id`) and on every game load. It returns `{ errors,
warnings }`; errors block save, warnings show in the editor.

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

## 8. Runtime Safety Nets

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
`leaderboard`, `winner`) set timers to advance after a pause. If the
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

## 9. Editor → Save → Run Lifecycle

```
Teacher opens /designer/edit?game=ID
  └─ GET /api/games/:id              load config
  └─ Render canvas (phase blocks + connections)
  └─ Right sidebar: edit fields for selected phase

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

## 10. Where the AI Sits

Two distinct uses, both via Claude API:

**(a) Game-time AI** — phases of type `ai-process` and `ai-eliminate`
call the Anthropic SDK during gameplay. Results become phase data,
referenced in later phases. Mock mode (no API key) returns plausible
fixtures for tests.

**(b) Editor-time AI** — REST endpoints help the teacher build:

| Endpoint | Purpose | Model |
|---|---|---|
| `POST /api/games/generate-questions` | "What kind of game?" → 2-4 clarifying Qs | Sonnet |
| `POST /api/games/generate` | Generate full config from answers | Sonnet |
| `POST /api/games/review` | Light or deep review of issues | Haiku / Sonnet |
| `POST /api/games/fix-issue` | Apply a single fix to one phase (constrained) | Haiku |
| `POST /api/games/revise` | Plain-English revise of whole game | Sonnet |
| `POST /api/games/revise-phase` | Plain-English revise of one phase | Sonnet |
| `POST /api/games/generate-theme` | Generate a CSS color palette | Haiku |

Editor-time AI is a productivity boost, not a runtime dependency.
Every endpoint runs its output through `stripUnknownFields()` +
`validate()` before returning. The "Apply Fix" button shows a diff
modal so the teacher approves the change.

---

## 11. The Three Things That Make This Hard (and How They're Handled)

### Reconnection

Students close laptops. Wifi blips. The 30-second grace period in
`engine/player-registry.js` keeps them in the room. On reconnect, the
registered handler's `onReconnect(ctx, socket)` rebuilds the current
screen (vote options, ranking items, current relay turn, etc.) from
`room.phaseState`.

### Templates that resolve to nothing

`{{nonexistent.field}}` returns the literal token, not undefined, so
the teacher can SEE the broken token instead of getting a blank
screen. The template-scan validator warns about the most common
mistake (raw arrays).

### The N-player ÷ scoring problem

When you eliminate "bottom 35%" of 4 players, that's 1.4 — round to
1 or 2? When 3 players tie for first in a wager, who's "the winner"?
These are answered in `engine/phases/eliminate-handler.js` and
`engine/phases/winner-handler.js` — pure functions, heavily unit-tested
(20+ tests across edge cases).

---

## 12. Testing & Verification

```bash
npm test                              # 281 Vitest unit tests, <1s
node scripts/test-all-games.js        # smoke validate every game (server running)
```

Tests cover:

- Engine internals (`game-engine`, `state-machine`, `player-registry`,
  `room-manager`)
- Validator rules (~98 tests in `game-loader.test.js`)
- Pure-logic phase helpers (`vote-handler`, `eliminate-handler`,
  `winner-handler`)
- Hooks loader, AI service mock mode, event schemas

Gaps:

- No browser E2E tests. The prototype iframe runner is the closest
  thing — humans drive it.
- Phase handlers (the registry-based ones) are tested indirectly via
  game playthroughs in the prototype, not directly. The handler
  surface is small (`onEnter`, `onReconnect`) so this hasn't bitten
  yet.

---

## 13. What I'd Want Feedback On

1. **Server.js as orchestrator.** It's down from a 2,300-line
   handler-switch to a 1,624-line file mostly composed of socket-event
   handlers (~30) and a few helpers (relay, foreach orchestration,
   template resolvers). Are the remaining socket handlers a candidate
   for the same registry treatment, or is the cost (more files,
   more indirection) worse than the benefit?

2. **`room.phaseState` as a typed bag.** Today it's `any`. Each
   handler stamps its own shape. Worth a per-phase-type type
   declaration (JSDoc, since no TS) to catch field typos in handler
   code?

3. **Validator coverage.** The validator catches structural and most
   common semantic errors. Two real classes still slip through:
   (a) template refs to fields that exist but aren't strings (e.g.
   `{{X.responses}}` rendered as a string — currently a warning, not
   an error); (b) phase-flow design holes more subtle than "team-split
   not referenced" (e.g. an AI step that produces JSON used in a
   plain-text reveal). Worth pushing the validator further, or are
   we hitting diminishing returns?

4. **Editor↔engine drift.** The editor (`screens/designer/editor.js`,
   4,358 lines) duplicates validation logic in JS for inline error
   display. The two implementations have drifted before. Worth
   sharing a single source of truth (e.g. extract validator to a
   browser-loadable module)?

5. **Per-game hooks.** A few games (`corn-story`) ship `hooks.js` for
   custom elimination logic. Loaded via dynamic import. Today it's
   an escape hatch; should the framework absorb common hook patterns
   (e.g. "eliminate duplicate semantic answers") into first-class
   eliminate methods?

6. **AI in the build loop.** The "AI generate game" path produces
   configs that need a 1-2 round auto-polish to clear all warnings
   on first open. Output quality is mostly bottlenecked on the
   prompt in `services/ai-service.js`. Is the right move to invest
   in better prompts, better validators, or fewer AI-generated
   primitives (i.e. lean harder on templates)?

7. **No persistence.** Rooms are in-memory; restarts lose them. Fine
   for a single classroom but blocks scaling to a multi-tenant
   service. If we go that direction, what's the right first step —
   Redis for room state, Postgres for game configs, both?

---

## 14. Running It

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-..." > .env   # optional — runs in mock mode without
npm start                                 # http://localhost:3000
npm test                                  # 281 tests, <1s
```

| URL | Who | Purpose |
|---|---|---|
| `/` | Anyone | Lobby — pick a game and host |
| `/host` | Teacher | Project to class, runs the game |
| `/player` | Student | Joins via 4-letter code |
| `/designer` | Teacher | Pick a game to edit / create new |
| `/designer/edit?game=ID` | Teacher | Drag-and-drop editor |
| `/prototype?game=ID` | Teacher | Side-by-side iframes for playtesting |
