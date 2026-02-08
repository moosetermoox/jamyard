# Corn Story Feasibility Analysis

This document analyzes whether Corn Story can be built with the current design, identifies required engine features, and recommends a build order.

## Corn Story Requirements Summary

**Round 1 (Don't Match):**
- Remaining players submit answers
- AI groups semantically similar answers (JSON output)
- Hook eliminates all players in matching groups

**Round 2 (Creativity Vote):**
- Remaining players submit answers
- ALL players vote head-to-head (~3 comparisons each)
- Bottom 60% eliminated by vote score

**Final Round:**
- Remaining players submit answers
- ONLY eliminated players vote (pick-one)
- Winner declared from vote scores

---

## Features Required Beyond Weekend Poem

### Weekend Poem Uses:
- `lobby` phase
- `collect` phase (all players)
- `ai-process` phase (text output)
- `reveal` phase (simple template)
- `end` phase

### Corn Story Additionally Needs:

| Feature | Weekend Poem | Corn Story |
|---------|--------------|------------|
| Player elimination tracking | No | Yes |
| Hook execution | No | Yes (eliminateDuplicates) |
| AI JSON output | No | Yes (grouped answers) |
| Head-to-head voting | No | Yes |
| Pick-one voting | No | Yes |
| Voter restrictions | No | Yes (eliminated-only) |
| Submitter restrictions | No | Yes (remaining-only) |
| Multiple rounds | No | Yes (3 rounds) |
| Winner declaration | No | Yes |
| Dynamic template data | Basic | Advanced (remaining.length) |

---

## Must-Have Primitives

### 1. Player State Tracking (Remaining vs Eliminated)

**What it does:** Maintains two lists of players throughout the game. When a player is eliminated, they move from `remaining` to `eliminated`. Both lists persist across phases.

**Integration with existing design:**
- PlayerRegistry already tracks players
- Add `status` field to player object: `"active"` | `"eliminated"`
- Engine maintains derived lists: `getRemaining()`, `getEliminated()`
- Phases use these lists for `from` and `voters` fields

**How to test:**
```javascript
test('eliminating player moves them to eliminated list', () => {
  registry.addPlayer('p1', 'Alice');
  registry.addPlayer('p2', 'Bob');
  registry.eliminate('p1');

  expect(registry.getRemaining()).toHaveLength(1);
  expect(registry.getEliminated()).toHaveLength(1);
  expect(registry.getEliminated()[0].id).toBe('p1');
});
```

---

### 2. Hooks System

**What it does:** Loads and executes named functions from `hooks.js` in a game folder. Hooks receive context (input data, player lists, phase outputs) and return transformed data.

**Integration with existing design:**
- Games with hooks declare `"hooks": "./hooks.js"` in config.json
- Engine dynamically imports hooks file when game loads
- `eliminate` phase with `method: "hook"` calls the named function
- Hook receives `HookContext` as defined in GAME-CONFIG-DESIGN.md

**How to test:**
```javascript
// Test hook in isolation
import { eliminateDuplicates } from '../games/corn-story/hooks.js';

test('eliminateDuplicates removes players in matching groups', () => {
  const context = {
    input: [['p1', 'p2'], ['p3']],  // p1 and p2 matched
    players: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
    remaining: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
    eliminated: [],
    phases: {}
  };

  const result = eliminateDuplicates(context);
  expect(result).toEqual(['p1', 'p2']);
});
```

---

### 3. AI JSON Output with Validation

**What it does:** When `ai-process` has `format: "json"`, the AI returns structured data that gets parsed and validated. Fallback behavior handles parse errors.

**Integration with existing design:**
- AIService already exists
- Add JSON mode to AI prompts (system prompt tells AI to return JSON)
- Parse response, handle errors gracefully
- Store parsed object in `phase.result`
- Per AI-TASK-DESIGN.md, use 3 retry attempts before fallback

**How to test:**
```javascript
test('ai-process parses valid JSON response', async () => {
  const mockResponse = '[["p1", "p2"], ["p3"]]';
  aiService.setMockResponse(mockResponse);

  const result = await engine.runAiProcess({
    instruction: 'Group similar answers',
    input: responses,
    format: 'json'
  });

  expect(result).toEqual([['p1', 'p2'], ['p3']]);
});

test('ai-process handles invalid JSON with fallback', async () => {
  aiService.setMockResponse('This is not JSON');

  const result = await engine.runAiProcess({
    instruction: 'Group similar answers',
    input: responses,
    format: 'json'
  });

  // Fallback: treat each player as unique group
  expect(result).toEqual([['p1'], ['p2'], ['p3']]);
});
```

---

### 4. Eliminate Phase Handler

**What it does:** Executes elimination logic based on `method` field. For `bottom-percent`, eliminates lowest-scoring players. For `hook`, calls the named hook function.

**Integration with existing design:**
- StateMachine needs new phase handler for `eliminate`
- Handler reads `method` and routes to appropriate logic
- Updates PlayerRegistry with eliminated players
- Emits event with elimination results

**How to test:**
```javascript
test('eliminate phase with bottom-percent removes correct players', () => {
  // 5 players, bottom 60% = 3 eliminated
  const scores = { p1: 10, p2: 8, p3: 5, p4: 3, p5: 1 };

  const eliminated = engine.runEliminate({
    method: 'bottom-percent',
    percent: 60,
    from: scores
  });

  expect(eliminated).toContain('p3');
  expect(eliminated).toContain('p4');
  expect(eliminated).toContain('p5');
  expect(eliminated).not.toContain('p1');
  expect(eliminated).not.toContain('p2');
});

test('eliminate phase with hook calls named function', () => {
  const hookResult = engine.runEliminate({
    method: 'hook',
    hook: 'eliminateDuplicates',
    input: [['p1', 'p2'], ['p3']]
  });

  expect(hookResult).toEqual(['p1', 'p2']);
});
```

---

### 5. Vote Phase Handler (Head-to-Head Mode)

**What it does:** Shows each voter a series of A/B comparisons. Each candidate appears ~3 times. Votes are tallied into scores.

**Integration with existing design:**
- StateMachine needs new phase handler for `vote`
- Server generates matchup pairs for each voter
- Player UI shows two options, player picks one
- Scores accumulated: `scores[candidateId]++` for each vote
- Timer per comparison (not total)

**How to test:**
```javascript
test('head-to-head generates fair matchups', () => {
  const candidates = ['c1', 'c2', 'c3', 'c4'];
  const matchups = engine.generateMatchups(candidates, 3);

  // Each candidate should appear ~3 times
  const appearances = { c1: 0, c2: 0, c3: 0, c4: 0 };
  matchups.forEach(([a, b]) => {
    appearances[a]++;
    appearances[b]++;
  });

  Object.values(appearances).forEach(count => {
    expect(count).toBeGreaterThanOrEqual(2);
    expect(count).toBeLessThanOrEqual(4);
  });
});

test('head-to-head tallies votes correctly', () => {
  const votes = [
    { voterId: 'v1', matchup: ['c1', 'c2'], choice: 'c1' },
    { voterId: 'v2', matchup: ['c1', 'c2'], choice: 'c2' },
    { voterId: 'v3', matchup: ['c1', 'c3'], choice: 'c1' },
  ];

  const scores = engine.tallyVotes(votes);
  expect(scores.c1).toBe(2);
  expect(scores.c2).toBe(1);
  expect(scores.c3).toBe(0);
});
```

---

### 6. Vote Phase Handler (Pick-One Mode)

**What it does:** Shows all candidates to voters. Each voter picks one. Simple plurality vote.

**Integration with existing design:**
- Same `vote` phase handler, different UI branch
- All candidates displayed at once
- Each voter gets one vote
- Timer for entire voting period

**How to test:**
```javascript
test('pick-one tallies single votes', () => {
  const votes = [
    { voterId: 'v1', choice: 'c1' },
    { voterId: 'v2', choice: 'c2' },
    { voterId: 'v3', choice: 'c1' },
  ];

  const scores = engine.tallyPickOneVotes(votes);
  expect(scores.c1).toBe(2);
  expect(scores.c2).toBe(1);
});
```

---

### 7. Winner Phase Handler

**What it does:** Determines winner from scores, displays final standings.

**Integration with existing design:**
- StateMachine needs handler for `winner`
- Reads scores from referenced phase
- Finds highest score, handles ties (first player wins, or random)
- Emits winner event with player info

**How to test:**
```javascript
test('winner phase identifies highest scorer', () => {
  const scores = { p1: 5, p2: 8, p3: 3 };
  const winner = engine.determineWinner(scores);

  expect(winner).toBe('p2');
});

test('winner phase handles ties', () => {
  const scores = { p1: 5, p2: 5, p3: 3 };
  const winner = engine.determineWinner(scores);

  // Either p1 or p2 acceptable
  expect(['p1', 'p2']).toContain(winner);
});
```

---

### 8. Data Reference System

**What it does:** Resolves `phaseName.field` references to actual data from completed phases.

**Integration with existing design:**
- Engine stores each phase's output in a map: `phaseOutputs[phaseName] = result`
- Template engine resolves `{{phase.field}}` at render time
- Phase configs that need data (e.g., `input: "round1.responses"`) use resolver

**How to test:**
```javascript
test('resolves phase.field references', () => {
  const outputs = {
    collect: { responses: [{ text: 'hello' }] },
    process: { result: 'A poem about hello' }
  };

  expect(engine.resolve('collect.responses', outputs)).toEqual([{ text: 'hello' }]);
  expect(engine.resolve('process.result', outputs)).toBe('A poem about hello');
});

test('resolves nested field references', () => {
  const outputs = {
    vote: { scores: { p1: 5, p2: 3 } }
  };

  expect(engine.resolve('vote.scores', outputs)).toEqual({ p1: 5, p2: 3 });
});
```

---

### 9. Player Subset Collection (from: remaining/eliminated)

**What it does:** Collect phase only shows prompt to players in specified subset.

**Integration with existing design:**
- Collect phase handler checks `from` field
- Emits prompt event only to matching player sockets
- Other players see "Waiting for other players..." message

**How to test:**
```javascript
test('collect with from=remaining only prompts active players', () => {
  engine.addPlayers(['p1', 'p2', 'p3']);
  engine.eliminate('p3');

  const prompted = engine.getPlayersForCollect({ from: 'remaining' });
  expect(prompted.map(p => p.id)).toEqual(['p1', 'p2']);
});
```

---

### 10. Voter Subset (voters: eliminated)

**What it does:** Vote phase only allows specified subset to vote.

**Integration with existing design:**
- Vote phase handler checks `voters` field
- Emits vote prompt only to matching player sockets
- Other players see candidates but cannot vote

**How to test:**
```javascript
test('vote with voters=eliminated only counts eliminated player votes', () => {
  engine.addPlayers(['p1', 'p2', 'p3']);
  engine.eliminate('p3');

  const voters = engine.getVotersForVote({ voters: 'eliminated' });
  expect(voters.map(p => p.id)).toEqual(['p3']);
});
```

---

## Optional Enhancements

These would improve the experience but aren't blocking:

### 1. Timer Warning System
- Show countdown at timerWarning seconds before expiry
- Visual/audio alert to players
- Can ship without and add later

### 2. Elimination Animations
- Visual feedback when players are eliminated
- Dramatic reveal of who's out
- Pure UI polish, not engine logic

### 3. Live Leaderboard
- Show current standings between rounds
- Helps spectators follow along
- Could be a reveal template, not new phase type

### 4. Reconnection for Eliminated Players
- Currently eliminated players could leave and rejoin
- Need to restore their eliminated status
- Edge case, can defer

---

## Hook-Based Custom Code

Only one hook needed for Corn Story:

### eliminateDuplicates
- **Purpose:** Convert AI groupings into list of playerIds to eliminate
- **Complexity:** Simple array traversal (~10 lines)
- **Testing:** Pure function, easy to unit test
- **Risk:** Low — clearly scoped logic

No other hooks needed. All other game logic is covered by phase types.

---

## Gaps and Conflicts in Current Design

### Gap 1: Global Variables in Templates
The template `{{remaining.length}}` references a global "remaining" list, not a phase output. Need to clarify:
- **Option A:** Engine provides built-in variables: `remaining`, `eliminated`, `players`
- **Option B:** Restrict templates to phase outputs only (e.g., `{{round1-eliminate.remaining.length}}`)

**Recommendation:** Option A — built-in variables are more intuitive.

### Gap 2: Tie-Breaking Not Specified
What happens when two players tie in voting?
- `winner` phase needs tie-break logic
- `eliminate` phase with `bottom-percent` might hit boundary ties

**Recommendation:** Add to design docs:
- Winner ties: First player by join order wins (deterministic)
- Elimination ties: Include all tied players in eliminated set

### Gap 3: AI JSON Schema Not Specified
The `eliminateDuplicates` hook expects `[[playerId, playerId], [playerId]]` format, but this isn't formally specified in the AI prompt.

**Recommendation:** Add to ai-process config:
```json
{
  "format": "json",
  "schema": "array of arrays of playerIds"
}
```
Or rely on instruction text to describe format (simpler, current approach).

### Gap 4: Phase Naming Restrictions
Corn Story uses hyphenated names like `round1-collect`. Need to ensure:
- Phase names are valid JS identifiers (for data refs)
- No conflicts with built-in names (remaining, eliminated, etc.)

**Recommendation:** Validation rule: phase names must be `[a-z][a-z0-9-]*` (lowercase, alphanumeric, hyphens).

### Gap 5: Empty Collect Handling
What if no remaining players submit in a round?
- AI receives empty array
- Downstream phases have no data

**Recommendation:** Engine should skip AI phase if input is empty, proceed with empty result.

---

## Recommended Build Order

Build incrementally, validating each step:

### Phase 1: Player State Foundation
1. Add `status` field to PlayerRegistry
2. Implement `getRemaining()` and `getEliminated()` methods
3. Add tests for elimination tracking
4. **Validate:** Run unit tests

### Phase 2: Data Reference System
1. Create `resolve(reference, phaseOutputs)` function
2. Store phase outputs in engine
3. Add tests for reference resolution
4. **Validate:** Run unit tests

### Phase 3: Template Engine
1. Implement `{{phase.field}}` substitution
2. Add built-in variables (remaining, eliminated)
3. Add tests for template rendering
4. **Validate:** Run unit tests

### Phase 4: Hooks System
1. Add hook loader (dynamic import from game folder)
2. Call hooks with context object
3. Test with Corn Story's `eliminateDuplicates`
4. **Validate:** Run unit tests + integration test

### Phase 5: Eliminate Phase
1. Implement `bottom-percent` method
2. Implement `hook` method
3. Wire up to StateMachine
4. **Validate:** Run unit tests + test with mock data

### Phase 6: AI JSON Mode
1. Add JSON instructions to AI prompts
2. Parse JSON responses with error handling
3. Implement retry/fallback logic
4. **Validate:** Test with mock AI returning various responses

### Phase 7: Vote Phase (Head-to-Head)
1. Implement matchup generator
2. Build voting UI
3. Implement score tallying
4. Wire up timer per comparison
5. **Validate:** End-to-end test with mock players

### Phase 8: Vote Phase (Pick-One)
1. Build pick-one UI
2. Implement simple tallying
3. **Validate:** End-to-end test

### Phase 9: Winner Phase
1. Implement winner determination
2. Build winner display UI
3. Handle tie-breaking
4. **Validate:** End-to-end test

### Phase 10: Integration
1. Create Corn Story config
2. Wire all phases together
3. Full playthrough test
4. **Validate:** E2E test with mock players

---

## Complexity Estimate for Novice Coder

### Overall Assessment: **Moderate-High**

The framework design is solid, but implementing Corn Story requires significant new engine code.

### Breakdown by Difficulty:

| Component | Difficulty | Effort | Notes |
|-----------|------------|--------|-------|
| Player state tracking | Easy | 2-3 hours | Straightforward data structure |
| Data reference system | Easy | 2-3 hours | String parsing + lookup |
| Template engine | Easy | 1-2 hours | Simple substitution |
| Hooks system | Medium | 3-4 hours | Dynamic imports can be tricky |
| Eliminate phase | Medium | 3-4 hours | Two methods to implement |
| AI JSON mode | Medium | 4-5 hours | Error handling matters |
| Vote (head-to-head) | Hard | 6-8 hours | UI + matchup algorithm + timing |
| Vote (pick-one) | Easy | 2-3 hours | Simpler variant of above |
| Winner phase | Easy | 1-2 hours | Just find max |
| Integration + testing | Medium | 4-6 hours | Wiring everything together |

### Total Estimate: 28-40 hours of focused work

### Risk Factors:
1. **Head-to-head voting UI** is the hardest part — async comparisons with timers
2. **Socket.io state sync** for player subsets needs careful handling
3. **AI JSON parsing** edge cases could cause debugging time

### Mitigation Strategies:
1. Build Weekend Poem fully first (validates core pipeline)
2. Build Mood Check second (adds no new engine features)
3. Tackle Corn Story phases one at a time
4. Use mock AI extensively to avoid API costs during development
5. Write tests before implementation (TDD)

---

## Conclusion

**Corn Story is feasible with the current design.** All required features have been specified in the design documents. The implementation requires:

- 10 must-have primitives (listed above)
- 1 custom hook (eliminateDuplicates)
- 5 gap resolutions (mostly clarifications)

The recommended build order allows incremental validation. Weekend Poem and Mood Check can be built first to validate the core engine, then Corn Story phases added one at a time.

**Main risk:** Head-to-head voting is complex. If time is limited, could simplify Round 2 to pick-one voting (loses some game design quality but simplifies implementation).
