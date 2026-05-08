# Classroom Games Framework

## Project Intent
Framework for quickly building classroom games where:
- Teacher projects a "host screen" to the class
- Students interact via their devices (Chromebooks/phones)
- AI facilitates/processes collective input
- Games are text-based for simplicity

## Target Users
- Novice coder (me) creating games via "vibe coding" with Claude
- Eventually: other teachers using the framework

## Architecture Principles
- Separation of Concerns: engine, views, AI are independent modules
- State Machine Pattern: every game is phases + transitions
- Events, Not Direct Calls: modules communicate via event bus
- AI Gets Summaries: collect data in scripts, send summary to AI (Script -> LLM Handoff)
- **Recipe Layer (R1 shipped):** teachers pick a recipe + fill 2-5 params; the compiler emits a phase graph. Phase-graph editor stays as advanced mode. Recipes are JSON, not code, so they migrate cleanly to a database when accounts ship. See `docs/RECIPE-LAYER.md`.

## Code Principles
- Don't swallow errors — surface them clearly
- No hardcoded values — use config
- Each file does one thing
- Write tests before implementation (TDD)
- Keep it simple — vanilla JS, no frameworks, no build steps

## Key Technical Decisions
- Node.js + Express for server
- Socket.io for real-time communication
- Vanilla HTML/CSS/JS for screens (no React)
- Vitest for testing
- Claude API for AI (swappable later)

## When Adding a New Game
1. Copy games/_template to games/your-game-name
2. Edit config.json for simple games
3. Edit game.js only if you need custom logic
4. Test with: npm test

## Current State
- **18 games in `games/`** (varies — teacher generates and deletes during testing; use `ls games/` for the current list)
- **All 10 engine primitives implemented** for Corn Story
- **Preview phase implemented** — teacher-only review before revealing to students
- **Timers implemented** — SVG ring countdown (host) + progress bar (player) with auto-submit on expiry
- **Player reconnection** — 30s grace period, auto-rejoin on socket reconnect, state restoration
- **Phase transitions** — smooth CSS fade transitions between game phases
- **Editor validation** — client-side + server-side config validation with friendly error messages
- **Test Game button** — saves dirty config then opens `/prototype?game={id}` (pre-selects game, user picks player count)
- **Prototype mode** — `/prototype` embeds host + player iframes side-by-side for quick playtesting
- **Dynamic AI messages** — processing screen shows task-specific text ("summarizing...", "comparing...") instead of hardcoded "creating your poem"
- Server runs on port 3000 (`npm start`)
- Host screen at /host, Player screen at /player
- Game editor at /designer, editor at /designer/edit
- Prototype mode at /prototype
- **AI game review** — two-tier review system: light check (Haiku, on save) + deep review (Sonnet, on demand) with inline phase badges and review panel
- **Loop/round system** — any phase can loop back to an earlier phase N times via `loopBack`/`loopCount` config fields
- **Screen control** — `hostTemplate`/`playerTemplate` for custom content, `hostShow`/`playerShow` for toggling built-in UI elements per phase
- **Announce phase fixed** — host and player screens now have announce sections with message, timer, continue button
- **Keith Haring editor restyle** — bold black borders, flat colors, warm canvas, energy marks on hover
- **Game templates** — 5 pre-built templates (blank, simple poll, creative writing, elimination game, quiz show) accessible via template picker modal
- **Live preview** — side-by-side host/player screen mockups in editor, respects hostShow/playerShow toggles
- **Game themes** — pre-built themes (pop-art, arcade, ocean, sunset) + AI-generated custom palettes, applied via CSS custom properties
- **Leaderboard phase** — shows scores/rankings with medal emojis, personal rank highlight on player screen, optional timer auto-advance
- **Reveal-one phase** — host reveals items incrementally (countdown style), items animate in on player screens, reconnection support
- **Foreach phase** — iterates over dynamic data (e.g., collected responses) running sub-phases per item, with auto-candidate generation, cumulative scoring, template variables (_current, _foreach, _candidates), self-exclusion (author can't rate own item), and tally scoring mode (author earns points from ratings)
- **AI game generation** — describe a game in plain English, Sonnet generates a complete config (designer UI button + `/api/games/generate` endpoint)
- **298 tests passing** (`npm test`)
- Simulator scripts for automated playtesting: `node scripts/simulate-corn-story.js`, `simulate-new-phases.js`, `simulate-dream-vacation.js`, `simulate-who-said-it.js`, `simulate-excuse-machine.js`

### Working Games
1. **Weekend Poem** (games/weekend-poem/) — collect → ai-process → reveal
2. **Mood Check** (games/mood-check/) — collect → ai-process → reveal
3. **Corn Story** (games/corn-story/) — 3-round elimination game with 16 phases
   - Round 1: "Don't Match" — AI groups similar answers, matching players eliminated via hook
   - Round 2: "Be Creative" — head-to-head voting, bottom 60% eliminated
   - Final: Pick-one voting by eliminated players, winner crowned
4. **Story Builder** (games/story-builder/) — collect (60s timer) → ai-process → preview → reveal
   - Uses preview phase for teacher review before showing AI-generated story
   - Teacher can approve (advance to reveal) or reject (re-run AI)
5. **Dream Vacation Debate** (games/dream-vacation/) — collect → rank → announce → team-split → relay → announce → wager → leaderboard
   - Uses all 4 new phase types: rank, team-split, relay, wager (host-resolved)
6. **Who Said It?** (games/who-said-it/) — collect → foreach(announce → collect-choice → announce) → leaderboard
   - First foreach game: iterates over each response, players guess the author with decoy choices, scoring tracks correct guesses
7. **Two Truths and a Lie** (games/two-truths/) — collect → foreach(announce → collect → announce) → announce
   - Social icebreaker: players write 3 statements, class discusses which is the lie
8. **Caption Contest** (games/caption-contest/) — ai-process → collect → foreach(announce → collect-choice → announce) → leaderboard
   - AI generates a scenario, players write captions, then guess who wrote each one
9. **The Excuse Machine** (games/excuse-machine/) — collect → foreach(announce → collect-choice → announce) → leaderboard
   - First tally scoring game: players write excuses, class rates each one, authors earn points from ratings
   - Tests both tally scoring mode and self-exclusion (authors can't rate their own excuse)
10. **Human vs AI: Birthday Party Battle** (games/human-vs-ai-birthday-party-battle/) — collect → announce → foreach(announce → collect-choice) → announce → leaderboard
   - First pairMode game: players write party ideas, AI generates fakes, pairs shown side-by-side
   - Uses `pairMode: "human-vs-ai"` with `aiInject` for side-by-side human vs AI comparison

### Engine Primitives (All Implemented)
1. Player state tracking (remaining vs eliminated) — PlayerRegistry
2. Data reference system (phase.field resolution) — GameEngine.resolve()
3. Template engine ({{phase.field}} substitution) — resolveTemplate() in server
4. Hooks system (dynamic import, context passing) — hooks-loader.js
5. Eliminate phase handler (bottom-percent, hook methods) — eliminate-handler.js
6. AI JSON output with extraction from preamble text — server.js
7. Vote phase - head-to-head mode — vote-handler.js
8. Vote phase - pick-one mode — vote-handler.js
9. Winner phase handler — winner-handler.js
10. Player subset filtering (from/voters restrictions) — getEligibleVoters()

### Known Bug Fixes & Lessons Learned
- **AI JSON preamble:** AI often wraps JSON in explanatory text. Server extracts JSON via regex fallback when JSON.parse fails directly.
- **AI playerIds vs text:** AI inconsistently returns playerIds or response text. The eliminateDuplicates hook resolves both by building a text-to-playerId lookup from phase data, with case-insensitive matching and deduplication.
- **AI mixed format:** AI sometimes returns `[playerId, responseText]` in same array. Hook deduplicates within groups — only eliminates if 2+ unique players resolve.
- **bottom-percent input field:** Eliminate phase reads scores from `phase.input` or `phase.from` (config uses `input`).

### 19 Phase Types Defined
1. `lobby` — Wait for players to join
2. `collect` — Gather text responses from players
3. `ai-process` — Send data to AI for processing
4. `vote` — Head-to-head or pick-one voting
5. `eliminate` — Remove players by percent or hook
6. `reveal` — Display content to all players
7. `preview` — Teacher-only preview before reveal
8. `winner` — Declare winner and show standings
9. `announce` — Display a message to everyone (round intros, instructions)
10. `collect-choice` — Players pick from predefined choices
11. `ai-eliminate` — AI judges answers and eliminates rule-breakers
12. `leaderboard` — Show scores and rankings with personal highlight
13. `reveal-one` — Host reveals items one-by-one (countdown style)
14. `team-split` — Divide players into teams (random or balanced)
15. `rank` — Players reorder a list by preference, aggregated by average position
16. `wager` — Players bet points on outcomes, auto or host-resolved
17. `relay` — Turn-by-turn collaborative input (storytelling, word chains)
18. `foreach` — Iterate over dynamic data running sub-phases per item (guessing games, review rounds)
19. `end` — Game over, clean up

### 6 AI Task Types Defined
- `summarize` — Combine responses into insight (Haiku)
- `generate` — Create content like poems (Haiku)
- `generate-choices` — Multiple choice questions (Sonnet)
- `compare` — Group by semantic similarity (Sonnet)
- `rank` — Order by criteria (Sonnet)
- `judge` — Pick winner with explanation (Sonnet)

### Gameplay Features
- **Preview phase** — Host sees AI content + player responses, can Approve (advance) or Reject (loop back). Players see "Waiting for teacher..." Server handler, socket events (`preview-approve`, `preview-reject`, `preview-edit`), and full host UI implemented.
- **Timers** — Config `timer` field (seconds) on collect and vote phases. Countdown displayed on both host and player screens. On expiry: player auto-submits current text (collect) or random vote (vote); host auto-clicks Close Submissions/Voting. Warning styling at ≤5 seconds.
- **Loop/round system** — Any phase can have `loopBack` (phase ID) and `loopCount` (2-100) to repeat a section of the game. After N iterations, falls through to `next`. Template variables: `{{_loop.<phaseId>.iteration}}` and `{{_loop.<phaseId>.total}}`. Phase data is versioned: bare key has latest, `phaseId~N` has per-iteration copies. Editor shows purple left border + "xN" badge on looped phases.
- **Screen control** — `hostTemplate` / `playerTemplate` for custom content per screen (resolved via `resolveTemplate()`). `hostShow` / `playerShow` arrays toggle built-in UI elements (e.g. `["content", "continueButton"]`). If omitted, all defaults shown (backward compat). Empty array `[]` hides all built-in elements. Valid toggles per phase type defined in `VALID_HOST_TOGGLES` / `VALID_PLAYER_TOGGLES`. Editor shows "Screen Control (Optional)" section with template textareas + toggle checkboxes.
- **Game editor** — Teacher-friendly UI redesign. Phase blocks show icons + friendly names ("Ask Players", "AI Does Something") instead of technical IDs. Right sidebar groups fields into sections with helper text. Data reference dropdowns replace raw text fields. Phase type picker modal for adding new steps. AI lane (purple) shows on ai-process phases. H/P/AI role dots on canvas blocks. All config.json internals unchanged — purely a presentation layer. Editor files: `screens/designer/editor.js`, `editor.css`, `editor.html`.
- **Foreach phase** — Orchestrator phase that iterates over dynamic data running sub-phases per item. Virtual sub-phases with `_fe:` prefix injected at runtime. Supports: auto-candidate generation (`candidateSource: "players"`, `decoyCount`), two scoring modes (`correct` for guessing games, `tally` for rating games), self-exclusion (author auto-skipped on collect-choice sub-phases), template variables (`_current`, `_foreach`, `_candidates`). Data refs: `.scores`, `.itemCount`. **Pair mode** (`pairMode: "human-vs-ai"`) — pairs each human response with an AI-injected response for side-by-side comparison. Each iteration exposes `_current.a`, `_current.b` (randomly assigned), and `_current.aiPosition`/`_current.humanPosition` for scoring.
- **AI game generation** — Describe a game in plain English and Sonnet generates a complete config. Accessible via "AI Generate Game" button in designer or `POST /api/games/generate`. Prompt documents all 19 phase types including foreach scoring modes.

### AI Game Review (Implemented)
- **Light review (Haiku)** — runs automatically after save, flags vague AI instructions, data flow breaks, player eligibility issues
- **Deep review (Sonnet)** — triggered by "Check My Game" button, comprehensive review of playability, prompt quality, timing, engagement
- **Review panel** — conversational summary + per-phase issues, clickable phase links to navigate canvas
- **Inline phase badges** — warning dots on phase boxes with issue count, AI suggestions section in sidebar
- **API endpoint** — `POST /api/games/review` with `{ config, depth }`, merges structural validation + AI review
- **Model selection** — `MODELS.haiku` for light checks, `MODELS.sonnet` for deep reviews
- **Mock mode** — returns plausible issues (empty instructions, missing timers) for testing without API key

### Safety Features Designed (Not Yet Implemented)
- Content filtering (profanity, slurs, PII detection)
- Moderation controls (hide responses, kick players)
- Anonymous mode option
- Rate limiting and input validation

### Editor Validation (Implemented)
- Server-side: phase type validation, required fields per type, enum values, timer range, data ref existence, `returnResults` mode
- Client-side: mirrors server logic with friendly names, errors block save, warnings prompt confirm
- Preview phase requires `content`, `approveNext`, and `rejectNext`
- Unreachable phase detection (BFS from lobby) as warnings
- Validation panel UI (red for errors, amber for warnings)
- Delete phase re-links `next`, `approveNext`, and `rejectNext` references
- Vote phases only offer `.scores` data ref (not `.results`)

### Engine Modules
- GameEngine (engine/game-engine.js) — orchestrates phases, data resolution, hooks
- StateMachine (engine/state-machine.js) — phases + transitions
- PlayerRegistry (engine/player-registry.js) — player management with elimination
- RoomManager (engine/room-manager.js) — room lifecycle
- GameLoader (engine/game-loader.js) — loads and validates game configs
- HooksLoader (engine/hooks-loader.js) — dynamic import of game hook functions
- EliminateHandler (engine/phases/eliminate-handler.js) — bottom-percent and hook methods
- VoteHandler (engine/phases/vote-handler.js) — matchup generation, tallying
- WinnerHandler (engine/phases/winner-handler.js) — determines winner from scores
- AIService (services/ai-service.js) — mock and real modes, game review (light/deep)

### Design Documents (docs/)
- **GAME-CONFIG-DESIGN.md** — 9 phase types, data references, hooks system
- **AI-TASK-DESIGN.md** — 6 AI task types with prompts, schemas, validation
- **SAFETY-DESIGN.md** — Threat model with three-layer mitigations
- **AUTHORING-DESIGN.md** — Config style guide, validation, debug mode
- **CORN-STORY-FEASIBILITY.md** — Implementation analysis and build order

### Environment
- Uses dotenv, set ANTHROPIC_API_KEY in .env for real AI
- Without API key, runs in mock mode (no real AI calls)
- Express 5.x (path matching is stricter than Express 4)
- Haiku for simple tasks, Sonnet for complex judgment

### Testing
- `npm test` — runs all 260 Vitest tests
- `node scripts/simulate-corn-story.js` — automated full-game playthrough (requires server running)

## Refinement Log
- Phase 5: Designed game config format with 9 phase types
- Phase 5: Defined 6 AI task types with structured JSON outputs
- Phase 5: Created safety design with three-layer mitigations
- Phase 5: Added authoring guide with validation and testing tools
- Phase 5: Completed feasibility analysis — Corn Story requires 10 primitives
- Phase 5 COMPLETE: All 5 design documents finished
- Phase 6: Implemented game loader, config validation, game selection UI
- Phase 6: Implemented Mood Check game
- Phase 6: Implemented player elimination, hooks system, eliminate phase handler
- Phase 6: Implemented vote handlers (pick-one and head-to-head) and winner handler
- Phase 6: Wired phase handlers into server, updated UI for voting and elimination
- Phase 6: Created Corn Story config (16 phases, 3 rounds)
- Phase 6: Fixed AI elimination bugs (JSON preamble, playerIds vs text, deduplication)
- Phase 6: Added simulator script for automated playtesting
- Phase 6 COMPLETE: All 3 games playable, 141 tests passing
- Phase 7: Implemented preview phase (server handler, socket events, host UI)
- Phase 7: Implemented timers (countdown display, auto-submit on expiry, warning styling)
- Phase 7: Completed preview phase fields in game editor (content, showResponses, approveNext, rejectNext)
- Phase 7: Created Story Builder game using preview + timers
- Phase 8: Redesigned editor UI for non-coders — friendly names, icons, grouped sections, helper text, data ref dropdowns, phase picker modal, AI lane in screen info
- Phase 9: Enhanced server validation — type checks, required fields per type, enum values, timer range, data ref existence, returnResults mode
- Phase 9: Client-side editor validation — mirrors server logic, friendly error messages, unreachable phase warnings, validation panel UI
- Phase 9: Fixed Test Game button — saves dirty config first, opens /host?game={id} with auto-create room
- Phase 9: Host auto-selects game from ?game= URL param
- Phase 9: Visual countdown timers — SVG ring on host, progress bar on player
- Phase 9: Smooth phase transitions — CSS opacity fade on host and player screens
- Phase 9: Player reconnection — disconnect grace period (30s), auto-rejoin, state restoration (sendCurrentState)
- Phase 9: Player avatars — colored initial circles in host player list, disconnected player styling
- Phase 9: isDirty tracking in editor — prevents losing unsaved changes
- Phase 9 COMPLETE: 179 tests passing, editor validation + play polish + reconnection
- Phase 10: Fixed 6 editor bugs — preview defaults, delete re-linking, vote data ref, ai-process format
- Phase 10: Added prototype mode — iframe-based playtesting at /prototype
- Phase 10: Dynamic AI processing messages — task-specific text on host and player screens
- Phase 10: Test Game button now opens prototype mode (pre-selects game, user adjusts player count)
- Phase 10: 180 tests passing
- Phase 11: AI game review — light check (Haiku on save) + deep review (Sonnet on demand)
- Phase 11: Review panel UI with summary, clickable phase issues, inline badges on canvas
- Phase 11: `POST /api/games/review` endpoint, AIService.review() with model selection
- Phase 11: 188 tests passing
- Phase 12: Added 3 new phase types — `announce` (show a message), `collect-choice` (multiple choice), `ai-eliminate` (AI judges and eliminates)
- Phase 12: Fixed reveal backward-compat (only scans when no template), preview validation (content OR template), eliminate/winner auto-advance with pause
- Phase 12: Fixed AIService.process() to pass systemPrompt through to API — ai-eliminate was using wrong prompt
- Phase 12: Updated review prompts to describe all 12 phase types (was only 9)
- Phase 12: ai-eliminate stores `survivors` array for use as vote candidates
- Phase 12: 202 tests passing
- Phase 13: Implemented loop/round system — loopBack/loopCount config fields, getNextPhaseId server helper, versioned phase data, _loop template variables, editor UI with loop fields + visual indicators, validation
- Phase 13: 212 tests passing
- Phase 14: Fixed announce phase — added HTML sections, JS listeners, and timer support to both host and player screens
- Phase 14: Implemented screen control — `hostTemplate`/`playerTemplate` for custom text, `hostShow`/`playerShow` for toggling built-in UI elements
- Phase 14: Added `.screen-template` divs + `applyShow`/`applyTemplate` helpers to host and player JS
- Phase 14: Server resolves and passes screen control fields in all phase emits + reconnection
- Phase 14: Validation for hostShow/playerShow (per-type toggle sets), hostTemplate/playerTemplate (string check)
- Phase 14: Editor UI — "Screen Control (Optional)" section with template textareas + toggle checkboxes
- Phase 14: 223 tests passing
- 2026-05-03: Per-player AI primitive — `ai-process` accepts `perPlayer: true` (engine generates N items, stores `byPlayer:{pid:item}`); new `{{X.mine}}` template token resolves per-recipient in collect/collect-choice prompts, announce, and reveal. Host sees `(each student gets their own)` placeholder.
- 2026-05-03: Synthetic `.list` resolver — `{{X.list}}` renders an array as a numbered text list (1. item / 2. item / ...). Added to AI generator prompt as the right way to display arrays.
- 2026-05-03: Save endpoint auto-strips unknown fields before validation (mirror of AI generator strip pass). Stale invented fields no longer block save.
- 2026-05-03: Foreach pattern — added "Guess the right answer" alongside spot-the-lie. `_current.shuffledFields` now excludes prompt-style keys (question/prompt/scenario/topic).
- 2026-05-03: Simple Poll template now uses collect-choice + barChart to match its bar-graph icon.
- 2026-05-03: collect/collect-choice prompts now resolve `{{...}}` refs (latent bug — they were being passed through unresolved).
- 2026-05-03: collect-choice responses store both `choice` and `text` so AI summarize sees the answer.
- 2026-05-03: Ask AI modal — fixed `display:flex` overriding the `[hidden]` attribute (modal popped open every page load and ignored close button).
- 2026-05-03: Prototype Skip Timer button — clicks whichever advance/close button is currently visible on host via postMessage, bypassing iframe focus issues.
- 2026-05-03: **Server crash fix** — stale `setTimeout` auto-advances in announce/eliminate/ai-eliminate/leaderboard/winner now check `ctx.isStale()` before transitioning. Skipping past a timed phase used to leave a leftover timer that fired later and threw an invalid-transition exception, killing the process.
- 2026-05-03: **Synthetic suffix resolver generalized** — `.list`/`.barChart`/`.pieChart`/`.chart` now work at any nesting depth. `{{collect-id.responses.list}}` renders the responses array as a numbered list. Bare `{{X.barChart}}` still reads `X.tally` (backward compat). New `formatList` helper auto-pulls arrays from `.result`/`.responses`/`.standings`.
- 2026-05-03: **Validator: cycle detection** — DFS over `next`/`approveNext` (excluding `loopBack` and `rejectNext`, which are intentional back-edges) flags any unintended loop as an error. Caught a real bug in corn-story (stub `phase-16` looping back into round1).
- 2026-05-03: **Validator: raw-array template warning** — scans `template`/`content`/`message`/`prompt`/`instruction`/`hostTemplate`/`playerTemplate` for `{{X.field}}` where field is a known-array (`responses`, `standings`, `eliminated`, `survivors`, `winnerIds`/`Names`, `rankings`, `matchups`, `candidateIds`, `voters`) without a `.list`/chart suffix. Warns to add `.list`. Caught 3 real bugs in feedback-coach-academy on first run.
- 2026-05-03: **Validator: design-hole warnings** — `scanForDesignHoles()` warns on (a) `wager` with no `scoresFrom` and no `correctOption` (host has to pick winner manually, players bet on nothing meaningful), (b) `team-split` with no downstream template referencing team data (wasted setup).
- 2026-05-03: **Wager default starting pool** — handler now gives every eligible player 100 points when `scoresFrom` isn't configured. Simplest case (one-off bet, no prior score chain) just works.
- 2026-05-03: **Corn Story rewrite** — deleted broken stub `phase-16`, repointed `crown.next → end`, fixed lobby/intro/collect ordering (intro now precedes collect), added 3 "Here's what everyone said" reveals using `{{X.responses.list}}`. 19 phases (was 16). Test asserting count updated.
- 2026-05-03: **Dream Vacation Debate rewrite** — dropped unused `team-split` and `wager` (no points basis, no objective winner — teams collaborated on one shared pitch, so "which team won?" had no answer). Flow now: lobby → submit → show-suggestions → rank → announce-winner (full ranking) → relay → pitch-reveal → end. Bumped announce timer 8s → 20s. Relay prompt now references `{{rank-destinations.rankings.0.item}}` so players have inline context.
- 2026-05-03: **Relay phase fixes**:
  - Player UI: added `#relay-prompt-display` element. Players now see the prompt above the running text on both their turn and while waiting.
  - Relay handler now resolves `{{...}}` refs in prompt via `ctx.resolveTemplate()` (latent bug — prompt was passed through raw).
  - Server emits `prompt` in `relay-waiting` event (was only sent on `relay-turn`).
  - New `relay-finish-all` socket event — host can fast-forward all remaining turns. Each remaining player gets `(skipped)`, then phase advances.
  - Host's `prototype-skip` handler detects when `relay-section` is visible and emits `relay-finish-all` (relay has no host-side button).
  - Prototype Bot Fill now repeats 12× over ~7s so each rotating active player gets filled in sequence.
- 2026-05-03: **Bot-fill regression fix** — earlier same-day change made bot-fill loop unconditionally for ~7s. That auto-skipped the next phase (e.g. vote screen never visible — players auto-voted before the screen rendered). Loop now only continues while the host iframe's `relay-section` is visible; non-relay phases get a single shot. Cap raised to 25 shots (~15s) for the relay path. Same-origin DOM read used to check host state; cross-origin fallback is single-shot.
- 2026-05-03: **Validator: unreachable-phase detection** — BFS from lobby across `next`/`approveNext`/`rejectNext`/`loopBack`. Any orphan phase warns (e.g. `winner` with no `next` strands `end`). Editor had this client-side but server didn't — now it does, so saved-via-API configs can't slip through. `detectUnreachablePhases()` in `engine/game-loader.js`.
- 2026-05-03: **Last One Standing rewrite** (`games/elimination-game/config.json`) — was 1 round, called itself "Last One Standing" but crowned a winner immediately. Now: 3-round loop on `eliminate.loopBack: round-intro, loopCount: 3`. Added `show-answers` reveal between collect and vote. `voting.voters: "remaining"` so eliminated players don't vote in later rounds. Added `winner.next: "end"` (caught by the new unreachable check). Round intro shows `Round X of Y` via `{{_loop.eliminate.iteration}}`.
- 2026-05-03: **ARCHITECTURE.md rewrite** (`docs/ARCHITECTURE.md`) — replaced the stale doc (claimed 2,376-line server.js, 900-line handlePhase, 264 tests, separate voteState/rankState properties — none current). Now reflects: registry-based phase handlers (`engine/phase-handlers/`), `phase-context.js` API, `room.phaseState` single bag with auto-cleanup, `phaseInstanceId` staleness checks, journal ring buffer, paused-error recovery, validator pipeline (errors + warnings), 281 tests, full editor→save→run lifecycle, current REST endpoints (7 AI-related + CRUD).
- 2026-05-05: **Phase D — AI generator reads from schema** (`services/ai-service.js`) — new `buildPhaseDocsForPrompt({format})` derives field listings for both LIGHT_REVIEW_PROMPT (terse one-line per type) and GAME_GENERATOR_PROMPT (verbose with field types) directly from `PHASE_SCHEMAS`. Hand-curated prose preserved via `PHASE_EXTRA_GUIDANCE` map (multi-field collect, per-player AI, foreach guidance). Adding a new phase to the schema now flows automatically into the AI prompts.
- 2026-05-05: **Phase E — resolver grammar + typed dataflow** (`engine/resolver-grammar.js`, new) — single source of truth for `{{...}}` syntax. Four exports: `parseTemplateTokens` (find tokens in a string), `parseRef` (structural parse: kind/segments/suffix), `classifyRef` (schema-aware: producedType/capability/renderable/canonicalForm/problem), `checkDataRefCompat` (does ref satisfy `accepts: [{type, capability}]`?). Validator and engine both run refs through this module so they can't drift on what's a valid token. `KNOWN_SUFFIXES = {list, count, json, barChart, pieChart, chart, mine}`. `BUILTIN_SCOPES = {remaining, eliminated, players, _current, _foreach, _candidates, _loop}`.
- 2026-05-05: **Validator — schema-driven raw-array scan** — `scanTemplatesForRawArrays` rewritten to use `parseTemplateTokens` + `classifyRef`. Replaces hardcoded `KNOWN_ARRAY_FIELDS` set; typing now flows from `phase-schemas.js` outputs. Adding a new array output to a schema participates automatically.
- 2026-05-05: **Validator — typed-dataflow scan** — new `scanDataRefTypeMismatches` walks every `dataRef` field on every phase, looks up the producer's output type, and emits `DATA_REF_TYPE_MISMATCH` warnings via `checkDataRefCompat`. Surfaces silent type drift (e.g. wiring a leaderboard to `ai-process.result` when `format: json` returns an object — would render as empty leaderboard at runtime). Caught real bugs in feedback-academy, feedback-coach-academy, mad-lib-mashup on first run.
- 2026-05-05: **Engine resolver uses parseRef** — `engine/game-engine.js#resolve()` now dispatches via `parseRef` rather than its own ad-hoc string split. Validator and engine share one grammar; behavior identical (47 game-engine tests still pass). Renderable suffixes (`list/barChart/pieChart/chart`) handled in engine; `mine` is rewritten by server-side per-player helper before resolve runs; `count/json` are validator-only annotations.
- 2026-05-05: **Schema fix — vote/rank candidates accept responseArray** — `vote.candidates` and `rank.candidates` were declared `accepts: [candidateSource]` only, but voting/ranking on raw collected responses is a primary use case. Now both also accept `responseArray`. Removed false-positive DATA_REF_TYPE_MISMATCH warnings on corn-story and dream-vacation.
- 2026-05-05: **Test count: 298** (`npm test`). New diagnostic-codes covered: `DATA_REF_TYPE_MISMATCH` fixture in `tests/engine/validator-diagnostics.test.js`. Snapshots updated for feedback-academy, feedback-coach-academy, mad-lib-mashup to reflect newly-surfaced bugs.
- 2026-05-06: **Recipe layer R1 (foundation)** — `engine/recipe-schema.js` (Recipe shape, validateRecipe, validateParams returning structured Diagnostics), `engine/recipe-compiler.js` (coerce form-strings → declared types, apply defaults, substitute `${param}` placeholders with whole-value type preservation), `engine/recipe-loader.js` (scans `recipes/` at startup, caches in memory, separate `recipes/user/` path for R5). First recipe `recipes/class-poll.json`. New endpoints: `GET /api/recipes`, `GET /api/recipes/:id`, `POST /api/recipes/:id/compile`. Compiled configs run through `validate()` as a safety net. Test count: **368** (+70). Plan in `docs/RECIPE-LAYER.md`.
- 2026-05-06: **Recipe layer R2 (picker UI)** — Designer landing page now has a primary "⭐ Use a Recipe" button. `screens/designer/designer.js` adds `showRecipePicker()`, parameter-form auto-renderer (one widget per type: text/textarea/number/checkbox/select/array-repeater), submit flow (gather → compile → save → redirect to editor). Inline error display reads structured Diagnostics. Form-string coercion handled server-side by the compiler ("30" → 30 for integer fields). CSS in `screens/designer/styles.css`. The phase-graph editor stays as the post-creation editing surface.
- 2026-05-06: **Recipe layer R3 (seed library)** — Five new hand-built recipes shipped: `discussion-starter` (collect → AI summarize themes → reveal), `creative-vote` (collect → vote pick-one → winner), `elimination-tournament` (round-intro → collect → vote → eliminate bottom-% → loop → winner; uses `loopBack`/`loopCount` driven by recipe param), `anonymous-feedback` (intro about anonymity → collect → AI paraphrase themes → reveal), `story-builder` (relay turns → reveal `{{story.text}}`). All recipes auto-validated by `tests/engine/recipes-integration.test.js` — every recipe must compile cleanly with sample params and produce a config that passes `validate()`. **6 recipes total** in the picker. `quiz-show` deferred — needs compiler extension for array-driven phase generation; documented in `docs/RECIPE-LAYER.md` as future R3.5.
- 2026-05-06: **Recipe layer R4 (AI as recipe matcher)** — `aiService.matchRecipe(description, recipes)` calls Haiku with a system prompt listing every available recipe + its parameters. Output is a tiny structured object: `{recipe: 'id', params: {...}}` or `{noMatch: true, reason, suggestion}`. New endpoint `POST /api/games/from-description`. Designer's "AI Generate Game" now uses this flow: description → AI matches recipe → preview the recipe + filled params → confirm → save + redirect. The legacy whole-config Sonnet generator is preserved as `showLegacyAIGenerateModal` (renamed) and reachable from the no-match view as "Generate Custom (Advanced)". **This resolves the JSON malformation bug class** — AI emits ~5 fields, not 200 lines, so parse errors at character 14640 stop happening. Cost: ~10× cheaper per generation (Haiku, 800 max-tokens vs Sonnet, 4096 max-tokens + auto-polish review).
- 2026-05-07: **Recipe layer R5 (save-as-recipe)** — `engine/recipe-extractor.js` adds `extractCandidates(config)` (walks every phase, returns all parameterizable fields with auto-suggested names + labels; collision-aware naming) and `buildUserRecipe(config, paramSpecs, metadata)` (substitutes `${name}` placeholders, preserves enum.values/array.item/integer.min-max/string.minLength-maxLength from the source phase schema, validates). New endpoints `POST /api/recipes/draft` (returns candidates) and `POST /api/recipes/user` (builds + smoke-tests + saves to `recipes/user/{id}.json`, busts cache). Editor toolbar adds "⭐ Save as Recipe" button → 2-step modal (candidate checklist with editable name+label per row, then recipe metadata). Round-trip property tested: game → extract → build → compile produces the same game back. Built-in id collisions blocked. Test count: **389** (+21).
- 2026-05-07: **Recipe layer R6 (polish)** — compatibility check in `engine/recipe-loader.js` compiles each loaded recipe with synthetic defaults + runs the result through `validate()`; on failure, flags `_broken: true` + `_brokenReason` instead of silently dropping. `summarizeRecipe()` now exposes `source: 'built-in'|'user'`, `broken`, `brokenReason` so the picker can render warning badges + group sections. New `DELETE /api/recipes/user/:id` endpoint (refuses built-ins, busts cache). Designer picker now renders "My Recipes" + "Built-in Recipes" sections, with delete buttons on user cards and orange "⚠ Needs update" badges on broken cards (broken recipes sort to the bottom of their section). Test count: **392** (+3). **Recipe layer plan R1–R6 complete.**
