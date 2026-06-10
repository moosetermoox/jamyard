# Lanyard Framework

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
- **Recipe Layer (R1 shipped):** teachers pick a recipe + fill 2-5 params; the compiler emits a phase graph. Phase-graph editor stays as advanced mode. Recipes are JSON, not code, so they migrate cleanly to a database when accounts ship. See `docs/RECIPE-LAYER.md`.

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
- **20+ games in `games/`** (varies — teacher generates and deletes during testing; use `ls games/` for the current list; `_`-prefixed dirs are hidden test fixtures)
- **All 10 engine primitives implemented** for Corn Story
- **Preview phase implemented** — teacher-only review before revealing to students
- **Timers implemented** — SVG ring countdown (host) + progress bar (player) with auto-submit on expiry
- **Player reconnection** — 30s grace period, auto-rejoin on socket reconnect, state restoration
- **Phase transitions** — smooth CSS fade transitions between game phases
- **Editor validation** — client-side + server-side config validation with friendly error messages
- **Prototype Mode button** — saves dirty config then opens `/prototype?game={id}` (pre-selects game, user picks player count)
- **Prototype mode** — `/prototype` embeds host + player iframes side-by-side for quick playtesting. Two view modes: Grid (all players at once) and "One at a time" (carousel — fixed-position arrows + dot indicators above iframes, looping keyboard ← → navigation)
- **Dynamic AI messages** — processing screen shows task-specific text ("summarizing...", "comparing...") instead of hardcoded "creating your poem"
- Server runs on port 3000 (`npm start`)
- Home screen at / (redesigned — two primary cards + student room-code join)
- Host screen at /host, Player screen at /player, private teacher console at /teacher (room code + click-to-reveal PIN)
- Game editor at /designer, editor at /designer/edit
- Prototype mode at /prototype
- **AI game review** — two-tier review system: light check (Haiku, on save) + deep review (Sonnet, on demand) with inline phase badges and review panel
- **Loop/round system** — any phase can loop back to an earlier phase N times via `loopBack`/`loopCount` config fields
- **Screen control** — `hostTemplate`/`playerTemplate` for custom content, `hostShow`/`playerShow` for toggling built-in UI elements per phase
- **Announce phase fixed** — host and player screens now have announce sections with message, timer, continue button
- **Keith Haring editor restyle** — bold black borders, flat colors, warm canvas, energy marks on hover
- **Game templates** — 5 pre-built templates (blank, simple poll, creative writing, elimination game, quiz show) accessible via template picker modal
- **Live preview** — side-by-side host/player screen mockups in editor, respects hostShow/playerShow toggles
- **Game themes** — pre-built themes (pop-art, arcade, ocean, sunset) + AI-generated custom palettes, applied via CSS custom properties
- **Leaderboard phase** — shows scores/rankings with medal emojis, personal rank highlight on player screen, optional timer auto-advance
- **Reveal-one phase** — host reveals items incrementally (countdown style), items animate in on player screens, reconnection support
- **Foreach phase** — iterates over dynamic data (e.g., collected responses) running sub-phases per item, with auto-candidate generation, cumulative scoring, template variables (_current, _foreach, _candidates), self-exclusion (author can't rate own item), and tally scoring mode (author earns points from ratings)
- **AI game generation** — describe a game in plain English, Sonnet generates a complete config (designer UI button + `/api/games/generate` endpoint)
- **Rotation primitive** — `collect.rotateFrom` + `{{X.assigned}}` token deliver each player a different player's prior item. Powers SCAMPER-style chains.
- **Rate phase** — class scores a target on 1-N custom scales (Originality / Feasibility / Effectiveness etc.). Results render as a per-scale averages bar chart + per-scale pie chart with red-to-green color palette. `visibility: "all"` shares with the class, `"host-only"` keeps it on the teacher screen.
- **Phase images** — `image` field on announce/reveal/collect/collect-choice. Uploads land in `games/<id>/assets/`. Editor has a drag-and-drop widget. Host/player visibility controlled by `hostShow`/`playerShow` toggles.
- **Auto-save + click-outside-collapse** — editor flushes changes to disk when the user clicks off a phase or switches to another; no more scrolling to the Save button.
- **Designer-vibe default theme** — host + player auto-apply the pop-art preset on load. Arial Black font, 3px black borders, warm cream canvas — matches the editor.
- **Turn phase** — charades/describe-it gameplay with server-authoritative timer, team rotation (Got It / Skip), pool drawn from prior collect step. Powers Charades Bowl.
- **Bluffing primitives** — `collect.assign:"pairwise"`, `vote.matchupsFromPairs`/`excludeAuthors`, `collect-choice.choicePool`/`excludeAuthored`/`shuffle` unlock Jackbox-style bluffing games as plain config.
- **Speed-bonus scoring** — `collect-choice` with `correctAnswer` + `speedBonus` grades responses at close time with Kahoot-style time-decay points (`engine/speed-scoring.js`).
- **Neon Postgres persistence** — user-created games stored in `user_games` DB table (`db.js`); survives Render redeploys. Built-in games stay on filesystem. `DATABASE_URL` env var enables; falls back to filesystem when unset (local dev unchanged).
- **Password gate** — set `SITE_PASSWORD` env var to require HTTP Basic Auth on teacher surfaces (/host, /designer, /prototype). Student paths stay open.
- **YouTube video embed** — `video:` field on announce/reveal/collect/collect-choice. Host-only; `engine/video.js` parses watch/youtu.be/embed/shorts URLs.
- **Content safety pipeline** — `engine/content-filter.js` (blocklist + mash detection) gates `submit-response`; AI system prompts include safety rules block; host moderation panel (hide/kick) on collect phases.
- **Editor UX** — H/P/AI role dots removed; form labels sentence-case; inputs softer 2px border with focus transition; more whitespace; section bands cleaned up; primary textarea auto-expands; "+ Insert from earlier step" hidden when no upstream refs exist; inserted {{tokens}} show as deletable chips in preview row.
- **Button renames** — "Check My Game" → "Check for Errors"; "Test Game" → "Prototype Mode".
- **Rank phase drag-and-drop** — players can drag items to reorder (HTML5 drag + touch for phones/Chromebooks); drag handle (☰) + drop highlight; arrow buttons kept as fallback. Rank handler also now accepts comma-separated string candidates (AI generators emit this format) — splits automatically so literal `candidates` values work without being arrays.
- **Rank "My own list"** — the editor's rank step has an "Items come from" toggle: an earlier step (data-ref dropdown) OR a teacher-typed fixed list (add/remove item rows, same widget as collect-choice choices; stored as an array). Validator requires ≥2 non-blank items for literal lists; literal strings with periods ("Dr. Who, Mr. Bean") are no longer mistaken for data refs (refs are single dotted tokens — anything with spaces/commas is literal).
- **Connection Pack** — first no-winner game family (spec: `docs/connection-pack-spec.md`): three experiences shipped as recipes + compiled games — **Closer** (escalating pair conversations), **Snowball** (think-pair-share via the merge phase), **One Voice** (cooperative counting). Zero AI calls in default paths. Shared primitives:
  - `collect.passAllowed` — Pass button; counts as a submission (step can close), excluded from results/AI/moderation list, never attributable anywhere (even the journal)
  - `collect.simultaneousReveal` — projected ticker shows counts only, no names, until close
  - `reveal.scope:"pair"` + `pairsFrom` — each pair sees only its own answers via `{{_pair.prompt}}`/`{{_pair.answers}}`; a pass renders byte-identical to a missing answer ("chose to listen this round")
  - config-level `family:"connection"` (set on the recipe, stamped into the compiled config) — validator permanently rejects leaderboard/winner/eliminate/ai-eliminate/wager/graded scoring
  - recipe-level `feel` tags (e.g. laughter/belonging/consensus) — fed into the AI recipe matcher
- **Pairing primitives** — `engine/phases/pairing.js` (pure greedy non-repeat matching). Collect pairwise extensions: `pairsFrom` now optional (pairs share the step's own prompt), `oddHandling:"triple"` (odd class forms one group of 3 instead of benching someone — keep `"sit-out"` for bluffing games feeding `matchupsFromPairs`), `rotatePairsFrom` (fresh pairing avoiding repeat partners), `reusePairsFrom` (same partners, next prompt)
- **Merge phase** (22nd type) — think-pair-share cooperation primitive: group shares one live draft (last-write-wins, 300ms debounce), submits via `agreeMode` both/any/timer (edits reset agreements), `groupSize:4` joins adjacent prior-merge groups, host force-close submits current drafts, reconnect restores draft state. Output `merged` is consumed downstream exactly like `collect.responses`
- **One-voice phase** (23rd type) — class counts to a target together; server-authoritative tap adjudication via pure `adjudicateTap` with injected clock (gap ≤ window = collision reset, same-player-twice rejected, 800ms post-reset lockout), success → celebration → auto-advance; teacher-speaker audio speaks each number via Web Speech on the host (`roomSpeak()` util, mute toggle; no recording/WebRTC — staged for later)
- **Recipe compiler indexing** — `${param[0]}` indexed array placeholders (whole-value and interpolated). **Known limitation, hit 3×:** the compiler can't conditionally include fields/phases, so enum-driven structure params (Closer's `pairing`, Snowball's `rounds`/`finalVote`, One Voice's `attempts`) were dropped from recipes — the engine supports all of them via the editor. Compiler conditionals are a roadmap item.
- **Sim harness** — `scripts/sim-harness.js`: reusable multi-client primitives (buffered event waiting, `setupRoom`/`teardown`, reporter) for headless playthroughs against a running server. Each Connection Pack experience has a sim asserting its privacy/timing invariants.
- **Idea-first front door** — `/designer` opens with one big box ("What do you want to play with your class?") that routes through `from-description` recipe matching; Enter submits, example chips fill the box (all four verified to route: One Voice / Class Poll / Snowball / Elimination Tournament), `?idea=` deep-link auto-launches the flow. The old three buttons are demoted to "Browse recipes / Start from scratch" links; the no-match view still offers the picker + legacy whole-config generator.
- **Robot playtest in "Check for Errors"** — deep review now ALSO plays the game: `services/simulator.js` self-connects 1 host + 4 bot clients to the running server in a hidden temp room (`_sim-tmp-` prefix → `room.simulated` → mock AI, zero API spend) and drives every phase type end-to-end, in parallel with the Sonnet review (no added latency). Catches the runtime bug class static review can't see: stalls (with a force-skip warning), crashed phases (`phase-error` capture + skip), blank screens, empty rank/vote/choice payloads, unresolved `{{tokens}}` and `[object Object]` reaching students, nobody-eligible-to-vote. Findings deep-link to phases by prompt-text matching; review panel shows a 🤖 banner (completed/stuck + duration + steps). Every bot emit echoes `phaseInstanceId`, so the stale-event guard makes double-advances impossible. First run caught a real shipped bug (mood-check's `{{process.result.content}}`). Typical runs: simple game ~2s, 16-step foreach game ~11s, cap 45s.
- **Teacher console** — `/teacher` is a private second-device view (the host screen is projected, so "teacher-only" UI there is actually public). Teacher's phone joins with the room code + a 4-digit PIN shown click-to-reveal ("👁 Teacher view" chip on the host screen); with `SITE_PASSWORD` set, the basic-auth header on the socket handshake works instead (`engine/teacher-auth.js`, pure + tested). Console gets: live entries with names (hide/kick), preview approve/reject, close-submissions, next-step, live counts, phase tracking (`teacher-phase` event). Privileged socket actions (moderate-*, preview-*) now check `isTeacherSocket` (host OR joined console). Preview content on the projected host screen is hidden by default behind "👁 Show on this screen". Verified by `scripts/simulate-teacher-console.js` (incl. intruder-can't-moderate and hidden-entry-never-reaches-class). Mobile-polished via screenshot review: "X of Y in" count seeds on join, "Next step" hidden during preview (Approve/Try again are the only paths — can't accidentally skip the review).
- **Prompt-aware Bot Fill** — `screens/shared/bot-brain.js` (`botAnswerFor(prompt)`): pure rules, no AI — keyword banks (food/feelings/places/excuses/ideas/story/etc.), embedded-choice picking ("pizza, sushi, or tacos?" → one of them), yes/no detection, "one word" handling, playful generic fallback. Multi-field inputs match each field's placeholder; merge bots combine the seed answers they can see. Browser global + side-effect-importable for tests.
- **Juice pack** — `screens/shared/juice.js` (browser global + side-effect-importable for tests): Web Audio synthesized SFX (cue table, per-cue throttle, gesture-unlocked AudioContext), theme-colored canvas confetti (reads `--theme-*` CSS vars, honors prefers-reduced-motion), deterministic emoji avatars (`Juice.avatarFor(name)` — consistent across host lobby/leaderboard/winner/teams and the student's own device), persisted mute chip on host. Themes declare `juice.wave` (arcade=square, ocean=sine...) surfaced as `window.__themeJuice`. Host: join pop, progress blips, reveal chimes, leaderboard tada + staggered rows, winner fanfare+confetti, timer ticks. Players stay quiet except own moments (submit blip, personal win confetti). All guarded — juice can never break gameplay.
- **Simple view (plain-English editor)** — `screens/designer/simple-view.js`: the editor's DEFAULT view renders each step as a sentence with its editable text inline ("Students answer: [box] · passing allowed · ⏱ 120s"), per-step "✨ Ask AI" for structural changes, "Advanced settings →" to the canvas. Choices/rank items/wager options are inline add-remove rows; foreach sub-steps render indented; structural facts (pairing, loops, scoring) read as sentence fragments. Simple/Advanced pill in the header, preference in localStorage. Implementation: wraps `renderCanvas()` (stays in sync with every mutation path incl. Ask-AI apply) and `selectPhase()` (review-panel deep links flip to Advanced first). Most teachers should never need the phase graph.
- **Friendly tokens everywhere** — teachers never see raw `{{ref}}` syntax: Simple view renders tokens as chips inside token-aware text boxes; Advanced primary textareas + screen-control/sidebar template fields tokenize to `[label — step N]` via `buildTemplateVariables` (labels are step-unique — duplicate labels used to let detokenize rewire refs to the wrong step); `phaseContentLabel` strips tokens from step-reference sentences. Validator rule `SPECIAL_SCOPE_OUT_OF_CONTEXT` warns when `_current`/`_foreach`/`_candidates`/`_pair` appear where they can't resolve (would render raw to students).
- **658 tests passing** (`npm test`)
- Simulator scripts for automated playtesting: `node scripts/simulate-any-game.js <game-id>` (universal), `simulate-closer.js`, `simulate-snowball.js`, `simulate-one-voice.js` (scripted tap timings), `simulate-connection-slice.js`, `simulate-corn-story.js`, `simulate-scamper.js`, and others in `scripts/`
- **Visual review tooling** — `scripts/screenshot.js` (headless screenshots via Chrome DevTools Protocol; required for socket pages — host/player/teacher hold a socket open so they never reach network-idle and `--virtual-time-budget` hangs) + `scripts/demo-room.js` (spins up a live room with bot players, holds at collect or preview, prints CODE/PIN — for phone testing and screenshot harnesses)

### Working Games
1. **Weekend Poem** (games/weekend-poem/) — collect → ai-process → reveal
2. **Mood Check** (games/mood-check/) — collect → ai-process → reveal
3. **Corn Story** (games/corn-story/) — 3-round elimination game with 16 phases
   - Round 1: "Don't Match" — AI groups similar answers, matching players eliminated via hook
   - Round 2: "Be Creative" — head-to-head voting, bottom 60% eliminated
   - Final: Pick-one voting by eliminated players, winner crowned
4. **Story Builder** (games/story-builder/) — collect (60s timer) → ai-process → preview → reveal
   - Uses preview phase for teacher review before showing AI-generated story
   - Teacher can approve (advance to reveal) or reject (re-run AI)
5. **Dream Vacation Debate** (games/dream-vacation/) — collect → rank → announce → team-split → relay → announce → wager → leaderboard
   - Uses all 4 new phase types: rank, team-split, relay, wager (host-resolved)
6. **Who Said It?** (games/who-said-it/) — collect → foreach(announce → collect-choice → announce) → leaderboard
   - First foreach game: iterates over each response, players guess the author with decoy choices, scoring tracks correct guesses
7. **Two Truths and a Lie** (games/two-truths/) — collect → foreach(announce → collect → announce) → announce
   - Social icebreaker: players write 3 statements, class discusses which is the lie
8. **Caption Contest** (games/caption-contest/) — ai-process → collect → foreach(announce → collect-choice → announce) → leaderboard
   - AI generates a scenario, players write captions, then guess who wrote each one
9. **The Excuse Machine** (games/excuse-machine/) — collect → foreach(announce → collect-choice → announce) → leaderboard
   - First tally scoring game: players write excuses, class rates each one, authors earn points from ratings
   - Tests both tally scoring mode and self-exclusion (authors can't rate their own excuse)
10. **Human vs AI: Birthday Party Battle** (games/human-vs-ai-birthday-party-battle/) — collect → announce → foreach(announce → collect-choice) → announce → leaderboard
   - First pairMode game: players write party ideas, AI generates fakes, pairs shown side-by-side
   - Uses `pairMode: "human-vs-ai"` with `aiInject` for side-by-side human vs AI comparison
11. **SCAMPER Brainstorm** (games/scamper/) — collect → 7× (announce + collect with rotateFrom) → reveal
   - First rotation game: each student writes one idea, then the idea passes round-robin through 7 SCAMPER lenses (substitute / combine / adapt / modify / put to another use / eliminate / rearrange)
   - End-to-end verified by `scripts/simulate-scamper.js`
12. **Class Critique** (games/class-critique/) — announce → rate → announce → end
   - First rate-phase game: class scores a presentation on Originality / Feasibility / Effectiveness (1-5 each)
   - Results visualized as averages bar chart + per-scale pie charts
13. **Charades Bowl** (games/charades-bowl/) — 3× collect (one phrase each) → team-split → 3× turn rounds → leaderboard
   - First turn-phase game: Fishbowl-style with Describe / Act it out / One word rounds
   - Cumulative leaderboard sums teamScores across all three rounds
14. **Quiplash-style** (games/quiplash/) — pairwise collect + H2H vote; first bluffing-primitive game
15. **Fibbage/Balderdash** (games/fibbage, games/definition-bluff) — trivia bluffing with choicePool truth injection
16. **Yes-or-No Bets** (games/yes-or-no-bets/) — class answers yes/no then bets on each classmate
17. **Speed Quiz** (games/speed-quiz/) — collect-choice with correctAnswer + speedBonus scoring
18. **Closer** (games/closer/) — 3 tiers × 3 pair-prompts (playful → values → reflective) → one-word checkout
   - First connection-family game: pairwise collects with passAllowed + simultaneousReveal, pair-scoped reveals, partner rotation between tiers (`rotatePairsFrom`), same partner within a tier (`reusePairsFrom`), odd class forms a triple
   - Prompt bank: `recipes/prompt-banks/closer.json` (~30 original prompts per tier)
19. **Snowball** (games/snowball/) — announce → solo collect → merge (pairs) → reveal → end
   - First merge-phase game: think-pair-share with shared live draft + agree-to-submit; merged answers revealed anonymously
20. **One Voice** (games/one-voice/) — announce → one-voice → stats reveal → end
   - First one-voice game: class counts to 20 together; collisions reset; each number spoken through the teacher's speakers; ends on a shared story ("Attempts: 3, best run: 17"), no winners

### Engine Primitives (All Implemented)
1. Player state tracking (remaining vs eliminated) — PlayerRegistry
2. Data reference system (phase.field resolution) — GameEngine.resolve()
3. Template engine ({{phase.field}} substitution) — resolveTemplate() in server
4. Hooks system (dynamic import, context passing) — hooks-loader.js
5. Eliminate phase handler (bottom-percent, hook methods) — eliminate-handler.js
6. AI JSON output with extraction from preamble text — server.js
7. Vote phase - head-to-head mode — vote-handler.js
8. Vote phase - pick-one mode — vote-handler.js
9. Winner phase handler — winner-handler.js
10. Player subset filtering (from/voters restrictions) — getEligibleVoters()

### Known Bug Fixes & Lessons Learned
- **AI JSON preamble:** AI often wraps JSON in explanatory text. Server extracts JSON via regex fallback when JSON.parse fails directly.
- **AI playerIds vs text:** AI inconsistently returns playerIds or response text. The eliminateDuplicates hook resolves both by building a text-to-playerId lookup from phase data, with case-insensitive matching and deduplication.
- **AI mixed format:** AI sometimes returns `[playerId, responseText]` in same array. Hook deduplicates within groups — only eliminates if 2+ unique players resolve.
- **bottom-percent input field:** Eliminate phase reads scores from `phase.input` or `phase.from` (config uses `input`).

### 23 Phase Types Defined
1. `lobby` — Wait for players to join
2. `collect` — Gather text responses from players; supports `rotateFrom` (rotation chains), `assign:"pairwise"` (bluffing/pair games — `pairsFrom` optional, `oddHandling:"triple"`, `rotatePairsFrom`, `reusePairsFrom`), `passAllowed`, `simultaneousReveal`
3. `ai-process` — Send data to AI for processing; `perPlayer:true` generates one item per student
4. `vote` — Head-to-head or pick-one voting; `matchupsFromPairs`/`excludeAuthors` for bluffing
5. `eliminate` — Remove players by percent or hook
6. `reveal` — Display content to all players; `scope:"pair"` + `pairsFrom` shows each pair only its own answers (`{{_pair.prompt}}`/`{{_pair.answers}}`)
7. `preview` — Teacher-only preview before reveal
8. `winner` — Declare winner and show standings
9. `announce` — Display a message to everyone (round intros, instructions); `video:` field for YouTube embed (host-only)
10. `collect-choice` — Players pick from predefined choices; `correctAnswer`+`speedBonus` for Kahoot-style scoring; `choicePool`/`excludeAuthored`/`shuffle` for bluffing
11. `ai-eliminate` — AI judges answers and eliminates rule-breakers
12. `leaderboard` — Show scores and rankings with personal highlight; `from` accepts array of refs to sum across rounds
13. `reveal-one` — Host reveals items one-by-one (countdown style); `itemTemplate` renders object items via `{{_current.field}}` (without it, objects fall back to text/name or JSON)
14. `team-split` — Divide players into teams (random or balanced)
15. `rank` — Players reorder a list by preference, aggregated by average position
16. `wager` — Players bet points on outcomes, auto or host-resolved
17. `relay` — Turn-by-turn collaborative input (storytelling, word chains)
18. `foreach` — Iterate over dynamic data running sub-phases per item (guessing games, review rounds)
19. `rate` — Class scores a target on N custom 1-N scales; results render as averages bar + distribution pies; visibility=all|host-only
20. `turn` — Charades/describe-it; server-authoritative per-turn timer, team rotation, Got It/Skip pool management; outputs `teamScores`+`capturedBy`
21. `merge` — Group members combine their answers into one shared answer (think-pair-share); live draft, `agreeMode` both/any/timer, `groupSize` 2/4; outputs `merged`
22. `one-voice` — Cooperative counting to a target; server-authoritative collision window, same-player rejection, teacher-speaker audio; outputs `success`/`attempts`/`resets`/`bestRun`
23. `end` — Game over, clean up

### 6 AI Task Types Defined
- `summarize` — Combine responses into insight (Haiku)
- `generate` — Create content like poems (Haiku)
- `generate-choices` — Multiple choice questions (Sonnet)
- `compare` — Group by semantic similarity (Sonnet)
- `rank` — Order by criteria (Sonnet)
- `judge` — Pick winner with explanation (Sonnet)

### Gameplay Features
- **Preview phase** — Host sees AI content + player responses, can Approve (advance) or Reject (loop back). Players see "Waiting for teacher..." Server handler, socket events (`preview-approve`, `preview-reject`, `preview-edit`), and full host UI implemented.
- **Timers** — Config `timer` field (seconds) on collect and vote phases. Countdown displayed on both host and player screens. On expiry: player auto-submits current text (collect) or random vote (vote); host auto-clicks Close Submissions/Voting. Warning styling at ≤5 seconds.
- **Loop/round system** — Any phase can have `loopBack` (phase ID) and `loopCount` (2-100) to repeat a section of the game. After N iterations, falls through to `next`. Template variables: `{{_loop.<phaseId>.iteration}}` and `{{_loop.<phaseId>.total}}`. Phase data is versioned: bare key has latest, `phaseId~N` has per-iteration copies. Editor shows purple left border + "xN" badge on looped phases.
- **Screen control** — `hostTemplate` / `playerTemplate` for custom content per screen (resolved via `resolveTemplate()`). `hostShow` / `playerShow` arrays toggle built-in UI elements (e.g. `["content", "continueButton"]`). If omitted, all defaults shown (backward compat). Empty array `[]` hides all built-in elements. Valid toggles per phase type defined in `VALID_HOST_TOGGLES` / `VALID_PLAYER_TOGGLES`. Editor shows "Screen Control (Optional)" section with template textareas + toggle checkboxes.
- **Game editor** — Teacher-friendly UI. Phase blocks show icons + friendly names ("Ask Players", "AI Does Something") instead of technical IDs. Color-coded section bands (blue=host, green=player, purple=AI) in settings. Data reference dropdowns replace raw text fields. Phase type picker modal for adding new steps. All config.json internals unchanged — purely a presentation layer. Editor files: `screens/designer/editor.js`, `editor.css`, `editor.html`.
- **Foreach phase** — Orchestrator phase that iterates over dynamic data running sub-phases per item. Virtual sub-phases with `_fe:` prefix injected at runtime. Supports: auto-candidate generation (`candidateSource: "players"`, `decoyCount`), two scoring modes (`correct` for guessing games, `tally` for rating games), self-exclusion (author auto-skipped on collect-choice sub-phases), template variables (`_current`, `_foreach`, `_candidates`). Data refs: `.scores`, `.itemCount`. **Pair mode** (`pairMode: "human-vs-ai"`) — pairs each human response with an AI-injected response for side-by-side comparison. Each iteration exposes `_current.a`, `_current.b` (randomly assigned), and `_current.aiPosition`/`_current.humanPosition` for scoring.
- **AI game generation** — Describe a game in plain English and Sonnet generates a complete config. Accessible via "AI Generate Game" button in designer or `POST /api/games/generate`. Phase docs in the prompt derive from `phase-schemas.js`, so all 23 phase types are covered automatically.

### AI Game Review (Implemented)
- **Light review (Haiku)** — runs automatically after save, flags vague AI instructions, data flow breaks, player eligibility issues
- **Deep review (Sonnet)** — triggered by "Check for Errors" button, comprehensive review of playability, prompt quality, timing, engagement
- **Review panel** — conversational summary + per-phase issues, clickable phase links to navigate canvas
- **Inline phase badges** — warning dots on phase boxes with issue count, AI suggestions section in sidebar
- **API endpoint** — `POST /api/games/review` with `{ config, depth }`, merges structural validation + AI review
- **Model selection** — `MODELS.haiku` for light checks, `MODELS.sonnet` for deep reviews
- **Mock mode** — returns plausible issues (empty instructions, missing timers) for testing without API key

### Safety Features (Implemented)
- **Content filtering** — `engine/content-filter.js` + `engine/blocklist.js`; word-boundary match with leet-speak normalization; rejects on `submit-response` with player-facing notice
- **Host moderation** — `engine/moderation.js`; live submission list on collect phases; Hide (reversible, excluded from AI) and Kick (blocked rejoin via `kickedTokens`)
- **AI safety rules** — `SAFETY_RULES` block appended to every game-run system prompt

### Safety Features (Not Yet Implemented)
- Anonymous mode option
- Rate limiting / DoS limits
- PII redaction

### Editor Validation (Implemented)
- Server-side: phase type validation, required fields per type, enum values, timer range, data ref existence, `returnResults` mode
- Client-side: mirrors server logic with friendly names, errors block save, warnings prompt confirm
- Preview phase requires `content`, `approveNext`, and `rejectNext`
- Unreachable phase detection (BFS from lobby) as warnings
- Validation panel UI (red for errors, amber for warnings)
- Delete phase re-links `next`, `approveNext`, and `rejectNext` references
- Vote phases only offer `.scores` data ref (not `.results`)

### Engine Modules
- GameEngine (engine/game-engine.js) — orchestrates phases, data resolution, hooks
- StateMachine (engine/state-machine.js) — phases + transitions
- PlayerRegistry (engine/player-registry.js) — player management with elimination
- RoomManager (engine/room-manager.js) — room lifecycle
- GameLoader (engine/game-loader.js) — loads and validates game configs
- HooksLoader (engine/hooks-loader.js) — dynamic import of game hook functions
- EliminateHandler (engine/phases/eliminate-handler.js) — bottom-percent and hook methods
- VoteHandler (engine/phases/vote-handler.js) — matchup generation, tallying
- WinnerHandler (engine/phases/winner-handler.js) — determines winner from scores
- AIService (services/ai-service.js) — mock and real modes, game review (light/deep)

### Design Documents (docs/)
- **GAME-CONFIG-DESIGN.md** — 9 phase types, data references, hooks system
- **AI-TASK-DESIGN.md** — 6 AI task types with prompts, schemas, validation
- **SAFETY-DESIGN.md** — Threat model with three-layer mitigations
- **AUTHORING-DESIGN.md** — Config style guide, validation, debug mode
- **connection-pack-spec.md** — the no-winner game family (Closer / Snowball / One Voice): design principles, phase strings, merge + one-voice specs, licensing stance, staged voice modes (v1.5 recorded clips / v2 WebRTC — NOT built)
- **CORN-STORY-FEASIBILITY.md** — Implementation analysis and build order
- **NEXT-STEPS.md** — living roadmap (Now / Next / Later); check here first when asking "what should we work on?"
- **CHANGELOG.md** — dated log of everything shipped; **DEFERRED-IDEAS.md** — considered but parked

### Engine Modules (additions)
- `db.js` — Neon Postgres connection + CRUD for `user_games` table; `DB_ENABLED = !!process.env.DATABASE_URL`
- `engine/speed-scoring.js` — Kahoot-style time-decay point formula (pure function)
- `engine/content-filter.js` + `engine/blocklist.js` — input safety pipeline
- `engine/moderation.js` — hide/kick helpers
- `engine/video.js` — YouTube URL → embed URL parser
- `engine/phase-schemas.js` — declarative schema for all 23 phase types (single source of truth for validator + AI prompts + editor field lists; schema `output` declarations are also the `{{...}}` grammar entries — e.g. `merge.merged` warns on raw template use automatically)
- `engine/resolver-grammar.js` — single source of truth for `{{...}}` syntax (`_pair` is a recognized scope, resolved per-recipient by the reveal handler)
- `engine/phases/pairing.js` — pure pairing logic (greedy non-repeat matching, triples, avoid-sets)
- `engine/phases/pair-reveal.js` — pure pair-scoped reveal helpers (views, listen-card, `{{_pair.*}}` substitution)
- `engine/phase-handlers/merge.js` — merge phase (exports pure `buildMergeGroups`, `agreesNeeded`)
- `engine/phase-handlers/one-voice.js` — one-voice phase (exports pure `adjudicateTap` with injected clock — unit-test timing rules there, not over sockets)
- `scripts/sim-harness.js` — shared multi-client simulation primitives (all simulate-*.js scripts build on it)
- `engine/recipe-*.js` — recipe layer (R1-R6 complete); `recipes/` has 11 built-ins (+ `recipes/prompt-banks/` data + `recipes/user/` for saved ones). Compiler supports `${param}` and `${param[i]}`; it can NOT conditionally include fields/phases (roadmap)

### Environment
- Uses dotenv, set ANTHROPIC_API_KEY in .env for real AI
- Without API key, runs in mock mode (no real AI calls)
- Set DATABASE_URL (Neon connection string) for persistent user-game storage; without it, falls back to filesystem
- Set SITE_PASSWORD to require HTTP Basic Auth on teacher surfaces
- Express 5.x (path matching is stricter than Express 4)
- Haiku for simple tasks, Sonnet for complex judgment
- Deployed on Render (free tier); auto-deploys from master

### Testing
- `npm test` — runs all 658 Vitest tests (~1.5s)
- `node scripts/simulate-any-game.js <game-id>` — universal automated playthrough (requires server running)
- `node scripts/simulate-closer.js` / `simulate-snowball.js` / `simulate-one-voice.js` — Connection Pack invariant sims (pass anonymity, pair privacy, draft sync, tap timing)
- New shipped games must be added to the snapshot map in `tests/engine/validator-diagnostics.test.js` (it fails loudly on unknown games)

## Refinement Log
Moved to [docs/CHANGELOG.md](docs/CHANGELOG.md) to keep these instructions lightweight. Append new entries there.
