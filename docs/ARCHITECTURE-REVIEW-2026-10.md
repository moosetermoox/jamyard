# Architecture review, October 2026

Written after two outside reviews on 2026-10-02 found 101 bugs in two days (PR #165 fixed 98). The question was whether the bug rate points at an architecture problem. Short answer: the architecture is sound, but the bugs are not random. They fall into five causes, each a specific structural debt with a specific fix.

## Measurements (2026-10-02, after #165)

| | |
|---|---|
| Commits in the last 30 days | 511 (155 PRs, 34 of them review fix rounds) |
| Step types × activities × languages | 31 × 49 × 6 |
| Biggest files | `screens/designer/editor.js` 7,756 lines · `server.js` 7,189 (62 socket handlers, 59 routes) · `screens/player/player.js` 4,490 · `screens/host/host.js` 3,424 |
| Step handlers with their own empty-state guard | 16 of 33 |
| Recipe or activity strings that restate a number a setting controls | 13 |
| CLAUDE.md | 16,000 words; 27 rules of the shape "a new X must also do Y"; two "wire it in N places" rules |
| Test files that check a source file as text (string match) | 28 of 295 |
| Test files that run a real `GameEngine` | 17 |
| Playthrough scripts (`scripts/simulate-*.js`) in CI | 0 (they need a running server) |

## What is working

- Phases as a state machine, pure logic in `engine/phases/` beside the socket-touching handlers in `engine/phase-handlers/`, recipes as JSON, `engine/phase-schemas.js` as the one source for the validator, the editor, and the AI prompts.
- The proof: on 2026-10-02 six agents changed about 100 things in parallel across the whole tree, merged with no conflicts, the suite passed, and fourteen full playthroughs ran clean.
- Two bugs a day found by outside reviewers in a product growing this fast is a normal ratio. The cost is that nearly all of them fall into the same few holes.

## Where the 101 bugs came from

### 1. Prose that restates the settings (about 15 of 101)

"Three scales", "90 seconds", "Theme: anything", "the list is above", "after 4 rounds". The recipe layer lets a teacher change a number; the activity's own sentences still describe the old default. Thirteen such strings remain in `recipes/` and `games/`.

**Fix:** a lint test that fails when a recipe or activity string carries a number or word one of its own settings controls; then derive those lines from the setting (`${timer} seconds`) or drop them.

### 2. Promises in words that no code enforces (about 6)

"Nobody will know who", "greyed out", "it's one tap", "students per group". The 2026-10-02 fix for anonymity (`engine/anonymity-promise.js`) reads the English prose to decide what the console does. It works, but it is backwards: the setting should be the source and the sentence should come from it.

**Fix:** when a line promises a behaviour, the behaviour is a field (`unattributed: true`) and the line is generated or validated against it.

### 3. Empty and tiny cases handled one step type at a time (about 14)

Zero submissions, zero votes, one student, two students, the first voter, two identical entries, 5 of 7 eliminated under a 60% cap. There is no shared contract for what a step does with 0, 1, or 2 inputs. Every reviewer who tries a small class finds a new one. This is the biggest hole and the cheapest to close.

**Fix:** `scripts/simulate-small-classes.js`, a playthrough of every visible built-in with 1, 2, and 3 students, plus a run where every answer step is closed empty, on its own server, in CI.

### 4. Rules in a document instead of in code (about 10)

The 27 "a new X must also do Y" rules and the "six places" rules in CLAUDE.md are knowledge the computer should enforce. Some have guard tests; many do not. The relay bug (#134, a missing `phaseInstanceId`) and the reconnecting-projector bug of 2026-10-02 were both "forgot one of the N places."

**Fix:** convert each rule into a guard test or a chokepoint (for example, `ctx.emit` that always stamps the phase id, so no handler can forget). The CLAUDE.md line then shrinks to a pointer at the test.

### 5. The same screen logic written three times

The make page, the Create page, and the editor each carry their own copy of form logic. The 2026-10-02 items 25 to 28 were "the make page already did this right; the Create form didn't." `editor.js` mirrors the server validator by hand.

**Fix:** serve the pure parts of `engine/game-loader.js` to the browser instead of mirroring; share the recipe-form renderer between the Create page and the make page.

### Also: test style

28 of 295 test files check behaviour by reading a source file as text and matching a string. Those pin wording, not behaviour, and pass while the feature is broken (the "vitest through grep never fails" gotcha). Only 17 files run a real `GameEngine`. The playthrough scripts are the real safety net, and they are not in CI.

**Fix:** new tests for engine behaviour run the engine; string-match tests are for copy rules only (no em dashes, no AI mention), never for "does the feature work."

## The order

1. Small-class playthrough in CI (cause 3). Started 2026-10-02.
2. Restated-settings lint, then derive the 13 strings (cause 1).
3. One rule a session from CLAUDE.md into a test or chokepoint (cause 4).
4. Validator served to the browser (cause 5).
5. Split `server.js`'s socket handlers into files by step family. Mechanical, low risk.

## Not doing

- A framework, a build step, or a rewrite of `editor.js`. It is old and large, but it is not where the bugs come from.
- Changing the state-machine model or moving recipes out of JSON. Nothing a reviewer found traces to those.
