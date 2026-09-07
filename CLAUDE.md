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
- Claude API for AI (Haiku 4.5 for simple tasks, Sonnet 5 at medium effort for judgment; the per-model policy lives in AIService._callClaude, and Sonnet 5 rejects sampling params and prefills); mock mode without API key
- Neon Postgres for persistence (user games/recipes, snapshots, feedback, featured overrides, AI usage); filesystem fallback when `DATABASE_URL` unset
- Deployed on Render; CI deploys on green only

## Current Snapshot
- **1616 tests passing** (`npm test`, ~5s) · **321 prompts** across 3 banks (`recipes/prompt-banks/`)
- **30 phase types**, **26 built-in recipes**, ~33 games in `games/` (varies — use `ls games/`; `_`-prefixed dirs are hidden test fixtures)
- Server on port 3000 (`npm start`); **restart the server after code changes** (no hot reload)
- Full feature history: `docs/CHANGELOG.md` + `docs/CLAUDE-ARCHIVE.md` (detailed ship-log formerly in this file)

## Surfaces & Routes
- `/` home (13a, 2026-09-06: ONE red action "Pick a template" + Paper Create door on the left; the yard's board carousel with projector prints on the right, 1-2-3 cards beneath it; a shelf of five templates with Connect/Think/Review/Play chips drawn from `glimpse` on `/api/games` via `engine/home-glimpse.js`; student join in the header strip and the join board; `screens/home/shots/` are load-bearing, rerun regen-carousel-shots.js after a redesign)
- `/library` — teacher front door: search, goal chips, ▶ Host cards, ♥/recents, Customize dialog
- `/host` projector screen · `/player` student screen · `/teacher` private console (room code + PIN, or SITE_PASSWORD basic auth)
- `/teacher/report` printable activity report (engine/report.js via PIN-gated `GET /api/rooms/:code/report`) — built on demand from live room state, NEVER stored server-side, gone when the room expires; the step that is still OPEN is read live from the players (`liveDataFor`, marked "Still open"), which is how a rolling exit ticket gets read mid-step; browser print dialog = the PDF; names toggle defaults on; console links it (header + end-phase reminder card)
- `/designer` Create page (idea box → recipe match or storyboard) · `/designer/edit` editor (Simple | Builder | Advanced views; Simple is default; Ask AI = the design chat panel beside the Simple view, `screens/designer/chat-panel.js` + `POST /api/games/chat` — proposes changes as cards, Apply gated on validation, one-step Revert; "Just do it" = `forceEdit:true` turn that folds the whole conversation into one proposal)
- `/prototype` ("the simulator", button label Simulate) host + player iframes side-by-side for playtesting; the map rail is clickable: a stop row asks "Skip ahead?" then plays the room forward with bots until the live rail reaches that step (`?goto=<phaseId>` deep link does the same on launch)
- `/guide` one-page teacher guide (setup, live controls, quick fixes) · `/owner` owner-mode doorway (redirects to the library unlock; no in-page owner links)
- `/feedback` owner inbox (SITE_PASSWORD-gated)
- `/share/<id>` — share link landing page: "Save to my activities" imports a COPY via `POST /api/games/:id/copy` (engine/share-copy.js; featured stripped, new deduped id, never the same row); built-in ids redirect to `/library?about=`; Share button lives in the yard popup (own activities)
- Vanity URLs: `vanity-urls.json` (slug → game id) mints memorable paths like `/good-question` that redirect to `/host?game=<id>`; server refuses reserved/malformed slugs at startup
- Teacher profile (grade band + subjects, localStorage via `screens/shared/teacher-profile.js`) personalizes prompt-deck picks ("for your class") and Customize; set from the library's first-visit card
- Surfaces model: **find it in the yard, start it in Create, shape it in the Editor** (docs/SURFACES-PLAN.md). Every Make it yours dialog ends in three doors: Continue setup in the designer / See it in the simulator / Host it now (untouched = the original runs, no copy saved)

## Standing Rules (active doctrine — check before writing code or copy)
- **No em dashes in user-facing text** (students read them as an AI tell); comma, colon, or new sentence instead. En dashes in numeric ranges fine; Along bank verbatim; code comments/docs exempt. Enforced by `tests/style/no-em-dash.test.js` + `STYLE_RULES` in `AIService._callClaude`.
- **No decorative emojis** in descriptions/messages/prompts; icons only in icon slots (functional marks like ♥, goal chips, avatars, medals are fine).
- **Teacher-facing vocabulary (owner's calls, 2026-09-02):** the /library page is **the yard**; the copy-and-tailor action is **Make it yours** (never "Customize"); the /prototype page is **the simulator** and its button is **Simulate** (never "Preview", except the "Teacher preview" step type and the editor's live-mockup toggle, which are different things). "library", "customize", "preview" survive only in routes, ids, class names, file names, function names, and code comments. Same split as activity/game.
- **"Activity" vocabulary** in user-facing copy ("game" only when it truly is one). Internals keep "game" (`games/`, `gameId`, socket events, API routes) — never rename them.
- **The host screen is a projector** — never put teacher-private info there; that's what `/teacher` is for.
- **Payoff beats are host-paced, never timed** (reveals, winners, galleries).
- **Rolling start is a family, not a knob** (`start: "rolling"`, engine/phases/rolling.js): the room opens straight into the first step, the doorway card stays on the projector, timers are ignored, and each student gets their own done screen. Only for activities without roster-bound steps (pairs, teams, chains, rounds; the validator warns). Exit Ticket, Live Poll, Solo Quiz are the three shapes.
- **Fixed UI labels go through `engine/i18n/`** (server labels via `continueLabelForPhase(phase, phases, lang)`, screens via `UiLang.t('Submit')` + `UiLang.apply()`); a new student- or projector-facing label needs a row in every language table (drift-guarded). Top-level `language` (auto | en | es | fr | de | pt | it) resolves once in the GameEngine constructor; auto = stopword detection over the activity's own text.
- **Nothing student-drawn reaches the projector without a teacher gate** (preview phase or moderation).
- **No student name in any outbound AI payload** (pseudonymous playerIds + `engine/ai-name-fill.js` re-fill; `engine/pii-scrub.js` on free text — pass `rosterNames` on game-time calls).
- **Student text, teacher config, and AI output are all untrusted for rendering** — prefer `textContent`; HTML interpolation must escape (`escapeHtml`/`escapeHtmlText`; enforced by `tests/screens/xss-sinks.test.js`).
- **Teacher-save purity (§49073.1)** — saved objects (configs, recipes, templates) never contain student-generated content; anything that would needs full student-data treatment — prefer never taking it.
- **Projector style** (docs/PROJECTOR-STYLE.md) — content owns the projector; brand shrinks to a corner mark via `body.in-activity`.

## Gotchas & Patterns
- **Foreach sub-phases run in key order, and JSONB scrambles key order** (2026-09-06): `user_games.config` and `user_recipes.recipe` are JSON (never JSONB; jsonb sorts keys by length so Doodle Bluff copies voted before the fakes). Old rows are repaired on read from their recipe stamp (`repairSavedConfig` → `engine/subphase-order.js`); AI edits carry the order (`carrySubPhaseOrder`); the validator warns on a sub-phase reading a later sibling. Any new JSON column that holds a config must be JSON.
- **CSS display value overrides the `hidden` attribute** — any styled-display element toggled via `.hidden` needs a `[hidden]{display:none}` override in the same stylesheet (bitten 3+ times).
- **Close/* handlers must kind-guard `room.phaseState` AND be idempotent** — all-inputs-in auto-advance races a late host click.
- **A Close must wait for in-flight submissions** (`engine/pending-submits.js`, 2026-09-04): submit-response awaits the moderation ladder, so a teacher's Close can land while the last answers are mid-flight; close-submissions settles the holds first, then re-checks the phase. Any new async gap in a submit handler takes a hold; any new gather-and-advance path settles them. (Doodle Bluff's "only one title to pick" was a rotation dealt from a short list.)
- **Multiple-choice ballots are ONE list per step** (`buildSharedBallot` in collect-choice.js): sample + shuffle once, stored on `room.phaseState.ballot`; a student's own fake is removed from their copy only. Never shuffle per player.
- **New gameplay socket handlers**: `checkEventPayload` + `isStalePhaseEvent` + `recordEvent`; every handler runs in a try/catch wrapper.
- **New phaseState containing player ids** gets reconnect id-migration free via the deep walker (`engine/id-migration.js`); **new closers** must be reachable from the `advance-phase` routing switch.
- **New transition-bearing fields wire in SIX places**: state-machine graph, validator ref-existence, BFS+cycle (server AND client), recipe drop-rewiring, editor delete-relink.
- **Player-facing payloads sent from a handler's `onReconnect` must carry `phaseInstanceId: ctx.phaseInstanceId`** (direct `socket.emit` skips the `withPhaseSeq` wrapper); late joiners are the normal case in rolling activities, and a missing id makes the client's stale guard drop every follow-up (solo-quiz feedback, 2026-09-02).
- **Word help is a ledger plus a lookup** (2026-09-06, `engine/word-help.js`): top-level `wordHelp: {tokens, to}` gives each student a purse of word translations; the server owns the count (`room.wordHelp`, id-migrated on reconnect, snapshotted on restart), the client only displays it. `screens/shared/word-help.js` wraps every `setRichText` sink; new prompt sinks get tappable words for free, other text (choices, buttons) does not. Any future rationed help (hints, examples) should spend from the same purse rather than invent a second one. The tapped-word log is counts only, teacher surfaces only.
- **Bold is `**word**` and nothing else** (2026-09-03): the one inline format in teacher text. Simple view edits it as real bold (`screens/shared/bold-box.js`, contenteditable with a `.value` accessor; base weight pinned to 400 or the browser's bold command toggles off); every prompt/instruction sink on host and player goes through `setRichText` (`RichText.applyInline`), where bold paints yellow (`.prompt-bold`) because prompts are already heavy. New text sinks must use it, never bare textContent; excerpts strip the markers.
- **Multi-field collect responses nest under `fields.*`** — reveal templates reading top-level keys render silently blank.
- **AI responses wrap JSON in preamble** — always regex-fallback extraction.
- **Timing claims come from `engine/duration-estimate.js`, never the AI** (2026-09-06): the matcher is told not to claim a fit; the route computes the estimate from timers plus named allowances and attaches a trimmed copy when it runs over the minutes the teacher named. New allowances or floors go in that module's tables.
- **A student screen says "submitted" only after `response-accepted`** (2026-09-06): every submit path in player.js goes through `awaitSubmitAck`; new collect-style inputs must too, and any new server store path must emit the ack.
- **Identical generate instructions = identical output across sessions** — ai-process appends a variety spin (random seed + inspiration word + chestnut ban, `engine/phases/variety-spin.js`) to every `generate` task at call time; never bake session randomness into recipes/configs (drift guards).
- Phase handlers self-register in `engine/phase-handlers/` via `registerHandler(type, {onEnter, onReconnect})`; use `EVENTS` constants (`engine/events.js`) and `players.listPublic()` (strips tokens).
- Review prompts in `services/ai-service.js` (PHASE_EXTRA_GUIDANCE) must be updated when adding phase types.
- Client validation in `screens/designer/editor.js` mirrors server validation in `engine/game-loader.js` — change both.
- **Step display names live in `screens/shared/phase-names.js`** (one canonical name per phase type; palette, Builder cards, refs, pickers, and the storyboard all read it). New phase types must be added there; never hardcode a step name in a screen.
- **Foreach rounds: the people who know the answer sit out** (`engine/phases/sit-out.js`, 2026-09-06): the item's author AND the author of what it was made from (`_current.assignedFromId`, stamped by close-submissions on rotated collects) are stamped onto each collect/collect-choice sub-phase as `_foreachSitOutIds`; every count (enter, emit, reconnect, submit "N of M", close gather, teacher list) reads them through `withoutSitOut`/`sitOutMessage`. Never filter on `_foreachAuthorId` directly again. Anyone handed the SAME item as the round's author sits out too (a short teacher list repeats). `collect.dealItems` hands out a teacher list one per player (`{{thisStep.assigned}}`), the no-author alternative to `rotateFrom`. A `limit`ed foreach keeps the unsampled items as `{{X.skipped}}` (a reveal-one gallery of the drawings that got no round); a reveal-one with nothing to show skips itself.
- **Recipe-born configs carry a provenance stamp** (`config.recipe = {id, version, params}`, written by `compileRecipe`) that powers the library Customize setup knobs. `games/speed-quiz`, `games/trivia-bluff`, `games/exquisite-corpse` AND `games/doodle-bluff` are drift-guarded: their phases must deep-equal a fresh compile of their stamp — change the recipe or the stamped params, never hand-edit their phases.
- **Setup knobs come in five kinds** (`screens/shared/setup-knobs.js`): scalar `setup: true` (integer/boolean/enum), array `{mode:"count"}` (how many), array `{mode:"lines"}` (one item per line), string `{mode:"text"}`; any object form may carry `showWhen: "otherParam=value"` so the knob hides until that pick (Doodle Bluff's phrase list behind "teacher", topic behind "ai"). Validated in `engine/recipe-schema.js`; rendered as `.knob-row`s in library.js.
- **`$repeat`/`$map` count mode**: `forEach`/`$map` over an INTEGER recipe param iterates 1..N (`${item}` = round number) — for "how many rounds" knobs where round content is generated at game time (trivia-bluff). Customize's AI interview receives the dialog's knob labels (`knownSettings`) and must never re-ask them.

## 30 Phase Types
`engine/phase-schemas.js` is the single source of truth (validator + AI prompts + editor fields + `{{...}}` grammar). Quick reference:
1. `lobby` — wait for players
2. `collect` — text/drawing input; `rotateFrom` (rotation chains + `assignedFrom` links; `rotateShuffle:true` = random no-self deal instead of fixed shift, chain per-pool for multi-pool deals; leave `{{X.assigned}}` out of the prompt = a BLIND hand-off), `prefillFromAssigned`, `appendOnly`, `showTail:N` (the exquisite-corpse fold: player sees only the last N words of the inherited text, full text still accumulates; requires appendOnly), `maxLength`, `assign:"pairwise"` (+`oddHandling:"triple"`, `rotatePairsFrom`, `reusePairsFrom` — accepts a pairwise collect OR team-split, `pairBy:{from,mode}` answer-keyed pairing from a collect-choice — opposite/same, best-effort), `passAllowed`, `simultaneousReveal`, `inputType:"drawing"`
3. `ai-process` — AI processes data; `perPlayer:true` for one item per student
4. `vote` — head-to-head or pick-one; `matchupsFromPairs`/`excludeAuthors`, literal `candidates`, `nextByWinner` branch routing
5. `eliminate` — remove players by percent or hook
6. `reveal` — show content; `scope:"pair"`+`pairsFrom` (pair-private), `scope:"own"`+`chainFrom` (return-to-author chains; `chainDisplay:"template"`+`chainTemplate:"The {1} {2}..."` assembles blind one-word chains into a sentence)
7. `preview` — teacher-only gate before reveal (requires `content`, `approveNext`, `rejectNext`)
8. `winner` — crown with drumroll; `winnerEntry` shows WHAT they won for
9. `announce` — message to everyone; `video:` YouTube embed (host-only), `image` field; `drawingFrom` shows a drawing (announce/collect/collect-choice all have it; `_current.drawing` in foreach = Doodle Bluff rounds)
10. `collect-choice` — pick from choices; `correctAnswer`+`speedBonus` (Kahoot scoring), `choicePool`/`excludeAuthored`/`shuffle`/`foolPoints`/`poolLimit` (bluffing), `liveResults` (Live Poll: projector tally grows as answers land)
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
28. `checklist` — group to-do list with live progress; `items` (strings or `{text, role}` role-tagged) + optional `teamsFrom` (team-split OR pairwise collect, pairs share a list) + `rolesFrom` (team-roles; tags items as a role's job, viewer's own highlighted); no scores
30. `solo-quiz` — self-paced multiple-choice quiz (`questions` [{question, choices, correct}], `showAnswers`, `pointsPerQuestion`); per-student progress, projector shows a progress board only, two-stage close, output `scores`; built for rolling start
29. `team-roles` — job per group member (Facilitator/Recorder/...); `teamsFrom` (team-split OR pairwise collect) + `roles` + `method: random|choice` (choice = claim-a-role with per-group capacity ceil(members/roles), stragglers auto-filled at close); output `byPlayer` so `{{X.mine}}` = your role, `rolesList` = the lineup

AI task types: `summarize`, `generate` (Haiku); `generate-choices`, `compare`, `rank`, `judge` (Sonnet).

## Key Files
- `server.js` — Express + socket handlers + template resolution
- `engine/` — GameEngine, StateMachine, PlayerRegistry, RoomManager, GameLoader (validation), phase handlers in `engine/phase-handlers/` + pure logic in `engine/phases/`
- `engine/phase-schemas.js` + `engine/resolver-grammar.js` — single sources of truth (phase fields; `{{...}}` syntax)
- `services/ai-service.js` — all AI calls via `_callClaude` (budget-gated by `services/ai-budget.js`); game review; mock mode
- `services/simulator.js` — robot playtest + chaos mode
- `screens/` — host, player, teacher, designer (editor.js/simple-view.js/builder), shared (design.css, juice.js, bot-brain.js, drawing.js, speech-input.js, feedback-widget.js, meadow.js — the post-submit waiting field, a SHARED space since 2026-08-30: server-assigned canonical block indexes + relayed nudges via `engine/meadow-sync.js`, payloads are anonymous {index, fx, fy} only)
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
- **Moderation ladder** (`services/moderation-ladder.js`, needs `OPENAI_API_KEY`): OpenAI moderation scores block the obvious (≥ blockAt rejects), the uncertain band goes to Haiku (`AIService.moderateText`), Haiku's "unsure" flags the entry on the teacher console ("Needs a look" chip via `responseFlagged` → `buildSubmissionList.flagged`; teacher surfaces only, never the projector). On collect submits + relay lines; NOT merge drafts (per-keystroke) or drawings (owner's call). Fail-open on OpenAI errors, fail-to-teacher on Haiku errors; sim rooms and PII-scrubbed text only
- Drawing safety = attribution + teacher-console thumbnails + preview gate (filter can't read pictures)
- Crash isolation: try/catch on every socket handler; unhandledRejection logs, never crashes
- Host moderation (hide/kick); PIN brute-force lockout (`engine/pin-throttle.js`)
- AI: SAFETY_RULES in every game-run prompt; name-stripping + PII scrub (see Standing Rules); cost guards (per-minute throttle + Neon-persisted daily cap, 429s)
- XSS output encoding enforced by test
- Anonymous mode: top-level `anonymous: true` (editor "Student names" setting) — server assigns "Color Animal" play names (`engine/anonymous-names.js`), typed names discarded unread; player join form hides the name box via `GET /api/rooms/:code/info`
- Not yet: rate limiting on non-AI socket events, PII redaction

## Environment
- `.env`: `ANTHROPIC_API_KEY` (real AI; absent = mock mode), `DATABASE_URL` (Neon; absent = filesystem), `SITE_PASSWORD` (site OWNER: feedback inbox, owner mode, built-in edits, teacher-console credential — the site itself is public), `AI_CALLS_PER_MINUTE` (default 20), `AI_DAILY_CAP` (default 500; 0 disables), `OPENAI_API_KEY` (moderation ladder; absent = blocklist only), `MODERATION_BLOCK_AT`/`MODERATION_REVIEW_AT` (ladder thresholds, defaults 0.85/0.4), `OPENAI_MODERATION_URL` (test stub override)
- Local `.env` points at a Neon **dev branch** (since 2026-08-30), isolated from prod: local DB writes never reach the live site, and owner ★ flips / built-in edits must be done on jamyard.xyz itself. Refresh dev data via the branch's "Reset from parent" in the Neon console.

## Testing
- `npm test` — all Vitest tests (~4s; count in Current Snapshot)
- `node scripts/simulate-any-game.js <game-id>` — universal playthrough (server running)
- `node scripts/simulate-chaos.js [gameId] [--players N]` — school-wifi chaos suite
- `node scripts/simulate-restart.js` — restart-survival proof (needs DATABASE_URL)
- Named sims: simulate-closer/snowball/one-voice/team-modes/teacher-console/append-only/late-join/holding and others in `scripts/`; `simulate-submit-race.js` spawns its own server + slow moderation stub (four students, immediate Close)
- CI: `.github/workflows/test.yml` on every push/PR; deploys only on green via `RENDER_DEPLOY_HOOK`

## Design Documents (docs/)
- **NEXT-STEPS.md** — living roadmap; check FIRST when asking "what should we work on?" (its "START HERE next session" block is current)
- **DESIGN-PHILOSOPHY.md** (engineering why) · **PEDAGOGY.md** (learning why) · **ARCHITECTURE.md** (what/how)
- **COMPARATIVE-ADVANTAGE.md** — positioning thesis + licensing gates (email pzlearn@gse.harvard.edu before public launch); research notes in `docs/research/`. Read before designing new activities.
- **COMPLIANCE-TODO.md** — COPPA/FERPA/§49073.1 checklist
- **PROJECTOR-STYLE.md** · **SURFACES-PLAN.md** · **LIBRARY-FIRST-PLAN.md** · **RECIPE-LAYER.md** · **connection-pack-spec.md** · **SAFETY-DESIGN.md** · **AUTHORING-DESIGN.md** · **GAME-CONFIG-DESIGN.md** · **AI-TASK-DESIGN.md**
- **CHANGELOG.md** — dated log of everything shipped (append new entries there) · **DEFERRED-IDEAS.md** — parked
- **CLAUDE-ARCHIVE.md** — full historical detail formerly in this file (ship-log, per-game descriptions, implementation notes)
