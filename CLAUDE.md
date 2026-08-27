# Lanyard Framework

## Project Intent
Framework for quickly building classroom games where:
- Teacher projects a "host screen" to the class
- Students interact via their devices (Chromebooks — phones are banned in most schools; design for Chromebooks/tablets)
- AI facilitates/processes collective input
- Games are text-based for simplicity (plus a stroke-based drawing input — the one deliberate exception)

## Target Users
- Novice coder (me) creating games via "vibe coding" with Claude
- Eventually: other teachers using the framework

## Architecture Principles
- Separation of Concerns: engine, views, AI are independent modules
- State Machine Pattern: every game is phases + transitions
- Events, Not Direct Calls: modules communicate via event bus
- AI Gets Summaries: collect data in scripts, send summary to AI (Script -> LLM Handoff)
- **Recipe layer:** teachers pick a recipe + fill 2-5 params; the compiler emits a phase graph (see `docs/RECIPE-LAYER.md`). Recipes are JSON, not code.
- **Custom creation is bricks-only:** recipe match or storyboard → `compileStoryboard`. The legacy whole-config generator is gone; if an activity can't be assembled from validated bricks, it can't be made.

## Code Principles
- Don't swallow errors — surface them clearly
- No hardcoded values — use config
- Each file does one thing
- Write tests before implementation (TDD)
- Keep it simple — vanilla JS, no frameworks, no build steps

## Key Technical Decisions
- Node.js (v24, ES modules) + Express 5.x (stricter path matching than Express 4)
- Socket.io for real-time communication
- Vanilla HTML/CSS/JS for screens (no React); editor code uses `var` — match that style
- Vitest for testing
- Claude API for AI (Haiku for simple tasks, Sonnet for judgment); mock mode without API key
- Neon Postgres for persistence (user games/recipes, snapshots, feedback, featured overrides, AI usage); filesystem fallback when `DATABASE_URL` unset
- Deployed on Render; CI deploys on green only

## Current Snapshot
- **1291 tests passing** (`npm test`, ~4s) · **321 prompts** across 3 banks (`recipes/prompt-banks/`)
- **28 phase types**, **22 built-in recipes**, ~30 games in `games/` (varies — use `ls games/`; `_`-prefixed dirs are hidden test fixtures)
- Server on port 3000 (`npm start`); **restart the server after code changes** (no hot reload)
- Full feature history: `docs/CHANGELOG.md` + `docs/CLAUDE-ARCHIVE.md` (detailed ship-log formerly in this file)

## Surfaces & Routes
- `/` home (one primary "Find an Activity" card + student room-code join)
- `/library` — teacher front door: search, goal chips, ▶ Host cards, ♥/recents, Customize dialog
- `/host` projector screen · `/player` student screen · `/teacher` private console (room code + PIN, or SITE_PASSWORD basic auth)
- `/designer` Create page (idea box → recipe match or storyboard) · `/designer/edit` editor (Simple | Builder | Advanced views; Simple is default; Ask AI = the design chat panel beside the Simple view, `screens/designer/chat-panel.js` + `POST /api/games/chat` — proposes changes as cards, Apply gated on validation, one-step Revert)
- `/prototype` host + player iframes side-by-side for playtesting
- `/guide` one-page teacher guide (setup, live controls, quick fixes) · `/owner` owner-mode doorway (redirects to the library unlock; no in-page owner links)
- `/feedback` owner inbox (SITE_PASSWORD-gated)
- Vanity URLs: `vanity-urls.json` (slug → game id) mints memorable paths like `/good-question` that redirect to `/host?game=<id>`; server refuses reserved/malformed slugs at startup
- Teacher profile (grade band + subjects, localStorage via `screens/shared/teacher-profile.js`) personalizes prompt-deck picks ("for your class") and Customize; set from the library's first-visit card
- Surfaces model: **find it in the Library, start it in Create, shape it in the Editor** (docs/SURFACES-PLAN.md)

## Standing Rules (active doctrine — check before writing code or copy)
- **No em dashes in user-facing text** (students read them as an AI tell); comma, colon, or new sentence instead. En dashes in numeric ranges fine; Along bank verbatim; code comments/docs exempt. Enforced by `tests/style/no-em-dash.test.js` + `STYLE_RULES` in `AIService._callClaude`.
- **No decorative emojis** in descriptions/messages/prompts; icons only in icon slots (functional marks like ♥, goal chips, avatars, medals are fine).
- **"Activity" vocabulary** in user-facing copy ("game" only when it truly is one). Internals keep "game" (`games/`, `gameId`, socket events, API routes) — never rename them.
- **The host screen is a projector** — never put teacher-private info there; that's what `/teacher` is for.
- **Payoff beats are host-paced, never timed** (reveals, winners, galleries).
- **Nothing student-drawn reaches the projector without a teacher gate** (preview phase or moderation).
- **No student name in any outbound AI payload** (pseudonymous playerIds + `engine/ai-name-fill.js` re-fill; `engine/pii-scrub.js` on free text — pass `rosterNames` on game-time calls).
- **Student text, teacher config, and AI output are all untrusted for rendering** — prefer `textContent`; HTML interpolation must escape (`escapeHtml`/`escapeHtmlText`; enforced by `tests/screens/xss-sinks.test.js`).
- **Teacher-save purity (§49073.1)** — saved objects (configs, recipes, templates) never contain student-generated content; anything that would needs full student-data treatment — prefer never taking it.
- **Projector style** (docs/PROJECTOR-STYLE.md) — content owns the projector; brand shrinks to a corner mark via `body.in-activity`.

## Gotchas & Patterns
- **CSS display value overrides the `hidden` attribute** — any styled-display element toggled via `.hidden` needs a `[hidden]{display:none}` override in the same stylesheet (bitten 3+ times).
- **Close/* handlers must kind-guard `room.phaseState` AND be idempotent** — all-inputs-in auto-advance races a late host click.
- **New gameplay socket handlers**: `checkEventPayload` + `isStalePhaseEvent` + `recordEvent`; every handler runs in a try/catch wrapper.
- **New phaseState containing player ids** gets reconnect id-migration free via the deep walker (`engine/id-migration.js`); **new closers** must be reachable from the `advance-phase` routing switch.
- **New transition-bearing fields wire in SIX places**: state-machine graph, validator ref-existence, BFS+cycle (server AND client), recipe drop-rewiring, editor delete-relink.
- **Multi-field collect responses nest under `fields.*`** — reveal templates reading top-level keys render silently blank.
- **AI responses wrap JSON in preamble** — always regex-fallback extraction.
- Phase handlers self-register in `engine/phase-handlers/` via `registerHandler(type, {onEnter, onReconnect})`; use `EVENTS` constants (`engine/events.js`) and `players.listPublic()` (strips tokens).
- Review prompts in `services/ai-service.js` (PHASE_EXTRA_GUIDANCE) must be updated when adding phase types.
- Client validation in `screens/designer/editor.js` mirrors server validation in `engine/game-loader.js` — change both.
- **Step display names live in `screens/shared/phase-names.js`** (one canonical name per phase type; palette, Builder cards, refs, pickers, and the storyboard all read it). New phase types must be added there; never hardcode a step name in a screen.
- **Recipe-born configs carry a provenance stamp** (`config.recipe = {id, version, params}`, written by `compileRecipe`) that powers the library Customize setup knobs. `games/speed-quiz` AND `games/trivia-bluff` are drift-guarded: their phases must deep-equal a fresh compile of their stamp — change the recipe or the stamped params, never hand-edit their phases.
- **`$repeat`/`$map` count mode**: `forEach`/`$map` over an INTEGER recipe param iterates 1..N (`${item}` = round number) — for "how many rounds" knobs where round content is generated at game time (trivia-bluff). Customize's AI interview receives the dialog's knob labels (`knownSettings`) and must never re-ask them.

## 28 Phase Types
`engine/phase-schemas.js` is the single source of truth (validator + AI prompts + editor fields + `{{...}}` grammar). Quick reference:
1. `lobby` — wait for players
2. `collect` — text/drawing input; `rotateFrom` (rotation chains + `assignedFrom` links), `prefillFromAssigned`, `appendOnly`, `maxLength`, `assign:"pairwise"` (+`oddHandling:"triple"`, `rotatePairsFrom`, `reusePairsFrom` — accepts a pairwise collect OR team-split, `pairBy:{from,mode}` answer-keyed pairing from a collect-choice — opposite/same, best-effort), `passAllowed`, `simultaneousReveal`, `inputType:"drawing"`
3. `ai-process` — AI processes data; `perPlayer:true` for one item per student
4. `vote` — head-to-head or pick-one; `matchupsFromPairs`/`excludeAuthors`, literal `candidates`, `nextByWinner` branch routing
5. `eliminate` — remove players by percent or hook
6. `reveal` — show content; `scope:"pair"`+`pairsFrom` (pair-private), `scope:"own"`+`chainFrom` (return-to-author chains)
7. `preview` — teacher-only gate before reveal (requires `content`, `approveNext`, `rejectNext`)
8. `winner` — crown with drumroll; `winnerEntry` shows WHAT they won for
9. `announce` — message to everyone; `video:` YouTube embed (host-only), `image` field; `drawingFrom` shows a drawing (announce/collect/collect-choice all have it; `_current.drawing` in foreach = Doodle Bluff rounds)
10. `collect-choice` — pick from choices; `correctAnswer`+`speedBonus` (Kahoot scoring), `choicePool`/`excludeAuthored`/`shuffle`/`foolPoints`/`poolLimit` (bluffing)
11. `ai-eliminate` — AI judges and eliminates
12. `leaderboard` — rankings; `from` accepts array of refs to sum rounds
13. `reveal-one` — one-by-one reveal; `itemTemplate` for objects, `limit` random sample
14. `team-split` — `teamCount` OR `groupSize` (never singletons); `method: random|balanced|teacher|choice`; `capacity:"open"`
15. `rank` — reorder a list; earlier-step ref OR literal item list
16. `wager` — bet points, auto or host-resolved
17. `relay` — turn-by-turn collaborative input
18. `foreach` — sub-phases per item; `limit` sample (a round per response kills the room ~round 12), `pairMode:"human-vs-ai"`, scoring `correct`/`tally`/`scores` (scores = adopt the sub-phase's own graded map; the bluff-rounds mode, keeps foolPoints), `_current`/`_foreach`/`_candidates` vars; sibling-sub-phase refs remap automatically in message/prompt/instruction/correctAnswer/input/content/choices/choicePool.from/excludeAuthored ONLY — collect's rotation/pairing fields (rotateFrom, assign, pairsFrom, ...) are schema-banned inside foreach (`contexts: ['topLevel']`)
19. `rate` — 1-N custom scales; bar + pie results; `visibility: all|host-only`
20. `turn` — charades; server timer, team rotation, `poolLimit`
21. `merge` — shared live draft (think-pair-share) with ONE PEN: writing claims it, agreeing releases it, 2.5s idle lets a partner take it; `agreeMode both|any|timer`, `groupSize` 2/3/4 OR `groupsFrom` (adopt a pairwise collect's pairs or a team-split's teams); output `merged`
22. `one-voice` — cooperative counting; server-authoritative collision window
23. `end` — game over
24. `buzz` — first-tap-wins buzzer; outputs `scores`
25. `estimate` — numeric guessing; `scoring: closest|graduated`; no answer = poll mode
26. `match` — pair two lists; `pairs` + `pointsPerMatch`
27. `sort` — items into buckets; all-or-none correct buckets = graded vs consensus
28. `checklist` — group to-do list with live progress; `items` + optional `teamsFrom`; no scores

AI task types: `summarize`, `generate` (Haiku); `generate-choices`, `compare`, `rank`, `judge` (Sonnet).

## Key Files
- `server.js` — Express + socket handlers + template resolution
- `engine/` — GameEngine, StateMachine, PlayerRegistry, RoomManager, GameLoader (validation), phase handlers in `engine/phase-handlers/` + pure logic in `engine/phases/`
- `engine/phase-schemas.js` + `engine/resolver-grammar.js` — single sources of truth (phase fields; `{{...}}` syntax)
- `services/ai-service.js` — all AI calls via `_callClaude` (budget-gated by `services/ai-budget.js`); game review; mock mode
- `services/simulator.js` — robot playtest + chaos mode
- `screens/` — host, player, teacher, designer (editor.js/simple-view.js/builder), shared (design.css, juice.js, bot-brain.js, drawing.js, speech-input.js, feedback-widget.js)
- `games/*/config.json` — game configs; `recipes/*.json` — recipes; `recipes/prompt-banks/` — prompt banks (per-prompt attribution is load-bearing)
- `db.js` — Neon Postgres; `engine/room-snapshot.js` — restart survival
- `scripts/` — sim-harness.js + simulate-*.js playtest scripts, screenshot.js, demo-room.js

## When Adding a New Game
1. Copy games/_template to games/your-game-name
2. Edit config.json for simple games
3. Edit game.js only if you need custom logic
4. Add it to the snapshot map in `tests/engine/validator-diagnostics.test.js` (fails loudly on unknown games)
5. Test with: `npm test`, then `node scripts/simulate-any-game.js <game-id>` (server running)

## Safety (implemented)
- Content filter (`engine/content-filter.js` + blocklist) on submit-response, merge-draft, relay-submit
- Drawing safety = attribution + teacher-console thumbnails + preview gate (filter can't read pictures)
- Crash isolation: try/catch on every socket handler; unhandledRejection logs, never crashes
- Host moderation (hide/kick); PIN brute-force lockout (`engine/pin-throttle.js`)
- AI: SAFETY_RULES in every game-run prompt; name-stripping + PII scrub (see Standing Rules); cost guards (per-minute throttle + Neon-persisted daily cap, 429s)
- XSS output encoding enforced by test
- Anonymous mode: top-level `anonymous: true` (editor "Student names" setting) — server assigns "Color Animal" play names (`engine/anonymous-names.js`), typed names discarded unread; player join form hides the name box via `GET /api/rooms/:code/info`
- Not yet: rate limiting on non-AI socket events, PII redaction

## Environment
- `.env`: `ANTHROPIC_API_KEY` (real AI; absent = mock mode), `DATABASE_URL` (Neon; absent = filesystem), `SITE_PASSWORD` (site OWNER: feedback inbox, owner mode, built-in edits, teacher-console credential — the site itself is public), `AI_CALLS_PER_MINUTE` (default 20), `AI_DAILY_CAP` (default 500; 0 disables)
- Local dev shares the prod DATABASE_URL — owner ★ flips affect the live site

## Testing
- `npm test` — all Vitest tests (~4s; count in Current Snapshot)
- `node scripts/simulate-any-game.js <game-id>` — universal playthrough (server running)
- `node scripts/simulate-chaos.js [gameId] [--players N]` — school-wifi chaos suite
- `node scripts/simulate-restart.js` — restart-survival proof (needs DATABASE_URL)
- Named sims: simulate-closer/snowball/one-voice/team-modes/teacher-console/append-only/late-join/holding and others in `scripts/`
- CI: `.github/workflows/test.yml` on every push/PR; deploys only on green via `RENDER_DEPLOY_HOOK`

## Design Documents (docs/)
- **NEXT-STEPS.md** — living roadmap; check FIRST when asking "what should we work on?" (its "START HERE next session" block is current)
- **DESIGN-PHILOSOPHY.md** (engineering why) · **PEDAGOGY.md** (learning why) · **ARCHITECTURE.md** (what/how)
- **COMPARATIVE-ADVANTAGE.md** — positioning thesis + licensing gates (email pzlearn@gse.harvard.edu before public launch); research notes in `docs/research/`. Read before designing new activities.
- **COMPLIANCE-TODO.md** — COPPA/FERPA/§49073.1 checklist
- **PROJECTOR-STYLE.md** · **SURFACES-PLAN.md** · **LIBRARY-FIRST-PLAN.md** · **RECIPE-LAYER.md** · **connection-pack-spec.md** · **SAFETY-DESIGN.md** · **AUTHORING-DESIGN.md** · **GAME-CONFIG-DESIGN.md** · **AI-TASK-DESIGN.md**
- **CHANGELOG.md** — dated log of everything shipped (append new entries there) · **DEFERRED-IDEAS.md** — parked
- **CLAUDE-ARCHIVE.md** — full historical detail formerly in this file (ship-log, per-game descriptions, implementation notes)
