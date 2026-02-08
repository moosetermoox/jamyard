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
- **Phase 5 in progress: Game Definition System**
- Phase 4 complete: Real Claude API integrated
- Server runs on port 3000 (`npm start`)
- Host screen at /host, Player screen at /player
- All 45 tests passing

### Design Documents (docs/)
- **GAME-CONFIG-DESIGN.md** — Game configuration format and phase definitions
- **AI-TASK-DESIGN.md** — AI task types, prompts, schemas, and validation
- **SAFETY-DESIGN.md** — Threat model and safety mitigations

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
