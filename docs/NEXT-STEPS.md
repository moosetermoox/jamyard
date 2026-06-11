# Next Steps

Living roadmap. When a session starts with "what should we work on?", start here.
History lives in [CHANGELOG.md](CHANGELOG.md); parked ideas in [DEFERRED-IDEAS.md](DEFERRED-IDEAS.md).

## Now — the pre-August plan (classroom tests start August 2026)

Filter every priority through: *what will matter in the first week of real use?*
Explicitly NOT doing: more phase types/features until August feedback.

- **A. Survive a real class period** ← IN PROGRESS
  - Room-state persistence: snapshot engine state to Neon on phase transitions;
    a restarted/slept server resurrects the room when host+players reconnect
    (semantic: resume at the START of the interrupted phase — mid-phase
    progress in that one phase is lost, the game is not)
  - Deploy-on-green (CI triggers the Render deploy; red suite can't ship)
  - Uptime: paid tier or external ping so the server doesn't sleep mid-day
- **B. Chaos simulator** — 30+ bot clients that drop, reconnect mid-phase,
  double-tap, replay stale events, rejoin with dead tokens — against every
  phase type. The reconnect paths are the thinnest code in the project.
- **C. Day-one kit** — pick the 3-5 games August actually starts with
  (likely One Voice/Closer, Quiz Show, Lightning Round), polish those deeply
  (phone screens, timings, prompts), + anonymous mode, + a one-page
  "if X goes wrong, do Y" teacher cheat sheet.
- **D. Proxy playtests (July)** — family/colleagues on real phones; two
  adults find what no sim can.
- **E. If time remains** — accessibility basics (contrast, touch targets,
  keyboard nav); AI-generation eval loop (20 realistic prompts → robot
  playtest all → fix generator weaknesses in batch).

1. **Field-test in a real classroom** — August 2026. Everything above serves this.

## Next

2. **Remaining safety items** (from SAFETY-DESIGN.md): anonymous mode option,
   rate limiting / DoS limits (non-AI socket events; AI endpoints now guarded),
   PII redaction.
3. **Editor odds and ends:**
   - class-critique ships with an empty reveal template (flagged during game sweep)
4. **New phase ideas** (from the 2026-06-10 ideation; buzz + estimate + branching
   votes shipped):
   - **`match`** — pair two lists (vocab↔definitions, quotes↔authors), auto-scored,
     drag-to-connect (rank's drag infra reuses).
   - **`sort`** — drag items into named buckets (categorization: metaphor vs simile),
     class-consensus reveal. Different cognition from rank's ordering.
   - **`secret-role`** — hidden per-player info (Spyfall/Chameleon pattern); per-player
     delivery exists ({{X.mine}}), new part is role assignment + projector discipline.
     The most-requested-by-students unbuilt thing once they see bluffing games.
   - **`appreciation`** — everyone writes something kind about an assigned classmate
     (rotation guarantees coverage), teacher previews every note before private
     delivery. Connection-family round 2; needs the new privacy pattern.

## Later (needs accounts or more users first)

4. **Accounts / owner model.** Game configs already persist in Neon Postgres;
   accounts unlock per-teacher libraries, recipe sharing/marketplace, content
   moderation surface. The `recipes/user/` gitignore boundary already marks the
   user-content line.
5. **Connection Pack voice modes** — v1.5 recorded clips, v2 WebRTC (staged in
   connection-pack-spec.md; deliberately NOT built yet).
6. **game-loader as a compiler** (architecture review item — see DEFERRED-IDEAS.md).
   Biggest long-term win for AI-generated config reliability; ~a week of work.

## Recently done (context for "why isn't X on the list")

- Branching votes (`vote.nextByWinner` + literal vote options + editor branch UI)
  — Story Quest CYOA shipped; fixed latent close-voting crash + broken sim votes ✅
- Buzz + estimate phases (25 types) + Lightning Round ✅

- Recipe compiler conditionals R7 ($if/$value/$repeat/$map, transition rewiring,
  object params) + One Voice/Snowball/Closer recipe upgrades + Quiz Show shipped ✅
- AI cost guards (`services/ai-budget.js` — AI_CALLS_PER_MINUTE + AI_DAILY_CAP,
  Neon-persisted day counter, 429s + phase-error pause) ✅
- Friendly tokens everywhere + SPECIAL_SCOPE_OUT_OF_CONTEXT validator rule ✅
- Strategic review items 1–4: idea-first front door, robot playtest, Simple view,
  juice pack (sounds/confetti/avatars — `screens/shared/juice.js`) ✅
- Connection Pack (Closer / Snowball / One Voice), 23 phase types ✅
- Teacher console (private second-device moderation) ✅
- Persistence (Neon), password gate, safety pipeline v1 ✅
- Recipe layer R1–R6 ✅
