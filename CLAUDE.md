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
- **4 games implemented and playable** (Weekend Poem, Mood Check, Corn Story, Story Builder)
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
- **241 tests passing** (`npm test`)
- Simulator script for automated playtesting: `node scripts/simulate-corn-story.js`

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

### 18 Phase Types Defined
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
18. `end` — Game over, clean up

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
- `npm test` — runs all 223 Vitest tests
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
