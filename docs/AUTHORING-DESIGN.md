# Authoring Design

> **Status (2026-09-19):** the command-line tools this document specifies (`npm run validate`, `test:players`, `preview:ai`, `test:e2e`) were never built and their placeholder scripts are gone. What they promised exists elsewhere: config validation in `engine/game-loader.js` and the test suite, automatic playthroughs in `scripts/simulate-any-game.js` and the robot playtest (`services/simulator.js`), AI previews through the designer's Ask AI panel. The design thinking below still holds; read the commands as history.

How teachers and game designers create, validate, debug, and test new games.

---

## 1. Config Style Guide

### Naming Conventions

| Element | Convention | Examples |
|---------|------------|----------|
| Game folder | `kebab-case` | `weekend-poem`, `corn-story`, `mood-check` |
| Game ID | `kebab-case` | `weekend-poem`, `trivia-blast` |
| Phase IDs | `kebab-case`, descriptive | `round1-collect`, `final-vote`, `show-results` |
| Hook functions | `camelCase`, verb-first | `eliminateDuplicates`, `calculateScores` |
| Config files | lowercase | `config.json`, `hooks.js` |

### Phase ID Patterns

Use consistent prefixes for multi-round games:

```
Good:
  round1-intro, round1-collect, round1-judge, round1-results
  round2-intro, round2-collect, round2-vote, round2-results
  final-intro, final-collect, final-vote

Bad:
  r1intro, collectRound1, ROUND1_JUDGE, results1
```

### Recommended Defaults

```json
{
  "name": "My Game",
  "description": "One sentence about what players do",
  "minPlayers": 3,
  "maxPlayers": 30,
  "safety": {
    "contentFilter": "strict",
    "teacherPreview": true
  },
  "phases": { ... }
}
```

| Setting | Recommended Default | Why |
|---------|---------------------|-----|
| `minPlayers` | 3 | Games need enough variety |
| `maxPlayers` | 30 | Typical classroom size |
| `timer` | 60 seconds | Long enough to think, short enough to stay engaged |
| `timerWarning` | 5 seconds | Gives heads-up without stress |
| `contentFilter` | "strict" | Safe for all classrooms |
| `teacherPreview` | true | Always review AI output first |

### Keeping Configs Readable

**Do: Group related phases visually**

```json
{
  "phases": {
    "lobby": { ... },

    "round1-intro": { ... },
    "round1-collect": { ... },
    "round1-process": { ... },
    "round1-reveal": { ... },

    "round2-intro": { ... },
    "round2-collect": { ... },
    "round2-vote": { ... },
    "round2-reveal": { ... },

    "end": { ... }
  }
}
```

**Do: Use meaningful phase names that describe what happens**

```json
"analyze-mood": {
  "type": "ai-process",
  "instruction": "Summarize the class mood..."
}
```

**Don't: Use generic or numbered names**

```json
"phase3": {
  "type": "ai-process",
  "instruction": "..."
}
```

**Do: Put instructions on one line if short, multiple lines if long**

```json
// Short - one line
"instruction": "Write a 4-line poem combining these activities."

// Long - use template literal in hooks.js instead, or accept the long line
"instruction": "Group these answers by semantic similarity. Two answers match if they describe essentially the same thing (e.g., 'eat it' and 'eating corn' match). Return a JSON array."
```

### Good vs Bad Config Patterns

**Good: Linear flow, clear naming**
```json
{
  "phases": {
    "lobby": { "type": "lobby", "next": "collect" },
    "collect": { "type": "collect", "next": "process" },
    "process": { "type": "ai-process", "next": "preview" },
    "preview": { "type": "preview", "approveNext": "reveal", "rejectNext": "fallback" },
    "reveal": { "type": "reveal", "next": "end" },
    "fallback": { "type": "reveal", "template": "Let's try again!", "next": "collect" },
    "end": { "type": "end" }
  }
}
```

**Bad: Confusing jumps, unclear names**
```json
{
  "phases": {
    "p1": { "type": "lobby", "next": "p2" },
    "p2": { "type": "collect", "next": "p5" },
    "p5": { "type": "ai-process", "next": "p3" },
    "p3": { "type": "reveal", "next": "p4" },
    "p4": { "type": "end" }
  }
}
```

**Good: Explicit about what data flows where**
```json
{
  "collect-answers": {
    "type": "collect",
    "prompt": "What can you do with corn?",
    "next": "judge-answers"
  },
  "judge-answers": {
    "type": "ai-process",
    "input": "collect-answers.responses",
    "next": "eliminate-duplicates"
  },
  "eliminate-duplicates": {
    "type": "eliminate",
    "input": "judge-answers.result",
    "next": "show-results"
  }
}
```

**Bad: Unclear data references**
```json
{
  "step1": { "type": "collect", "next": "step2" },
  "step2": { "type": "ai-process", "input": "responses", "next": "step3" }
}
```

---

## 2. Validation Approach

### When Validation Runs

1. **On server start**: All games in `games/` folder are validated
2. **On game load**: When teacher selects a game
3. **On config change**: Hot reload in development mode

### Human-Readable Error Messages

The validator produces friendly errors, not JSON path gibberish.

**Instead of:**
```
Error: Invalid type at $.phases.lobby.minPlayers - expected number, got string
```

**We show:**
```
Config Error in "weekend-poem":

  In phase "lobby":
    minPlayers must be a number, but got "three"

  Suggestion: Use minPlayers: 3 instead of minPlayers: "three"
```

### Error Message Format

```javascript
class ConfigError {
  constructor({ game, phase, field, message, suggestion }) {
    this.game = game;
    this.phase = phase;
    this.field = field;
    this.message = message;
    this.suggestion = suggestion;
  }

  toString() {
    let result = `Config Error in "${this.game}":\n\n`;
    if (this.phase) {
      result += `  In phase "${this.phase}":\n`;
    }
    result += `    ${this.message}\n`;
    if (this.suggestion) {
      result += `\n  Suggestion: ${this.suggestion}\n`;
    }
    return result;
  }
}
```

### Common Mistakes and How We Catch Them

| Mistake | Detection | Error Message |
|---------|-----------|---------------|
| Missing `next` on non-end phase | Check all phases except `end` have `next` | `Phase "collect" has no "next" - game would get stuck here` |
| `next` points to non-existent phase | Check all `next` values exist in phases | `Phase "collect" points to "proccess" which doesn't exist. Did you mean "process"?` |
| Circular reference (A→B→A) | Graph cycle detection | `Circular flow detected: collect → process → collect. Games must eventually reach "end"` |
| No path to `end` | Reachability analysis | `Phase "bonus-round" can never reach "end" - it's orphaned` |
| Wrong type for field | Type checking | `timer must be a number (seconds), but got "60 seconds"` |
| Missing required field | Required field check | `Phase "collect" is missing required field "prompt"` |
| Unknown phase type | Enum check | `Unknown phase type "proccess". Valid types: lobby, collect, ai-process, vote, eliminate, reveal, preview, winner, end` |
| Hook referenced but not exported | Hook file check | `Hook "eliminateDups" not found in hooks.js. Available hooks: eliminateDuplicates, calculateBonus` |
| Data reference to non-existent phase | Reference check | `"judge.result" references phase "judge" which doesn't exist` |
| Data reference to wrong output | Output check | `Phase "lobby" doesn't output "responses". Collect phases output responses.` |

### JSON Schema (Simplified)

```javascript
const gameConfigSchema = {
  type: 'object',
  required: ['name', 'phases'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 50 },
    description: { type: 'string', maxLength: 200 },
    minPlayers: { type: 'number', minimum: 1, maximum: 100, default: 2 },
    maxPlayers: { type: 'number', minimum: 1, maximum: 100, default: 50 },
    hooks: { type: 'string' }, // Path to hooks.js
    safety: {
      type: 'object',
      properties: {
        contentFilter: { enum: ['strict', 'moderate', 'off'], default: 'strict' },
        teacherPreview: { type: 'boolean', default: true },
        anonymousMode: { type: 'boolean', default: false }
      }
    },
    phases: {
      type: 'object',
      additionalProperties: { $ref: '#/definitions/phase' }
    }
  }
};

const phaseSchemas = {
  lobby: {
    required: ['type', 'next'],
    properties: {
      type: { const: 'lobby' },
      minPlayers: { type: 'number', default: 2 },
      next: { type: 'string' }
    }
  },
  collect: {
    required: ['type', 'prompt', 'next'],
    properties: {
      type: { const: 'collect' },
      prompt: { type: 'string' },
      timer: { type: 'number', minimum: 5, maximum: 300 },
      timerWarning: { type: 'number', default: 5 },
      from: { enum: ['all', 'remaining', 'eliminated'], default: 'remaining' },
      next: { type: 'string' }
    }
  },
  // ... other phase types
};
```

### Validation Implementation

```javascript
// services/config-validator.js

export function validateGameConfig(config, hooksModule = null) {
  const errors = [];

  // Basic structure
  if (!config.name) {
    errors.push(new ConfigError({
      game: config.name || 'unknown',
      message: 'Game must have a name'
    }));
  }

  if (!config.phases || Object.keys(config.phases).length === 0) {
    errors.push(new ConfigError({
      game: config.name,
      message: 'Game must have at least one phase'
    }));
    return errors; // Can't continue without phases
  }

  // Must have lobby and end
  if (!config.phases.lobby) {
    errors.push(new ConfigError({
      game: config.name,
      message: 'Game must have a "lobby" phase',
      suggestion: 'Add a lobby phase where players join'
    }));
  }

  if (!config.phases.end) {
    errors.push(new ConfigError({
      game: config.name,
      message: 'Game must have an "end" phase',
      suggestion: 'Add an end phase to finish the game'
    }));
  }

  // Validate each phase
  for (const [phaseId, phase] of Object.entries(config.phases)) {
    errors.push(...validatePhase(config.name, phaseId, phase, config.phases));
  }

  // Check flow reaches end
  const unreachable = findUnreachablePhases(config.phases);
  for (const phaseId of unreachable) {
    errors.push(new ConfigError({
      game: config.name,
      phase: phaseId,
      message: `This phase is never reached from lobby`,
      suggestion: 'Check your "next" values or remove this phase'
    }));
  }

  // Check hooks exist if referenced
  if (config.hooks && hooksModule) {
    errors.push(...validateHooks(config, hooksModule));
  }

  return errors;
}

function validatePhase(gameName, phaseId, phase, allPhases) {
  const errors = [];

  // Check type is valid
  const validTypes = ['lobby', 'collect', 'ai-process', 'vote', 'eliminate', 'reveal', 'preview', 'winner', 'end'];
  if (!validTypes.includes(phase.type)) {
    const suggestion = findSimilar(phase.type, validTypes);
    errors.push(new ConfigError({
      game: gameName,
      phase: phaseId,
      message: `Unknown phase type "${phase.type}"`,
      suggestion: suggestion ? `Did you mean "${suggestion}"?` : `Valid types: ${validTypes.join(', ')}`
    }));
    return errors;
  }

  // Check next exists (except for end)
  if (phase.type !== 'end' && phase.next) {
    if (!allPhases[phase.next]) {
      const suggestion = findSimilar(phase.next, Object.keys(allPhases));
      errors.push(new ConfigError({
        game: gameName,
        phase: phaseId,
        field: 'next',
        message: `Points to "${phase.next}" which doesn't exist`,
        suggestion: suggestion ? `Did you mean "${suggestion}"?` : null
      }));
    }
  }

  // Type-specific validation
  // ... (check required fields for each type)

  return errors;
}

function findSimilar(input, options) {
  // Simple Levenshtein distance for typo detection
  for (const option of options) {
    if (levenshtein(input.toLowerCase(), option.toLowerCase()) <= 2) {
      return option;
    }
  }
  return null;
}
```

---

## 3. Debug Mode

### What Debug Mode Shows

A debug panel visible only to the host (teacher) showing real-time game state.

```
+------------------------------------------------------------------+
| DEBUG MODE                                            [Hide Debug] |
+------------------------------------------------------------------+
| Room: ABCD                    Players: 6/30                       |
| Game: weekend-poem            Status: running                     |
+------------------------------------------------------------------+
| CURRENT PHASE                                                     |
|   Name: collect                                                   |
|   Type: collect                                                   |
|   Timer: 45s remaining                                            |
|   Submissions: 4/6                                                |
+------------------------------------------------------------------+
| LAST TRANSITION                                                   |
|   From: lobby → collect                                           |
|   Trigger: host clicked "Start Game"                              |
|   Time: 2 minutes ago                                             |
+------------------------------------------------------------------+
| PHASE DATA                                                        |
|   lobby: { players: 6 }                                           |
|   collect: { responses: 4, pending: 2 }                           |
+------------------------------------------------------------------+
| AI REQUESTS (click to expand)                                     |
|   [+] process (pending...)                                        |
+------------------------------------------------------------------+
```

### Expanded AI Request View

```
+------------------------------------------------------------------+
| AI REQUEST: process                                               |
+------------------------------------------------------------------+
| Task: generate                                                    |
| Model: claude-3-haiku-20240307                                    |
| Status: completed (1.2s)                                          |
+------------------------------------------------------------------+
| INPUT (sent to AI):                                               |
|   {                                                               |
|     "instruction": "Write a funny 4-line poem...",                |
|     "responses": [                                                |
|       { "name": "Alex", "text": "played soccer" },                |
|       { "name": "Jordan", "text": "watched movies" },             |
|       ...                                                         |
|     ]                                                             |
|   }                                                               |
+------------------------------------------------------------------+
| OUTPUT (from AI):                                                 |
|   {                                                               |
|     "content": "On weekends we rest and play...",                 |
|     "title": "The Weekend Song",                                  |
|     "references": ["Alex", "Jordan"]                              |
|   }                                                               |
+------------------------------------------------------------------+
| VALIDATION: passed                                                |
+------------------------------------------------------------------+
```

### How to Enable Debug Mode

**Option 1: URL parameter**
```
http://localhost:3000/host?debug=true
```

**Option 2: Keyboard shortcut (host only)**
```
Press Ctrl+Shift+D on host screen
```

**Option 3: Environment variable (development)**
```bash
DEBUG_MODE=true npm start
```

### Implementation

```javascript
// Host screen debug panel
class DebugPanel {
  constructor(socket) {
    this.socket = socket;
    this.visible = false;
    this.data = {
      room: null,
      phase: null,
      lastTransition: null,
      phaseData: {},
      aiRequests: []
    };

    // Listen for debug events
    socket.on('debug:state', (state) => this.updateState(state));
    socket.on('debug:transition', (t) => this.logTransition(t));
    socket.on('debug:ai-request', (req) => this.logAIRequest(req));
    socket.on('debug:ai-response', (res) => this.updateAIResponse(res));
  }

  toggle() {
    this.visible = !this.visible;
    this.render();
  }

  render() {
    if (!this.visible) {
      this.element.style.display = 'none';
      return;
    }
    // Render debug panel HTML...
  }
}

// Server-side debug events
function emitDebugState(room) {
  if (!room.debugMode) return;

  const hostSocket = io.sockets.sockets.get(room.hostSocketId);
  if (hostSocket) {
    hostSocket.emit('debug:state', {
      roomCode: room.code,
      phase: room.stateMachine.current,
      phaseConfig: room.currentPhaseConfig,
      playerCount: room.playerRegistry.count(),
      phaseData: room.phaseData
    });
  }
}
```

### What Teachers See vs Developers

| Information | Teacher (Debug Mode) | Developer (Console) |
|-------------|---------------------|---------------------|
| Current phase | Yes | Yes |
| Player count | Yes | Yes |
| Submissions count | Yes | Yes |
| AI request/response | Yes (formatted) | Yes (raw JSON) |
| Transition reason | Yes (friendly) | Yes (detailed) |
| Error stack traces | No | Yes |
| Socket event names | No | Yes |
| Performance metrics | No | Yes |
| Full phase data | Summary | Full objects |

---

## 4. Testing a New Game

### Local Testing Workflow

```bash
# 1. Create your game
cp -r games/_template games/my-game
# Edit games/my-game/config.json

# 2. Validate config
npm run validate games/my-game

# 3. Start server with mock AI
MOCK_AI=true npm start

# 4. Open test URLs
#    Host: http://localhost:3000/host?game=my-game&debug=true
#    Players: http://localhost:3000/player (open 3+ tabs)

# 5. Play through the game
```

### Mock Player Mode

Simulate multiple players without opening browser tabs.

```bash
# Start with mock players
npm run test:players -- --game=my-game --count=5

# Or via URL
http://localhost:3000/host?game=my-game&mockPlayers=5
```

**Mock player behavior:**
- Auto-join with names: "Test Player 1", "Test Player 2", etc.
- Submit random responses from a sample pool
- Vote randomly in voting phases
- Configurable response delay (simulates real typing)

```javascript
// Mock player configuration
const mockPlayerConfig = {
  count: 5,
  joinDelay: 500,        // ms between joins
  responseDelay: 2000,   // ms to "think" before submitting
  responses: [
    "played video games",
    "went to the park",
    "watched a movie",
    "had pizza for dinner",
    "visited grandma"
  ]
};
```

### Fast-Forward Mode

Skip or shorten timers for rapid testing.

```bash
# URL parameter
http://localhost:3000/host?game=my-game&fastForward=true

# Or keyboard shortcut on host
Press F (when timer is running) to skip to 5 seconds remaining
Press Shift+F to end timer immediately
```

**Fast-forward behavior:**
- All timers run at 10x speed
- 60-second timer becomes 6 seconds
- Timer warning still triggers at appropriate relative time
- Manual transitions still require button click

### AI Response Preview

See what AI will generate before running the full game.

```bash
# Preview AI for a specific phase
npm run preview:ai -- --game=my-game --phase=process

# With sample responses
npm run preview:ai -- --game=my-game --phase=process --responses=sample.json
```

**Sample responses file:**
```json
{
  "responses": [
    { "name": "Alex", "text": "I played soccer all weekend" },
    { "name": "Jordan", "text": "Watched three movies" },
    { "name": "Sam", "text": "Helped my mom cook dinner" }
  ]
}
```

**Preview output:**
```
AI Preview for "weekend-poem" phase "process"
============================================

Task Type: generate
Model: claude-3-haiku-20240307

Input (3 responses):
  - Alex: "I played soccer all weekend"
  - Jordan: "Watched three movies"
  - Sam: "Helped my mom cook dinner"

Calling AI...

Response (1.3s):
{
  "content": "From soccer fields to movie nights,\n
              And cooking up delights,\n
              Our weekends flew on by,\n
              Beneath the autumn sky!",
  "title": "Weekend Adventures",
  "references": ["Alex", "Jordan", "Sam"]
}

Validation: PASSED
```

### Test Checklist

Before using with students:

```markdown
## Pre-Launch Checklist for [Game Name]

### Config Validation
- [ ] `npm run validate` passes with no errors
- [ ] All phases have valid `next` references
- [ ] All data references point to existing phases

### Flow Testing
- [ ] Can complete game from lobby to end
- [ ] All transitions work (no stuck states)
- [ ] Timer warnings appear at correct time
- [ ] Timer auto-submit works

### AI Testing
- [ ] AI responses are appropriate for classroom
- [ ] AI handles empty/minimal responses gracefully
- [ ] AI handles unusual responses without crashing
- [ ] Preview mode shows expected output

### Safety Testing
- [ ] Content filter blocks test profanity
- [ ] Teacher preview appears before reveal
- [ ] Can hide individual responses
- [ ] Can kick a player

### Edge Cases
- [ ] Works with minimum players (e.g., 3)
- [ ] Works with maximum players (e.g., 30)
- [ ] Handles player disconnect mid-game
- [ ] Handles host disconnect (shows error to players)

### Polish
- [ ] All prompts are clear and classroom-appropriate
- [ ] Reveal templates display nicely
- [ ] End message is friendly
```

### Testing Commands Summary

```bash
# Validate config
npm run validate games/my-game

# Start with debug mode
DEBUG_MODE=true npm start

# Start with mock AI (no API calls)
MOCK_AI=true npm start

# Start with mock players
npm run test:players -- --game=my-game --count=5

# Preview AI output
npm run preview:ai -- --game=my-game --phase=process

# Run all game tests
npm test -- --grep="my-game"

# Fast full test (mock everything)
MOCK_AI=true npm run test:e2e -- --game=my-game --fast
```

---

## Implementation Notes

### Config Validator (Priority: High)

```javascript
// services/config-validator.js

export async function validateGame(gamePath) {
  const configPath = path.join(gamePath, 'config.json');
  const hooksPath = path.join(gamePath, 'hooks.js');

  // Load config
  let config;
  try {
    config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
  } catch (e) {
    return [new ConfigError({
      game: path.basename(gamePath),
      message: `Could not parse config.json: ${e.message}`
    })];
  }

  // Load hooks if referenced
  let hooks = null;
  if (config.hooks) {
    try {
      hooks = await import(hooksPath);
    } catch (e) {
      return [new ConfigError({
        game: config.name,
        message: `Could not load hooks.js: ${e.message}`
      })];
    }
  }

  return validateGameConfig(config, hooks);
}
```

### Debug Event Emitter (Priority: Medium)

```javascript
// engine/debug-emitter.js

export class DebugEmitter {
  constructor(io, room) {
    this.io = io;
    this.room = room;
    this.enabled = room.debugMode;
  }

  transition(from, to, trigger) {
    if (!this.enabled) return;
    this.emit('debug:transition', {
      from,
      to,
      trigger,
      timestamp: Date.now()
    });
  }

  aiRequest(phaseId, input) {
    if (!this.enabled) return;
    this.emit('debug:ai-request', {
      phaseId,
      input: this.summarize(input),
      timestamp: Date.now()
    });
  }

  aiResponse(phaseId, output, duration) {
    if (!this.enabled) return;
    this.emit('debug:ai-response', {
      phaseId,
      output: this.summarize(output),
      duration,
      timestamp: Date.now()
    });
  }

  emit(event, data) {
    const hostSocket = this.io.sockets.sockets.get(this.room.hostSocketId);
    if (hostSocket) {
      hostSocket.emit(event, data);
    }
  }

  summarize(obj) {
    // Truncate long strings, limit array lengths for display
    return JSON.parse(JSON.stringify(obj, (key, value) => {
      if (typeof value === 'string' && value.length > 200) {
        return value.substring(0, 200) + '...';
      }
      if (Array.isArray(value) && value.length > 10) {
        return [...value.slice(0, 10), `... and ${value.length - 10} more`];
      }
      return value;
    }));
  }
}
```

### Mock Player Service (Priority: Low)

```javascript
// services/mock-players.js

export class MockPlayerService {
  constructor(io, roomCode, config) {
    this.io = io;
    this.roomCode = roomCode;
    this.config = config;
    this.players = [];
  }

  async start() {
    for (let i = 0; i < this.config.count; i++) {
      await this.delay(this.config.joinDelay);
      this.addPlayer(i + 1);
    }
  }

  addPlayer(num) {
    const socket = this.io.connect();
    socket.emit('join-room', {
      code: this.roomCode,
      name: `Test Player ${num}`
    });

    socket.on('game-started', async () => {
      await this.delay(this.config.responseDelay);
      const response = this.randomResponse();
      socket.emit('submit-response', {
        code: this.roomCode,
        response
      });
    });

    this.players.push(socket);
  }

  randomResponse() {
    const responses = this.config.responses;
    return responses[Math.floor(Math.random() * responses.length)];
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop() {
    for (const socket of this.players) {
      socket.disconnect();
    }
  }
}
```
