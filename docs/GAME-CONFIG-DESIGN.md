# Game Config Design

## Design Goals

1. **Declarative over imperative** — config describes *what*, not *how*
2. **Small phase vocabulary** — 9 phase types cover most games
3. **Escape hatch without complexity** — hooks are named functions, not inline code
4. **Testable** — every hook is a pure function with clear inputs/outputs
5. **Readable** — a teacher should understand the game flow from config alone

## Phase Types (9 total)

### 1. `lobby`
Wait for players to join. Host manually starts the game.

```json
{
  "type": "lobby",
  "minPlayers": 2,
  "next": "round1"
}
```

### 2. `collect`
Gather text responses from players.

```json
{
  "type": "collect",
  "prompt": "What did you do this weekend?",
  "timer": 60,
  "from": "remaining",
  "next": "process"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| prompt | string | required | Question shown to players |
| timer | number | null | Seconds until auto-close (null = manual) |
| timerWarning | number | 5 | Seconds before timer expires to show warning |
| from | "all" \| "remaining" \| "eliminated" | "remaining" | Who can submit |

**Outputs:** `responses` — array of `{ playerId, name, text }`

### 3. `ai-process`
Send collected data to AI with an instruction.

```json
{
  "type": "ai-process",
  "instruction": "Write a funny 4-line poem combining these weekend activities.",
  "input": "collect.responses",
  "format": "text",
  "next": "reveal"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| instruction | string | required | What to tell the AI |
| input | string | required | Reference to data (phase.field) |
| format | "text" \| "json" | "text" | Expected response format |

**Outputs:** `result` — string (text) or parsed object (json)

### 4. `vote`
Players vote on options.

```json
{
  "type": "vote",
  "mode": "head-to-head",
  "candidates": "collect.responses",
  "voters": "all",
  "timer": 30,
  "next": "tally"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| mode | "head-to-head" \| "pick-one" | required | Voting style |
| candidates | string | required | Reference to voteable items |
| voters | "all" \| "remaining" \| "eliminated" | "all" | Who can vote |
| timer | number | null | Seconds per vote (head-to-head) or total (pick-one) |
| timerWarning | number | 5 | Seconds before timer expires to show warning |

**Head-to-head mode:** Each answer is seen ~3 times. Comparisons = `ceil(candidates * 3 / 2)`. Matchups randomized per voter.

**Outputs:** `votes` — array of `{ voterId, choice }`, `scores` — map of candidateId → vote count

### 5. `eliminate`
Remove players based on criteria.

```json
{
  "type": "eliminate",
  "method": "bottom-percent",
  "percent": 60,
  "next": "final-round"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| method | "bottom-percent" \| "hook" | required | Elimination strategy |
| percent | number | — | For bottom-percent: what % to eliminate |
| hook | string | — | For hook: function name in hooks.js |
| input | string | — | For hook: data to pass to function |

**Outputs:** `eliminated` — array of playerIds removed this phase

### 6. `reveal`
Display content to all players.

```json
{
  "type": "reveal",
  "template": "Here's your class poem:\n\n{{ai.result}}",
  "duration": 10,
  "next": "end"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| template | string | required | Text with `{{phase.field}}` placeholders (simple substitution only, no conditionals) |
| duration | number | null | Auto-advance after N seconds (null = manual) |

### 7. `preview`
Teacher-only preview before revealing to students. Players see "Waiting for teacher..." while the host reviews content. Teacher can approve, edit, or reject.

```json
{
  "type": "preview",
  "content": "process.result",
  "showResponses": true,
  "approveNext": "reveal",
  "rejectNext": "fallback"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| content | string | required | Reference to content to preview |
| showResponses | boolean | true | Also show original player responses |
| approveNext | string | required | Phase to go to if approved |
| rejectNext | string | required | Phase to go to if rejected |

**Host actions:**
- **Approve** — Continue to `approveNext` phase with content as-is
- **Edit** — Modify the content, then continue to `approveNext`
- **Reject** — Discard content and go to `rejectNext` phase

### 8. `winner`
Declare a winner and show final standings.

```json
{
  "type": "winner",
  "from": "vote.scores",
  "next": "end"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| from | string | required | Reference to scores/rankings |

### 9. `end`
Game over. Clean up and allow restart.

```json
{
  "type": "end",
  "message": "Thanks for playing!"
}
```

---

## Data References

Phases can reference outputs from earlier phases using `phaseName.field` syntax:

- `round1.responses` — responses from a collect phase named "round1"
- `judge.result` — AI result from an ai-process phase named "judge"
- `voting.scores` — vote tallies from a vote phase named "voting"

---

## Escape Hatch: Hooks

For logic that can't be expressed declaratively, games define hooks in `hooks.js`:

```javascript
// games/corn-story/hooks.js

export function eliminateDuplicates(context) {
  // context.input = AI result with grouped answers
  // context.players = current player list
  // Returns: array of playerIds to eliminate

  const groups = context.input;
  const toEliminate = [];

  for (const group of groups) {
    if (group.length > 1) {
      // Everyone in a duplicate group is eliminated
      toEliminate.push(...group.map(r => r.playerId));
    }
  }

  return toEliminate;
}
```

Hooks are:
- **Named exports** — called by name from config
- **Pure functions** — same input always gives same output
- **Testable** — import and test directly with Vitest
- **Limited scope** — only transform data, don't call AI or emit events

### Hook Signature

```typescript
type HookContext = {
  input: any;           // Data from config's "input" field
  players: Player[];    // All players
  remaining: Player[];  // Non-eliminated players
  eliminated: Player[]; // Eliminated players
  phases: PhaseData;    // All phase outputs so far
};

type Hook = (context: HookContext) => any;
```

---

## Example Configs

### Weekend Poem (Simple)

```json
{
  "name": "Weekend Poem",
  "description": "Share your weekend, get a class poem!",
  "phases": {
    "lobby": {
      "type": "lobby",
      "minPlayers": 3,
      "next": "collect"
    },
    "collect": {
      "type": "collect",
      "prompt": "What did you do this weekend?",
      "timer": 60,
      "next": "process"
    },
    "process": {
      "type": "ai-process",
      "instruction": "Write a funny 4-line poem that cleverly combines all these weekend activities. Be playful and creative!",
      "input": "collect.responses",
      "format": "text",
      "next": "reveal"
    },
    "reveal": {
      "type": "reveal",
      "template": "# Your Class Weekend Poem\n\n{{process.result}}",
      "next": "end"
    },
    "end": {
      "type": "end",
      "message": "Thanks for sharing your weekends!"
    }
  }
}
```

**No hooks needed** — entirely declarative.

---

### Mood Check (Simple)

```json
{
  "name": "Mood Check",
  "description": "How is everyone feeling today?",
  "phases": {
    "lobby": {
      "type": "lobby",
      "minPlayers": 2,
      "next": "collect"
    },
    "collect": {
      "type": "collect",
      "prompt": "How are you feeling today? (one word or short phrase)",
      "timer": 30,
      "next": "analyze"
    },
    "analyze": {
      "type": "ai-process",
      "instruction": "Summarize the overall mood of this class in 2-3 sentences. Note any patterns or outliers. Be warm and supportive.",
      "input": "collect.responses",
      "format": "text",
      "next": "reveal"
    },
    "reveal": {
      "type": "reveal",
      "template": "# Class Mood Check\n\n{{analyze.result}}\n\n---\n*{{collect.responses.length}} students checked in*",
      "next": "end"
    },
    "end": {
      "type": "end",
      "message": "Thanks for checking in!"
    }
  }
}
```

**No hooks needed.**

---

### Corn Story (Complex Multi-Round)

```json
{
  "name": "Corn Story",
  "description": "A 3-round elimination game of creativity!",
  "hooks": "./hooks.js",
  "phases": {
    "lobby": {
      "type": "lobby",
      "minPlayers": 4,
      "next": "round1-intro"
    },

    "round1-intro": {
      "type": "reveal",
      "template": "# Round 1: Don't Match!\n\nAnswer the question, but don't match anyone else's answer!\nIf two players give the same answer, BOTH are eliminated.",
      "duration": 5,
      "next": "round1-collect"
    },
    "round1-collect": {
      "type": "collect",
      "prompt": "What can you do with corn?",
      "timer": 50,
      "from": "remaining",
      "next": "round1-judge"
    },
    "round1-judge": {
      "type": "ai-process",
      "instruction": "Group these answers by semantic similarity. Two answers match if they describe essentially the same thing (e.g., 'eat it' and 'eating corn' match). Return a JSON array of arrays, where each inner array contains the playerIds whose answers match.",
      "input": "round1-collect.responses",
      "format": "json",
      "next": "round1-eliminate"
    },
    "round1-eliminate": {
      "type": "eliminate",
      "method": "hook",
      "hook": "eliminateDuplicates",
      "input": "round1-judge.result",
      "next": "round1-results"
    },
    "round1-results": {
      "type": "reveal",
      "template": "# Round 1 Results\n\n{{round1-eliminate.eliminated.length}} players eliminated for matching!\n\n{{remaining.length}} players advance to Round 2.",
      "duration": 5,
      "next": "round2-intro"
    },

    "round2-intro": {
      "type": "reveal",
      "template": "# Round 2: Be Creative!\n\nRemaining players: submit your most creative answer.\nThen EVERYONE votes head-to-head.\nBottom 60% will be eliminated!",
      "duration": 5,
      "next": "round2-collect"
    },
    "round2-collect": {
      "type": "collect",
      "prompt": "What is an alternative use for corn?",
      "timer": 50,
      "from": "remaining",
      "next": "round2-vote"
    },
    "round2-vote": {
      "type": "vote",
      "mode": "head-to-head",
      "candidates": "round2-collect.responses",
      "voters": "all",
      "timer": 15,
      "next": "round2-eliminate"
    },
    "round2-eliminate": {
      "type": "eliminate",
      "method": "bottom-percent",
      "percent": 60,
      "from": "round2-vote.scores",
      "next": "round2-results"
    },
    "round2-results": {
      "type": "reveal",
      "template": "# Round 2 Results\n\n{{round2-eliminate.eliminated.length}} players eliminated!\n\n{{remaining.length}} players advance to the Final Round!",
      "duration": 5,
      "next": "final-intro"
    },

    "final-intro": {
      "type": "reveal",
      "template": "# Final Round!\n\nFinalists: give us your BEST answer.\nEliminated players: YOU decide the winner!",
      "duration": 5,
      "next": "final-collect"
    },
    "final-collect": {
      "type": "collect",
      "prompt": "What is your ultimate creative use for corn?",
      "timer": 60,
      "from": "remaining",
      "next": "final-vote"
    },
    "final-vote": {
      "type": "vote",
      "mode": "pick-one",
      "candidates": "final-collect.responses",
      "voters": "eliminated",
      "timer": 30,
      "next": "crown"
    },
    "crown": {
      "type": "winner",
      "from": "final-vote.scores",
      "next": "end"
    },
    "end": {
      "type": "end",
      "message": "Thanks for playing Corn Story!"
    }
  }
}
```

**hooks.js:**
```javascript
// games/corn-story/hooks.js

/**
 * Eliminate players whose answers were grouped together by AI
 * @param {HookContext} context
 * @returns {string[]} Array of playerIds to eliminate
 */
export function eliminateDuplicates(context) {
  const groups = context.input; // AI returned: [[id1, id2], [id3], [id4, id5, id6]]
  const toEliminate = [];

  for (const group of groups) {
    if (group.length > 1) {
      // All players in a matching group are eliminated
      toEliminate.push(...group);
    }
  }

  return toEliminate;
}
```

---

## Design Decisions & Rationale

### Why named phases instead of an array?
Named phases allow data references like `round1.responses` which are more readable than index-based `phases[2].responses`.

### Why hooks in a separate file?
1. Keeps config.json pure JSON (no embedded code)
2. Hooks can be unit tested independently
3. Forces hook logic to be named and documented
4. Prevents config from becoming Turing-complete

### Why only 9 phase types?
Every phase type requires engine support (socket events, UI states, etc.). More types = more complexity. 9 types cover the three example games plus reasonable variations, including teacher moderation.

### What about phases not covered?
If you need something truly custom, you can:
1. Use `reveal` with manual advancement for pauses/intros
2. Chain multiple `ai-process` phases for complex AI work
3. Write a hook for custom elimination/scoring logic
4. Propose a new phase type if the pattern is reusable

### Why no conditional branching?
Conditionals (if/else in config) create implicit programming. Instead:
- Use hooks to prepare data (e.g., a hook can return different text based on conditions)
- Templates use simple `{{phase.field}}` substitution only — no conditionals
- Keep game flow linear; complexity lives in hooks

---

## Resolved Design Questions

1. **Template syntax**: Simple `{{phase.field}}` substitution only. No conditionals in templates — if you need conditional display, use a hook to prepare the data first. This keeps templates readable and testable.

2. **Timer behavior**: Players receive a warning before auto-submit. Configurable via `timerWarning` field (defaults to 5 seconds). When timer expires, any in-progress response is auto-submitted.

3. **Head-to-head voting**: Each answer should be seen approximately 3 times to ensure fair comparison. The engine calculates the number of comparisons based on candidate count: `comparisons = ceil(candidates * 3 / 2)`. Matchups are randomized per voter.

4. **AI JSON validation**: Validation and fallback rules will be defined in Prompt 2 (AI integration design).

5. **Hook testing**: Testing approach and fixtures will be defined in Prompt 4 (hook system implementation).

---

## Next Steps

1. Review this design with example games
2. Finalize template syntax
3. Implement phase handlers in engine
4. Build first simple game (Weekend Poem) end-to-end
5. Add hook support and build Corn Story
