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
- **Phase 5 complete: Game Definition System designed**
- Ready to begin implementation
- Server runs on port 3000 (`npm start`)
- Host screen at /host, Player screen at /player
- All 45 tests passing

### Design Documents (docs/)
- **GAME-CONFIG-DESIGN.md** — 9 phase types, data references, hooks system
- **AI-TASK-DESIGN.md** — 6 AI task types with prompts, schemas, validation
- **SAFETY-DESIGN.md** — Threat model with three-layer mitigations
- **AUTHORING-DESIGN.md** — Config style guide, validation, debug mode
- **CORN-STORY-FEASIBILITY.md** — Implementation analysis and build order

### Recommended Build Order
1. **Weekend Poem** — Validates core pipeline (collect → ai-process → reveal)
2. **Mood Check** — Same phases, different content (no new engine features)
3. **Corn Story** — Requires 10 engine primitives (see feasibility doc)

### Engine Primitives Needed for Corn Story
1. Player state tracking (remaining vs eliminated)
2. Data reference system (phase.field resolution)
3. Template engine ({{phase.field}} substitution)
4. Hooks system (dynamic import, context passing)
5. Eliminate phase handler (bottom-percent, hook methods)
6. AI JSON output with validation
7. Vote phase - head-to-head mode
8. Vote phase - pick-one mode
9. Winner phase handler
10. Player subset filtering (from/voters restrictions)

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

### Safety Features Designed
- Content filtering (profanity, slurs, PII detection)
- Teacher preview before reveal
- Moderation controls (hide responses, kick players)
- Anonymous mode option
- Rate limiting and input validation

### Engine Modules
- StateMachine (engine/state-machine.js) — phases + transitions
- PlayerRegistry (engine/player-registry.js) — player management
- RoomManager (engine/room-manager.js) — room lifecycle
- AIService (services/ai-service.js) — mock and real modes

### Environment
- Uses dotenv, set ANTHROPIC_API_KEY in .env for real AI
- Haiku for simple tasks, Sonnet for complex judgment

## Refinement Log
- Phase 5: Designed game config format with 9 phase types
- Phase 5: Defined 6 AI task types with structured JSON outputs
- Phase 5: Created safety design with three-layer mitigations
- Phase 5: Added authoring guide with validation and testing tools
- Phase 5: Completed feasibility analysis — Corn Story requires 10 primitives
- Phase 5 COMPLETE: All 5 design documents finished, ready for implementation
