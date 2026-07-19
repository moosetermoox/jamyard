# Deferred Ideas

Things considered but not built. Living document — promote to design docs when ready to tackle.

## Editor UX

### Inline-expand step settings (Trello-style)
Today: clicking a phase card populates the right sidebar with its settings.
Idea: drop the sidebar; click a card to expand it inline, showing settings within the card itself (one open at a time so the canvas doesn't explode).

**Why deferred:** big rewrite (renderPhaseConfig mount target, layout, live preview & AI suggestion homes). Decided to nail the mechanics first (settings IA, visualization phases, pattern presets) before redesigning the canvas itself.

**When to revisit:** after the core feature set feels stable and we want to focus on first-time-user delight.

### Step-settings polish (UX expert review, 2026-04-19) — DONE

All 8 items shipped over commits 868b6d5, 7738144, 1c080b6:

1. ✅ Progressive disclosure on optional sections (Loop, Host/Player customize, Multi-field).
2. ✅ AI Suggestions pinned to top, "✓ This step looks good" when no issues.
3. ✅ "Preview this step" button → modal with host + player mock side-by-side.
4. ✅ Smart defaults on phase creation + "We added a typical setup" toast.
5. ✅ Compact "Goes to: X [Change]" replaces Next-step dropdown when next is set.
6. ✅ Yellow clickable example chips under high-traffic textareas (collect/choice prompt, AI instructions, announce message).
7. ✅ Save-state pip in header (green Saved / orange Unsaved changes).
8. ✅ "Flow" → "What's next" in section headers.

Bonus: auto-polish during generation now uses the SAME deep Sonnet review the user later runs via Check My Game, iterating up to 2 passes (was 1 Haiku pass). Closes the "AI generated it but is suggesting fixes to itself on first open" loop. (commit 1c080b6)

## Architecture (from external review, deferred)

### game-loader as a compiler
See conversation in session 2026-04-19. Estimated week of work. Resolves all references, applies defaults, expands foreach instances, validates dataflow at load time. Engine becomes pure executor. Biggest long-term win for AI-generated config reliability. Deferred until product is more settled.

### Per-phase runner extraction
Move the orchestration code in server.js into per-phase-type runner modules with consistent contracts (`enter`, `onCommand`, `cleanup`). Defer until the runtime hardening proves stable in classroom use.

### Socket.io integration tests
In-process tests using socket.io-client to cover golden paths the unit tests miss (race conditions, reconnects, AI timeouts). Three to five flows cover most risk.

### Tiny Playwright suite for E2E
Real browser tests for the most critical user flows. Deferred until a known gap can't be caught any other way.

## Game concepts

### AI Dungeon Master — live choose-your-own-adventure (2026-07-19)

Teacher writes a scenario + constraints ("ancient Egypt, no combat, no scary
content"); the AI narrates a story beat and offers exactly three options; the
class votes pick-one; the AI continues from the winner. 5-8 decision points,
then an AI-written finale. Like AI Dungeon but class-voted and teacher-bounded
— no dice, no combat system. Story Quest is the pre-written-branches version
of this; this replaces the authored tree with a live narrator.

**Design sketch (worked out, not built):** needs NO new phase type — it is a
loop of ai-process → reveal → vote (pick-one). Build list:
1. `story-beat` AI task type: strict JSON `{storySoFar, beat, options[3]}`
   (+ finale variant, + mock-mode shape for the robot playtest). Story memory
   = the narrator reads its OWN previous loop iteration (`storySoFar`) plus
   `{{vote.winner}}`; first iteration starts from the teacher scenario.
2. Vote candidates sourced from AI output (`candidates: "narrate.result.options"`)
   — vote already accepts array dataRefs; needs resolver/validator verification.
3. Verify loop self-reference resolves to the previous iteration cleanly.
4. "AI Adventure" recipe: scenario + constraints + decision-point count
   (+ optional per-beat teacher preview gate — default off, on for younger
   classes). This is the front-door payoff: "run a D&D adventure about the
   water cycle" just works.
5. Projector storybook styling + story-flavored AI-wait text; graceful
   teacher-continues-manually fallback if an API call fails mid-game.

**Why deferred:** August prep comes first (proxy playtests, day-one kit,
recipes for match/sort/drawing). Also the first game with a hard live-API
dependency mid-game (5-15s wait per beat) — prompt quality needs real
playtest iterations.

**When to revisit:** after field tests start; effort is roughly one
sort-phase-sized session. Scope call already made: v1 is the AI's three
options only — a student write-in round (collect step in the loop) is a
possible v2.
