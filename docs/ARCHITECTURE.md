# Classroom Games - Architecture Overview

> A framework for building real-time classroom games where a teacher hosts and students play on their devices. ~20K lines, vanilla JS, no build step.

## System Diagram

```
                          +-----------------+
                          |   Teacher's     |
                          |   Browser       |
                          |   (Host UI)     |
                          +--------+--------+
                                   |
                             Socket.io
                                   |
+-------------+            +-------+--------+            +-------------+
|  Student 1  |---Socket-->|                |<--REST---->| Game Editor |
|  (Player)   |            |   server.js    |            | (Designer)  |
+-------------+            |   (Express +   |            +-------------+
+-------------+            |    Socket.io)  |
|  Student 2  |---Socket-->|                |--API------>| Claude API  |
|  (Player)   |            +-------+--------+            | (Haiku 4.5) |
+-------------+                    |                     +-------------+
      ...                  +-------+--------+
+-------------+            |     Engine     |
|  Student N  |---Socket-->| GameEngine     |
|  (Player)   |            | PlayerRegistry |
+-------------+            | StateMachine   |
                           +----------------+
```

## Core Concept: Config-Driven State Machine

Every game is a **JSON config** that defines a sequence of phases. The engine walks through them:

```json
{
  "name": "Mood Check",
  "phases": {
    "lobby":   { "type": "lobby",      "next": "collect" },
    "collect": { "type": "collect",     "prompt": "How are you?", "next": "ai" },
    "ai":      { "type": "ai-process",  "task": "summarize",      "next": "reveal" },
    "reveal":  { "type": "reveal",      "next": "end" },
    "end":     { "type": "end" }
  }
}
```

Teachers create games by wiring phases together in a visual editor. No code required for simple games. Custom logic (elimination rules, scoring) uses optional hook files.

## Module Boundaries

```
server.js (2,376 lines)          # Orchestrator - the "thick controller"
  |-- Dispatches phases via handlePhase() switch (19 cases)
  |-- Manages socket.io events (~20 event types)
  |-- REST API for game CRUD
  |-- Phase-specific state (voteState, rankState, wagerState, relayState)
  |
  +-- engine/
  |     game-engine.js           # Phase transitions, data storage, template resolution
  |     state-machine.js         # State + transition table
  |     player-registry.js       # Player add/remove/eliminate/reconnect
  |     room-manager.js          # Room creation, 4-letter codes, expiry
  |     game-loader.js           # Config loading + validation (30+ rules)
  |     hooks-loader.js          # Dynamic import of per-game hooks
  |     phases/
  |       vote-handler.js        # Matchup generation, tallying
  |       eliminate-handler.js   # Bottom-percent, hook-based elimination
  |       winner-handler.js      # Winner determination
  |
  +-- services/
  |     ai-service.js            # Claude API wrapper (real + mock modes)
  |
  +-- screens/                   # Client-side (vanilla JS, no framework)
  |     host/                    # Teacher control panel
  |     player/                  # Student gameplay
  |     designer/                # Visual game editor
  |
  +-- games/                     # Game definitions
        {game-id}/
          config.json            # Phase definitions
          hooks.js               # Optional custom logic
```

## Data Flow

### A typical game round:

```
1. Host creates room        create-room → roomManager.create() → room-created
2. Players join              join-room → playerRegistry.add() → join-success
3. Host starts               start-game → engine.transition('collect') → handlePhase()

4. handlePhase('collect')    → emit 'game-started' to players (prompt + timer)
5. Players submit            submit-response → store in player object
6. Host closes               close-submissions → engine.storePhaseData('collect', responses)
                             → engine.transition('ai') → handlePhase('ai-process')

7. handlePhase('ai-process') → aiService.process() → engine.storePhaseData('ai', result)
                              → engine.transition('reveal') → handlePhase('reveal')

8. handlePhase('reveal')     → resolve templates → emit 'show-results' to all
9. Host advances             next-phase → engine.transition('end') → game-ended
```

Key pattern: **`handlePhase()` is recursive**. Auto-advancing phases (ai-process, eliminate) call `handlePhase()` again immediately. Interactive phases (collect, vote) return and wait for socket events.

## Phase Types (19)

| Category | Types | How they work |
|----------|-------|---------------|
| **Setup** | `lobby`, `end` | Wait for players / clean up |
| **Input** | `collect`, `collect-choice`, `rank`, `wager`, `relay` | Players submit, host closes |
| **AI** | `ai-process`, `ai-eliminate` | Call Claude, auto-advance |
| **Display** | `reveal`, `announce`, `preview`, `leaderboard`, `reveal-one` | Show content, timer or host advances |
| **Competition** | `vote`, `eliminate`, `winner` | Scoring and elimination |
| **Control** | `foreach`, `team-split` | Orchestration (loops, grouping) |

## Key Design Decisions

### Why vanilla JS, no framework?
Target users are teachers who may self-host. Zero build step = `npm start` and go. Client files served as static assets.

### Why is server.js so large?
`handlePhase()` is a 900-line switch statement because each phase type has unique socket.io orchestration (different events, different state tracking, different advancement rules). The phase handlers in `engine/phases/` contain pure logic; the server contains the I/O wiring.

### Why in-memory state, no database?
Games are ephemeral (15-60 minutes). Rooms expire. No persistence needed. Reconnection uses a 30-second grace period with name-based lookup.

### Why config-driven instead of code?
The goal is that teachers build games in a visual editor. Configs are validated on save (30+ rules). The engine interprets them at runtime. Custom logic is opt-in via hooks.

### How does foreach work?
Foreach is an orchestrator phase that creates virtual sub-phases at runtime (`_fe:phaseId:subName`). It supports two scoring modes (correct/tally), self-exclusion, and AI injection for human-vs-AI games.

### How does AI game generation work?
`POST /api/games/generate-questions` runs a two-step flow: Sonnet first asks 2-4 clarifying questions (e.g. "Do players write one response or multiple?"), then `POST /api/games/generate` produces a config with those answers. After generation, the server auto-polishes: runs the light review, then auto-applies up to 4 non-error fixes via the fix-issue endpoint. Users get a cleaner config on first try.

### How does review + fix work?
- **Light review** (Haiku) runs automatically after save, flags vague instructions, missing timers, broken data flow
- **Deep review** (Sonnet) runs on "Check My Game", adds engagement and playability feedback
- **Apply Fix** (Haiku) — each non-error issue gets an "Apply Fix" button. Server sends only the target phase + list of other phase IDs (can't rename IDs, can't invent new refs, can't change phase type). Returns `{updatedPhase, explanation}`. Client shows a diff modal before committing.

### Why friendly tokens in the editor?
Teachers saw `{{_current.playerName}}` and got confused. Editor textareas now display `[Player's name]`, but the stored config keeps the `{{}}` syntax the engine expects. Translation is bidirectional via `tokenize`/`detokenize` in `editor.js`, triggered when `addVariableChips` / `addForeachVariableChips` attach to a textarea.

## What I'd Want Feedback On

1. **server.js monolith** - The central `handlePhase()` dispatcher is getting large. Is this the right seam to split on, or would extracting per-phase-type handlers into separate files add complexity without benefit?

2. **State management** - Phase-specific state (voteState, rankState, etc.) lives as ad-hoc properties on the room object. Should this be formalized?

3. **Testing gap** - Unit tests cover engine logic (264 tests). Integration tests are simulator scripts that require a running server. No true E2E browser tests. Is the simulator approach sufficient?

4. **Socket.io event surface** - ~30 event types with no schema validation on payloads. Events are stringly-typed. Is this a problem at this scale?

5. **Error handling** - Errors in handlePhase() are caught but the game may stall. Should there be a "skip to next phase on error" recovery mechanism?

6. **Scalability** - Currently single-process, in-memory. If this grows beyond one classroom (multiple teachers), what's the right first step?

## Running It

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-..." > .env   # optional, runs in mock mode without
npm start                                 # http://localhost:3000
npm test                                  # 264 tests, <1s
node scripts/test-all-games.js            # smoke test all 15 games (needs server running)
```

## Stats

- **~20K lines** across JS, HTML, CSS, JSON
- **19 phase types**, **~17 working games**, **266 unit tests**
- **Dependencies:** Express 5, Socket.io, Anthropic SDK, Vitest (dev)
- **AI:** Claude Haiku 4.5 for gameplay/light review/fix-issue, Sonnet for game generation/deep review
