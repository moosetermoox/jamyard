# Lanyard — Architecture Overview

> A framework for teachers to assemble custom whole-class **activities** —
> games, polls, critiques, shared checklists — by wiring together
> pre-built phase blocks. The design goal is **as few errors as
> possible** between "teacher clicks save" and "30 students are
> playing." Vanilla JS, no build step, ~28K lines.
>
> _Last refreshed 2026-07-19 (28 phase types, teams upgrade, drawing
> input, COPPA/FERPA hardening, 810 tests). Earlier sections rewritten
> to match. Compliance posture: see §9.5 and
> [COMPLIANCE-TODO.md](COMPLIANCE-TODO.md)._

---

## 1. Goal & Scope

A teacher should be able to build a working classroom activity in
minutes without writing code. The framework supplies **28 reusable
phase types** (collect text or drawings, multiple choice, vote,
AI-process, reveal, elimination, leaderboard, relay, turn, merge,
cooperative counting, buzzer, estimate, match, sort, group checklist,
etc.). Teachers wire them into a sequence using a visual editor or pick
a **recipe** (a parameterized template that emits a phase graph); the
engine plays the result. User-facing copy says "activity" — the scope
outgrew games (checklists and critiques aren't games) — while all
internals deliberately keep `game` naming.

Not every game has a winner. A **connection family** of phase types and
games (Closer / Snowball / One Voice) is built for belonging and
calm — no points, no eliminations — and the validator *enforces* that
promise (a connection-family game can't contain a leaderboard or
scoring phase).

The hard part is not the phase types — it's the safety net. Most user
errors are silent: a phase referencing a field that doesn't exist, a
template rendering an array as `[object Object]`, a winner phase with
no `next` leaving the game frozen, or `{{_current.x}}` used outside the
foreach that gives it meaning. The architecture is built around
**catching these errors at save time** rather than at the front of a
classroom — and, increasingly, around surviving the things you *can't*
catch statically (a server restart mid-game, a kid's wifi dropping at
the worst moment).

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

**Browser surfaces**, all served as static HTML/JS by the same
Express server:

- `/designer` then `/designer/edit?game=ID` — idea-first front door +
  drag-and-drop editor (one teacher)
- `/host?code=ABCD` — projected to the class (one teacher)
- `/player?code=ABCD` — each student joins on their device
- `/teacher?code=ABCD` — **private** second-device console (the host
  screen is a *projector*, so moderation/preview controls that must
  stay teacher-only live here; joined with a 4-digit PIN — see §9)
- `/prototype?game=ID` — host + N players in side-by-side iframes for
  quick playtesting without a real classroom

**Persistence:** room *gameplay* state is in-memory (one Node process),
but durable data lives in **Neon Postgres** when `DATABASE_URL` is set:
user-created game configs, the AI-usage day counter, and **room
snapshots** (so a restart mid-game doesn't kill the class — see §12).
Without `DATABASE_URL` the server falls back to the filesystem for
games and skips snapshots; local dev is unchanged.

**Security:** when `SITE_PASSWORD` is set in the environment, `/host`,
`/designer`, `/prototype`, and all write APIs require HTTP Basic Auth.
Student paths (`/player`, static assets, socket.io) stay open so kids
can join with just a room code. Unset = disabled, so local dev is
unchanged. AI endpoints are additionally gated by a spend budget (§14).

---

## 3. Code Map

Line counts are approximate (they drift; treat as orders of magnitude).

```
server.js                  ~3,300 lines HTTP + socket.io + REST + snapshots
db.js                         97        Neon Postgres CRUD (games, ai_usage, room_snapshots)
engine/
  game-engine.js             314       Phase state, data store, template resolver
  game-loader.js           ~1,300      Config validation (errors + warnings)
  state-machine.js            39       Strict transitions (throws on invalid)
  player-registry.js         102       Player add/remove/eliminate, reconnect
  room-manager.js             59       Rooms keyed by 4-letter code (+ adopt for restore)
  room-snapshot.js           114       serializeRoom / restoreRoom (restart survival)
  id-migration.js             66       Deep-rewrite a player's old socket id on reconnect
  ai-name-fill.js             45       Re-fill real names into AI JSON (data minimization, §9.5)
  pin-throttle.js             75       Teacher-PIN brute-force lockout (pure, injected clock)
  drawing.js                           Stroke validation for drawing submissions (caps, clamping)
  events.js                  160       Socket event name constants
  event-schemas.js           200       Payload type checks for socket events
  hooks-loader.js             32       Dynamic import of per-game JS hooks
  phase-schemas.js         ~1,600      Declarative schema for all 28 phase types
  resolver-grammar.js        348       Single source of truth for {{...}} syntax
  diagnostics.js                       Diagnostic shape + codes
  normalizer.js                        Config normalization pipeline
  content-filter.js                    Blocklist word-boundary match + mash detect
  moderation.js                        Pure helpers: responseToText, hide, kick (+ drawing thumbnails)
  teacher-auth.js                      PIN / basic-auth check for the /teacher console
  video.js                             YouTube URL → embed URL parser
  speed-scoring.js                     Kahoot-style time-decay point formula
  recipe-schema.js           499       Recipe shape + param validation
  recipe-compiler.js         474       ${param} + $if/$repeat/$map → phase graph
  recipe-loader.js           220       Scans recipes/ + recipes/user/ at startup
  recipe-extractor.js                  "Save as Recipe" field extraction
  phase-handlers/  (30 files)          One file per phase type — self-register
    phase-registry.js         ~19      Map<type, handler> populated on import
    phase-context.js          ~80      Builds the ctx passed to every handler
    index.js                  ~45      Imports each handler so they register
    end / announce / reveal / preview / eliminate / winner / leaderboard /
    team-split / ai-process / collect / collect-choice / vote / reveal-one /
    rank / wager / relay / foreach / ai-eliminate / rate / turn / merge /
    one-voice / buzz / estimate / match / sort / checklist  (~70–300 lines each)
  phases/                              Pure-logic helpers (no I/O)
    eliminate-handler.js
    vote-handler.js                    Matchup gen, tally, resolveBranchTarget (CYOA)
    winner-handler.js
    pairing.js                         Greedy non-repeat pair matching (Connection Pack)
    pair-reveal.js                     {{_pair.*}} per-recipient reveal helpers
    estimate-scoring.js                Closeness scoring (closest / graduated)
    match-scoring.js                   Position-aligned pair matching + class accuracy
    sort-scoring.js                    Graded vs consensus bucket scoring + distributions
    team-grouping.js                   groupSize→count (no singletons), capacities, auto-fill
    checklist-state.js                 Group to-do rules: membership, attribution, progress
services/
  ai-service.js             ~1,400     Claude API wrapper + review/fix prompts
  ai-budget.js                133      Per-minute throttle + daily cap (cost guard)
  simulator.js                ~750     Headless robot playtest (+ chaos mode)
screens/
  host/host.js              ~1,700
  player/player.js          ~2,100
  designer/editor.js        ~6,200     The drag-and-drop ("Advanced") editor
  designer/simple-view.js              Plain-English sentence-per-step editor (default)
  shared/juice.js             224      Synthesized SFX + confetti + emoji avatars
  shared/bot-brain.js                  Prompt-aware Bot Fill answers (prototype)
  shared/drawing.js                    Drawing pad + stroke renderer (browser global)
  shared/themes.js                     Theme presets + applyGameTheme (CSS vars)
  teacher/                             Private second-device console
  prototype/prototype.js               Iframe playtester
recipes/   (13 built-in, + user/ for saved ones, + prompt-banks/ data)
games/     (35+ shipped; _-prefixed are hidden test fixtures — `ls games/` for truth)
  {game-id}/config.json              Phase definitions
  {game-id}/hooks.js  (optional)     Custom JS for elimination/scoring rules
  {game-id}/assets/   (optional)     Uploaded phase images
tests/
  810 Vitest unit tests (55 files)   Engine, validator, hooks, recipes; ~2s
scripts/                             Sim harness + automated playthroughs (§16)
.github/workflows/test.yml           CI: run the suite on push/PR (+ deploy-on-green)
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
`rejectNext` / `loopBack` / a `vote.nextByWinner` branch target)
explicitly lists the target. Any other transition throws.

**Branching votes** make the next phase depend on the *outcome*: a
pick-one vote with a literal option list can carry a `nextByWinner` map
(`{"Enter the cave": "cave-intro", ...}`) that routes the game by which
option won (choose-your-own-adventure). Branch targets are added to the
legal-transition graph, and the validator/BFS/cycle checks all treat
them as forward edges. (A subtle lesson learned: a transition-bearing
field has to be wired in *six* places — the SM graph, validator
ref-existence, unreachable-BFS, cycle detection, recipe-compiler
rewriting, and editor delete-relink — or it crashes somewhere.)

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
relay, foreach, turn, merge, one-voice, buzz, estimate, match, sort,
checklist, interactive team-split) put their state on `room.phaseState`. `handlePhase()` calls `room.phaseState.cleanup?.()`
and resets the bag on every transition, so timers can't leak across
phases.

Two invariants every stateful phase now carries (both learned from
real/simulated crashes):

- **A `kind` field.** Every close/submit/resolve socket handler
  `kind`-guards before touching the bag. Without it, an all-inputs-in
  auto-advance racing a late host "Close" click ran the closer against
  the *next* phase's state — which crashed the whole process. Closers
  are also idempotent (a `closed`/`tallied`/`resolved` flag).
- **Player ids that survive reconnects.** On reconnect a player gets a
  new socket id; `engine/id-migration.js` deep-rewrites the old id
  through `phaseState` + `phaseData` + `foreachState` (object keys,
  string values, arrays, Sets, Maps). Before this, a wifi blip gave
  the charades describer dead buttons, dropped votes, and orphaned a
  reconnected kid's leaderboard score. Any new phaseState that stores
  ids gets migration for free (it's a deep walker).

---

## 6. Phase Types (28 total)

| # | Type | What it does |
|---|---|---|
| 1 | `lobby` | Wait for players to join |
| 2 | `collect` | Gather free-text responses; `rotateFrom` (rotation chains), `assign:"pairwise"` (bluffing/pairs), `passAllowed` + `simultaneousReveal` (Connection Pack), `inputType:"drawing"` (stroke pad — combines with rotation for continue-the-drawing / caption modes) |
| 3 | `collect-choice` | Multiple choice; `correctAnswer` + `speedBonus` enable Kahoot-style scoring; `choicePool` for bluffing |
| 4 | `ai-process` | Send data to Claude; `perPlayer:true` generates one item per student |
| 5 | `vote` | Head-to-head or pick-one; `matchupsFromPairs`/`excludeAuthors` (bluffing); literal option lists + `nextByWinner` (branching / CYOA) |
| 6 | `eliminate` | Remove bottom-% of players by score |
| 7 | `reveal` | Display content to all; `scope:"pair"` shows each pair only its own answers (`{{_pair.*}}`) |
| 8 | `preview` | Teacher-only review; can approve or reject (also the safety gate before any drawing reaches the projector) |
| 9 | `winner` | Declare winner and show standings |
| 10 | `announce` | Show a message to everyone; `video:` plays a YouTube clip on the host screen |
| 11 | `ai-eliminate` | Claude judges answers, eliminates rule-breakers |
| 12 | `leaderboard` | Scores + rankings; `from` accepts a list of refs to sum across rounds |
| 13 | `reveal-one` | Host reveals items one-by-one; `itemTemplate` renders object items; drawings replay as animated strokes |
| 14 | `team-split` | Divide players into teams; sizing via `teamCount` OR `groupSize` (computed count, no singletons); `method: random\|balanced\|teacher\|choice` (teacher arranges on host screen / students claim spots); `capacity:"open"` removes choice-mode caps for pre-existing classroom teams |
| 15 | `rank` | Players reorder a list; aggregated by average position |
| 16 | `wager` | Players bet points; auto or host-resolved |
| 17 | `relay` | Turn-by-turn collaborative input (storytelling, word chains) |
| 18 | `foreach` | Iterate over data running sub-phases per item; pair-mode for human-vs-AI |
| 19 | `rate` | Class scores a target on N custom 1-N scales; bar + pie chart results |
| 20 | `turn` | Charades/describe-it; server-authoritative timer, team rotation, Got It / Skip |
| 21 | `merge` | Think-pair-share: a group shares one live draft and submits by agreement (`agreeMode`); outputs `merged` |
| 22 | `one-voice` | Cooperative counting to a target; server-authoritative collision window; teacher-speaker audio; no winners |
| 23 | `buzz` | First-tap-wins buzzer rounds; teacher judges Right/Wrong on the host; one phase runs many questions; outputs `scores` |
| 24 | `estimate` | Numeric guessing; `closest`/`graduated` (rank-based, scale-free) scoring; reveal shows answer + distribution; no-answer = poll-the-room |
| 25 | `match` | Pair two lists (vocab ↔ definitions); left column fixed, right drag-to-swap; close = discussion moment with per-pair class accuracy; outputs `scores` |
| 26 | `sort` | Place items into named buckets; tap-to-assign (phone-friendly); all-or-none correct buckets = graded vs consensus poll; outputs `scores`/distributions |
| 27 | `checklist` | Shared group to-do list (lab days, stations); any member checks items with attribution (group + console see names, never the projector); live per-group progress dashboard; no scores |
| 28 | `end` | Activity over, clean up |

### The connection family (no-winner games)

A recipe/config-level `family: "connection"` flag marks games built for
belonging rather than competition (Closer, Snowball, One Voice). The
validator **permanently rejects** leaderboard / winner / eliminate /
ai-eliminate / wager / buzz / estimate / graded scoring in such a game —
the promise of "no points, no winners" is enforced, not just intended.
The shared primitives:

- `collect.passAllowed` — a Pass button that counts as a submission but
  is never attributable anywhere (not even the journal).
- `collect.simultaneousReveal` — the projector shows counts only, no
  names, until close.
- `reveal.scope:"pair"` + `pairsFrom` — each pair sees only its own
  answers; a pass renders byte-identical to a missing answer.
- `engine/phases/pairing.js` — pure greedy non-repeat matching, with
  `rotatePairsFrom` (new partners) / `reusePairsFrom` (same partners).

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
| **Special-scope-out-of-context** (`SPECIAL_SCOPE_OUT_OF_CONTEXT`) | `{{_current.x}}` / `{{_pair.x}}` used where it can't resolve — would render raw code to students (caught a real shipped bug) |
| **Connection-family violation** | a `family:"connection"` game containing a leaderboard / winner / scoring phase |
| **Branching-vote checks** | `nextByWinner` target doesn't exist; key matches no option; <2 literal options |
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
prompt-injection attempts. Wired into **`submit-response`, `merge-draft`,
AND `relay-submit`** — the three paths that put student text in front of
peers or the projector. Rejects emit `RESPONSE_REJECTED`; the player-side
handler is section-aware (a merge rejection shows in the draft status, a
relay rejection reopens the turn to revise, collect preserves the text and
shows a red notice).

**2. AI system prompt** — a `SAFETY_RULES` block (content-safety +
anti-prompt-injection instructions) is appended to every game-run system
prompt in `AIService._processReal()`.

**3. Host moderation** (`engine/moderation.js`) — a collapsible
"Moderation" panel with the live submission list on collect phases. Host
can **Hide** a response (excluded from AI input + reveal, reversible) or
**Kick** a player (blocks rejoin via per-room `kickedTokens`). Emits:
`SUBMISSIONS_UPDATE`, `MODERATE_HIDE`, `MODERATE_KICK`, `KICKED`.

**Where moderation actually lives: the teacher console** (`/teacher`).
The host screen is *projected to the class*, so moderation with student
names on it is effectively public. The console is a private second-device
view (the teacher's phone), joined with the room code + a 4-digit PIN
(shown click-to-reveal on the host screen) or the `SITE_PASSWORD`
basic-auth header. It gets the live entries-with-names, preview
approve/reject, and close/next controls; the host screen's preview
content stays hidden behind "👁 Show on this screen" by default.
Privileged socket actions check `isTeacherSocket` (host OR a joined
console). Auth logic is pure + tested in `engine/teacher-auth.js`.
**Design rule going forward: never put teacher-private info on the host
screen — it's a projector.**

**4. Drawing safety** — the blocklist can't read a picture, so drawing
submissions lean on structure instead: server-side stroke validation
(`engine/drawing.js` — coordinate clamping, hard caps), attribution
(every drawing is named, never anonymous), live thumbnails on the
teacher console (hide/kick), and the `preview` phase before any
class-wide reveal. **Rule: nothing student-drawn reaches the projector
without a teacher gate.** AI steps can't read drawings (validator warns).

---

## 9.5 Student-Data Posture (COPPA / FERPA / § 49073.1)

Hardened 2026-07-19 against a California student-data review; the
working checklist (remaining documents, verifications, watch list) is
[COMPLIANCE-TODO.md](COMPLIANCE-TODO.md). What the code enforces today:

**Data minimization by construction.** Students join with a first name
only — no accounts, no emails, no ages. Player identity at runtime is
an ephemeral socket id plus a per-room reconnect token.

**Names never reach the AI.** Every outbound Claude prompt carries
pseudonymous playerIds + answer text only (`AIService._buildUserMessage`,
ai-eliminate's playerList). Because shipped games render
`{{_current.playerName}}` from AI JSON, `engine/ai-name-fill.js`
re-fills the *real* names server-side into any returned object with a
recognized playerId — the model never sees a name, and a model-garbled
echo can never beat the registry spelling. A unit test makes a name in
an outbound message a hard failure. **Rule: no student name in any
outbound API payload.**

**Data lifetime.** Student content (responses, drawings, scores) lives
in room memory and in `room_snapshots` — nowhere else. Snapshots exist
solely to survive a restart mid-class: they're deleted the moment an
activity reaches its end phase, on-touch when expired, and TTL-swept at
6 hours. **Rule: saved objects (game configs, recipes, exports) never
contain student-generated content** — "Save as Recipe" derives from
teacher-authored config only. A future "save the class's story" feature
would need full student-data treatment (disclosed retention, deletion,
de-identification); the default answer is to never take possession.

**Console access is brute-force-resistant.** The 4-digit teacher PIN
guards the only surface showing student names off-projector;
`engine/pin-throttle.js` locks a room's console joins after 5 wrong
PINs (room-keyed — a fresh socket doesn't reset it; even the correct
PIN bounces during lockout).

**Known gaps** (tracked in COMPLIANCE-TODO.md): PII-scrubbing of
student free text (the filter catches profanity, not a kid typing their
phone number), the published privacy/retention documents, and the
infrastructure verifications only the operator can do (Neon PITR
window, Render log rotation, Anthropic DPA recording).

---

## 10. Runtime Safety Nets

The validator catches what it can statically. Several runtime mechanisms
catch the rest.

### Crash isolation (one bad room can't end every class)

Every socket handler runs inside a try/catch wrapper (the `socket.on`
override at connection time), so a throwing handler logs loudly and
keeps the process — and every *other* classroom on the server — alive.
`process.on('unhandledRejection')` does the same for stray promises.
This is not theoretical: the close-handler race below took the whole
server down in testing before these nets existed.

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

### Close-handler kind guards + idempotence

The all-inputs-in auto-advance and a late host "Close" click can race.
Without protection the closer runs against the *next* phase's state — a
server-killing crash. Every stateful phase stamps a `kind`; every
close/submit/resolve handler verifies it; closers carry a
`closed`/`tallied`/`resolved` flag so a double-fire is a no-op. The
generic `advance-phase` ("Next step" on the teacher console) routes
through the current phase's closer first, so it can't skip a phase's
data close (which would lose scores and leave raw `{{tokens}}` on the
next screen).

### Socket payload validation

`engine/event-schemas.js` defines simple type schemas
(`"string:required"`, `"number:optional"`, `"array:required"`) for the
most-touched events (`submit-response`, `submit-vote`, `rank-submit`,
`wager-submit`, `relay-submit`, `estimate-submit`, `host-rejoin`,
`close-*`). Hostile or malformed payloads are dropped before reaching
handler logic. The **chaos simulator** (§16) verifies all of this under
load: 12 players dropping/reconnecting mid-phase while malformed and
stale events spray the server, and every game must still complete.

---

## 11. The Recipe Layer

Non-coder teachers can create games without touching the phase graph
by using **recipes** — parameterized JSON templates that compile into
a complete config.

```
Teacher opens /designer  (idea-first front door — one big box:
                           "What do you want to play with your class?")
  └─ Types a description → POST /api/games/from-description
       └─ Haiku matches a recipe + fills params, OR
  └─ "Browse recipes" → picks one (12 built-in + recipes/user/)
  └─ Fills 2-5 fields (topic, timer, etc.)
  └─ POST /api/recipes/:id/compile → validated config
  └─ POST /api/games → save game
  └─ Redirect to the editor (Simple view by default, Advanced canvas behind it)
```

**AI recipe matching** (`POST /api/games/from-description`) — teacher
describes a game in plain English; Haiku picks the closest recipe and
fills reasonable params. Output is ~5 fields, not 200 lines, so JSON
malformation is no longer a failure mode. Cost ~10× cheaper than the
legacy whole-config Sonnet generator (still reachable from the no-match
view for fully custom games).

**Compiler conditionals (R7)** — recipes are JSON templates, not code,
but they're no longer purely flat substitution. Declarative directives
let one recipe cover structural variants:

- `$if` conditions (`name` / `!name` / `name=value` / `name!=value`)
  drop a phase, a field (via a `{$if, $value}` envelope), or an array
  element. Transitions auto-rewire *through* dropped phases (unlink the
  node, follow the chain; a dangling ref is a compile error).
- `$repeat` inside `phases` generates one phase per array item
  (`${item.x}`, `${i}`, `${n}`, `${nextKey}`) — this is what finally
  shipped the long-deferred **quiz-show** recipe (one round per
  teacher-written question).
- `$map` builds a derived array (e.g. a leaderboard summing
  `q1.scores … qN.scores`).
- Placeholders take dotted paths (`${item.question}`); a new `object`
  param type carries `fields` and renders as a card-per-item in the
  picker. 12 recipes total.

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

## 12. Persistence & Restart Survival

Gameplay state (the live engine, per-phase bags, timers) is in-memory
in one Node process — fast, simple, and correct for a single classroom.
Everything *durable* goes to **Neon Postgres** (`db.js`) when
`DATABASE_URL` is set, with a clean filesystem fallback when it isn't:

| Table | What it holds |
|---|---|
| `user_games` | Teacher-created game configs (survive Render redeploys) |
| `ai_usage` | The AI spend day-counter (so restarts can't reset the cap — §14) |
| `room_snapshots` | Mid-game room state for restart recovery (below) |

### Room snapshots — surviving a server death mid-class

The existential failure mode of an in-memory server: a Render redeploy,
free-tier sleep, or crash at minute 20 of a 35-minute period used to
silently kill every running game. Now (`engine/room-snapshot.js`):

- **On every phase transition**, `serializeRoom()` writes a JSON-safe
  snapshot (engine position, all completed-phase data, players + their
  reconnect tokens, scores, eliminations, kicked tokens, teacher PIN)
  to `room_snapshots`, debounced ~300ms.
- **On a rejoin the restarted server doesn't recognize**,
  `restoreRoom()` lazily rebuilds the room from its snapshot and adopts
  it back into the RoomManager. Players rebind through the existing
  token-reconnect path; the host rebinds via a `hostToken` kept in the
  host page's sessionStorage (`host-rejoin` on connect).
- **Semantic:** resume at the *start* of the interrupted phase. That
  one phase's mid-progress (votes cast, half-typed answers) is lost; the
  game — completed phases, roster, scores — is not. Mid-foreach restores
  re-enter the foreach parent fresh.

A related fix in the same area: a host disconnect used to *delete the
room instantly*, so a teacher's F5 or a flaky projector laptop killed
the game for the whole class. Now the room is held for a 5-minute grace
window for the host to rejoin, and snapshots are TTL-swept at 6h.

Verified end-to-end by `scripts/simulate-restart.js`: it plays to
mid-phase, **SIGKILLs the server**, starts a fresh process, and rejoins
as host + player — asserting roster, phase, and PIN all survived (and a
forged hostToken is rejected).

---

## 13. Editor → Save → Run Lifecycle

```
Teacher opens /designer/edit?game=ID
  └─ GET /api/games/:id              load config
  └─ GET /api/phase-schemas          populate field lists + toggles (schema-driven)
  └─ Default to SIMPLE VIEW (sentence-per-step), Advanced canvas behind a pill
  └─ Edit content inline; "✨ Ask AI" for structural changes
  └─ Auto-save fires when user clicks off a step / switches view

Teacher edits, clicks Save (or auto-save)
  └─ Client-side validation (mirror of server rules) — friendly errors inline
  └─ PUT /api/games/:id with config
       └─ stripUnknownFields(config)   drop invented fields, log warnings
       └─ validate(config, gameId)     errors block save, warnings returned
       └─ Write to DB (user_games) or games/{id}/config.json
  └─ Editor shows "saved" pip

Teacher clicks "Check for Errors" (deep review)
  └─ POST /api/games/review (depth: deep)
       └─ Sonnet review  ─┐ run in parallel
       └─ Robot playtest ─┘ services/simulator.js self-connects 1 host + 4
            bots to a hidden _sim-tmp- room (mock AI, zero API spend) and
            DRIVES every phase to the end, catching stalls / crashed phases /
            blank screens / empty payloads / unresolved {{tokens}} that
            static review can't see. Findings deep-link to phases.

Teacher clicks Prototype Mode
  └─ Save first if dirty → open /prototype?game=ID
       └─ host iframe (auto-creates room) + N player iframes (auto-join)
       └─ Bot Fill posts {type:'bot-fill'}; Skip posts {type:'prototype-skip'}

Teacher uses for real
  └─ Open /host  → Create Room → projects 4-letter code (+ a hostToken
       stashed in sessionStorage for F5 / restart recovery)
  └─ Students open /player → enter code + name
  └─ (optional) Teacher's phone → /teacher → enter code + PIN
  └─ Teacher clicks Start
       └─ engine.transition('lobby' → first phase)
       └─ handlePhase() dispatches via registry; snapshots the room
       └─ Each phase emits to host + players, waits for events or auto-advances
```

Tokens are never shown raw to teachers: Simple view renders `{{refs}}`
as friendly chips inside token-aware boxes; the Advanced primary
textareas tokenize to `[label — step N]` (round-tripped on save).

---

## 14. Where the AI Sits

Two distinct uses, both via Claude API:

**(a) Game-time AI** — phases of type `ai-process` and `ai-eliminate`
call the Anthropic SDK during gameplay. Results become phase data,
referenced in later phases. Mock mode (no API key) returns plausible
fixtures for tests. Prompts are minimized (§9.5): pseudonymous
playerIds only, never student names.

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

**Cost guards** (`services/ai-budget.js`) — every *real* Anthropic call
goes through `AIService._callClaude`, gated by a per-minute throttle
(`AI_CALLS_PER_MINUTE`, default 20) and a daily cap (`AI_DAILY_CAP`,
default 500; the day counter persists in `ai_usage` so a restart can't
reset it). A blocked call throws `AiBudgetError` (HTTP 429 with a
friendly message) *before* hitting the API, so it costs nothing — editor
endpoints surface the 429, in-game AI failures hit the phase-error
pause. Mock mode never reaches the guard.

---

## 15. The Hard Parts (and How They're Handled)

### Reconnection (and surviving it everywhere)

Students close laptops. Wifi blips. The grace period in
`engine/player-registry.js` keeps a player in the room across a brief
drop. On reconnect the registered handler's `onReconnect(ctx, socket)`
rebuilds the current screen (vote options, ranking items, the current
relay turn / charades describer, an estimate's *results* if it already
closed, etc.) from `room.phaseState`.

The harder half is that a reconnect issues a **new socket id**, and
player ids are sprinkled through live state. `engine/id-migration.js`
deep-rewrites the old id everywhere on rebind (§5) — without it, the
charades describer's buttons go dead after a blip, votes drop, and the
reconnected kid vanishes from the leaderboard. And if the *whole server*
restarts, room snapshots (§12) bring the game back. The **chaos
simulator** (§16) is what proves all three layers hold up under
school-wifi hostility.

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
(20+ tests across edge cases). Estimate scoring is the same idea made
scale-free: `engine/phases/estimate-scoring.js` ranks by *closeness*
rather than absolute error, so the same modes work for "guess 7" and
"guess 7 million."

---

## 16. Testing & Verification

```bash
npm test                                   # 810 Vitest unit tests (55 files), ~2s
node scripts/simulate-any-game.js <id>     # universal automated playthrough (server up)
node scripts/simulate-chaos.js             # school-wifi chaos suite (drop/reconnect/spray)
node scripts/simulate-restart.js           # restart-survival proof (needs DATABASE_URL)
node scripts/simulate-teacher-console.js   # console invariants incl. PIN brute-force lockout
node scripts/simulate-team-modes.js        # teacher/choice/open-capacity team splits
node scripts/demo-room.js <id>             # live room + bots, prints CODE/PIN (phone testing)
node scripts/screenshot.js <url> out.png   # headless screenshots of socket pages (CDP)
```

**Unit tests** cover engine internals, validator rules (~100 tests in
`game-loader.test.js`), every pure-logic helper (vote/eliminate/winner/
speed-/estimate-scoring, pairing, one-voice `adjudicateTap`, buzz
referee, id-migration, room-snapshot, AI budget), hooks loader, AI
service mock mode, event schemas, content filter, recipe compilation +
conditionals, and a **per-game diagnostic snapshot** (`validate()`
output is pinned for every shipped game; a new game must be added or the
test fails loudly).

**Headless playthroughs** are the E2E layer. The same robot reactor
(`services/simulator.js`) powers three things: the in-editor "Check for
Errors" deep review, the universal `simulate-any-game.js`, and **chaos
mode** — `simulate-chaos.js` runs every interactive phase type while 12
bots drop/reconnect mid-phase, ghosts join with dead tokens, and stale/
malformed/duplicate events spray the server; all six suite games must
complete. This is what caught the reconnect-id-staleness and
advance-phase-skips-close bug classes.

**CI** (`.github/workflows/test.yml`) runs the suite on every push/PR.
With the `RENDER_DEPLOY_HOOK` secret set (and Render auto-deploy off),
deploy-on-green is wired; until then it skips harmlessly and Render's
own auto-deploy handles it.

Gaps:

- No real-classroom data yet — field tests start August 2026. Most
  games are sim-tested, not human-tested; the pre-August plan in
  `docs/NEXT-STEPS.md` is built around closing that.
- Browser *unit* tests don't exist; host/player JS is verified by
  screenshot + the headless playthroughs, which catch interaction but
  not every rendering edge.

---

## 17. What I'd Want Feedback On

Engineering:

1. **Server.js as orchestrator.** It's now ~3,300 lines — socket-event
   handlers (~45) plus helpers (relay/foreach orchestration, snapshot
   persistence, per-phase closers, template resolvers). Are the
   remaining socket handlers a candidate for the same registry treatment
   as phase handlers, or is the indirection cost worse than the benefit?

2. **`room.phaseState` as a typed bag.** It's `any` with a `kind`
   discriminator each handler stamps. Worth a per-phase-type JSDoc
   shape (no TS) to catch field typos in handler code?

3. **Validator coverage.** It catches structural + most semantic errors
   (typed dataflow, special-scope misuse, connection-family violations).
   Remaining gap: design holes subtler than the current checks. Push
   further, or diminishing returns?

4. **Editor↔engine drift.** `screens/designer/editor.js` (~6,200 lines)
   still duplicates some validation for inline display. `GET
   /api/phase-schemas` closes most of the gap; sidebar field rendering
   is still hardcoded per type.

5. **Per-game hooks.** A few games (`corn-story`) ship `hooks.js` for
   custom logic — an escape hatch. Absorb common patterns into
   first-class methods, or keep the hatch?

6. **In-memory room state at multi-tenant scale.** Snapshots solved
   *survival* (restart recovery), not *scale* — gameplay still lives in
   one process. If Lanyard ever needs horizontal scaling, the right
   first step is probably moving live room state behind a shared store
   (Redis), keeping configs in Postgres. Not needed for one school.

Compliance (§9.5 + COMPLIANCE-TODO.md):

7. **Is the minimization boundary drawn correctly?** Pseudonymous
   playerIds still go to the API (compare/judge need a mappable
   identifier). Is an ephemeral socket id an acceptable pseudonym, or
   should prompts use per-call synthetic indexes with a server-side map?

8. **Retention story completeness.** Purge-on-end + 6h TTL covers
   snapshots; Neon PITR/backups and Render logs extend real retention
   underneath and are operator-verified, not code-enforced. Anything
   else retaining student data that we've missed (e.g. server logs
   printing submissions — `console.log` currently echoes AI inputs)?

9. **PIN threat model.** 5-wrong-in-10-min → 5-min room lockout, keyed
   by room code. Is denial-of-service via deliberate lockout (a student
   spamming wrong PINs to lock their teacher out) an acceptable
   trade-off, given the host screen retains full control without a PIN?

---

## 18. Running It

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-..." > .env   # optional — runs in mock mode without
# echo "DATABASE_URL=postgres://..."     # optional — enables persistence + snapshots
npm start                                 # http://localhost:3000
npm test                                  # 810 tests, ~2s
```

| URL | Who | Purpose |
|---|---|---|
| `/` | Anyone | Home — host an activity or join with a room code |
| `/host` | Teacher | Project to class, runs the game |
| `/player` | Student | Joins via 4-letter code |
| `/teacher` | Teacher | Private second-device console (PIN-gated) |
| `/designer` | Teacher | Idea-first front door → recipe / editor |
| `/designer/edit?game=ID` | Teacher | Simple view + Advanced canvas editor |
| `/prototype?game=ID` | Teacher | Side-by-side iframes for playtesting |

**Env vars:** `ANTHROPIC_API_KEY` (real AI; mock without), `DATABASE_URL`
(Neon persistence + snapshots), `SITE_PASSWORD` (basic-auth on teacher
surfaces), `AI_CALLS_PER_MINUTE` / `AI_DAILY_CAP` (spend guards).

**Deployed on Render** (free tier, auto-deploys from `master`). Note the
free tier *sleeps* when idle and resets the filesystem on redeploy —
which is exactly why durable data lives in Neon and rooms snapshot
there. Classroom field tests begin **August 2026**; the work between now
and then is hardening, not new features (see `docs/NEXT-STEPS.md`).
