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
- **All 3 games implemented and playable** (Weekend Poem, Mood Check, Corn Story)
- **All 10 engine primitives implemented** for Corn Story
- Server runs on port 3000 (`npm start`)
- Host screen at /host, Player screen at /player
- **141 tests passing** (`npm test`)
- Simulator script for automated playtesting: `node scripts/simulate-corn-story.js`

### Working Games
1. **Weekend Poem** (games/weekend-poem/) — collect → ai-process → reveal
2. **Mood Check** (games/mood-check/) — collect → ai-process → reveal
3. **Corn Story** (games/corn-story/) — 3-round elimination game with 16 phases
   - Round 1: "Don't Match" — AI groups similar answers, matching players eliminated via hook
   - Round 2: "Be Creative" — head-to-head voting, bottom 60% eliminated
   - Final: Pick-one voting by eliminated players, winner crowned

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

### 9 Phase Types Defined
1. `lobby` — Wait for players to join
2. `collect` — Gather text responses from players
3. `ai-process` — Send data to AI for processing
4. `vote` — Head-to-head or pick-one voting
5. `eliminate` — Remove players by percent or hook
6. `reveal` — Display content to all players
7. `preview` — Teacher-only preview before reveal
8. `winner` — Declare winner and show standings
9. `end` — Game over, clean up

### 6 AI Task Types Defined
- `summarize` — Combine responses into insight (Haiku)
- `generate` — Create content like poems (Haiku)
- `generate-choices` — Multiple choice questions (Sonnet)
- `compare` — Group by semantic similarity (Sonnet)
- `rank` — Order by criteria (Sonnet)
- `judge` — Pick winner with explanation (Sonnet)

### Safety Features Designed (Not Yet Implemented)
- Content filtering (profanity, slurs, PII detection)
- Teacher preview before reveal
- Moderation controls (hide responses, kick players)
- Anonymous mode option
- Rate limiting and input validation

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
- AIService (services/ai-service.js) — mock and real modes

### Design Documents (docs/)
- **GAME-CONFIG-DESIGN.md** — 9 phase types, data references, hooks system
- **AI-TASK-DESIGN.md** — 6 AI task types with prompts, schemas, validation
- **SAFETY-DESIGN.md** — Threat model with three-layer mitigations
- **AUTHORING-DESIGN.md** — Config style guide, validation, debug mode
- **CORN-STORY-FEASIBILITY.md** — Implementation analysis and build order

### Environment
- Uses dotenv, set ANTHROPIC_API_KEY in .env for real AI
- Without API key, runs in mock mode (no real AI calls)
- Haiku for simple tasks, Sonnet for complex judgment

### Testing
- `npm test` — runs all 141 Vitest tests
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
