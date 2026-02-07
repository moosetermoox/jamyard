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
- Phase 4 fully complete: Real Claude API integrated
- Using claude-3-haiku-20240307 model (fast and cheap)
- API key loaded from .env file (ANTHROPIC_API_KEY)
- Server runs on port 3000 (`npm start`)
- Host screen at /host, Player screen at /player
- Game flow: lobby → collect → process → reveal → end
- AIService (services/ai-service.js) supports mock and real modes
  - Mock mode: returns placeholder text for testing
  - Real mode: calls Claude API when ANTHROPIC_API_KEY is set
- Socket.io events:
  - Room: create-room, room-created, join-room, join-success, join-error, player-joined, player-left
  - Game: start-game, game-started, submit-response, response-received, close-submissions, processing-started, show-results, end-game, game-ended
- Engine modules:
  - StateMachine (engine/state-machine.js) - phases + transitions with event emission
  - PlayerRegistry (engine/player-registry.js) - player management with name validation
  - RoomManager (engine/room-manager.js) - room lifecycle with auto-cleanup
- Config: game phases defined in config/game-phases.js
- Environment: uses dotenv, set ANTHROPIC_API_KEY in .env for real AI
- All 45 tests passing

## Refinement Log
(Claude: update this section when we make significant decisions)
