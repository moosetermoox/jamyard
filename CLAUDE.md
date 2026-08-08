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
- **Library-first (2026-07-28, Phase 1 of docs/LIBRARY-FIRST-PLAN.md)** — `/library` is the teacher front door: search + goal chips (Connect first), run-focused cards (▶ Host primary, Try it, ♥/Recents via shared `screens/shared/activity-prefs.js`), builder doorway ("Build your own" → optional note filed as feedback category `builder-request` → /designer; signal-only, /designer never gated). Home = ONE primary card → /library + student join; designer demoted to footer link. Runs-not-builds metric: `activity_runs` Neon table (game_id/player_count/started_at only — no student data), recorded once per room at start-game (never simulated rooms), owner-gated `GET /api/activity-runs`.
- Home screen at / (one primary "Find an Activity" card → /library + student room-code join)
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
- **Designer-vibe default theme** — host + player auto-apply the pop-art preset on load. Archivo Black display font, 3px black borders, warm cream canvas — matches the editor.
- **Builder mode (2026-08-01)** — third editor view (Simple | Builder | Advanced pill): left step palette (click-to-add), plain-English step cards with **+** gaps offering ranked next-step suggestions (`screens/shared/step-suggestions.js` — pure rules mined from built-in transition frequencies, zero AI; every suggested default is validator-certified hostable-as-is by test), AI tiles land as ai-process+reveal pairs with pre-written instructions, "Wrap it up" appears once the activity has an arc (≥1 ask + ≥1 show/decide), finish panel (Try with pretend players / Host live) when arc+end complete. Rail = Activity/Step tabs hosting the RELOCATED real `#settings-panel` and portable `#phase-config-form` (no duplicated forms) + a Builder-owned primary-text field. Enters via programmatic Advanced-pill click (keeps simple-view's selectPhase wrapper from flipping views); the editor's click-outside-collapse is body-class-guarded in Builder (re-renders detach clicked nodes, so closest() can't be trusted). Simple view untouched, still default. Surfaces model: **find it in the Library, start it in Create (/designer, grid removed), shape it in the Editor** — see docs/SURFACES-PLAN.md.
- **Storyboard-before-generate (2026-08-01)** — AI proposes a SEQUENCE OF BRICKS (never config JSON) via POST /api/games/storyboard; teacher approves/edits words in the Create page's step cards; `StepSuggestions.compileStoryboard` assembles guaranteed-valid structure; opens in Builder. New bricks: `collect-two` (secret+clue) + `guessing-rounds` (pair-aware foreach: show clue → typed guesses → reveal). DECIDED: promote to the DEFAULT "Make it" path once real use proves it (recipes = fast path; legacy generator retires).
- **Projector style rules (2026-08-02, docs/PROJECTOR-STYLE.md)** — content owns the projector (brand shrinks to a corner mark outside the lobby via `body.in-activity`); announce/reveal messages render first-short-line-as-headline + left-aligned Nunito body (`renderProjectorMessage` host / `renderPlayerMessage` player, textContent-only); numbered `responses.list` output renders as cards. Gotcha fixed twice now: `[hidden]` needs display:none overrides (phase-image dot).
- **Builder polish (2026-08-02)** — palette is ONE taxonomy: essentials (validator-certified bricks) + "All step types →" expands ALL 28 in the same verb groups in place (old picker modal no longer used from Builder); non-brick tiles insert a skeleton + blue "fill in its settings" rail nudge (no dashed-border code, it wasn't readable); "Loop this section" hidden from the Builder rail (one game uses loops; recipe covers it; Technical view keeps it); + circles quiet until hover. Editor header: Preview (renamed) + ▶ Host (validating save → /host). beforeunload guard on unsaved edits. Question & Share template (picker slot 2). Usability agents (Dana/Marcus) ranked backlog: docs/SURFACES-PLAN.md §8.
- **Design system (2026-08-01)** — `screens/shared/design.css` (linked by every page): self-hosted Archivo Black (display/headings) + Nunito (body) woff2 fonts + shared design tokens; prototype screen restyled from dark navy to pop-art; chrome canvas unified to `#FFFDE7`. Decorative emojis stripped from all config/recipe text and copy sentences (functional UI marks — ♥, 💬, goal chips, 🕊, avatars, medals — kept; recipe `icon` fields kept). Rule: no emojis in descriptions/messages/prompts; icons only in icon slots.
- **Turn phase** — charades/describe-it gameplay with server-authoritative timer, team rotation (Got It / Skip), pool drawn from prior collect step. Powers Charades Bowl.
- **Bluffing primitives** — `collect.assign:"pairwise"`, `vote.matchupsFromPairs`/`excludeAuthors`, `collect-choice.choicePool`/`excludeAuthored`/`shuffle` unlock Jackbox-style bluffing games as plain config.
- **Speed-bonus scoring** — `collect-choice` with `correctAnswer` + `speedBonus` grades responses at close time with Kahoot-style time-decay points (`engine/speed-scoring.js`).
- **Neon Postgres persistence** — user-created games (`user_games`) AND user-saved recipes (`user_recipes`) stored in Neon (`db.js`); both survive Render redeploys (recipes were filesystem-only until 2026-07-19 — "Save as Recipe" silently died on deploy). Built-in games/recipes stay on filesystem; DB user recipes win over same-id files. `DATABASE_URL` env var enables; falls back to filesystem when unset (local dev unchanged). Startup migrates any filesystem strays into the DB.
- **Owner password (SITE_PASSWORD) + curated public site** (2026-07-26 rework) — the site is public by design: visitors can host featured activities and build their own. `SITE_PASSWORD` is now the OWNER's password: it gates the feedback inbox (`/feedback` + `GET/PATCH /api/feedback`), `/api/owner-check`, and edits/deletes of BUILT-IN activities; it also still works as a teacher-console credential. Public pickers (host/designer/prototype) show only `featured: true` built-ins plus activities created on that device (`screens/shared/game-visibility.js` + `my-games.js` localStorage ids; one filter, three screens). Owner mode ("Site owner? Show everything" link on the designer grid → `owner-mode.js` unlock via basic auth) reveals everything + per-card ★ featured toggles (built-in flags flipped on Render last until redeploy — durable changes belong in the repo configs). Featured set (10, thesis-forward rebalance 2026-07-27 per docs/COMPARATIVE-ADVANTAGE.md): someones-got-you, whose-eyes, both-sides-rope (the new slate), one-voice, snowball, weekend-poem, art-gallery, speed-quiz, vocab-match, group-work-day. story-quest + who-said-it unfeatured (still in library).
- **Site feedback** — floating 💬 widget (`screens/shared/feedback-widget.js`, createElement/textContent only) on home/designer/editor/prototype POSTs to `/api/feedback` (open, per-IP rate-limited via `engine/simple-rate-limit.js`, validated + content-filtered via `engine/feedback-validate.js`; anonymous by design — no name/email fields). Stored in Neon `feedback` table (`data/feedback.ndjson` fallback for local dev — Render's filesystem is ephemeral). Owner inbox at `/feedback`: New/Done/All tabs, mark-done. Store: `services/feedback-store.js` (injected deps, tested).
- **YouTube video embed** — `video:` field on announce/reveal/collect/collect-choice. Host-only; `engine/video.js` parses watch/youtu.be/embed/shorts URLs.
- **Content safety pipeline** — `engine/content-filter.js` (blocklist + mash detection) gates `submit-response`; AI system prompts include safety rules block; host moderation panel (hide/kick) on collect phases.
- **Editor UX** — H/P/AI role dots removed; form labels sentence-case; inputs softer 2px border with focus transition; more whitespace; section bands cleaned up; primary textarea auto-expands; "+ Insert from earlier step" hidden when no upstream refs exist; inserted {{tokens}} show as deletable chips in preview row.
- **Button renames** — "Check My Game" → "Check for Errors"; "Test Game" → "Prototype Mode".
- **Rank phase drag-and-drop** — players can drag items to reorder (HTML5 drag + touch for touchscreen Chromebooks/tablets); drag handle (☰) + drop highlight; arrow buttons kept as fallback. Rank handler also now accepts comma-separated string candidates (AI generators emit this format) — splits automatically so literal `candidates` values work without being arrays.
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
- **Recipe compiler conditionals (R7)** — declarative directives in recipe JSON: `$if` conditions (`name`, `!name`, `name=value`, `name!=value`) drop phases/fields/array elements; `{$if, $value}` envelope for conditional scalar fields; transitions auto-rewire through dropped phases (linked-list unlink, chains followed, dangling ref = compile error); `$repeat` inside `phases` generates one phase per array item (`${item.x}`, `${i}`, `${n}`, `${nextKey}`); `$map` builds derived arrays (leaderboard summing N rounds); placeholders support dotted paths (`${item.question}`). New `object` param type with `fields` (+ picker card widget; array sub-fields are comma-separated inputs). Closed the 3× limitation: One Voice has `maxAttempts`, Snowball has `snowballAgain` (groups of 4), Closer has `partners` (new-each-tier / same-all-game) — and the long-deferred **quiz-show recipe shipped** (one collect-choice round per teacher-written question, speed bonus, leaderboard).
- **Sim harness** — `scripts/sim-harness.js`: reusable multi-client primitives (buffered event waiting, `setupRoom`/`teardown`, reporter) for headless playthroughs against a running server. Each Connection Pack experience has a sim asserting its privacy/timing invariants.
- **Idea-first front door** — `/designer` opens with one big box ("What do you want to play with your class?") that routes through `from-description` recipe matching; Enter submits, example chips fill the box (all four verified to route: One Voice / Class Poll / Snowball / Elimination Tournament), `?idea=` deep-link auto-launches the flow. The old three buttons are demoted to "Browse recipes / Start from scratch" links; the no-match view still offers the picker + legacy whole-config generator.
- **Robot playtest in "Check for Errors"** — deep review now ALSO plays the game: `services/simulator.js` self-connects 1 host + 4 bot clients to the running server in a hidden temp room (`_sim-tmp-` prefix → `room.simulated` → mock AI, zero API spend) and drives every phase type end-to-end, in parallel with the Sonnet review (no added latency). Catches the runtime bug class static review can't see: stalls (with a force-skip warning), crashed phases (`phase-error` capture + skip), blank screens, empty rank/vote/choice payloads, unresolved `{{tokens}}` and `[object Object]` reaching students, nobody-eligible-to-vote. Findings deep-link to phases by prompt-text matching; review panel shows a 🤖 banner (completed/stuck + duration + steps). Every bot emit echoes `phaseInstanceId`, so the stale-event guard makes double-advances impossible. First run caught a real shipped bug (mood-check's `{{process.result.content}}`). Typical runs: simple game ~2s, 16-step foreach game ~11s, cap 45s.
- **Teacher console** — `/teacher` is a private second-device view (the host screen is projected, so "teacher-only" UI there is actually public). Teacher's second device (laptop or spare Chromebook) joins with the room code + a 4-digit PIN shown click-to-reveal ("👁 Teacher view" chip on the host screen); with `SITE_PASSWORD` set, the basic-auth header on the socket handshake works instead (`engine/teacher-auth.js`, pure + tested). Console gets: live entries with names (hide/kick), preview approve/reject, close-submissions, next-step, live counts, phase tracking (`teacher-phase` event). Privileged socket actions (moderate-*, preview-*) now check `isTeacherSocket` (host OR joined console). Preview content on the projected host screen is hidden by default behind "👁 Show on this screen". Verified by `scripts/simulate-teacher-console.js` (incl. intruder-can't-moderate and hidden-entry-never-reaches-class). Mobile-polished via screenshot review: "X of Y in" count seeds on join, "Next step" hidden during preview (Approve/Try again are the only paths — can't accidentally skip the review). **Console wave 2026-07-27**: lobby shows live joined roster (`teacher-roster` event) + explicit "Start activity" button (generic advance hidden in lobby); advance button uses continue-labels ("Send the question to students ▸"); every console pairing announced on host + other consoles (`teacher-console-joined`); host PIN chip is two-step-confirm with 15s auto-hide (hides instantly once a console pairs); stale-guard fix — no phaseInstanceId yet (lobby) means nothing can be stale (the console's first click used to be silently dropped).
- **Prompt-aware Bot Fill** — `screens/shared/bot-brain.js` (`botAnswerFor(prompt)`): pure rules, no AI — keyword banks (food/feelings/places/excuses/ideas/story/etc.), embedded-choice picking ("pizza, sushi, or tacos?" → one of them), yes/no detection, "one word" handling, playful generic fallback. Multi-field inputs match each field's placeholder; merge bots combine the seed answers they can see. Browser global + side-effect-importable for tests.
- **Juice pack** — `screens/shared/juice.js` (browser global + side-effect-importable for tests): Web Audio synthesized SFX (cue table, per-cue throttle, gesture-unlocked AudioContext), theme-colored canvas confetti (reads `--theme-*` CSS vars, honors prefers-reduced-motion), deterministic emoji avatars (`Juice.avatarFor(name)` — consistent across host lobby/leaderboard/winner/teams and the student's own device), persisted mute chip on host. Themes declare `juice.wave` (arcade=square, ocean=sine...) surfaced as `window.__themeJuice`. Host: join pop, progress blips, reveal chimes, leaderboard tada + staggered rows, winner fanfare+confetti, timer ticks. Players stay quiet except own moments (submit blip, personal win confetti). All guarded — juice can never break gameplay.
- **Simple view (plain-English editor)** — `screens/designer/simple-view.js`: the editor's DEFAULT view renders each step as a sentence with its editable text inline ("Students answer: [box] · passing allowed · ⏱ 120s"), per-step "✨ Ask AI" for structural changes, "Advanced settings →" to the canvas. Choices/rank items/wager options are inline add-remove rows; foreach sub-steps render indented; structural facts (pairing, loops, scoring) read as sentence fragments. Simple/Advanced pill in the header, preference in localStorage. Implementation: wraps `renderCanvas()` (stays in sync with every mutation path incl. Ask-AI apply) and `selectPhase()` (review-panel deep links flip to Advanced first). Most teachers should never need the phase graph.
- **Friendly tokens everywhere** — teachers never see raw `{{ref}}` syntax: Simple view renders tokens as chips inside token-aware text boxes; Advanced primary textareas + screen-control/sidebar template fields tokenize to `[label — step N]` via `buildTemplateVariables` (labels are step-unique — duplicate labels used to let detokenize rewire refs to the wrong step); `phaseContentLabel` strips tokens from step-reference sentences. Validator rule `SPECIAL_SCOPE_OUT_OF_CONTEXT` warns when `_current`/`_foreach`/`_candidates`/`_pair` appear where they can't resolve (would render raw to students).
- **AI cost guards** — every real Anthropic call passes through `AIService._callClaude`, gated by `services/ai-budget.js`: per-minute throttle (`AI_CALLS_PER_MINUTE`, default 20) + daily cap (`AI_DAILY_CAP`, default 500; 0 disables). Day counter persists in Neon `ai_usage` table — restarts/redeploys can't reset it. Blocked calls throw `AiBudgetError` (429, friendly message) before reaching the API. Editor endpoints return 429; in-game AI failures hit the phase-error pause. `GET /api/ai-budget` shows today's usage.
- **Branching votes** — `vote.nextByWinner` maps a literal option's text to the phase the game goes to when it wins (CYOA storytelling); winner not in the map falls back to `next`; tie-breaks are deterministic (alphabetical). Vote phases also accept teacher-typed literal `candidates` arrays now (the editor has per-option "If this wins →" dropdowns). Found+fixed two latent crashes: late "Close Voting" after all-votes-in auto-advance crashed the server (now `kind`-guarded + idempotent), and the universal sim's vote support never worked (wrong event names).
- **Room snapshots — games survive server restarts** (`engine/room-snapshot.js` + `room_snapshots` Neon table): every phase transition snapshots the room (engine position, phaseData, players+tokens, scores, kicked tokens); a restarted/slept server lazily resurrects the room when the host (`hostToken` in sessionStorage → `host-rejoin`) or a player (existing token rebind) returns. Semantic: resume at the START of the interrupted phase. Mid-foreach restores re-enter the foreach parent fresh. Host disconnect now holds the room 5 min for rejoin (was: instant deletion — a host F5 used to kill the game for the whole class). Snapshots TTL-swept at 6h; `_sim-tmp-` rooms never persisted. Verified by `scripts/simulate-restart.js` (plays → SIGKILLs the server → restarts → host+player rejoin → asserts roster/phase/PIN survived + wrong hostToken rejected).
- **Chaos-tested** — `node scripts/simulate-chaos.js` runs every interactive phase type under school-wifi hostility (chaos mode in `services/simulator.js`: players drop/reconnect mid-phase via token rebind, ghosts join with dead tokens, stale/malformed/duplicate event sprays) — all 6 suite games must complete. Key invariant it enforces: **player-id migration on reconnect** (`engine/id-migration.js`, called in join-room) deep-rewrites the old socket id through `room.phaseState` + `engine.phaseData` + `foreachState`, so turn describers keep working buttons, relay turns survive, votes count, and leaderboard scores follow players across wifi blips. Also enforced: generic `advance-phase` closes the current phase first (routes to tallyAndAdvance/closeRanking/closeOneVoice/closeBuzz/closeMerge, flushes rate/estimate) — a teacher-console "Next step" can no longer skip a phase's data close.
- **Match phase** (26th type) — pair two lists (vocab ↔ definitions); left column fixed, right column drag-to-SWAP (touch + arrows fallback); `pairs` literal array + `pointsPerMatch`; close = discussion moment (per-pair class accuracy bars on host, personal score + answer key on players); output `scores` is a scoreMap. Pure scoring in `engine/phases/match-scoring.js`. First game: Vocab Match.
- **Teams upgrade** — team-split sizing by `teamCount` OR `groupSize` (count computed via `engine/phases/team-grouping.js` — 22 kids in groups of 4 → 4,4,4,4,3,3, never a singleton); two new interactive methods: `teacher` (tap-a-name-tap-a-team roster on the host screen + Confirm) and `choice` (students claim open spots FCFS, re-pick allowed, full teams bounce only the tapper, stragglers auto-filled into emptiest teams on confirm/all-placed). Output shape unchanged (`teams`/`playerTeam`) so turn/relay/leaderboard consume all methods identically. Privileged actions (`team-assign`/`team-split-confirm`) check `isTeacherSocket`. `capacity:"open"` (choice mode) removes the even-split spot caps for classes whose teams already exist in the real world — students tap their own team, uneven sizes/absences never lock anyone out (default `"even"` keeps the fair-pick caps). Verified by `scripts/simulate-team-modes.js` (18 socket-level invariants incl. intruder rejection + open-capacity pile-on) against the `games/_team-modes` fixture.
- **Sort phase** (27th type) — categorization: students tap a bucket for every item (drag rejected — miserable on small touchscreens); `buckets` + `items` where correct buckets are all-or-none (all = graded via `pointsPerItem`, none = consensus poll à la estimate's poll mode); close shows per-item class distributions with the correct bucket highlighted. Pure scoring in `engine/phases/sort-scoring.js`. First game: Metaphor or Simile? (graded round + consensus round).
- **Drawing input (v1)** — `collect.inputType:"drawing"` swaps the text box for a stroke-based drawing pad (`screens/shared/drawing.js`: pointer-events pad, palette, undo/clear, animated stroke replay; strokes normalized 0-1 so any surface renders them). Server validation in `engine/drawing.js` (caps, clamping — the content filter can't read pictures, so safety = attribution + moderation thumbnails on the teacher console + teacher preview before reveal). Works with `reveal-one` (animated gallery with ✏️-name captions), `rotateFrom` (drawing source preloads onto the recipient's pad = continue-the-drawing; shows read-only above a text box = caption mode), preview, and Bot Fill (`Draw.scribble()`). AI steps can't read drawings (validator warns). v2 (live mural / tile wall phase) deliberately deferred. Games: Art Gallery, Finish My Drawing.
- **Mic input (2026-08-07)** — `screens/shared/speech-input.js` (browser global `Speech`, side-effect-importable): "🎤 Speak instead" button on the player collect textarea + compact per-field mics on multi-field collects, via the browser's built-in Web Speech API (Chrome/Chromebooks). Feature-detected (no button on unsupported browsers; "Mic unavailable" when admin-blocked), dictation merges with typed text (never overwrites), respects maxLength, fires input events (counters react), stops on section change/submit. NO audio reaches the server — only final text through the normal submit path + content filter (recognition itself runs through the browser's speech service, i.e. Google on Chromebooks). Prototype player iframes carry `allow="microphone"`.
- **Checklist phase** (28th type) — shared group to-do list with a live progress dashboard: teacher writes the tasks, each group (from `teamsFrom`, or per-student without it) checks items off together (any member, un-check allowed, attribution shown to group + teacher console but never the projector); host shows per-group progress bars + per-group finish celebrations; teacher console gets full detail + check-on-behalf; close = summary moment. No scores — completion tracking for lab days/stations/project work. Pure logic in `engine/phases/checklist-state.js`. First game: Group Work Day; **group-work recipe shipped with it** (tasks + group size + method + optional work timer).
- **"Activity" vocabulary** — user-facing copy says **activity** (the umbrella word teachers use: games, polls, critiques, checklists all fit); "game" stays only where something genuinely is a game (e.g. the elimination-game example chip). End screens say "That's a wrap!", host button "End Session". Internals unchanged on purpose: `games/`, `gameId`, `GameEngine`, socket event names, API routes all keep "game" — this was a copy-level sweep, not a rename.
- **Library controls** — designer grid has search, goal chips (from config `tags` using a fixed goal vocabulary: connect/create/discuss/decide/reflect/energize/review — seeded into ~14 configs), ♥ favorites and "Recently used" sections (localStorage, same no-accounts model as MyGames). One render entry point: `refreshLibrary()` in designer.js.
- **Descriptive continue buttons** — announce and reveal host buttons say what happens NEXT ("Start the voting", "Send the question to students") via pure `engine/phases/continue-labels.js` (`continueLabelForPhase(phase, config.phases)` — covers virtual foreach sub-phases; unknown types fall back to "Continue"). Payload field `continueLabel` on ANNOUNCE/SHOW_RESULTS host emits.
- **972 tests passing** · **261 prompts** across 3 banks (recipes/prompt-banks/) (`npm test`)
- **Decorative-scoring nets (2026-08-03)** — the two-truths bug class is fenced three ways: validator `SCORING_NEVER_AWARDS` (zero pointMaps; leaderboard/winner reading scores no phase can produce), robot-playtest ERROR on an all-zero leaderboard, and AI-generation guidance (capture the secret in its own field / no zero pointMaps / every guess loop gets a reveal beat). Also: `turn.poolLimit` caps the charades bowl (drawn set stored as `.pool` for later rounds — same-bowl invariant), and foreach sub-phases can reference sibling data in templates (`{{guess.barChart}}`, `{{guess.responses.list}}` — remapSubPhaseRefs, already existed).
- **Bluffing scoring primitives (2026-08-03)** — collect-choice `foolPoints` (author of a fake earns N per classmate who picks it — `engine/phases/bluff-scoring.js`; needs `excludeAuthored`) + `poolLimit` (per-player ballot cap; injected literals always survive the sample). two-truths-a-lie rebuilt on multi-field lie capture + `_current.shuffledFields` + correct-answer scoring + reveal-lie beat; definition-bluff/trivia-bluff deliver their promised scoring + leaderboards; human-vs-ai reveals which idea was the AI.
- **Durable featured curation (2026-08-03)** — owner ★ flips of BUILT-IN activities persist to the Neon `featured_overrides` table via `POST /api/games/:id/featured` (repo flags = defaults; overrides win in both game listings via pure `engine/featured-merge.js`; flipping back to the default deletes the override; owner cards show a • drift marker when live state differs from the repo). The old whole-config PUT wrote to the ephemeral disk and reverted on every deploy.
- **Day-one kit polish (2026-08-02)** — the review's feature-worthy games fixed against their notes. New primitives: `collect.appendOnly` (inherited rotation text renders read-only; server rebuilds the response from its own copy — vandal-proof accumulating chains; verified by `scripts/simulate-append-only.js`) and rotation collects stamping `assigned` onto response records (`{{_current.assigned}}` usable in reveal-one itemTemplates — killed whose-eyes' retype field). Gotcha fixed: multi-field collect responses nest under `fields.*` — reveal templates reading top-level keys render silently blank (whose-eyes' circle did this since ship).
- **Coherence review + action wave (2026-08-02)** — all 41 games agent-reviewed for classroom worthwhileness (docs/GAME-COHERENCE-REVIEW-2026-08-02.md; thesis games swept the top). Shipped: `limit` sampling cap on foreach/reveal-one (`engine/phases/sampling.js` — the #1 finding was foreach-over-every-response killing rooms ~round 12; capped in the 8 worst configs, never where fairness is the point), 4 games cut (simple-poll, llm-or-duck, roast-me-if-you-can, feedback-coach-academy), placeholder content fixed (class-critique, lightning-round, vocab-match, group-work-day), feedback-academy restructured (rotateFrom peer review + reveal scope:"own" feedback return, no public grading), 16 payoff timers removed across 13 configs (**rule: payoff beats are host-paced, never timed**), speed-quiz rebuilt to 5 questions. Review's remaining backlog lives in the review doc.
- Simulator scripts for automated playtesting: `node scripts/simulate-any-game.js <game-id>` (universal), `simulate-closer.js`, `simulate-snowball.js`, `simulate-one-voice.js` (scripted tap timings), `simulate-team-modes.js` (teacher/choice team-split invariants), `simulate-connection-slice.js`, `simulate-corn-story.js`, `simulate-scamper.js`, and others in `scripts/`
- **Visual review tooling** — `scripts/screenshot.js` (headless screenshots via Chrome DevTools Protocol; required for socket pages — host/player/teacher hold a socket open so they never reach network-idle and `--virtual-time-budget` hangs) + `scripts/demo-room.js` (spins up a live room with bot players, holds at collect or preview, prints CODE/PIN — for second-device testing and screenshot harnesses)

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
21. **Lightning Round** (games/lightning-round/) — announce → buzz → estimate ×2 → leaderboard → end
   - First buzz + estimate game: buzzer round (teacher asks aloud) then two guess-the-number questions; leaderboard sums scores across all three phases
22. **Story Quest: The Locked Library** (games/story-quest/) — chapters + 2 branching votes → converging finale → end
   - First branching-vote game: class-steered choose-your-own-adventure; each vote's winner routes the story (`nextByWinner`), paths converge on a shared finale
23. **Vocab Match** (games/vocab-match/) — announce → match ×2 → leaderboard → end
   - First match-phase game: French vocab round + inventors round, leaderboard sums both; the template for any vocab/definitions review
24. **Metaphor or Simile?** (games/metaphor-or-simile/) — announce → sort (graded) → sort (consensus) → leaderboard → end
   - First sort-phase game: scored figure-of-speech ID round, then a no-right-answers class-verdict round (Genius vs Chaos); the template for any categorization review
25. **Art Gallery** (games/art-gallery/) — announce → collect (drawing) → preview → reveal-one gallery → end
   - First drawing game: everyone draws one prompt, teacher previews the thumbnails, then the gallery reveals one animated drawing at a time
26. **Finish My Drawing** (games/finish-my-drawing/) — draw → pass & continue ×2 → preview → gallery → end
27. **Group Work Day** (games/group-work-day/) — announce → team-split → checklist → wrap announce → end
   - First checklist game: groups work a shared to-do list while the projector shows live progress bars; the template for lab days, stations, and project sessions
   - First drawing-rotation game: each drawing passes through three artists (inherited strokes preload onto the pad); nobody knows what theirs became until the reveal
28. **Whose Eyes?** (games/whose-eyes/) — collect viewpoints → rotateFrom multi-field "step inside" → reveal-one circle
   - Thesis-slate perspective circle (2026-07-27, from docs/COMPARATIVE-ADVANTAGE.md): each student speaks from a DIFFERENT classmate's suggested viewpoint; 30 voices instead of 5
29. **Someone's Got You** (games/someones-got-you/) — collect (passAllowed) → rotateFrom encouragement → preview gate → reveal-one wall
   - Connection-family appreciation: assigned (never chosen) encouragement, teacher reviews every line before the wall; no scores possible
30. **Both Sides of the Rope** (games/both-sides-rope/) — stance collect-choice → evidence collect → AI rope summary → what-ifs → re-vote → delta reveal ({{stance.barChart}} before/after)
   - The stance-delta demo: the class watches its own mind move; "changed your mind = thinking, not losing"
31.5. **Emoji Movies** (games/emoji-movies/) — secret movie title + emoji-only clues (multi-field collect) → shuffled foreach guessing rounds → host-paced reveals. Unfeatured; the guessing-rounds brick's reference game.
31. **One More Thing** (games/one-more-thing/) — recall collect → 2× rotateFrom+prefill "add one" → reveal scope:"own" (each list returns to its author, grown) → AI class-memory summary
   - First accumulating-chain + return-to-author game: retrieval practice that's structurally social; the +1-routine shape

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

### 28 Phase Types Defined
1. `lobby` — Wait for players to join
2. `collect` — Gather text responses from players; supports `rotateFrom` (rotation chains; stores `assignedFrom` recipient→sender links for return-to-author; stamps `assigned` onto response records for reveal templates), `prefillFromAssigned` (the passed item starts IN the box — accumulating lists), `appendOnly` (inherited text read-only + server-enforced append — vandal-proof chains), `maxLength` (per-step char cap, default 280 — raise for accumulating chains), `assign:"pairwise"` (bluffing/pair games — `pairsFrom` optional, `oddHandling:"triple"`, `rotatePairsFrom`, `reusePairsFrom`), `passAllowed`, `simultaneousReveal`, `inputType:"drawing"` (stroke-based drawing pad; combines with rotateFrom for continue-the-drawing / caption modes)
3. `ai-process` — Send data to AI for processing; `perPlayer:true` generates one item per student
4. `vote` — Head-to-head or pick-one voting; `matchupsFromPairs`/`excludeAuthors` for bluffing; literal `candidates` arrays (teacher-typed options); `nextByWinner` map routes the game by outcome (choose-your-own-adventure — branch targets are legal transitions, BFS/cycle/validator aware)
5. `eliminate` — Remove players by percent or hook
6. `reveal` — Display content to all players; `scope:"pair"` + `pairsFrom` shows each pair only its own answers (`{{_pair.prompt}}`/`{{_pair.answers}}`); `scope:"own"` + `chainFrom:[...]` returns each rotation chain to its author (`chainDisplay: steps|final`; pure walker in `engine/phases/chain-reveal.js`)
7. `preview` — Teacher-only preview before reveal
8. `winner` — Declare winner and show standings; shows WHAT they won for (`winnerEntry`/`winnerEntries` auto-traced vote → candidates → responses, `entryFrom` overrides; `{{crown.winnerEntry}}` usable in templates) with a drumroll build-up → crown reveal on both screens; auto-advance pause default 10s (payoff beat)
9. `announce` — Display a message to everyone (round intros, instructions); `video:` field for YouTube embed (host-only)
10. `collect-choice` — Players pick from predefined choices; `correctAnswer`+`speedBonus` for Kahoot-style scoring (`speedBonus:false` = flat points); `choicePool`/`excludeAuthored`/`shuffle` for bluffing, plus `foolPoints` (author earns N per classmate fooled) and `poolLimit` (per-player ballot cap, literals always kept)
11. `ai-eliminate` — AI judges answers and eliminates rule-breakers
12. `leaderboard` — Show scores and rankings with personal highlight; `from` accepts array of refs to sum across rounds
13. `reveal-one` — Host reveals items one-by-one (countdown style); `itemTemplate` renders object items via `{{_current.field}}` (without it, objects fall back to text/name or JSON); `limit` caps the reveal at a random sample (leave unset when every student's item must appear)
14. `team-split` — Divide players into teams/groups; sizing via `teamCount` OR `groupSize` (count computed, no singletons); `method: random|balanced|teacher|choice` — teacher arranges a roster on the host screen, choice lets students claim open spots (stragglers auto-filled on confirm); `capacity:"open"` removes choice-mode spot caps for pre-existing classroom teams
15. `rank` — Players reorder a list by preference, aggregated by average position
16. `wager` — Players bet points on outcomes, auto or host-resolved
17. `relay` — Turn-by-turn collaborative input (storytelling, word chains)
18. `foreach` — Iterate over dynamic data running sub-phases per item (guessing games, review rounds); `limit` runs a random sample instead of every item (a round per response kills the room ~round 12 at class size)
19. `rate` — Class scores a target on N custom 1-N scales; results render as averages bar + distribution pies; visibility=all|host-only
20. `turn` — Charades/describe-it; server-authoritative per-turn timer, team rotation, Got It/Skip pool management; outputs `teamScores`+`capturedBy`
21. `merge` — Group members combine their answers into one shared answer (think-pair-share); live draft, `agreeMode` both/any/timer, `groupSize` 2/3/4 (3 = trios for consulting protocols, no singletons); outputs `merged`
22. `one-voice` — Cooperative counting to a target; server-authoritative collision window, same-player rejection, teacher-speaker audio; outputs `success`/`attempts`/`resets`/`bestRun`
23. `end` — Game over, clean up
24. `buzz` — First-tap-wins buzzer rounds (trivia bee); teacher asks aloud, judges Right/Wrong on host; wrong = lockout for the question; one phase runs many questions; outputs `scores` (scoreMap)
25. `estimate` — Numeric guessing; optional `answer`+`unit`, `scoring: closest|graduated` (rank-based, scale-free), resubmission allowed until close; reveal shows answer + distribution; outputs `scores`/`average`/`median`; no answer = poll-the-room mode
26. `match` — Pair two lists (vocab ↔ definitions); `pairs` literal array, `pointsPerMatch`; left column fixed, right drag-to-swap; close reveals correct pairs + per-pair class accuracy (host Continue advances); outputs `scores` (scoreMap)/`results`/`resultsList`/`pairCount`
27. `sort` — Place items into named buckets (metaphor vs simile); `buckets` (2-5 names) + `items` with all-or-none correct buckets — all = graded (`pointsPerItem`), none = consensus poll; tap-to-assign on touch devices; close reveals per-item distributions (+accuracy when graded); outputs `scores`/`results`/`resultsList`/`itemCount`
28. `checklist` — Shared group to-do list (lab days, stations, project work); `items` literal array + optional `teamsFrom` (team-split ref; omitted = one checklist per student); any member checks/un-checks with attribution (group + teacher console see names, never the projector); host dashboard shows live per-group progress bars; close = summary moment (host Continue advances); no scores — outputs `results`/`resultsList`/`doneCount`/`groupCount`/`itemCount`

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
- **Content filtering** — `engine/content-filter.js` + `engine/blocklist.js`; word-boundary match with leet-speak normalization; rejects on `submit-response`, `merge-draft`, AND `relay-submit` with a player-facing notice (the notice lands on whichever input the student is using — merge/relay rejections keep them in place to revise)
- **Drawing safety** — the blocklist can't read a picture, so drawing submissions lean on: attribution (every drawing is named, never anonymous), live moderation thumbnails on the teacher console (hide/kick), and the `preview` phase before any class-wide reveal (both shipped drawing games route through it). Structural validation only in `engine/drawing.js`. **Rule for new drawing surfaces: nothing student-drawn reaches the projector without a teacher gate.**
- **Crash isolation** — every socket handler runs inside a try/catch wrapper (one bad room can't kill the process / every other classroom); `process.on('unhandledRejection')` logs instead of crashing; all close/* handlers and submit handlers kind-guard `room.phaseState` (`kind` field on every stateful phase) and the closers are idempotent — the all-inputs-in auto-advance racing a late host click used to crash the server
- **Host moderation** — `engine/moderation.js`; live submission list on collect phases; Hide (reversible, excluded from AI) and Kick (blocked rejoin via `kickedTokens`)
- **AI safety rules** — `SAFETY_RULES` block appended to every game-run system prompt
- **AI data minimization (COPPA/FERPA)** — student NAMES never reach the Claude API: prompts carry pseudonymous playerIds only (`AIService._buildUserMessage`, ai-eliminate's playerList), and `engine/ai-name-fill.js` re-fills real names into AI JSON output server-side (any object with a recognized `playerId` gets truthful `playerName`), so `{{_current.playerName}}` templates keep working. **Rule for new AI surfaces: no student name in any outbound API payload.** Free-text half: `engine/pii-scrub.js` scrubs known roster names + email/phone/URL patterns from COPIES at the `AIService` real-call boundary (instructions included — resolved tokens embed student text); pass `rosterNames` on every game-time call.
- **XSS output encoding** — every screen statement that builds HTML with interpolated values must escape them (`escapeHtml` on host/player/editor, `escapeHtmlText` on designer; `previewEl`/`previewBtn`/`previewInput` escape internally). Enforced by `tests/screens/xss-sinks.test.js` (statement-level scanner over all seven screen files; audited-numeric allowlist). `applyTemplate` and most content paths use `textContent` — prefer that for new UI. **Rule: student text, teacher config, and AI output are all untrusted for rendering.**
- **PIN brute-force lockout** — `engine/pin-throttle.js` (pure, injected clock): 5 wrong console PINs within 10 min lock that room's `join-teacher` for 5 min — even for the correct PIN, keyed by room code so fresh sockets don't reset it; success clears the count; hourly sweep. Verified by simulate-teacher-console (attacker spam → right-PIN-fresh-socket still bounced).
- **Teacher-save purity (§49073.1)** — saved objects (game configs, recipes, templates) never contain student-generated content: "Save as Recipe" derives from teacher-authored config only; responses/drawings live in room state + snapshots, which die with the room (purged at end phase, TTL-swept at 6h). **Rule for new save/export features: anything folding live-room content into a persistent object needs full student-data treatment (disclosed retention, deletion, de-identification) — prefer never taking it.**

### Safety Features (Not Yet Implemented)
- Anonymous mode option
- Rate limiting / DoS limits on non-AI socket events (AI endpoints are guarded by ai-budget)
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
- **DESIGN-PHILOSOPHY.md** — the *why* (engineering): the one-shot north star, agency-vs-structure bet, catch-or-survive, phases as the unit, single source of truth, AI as leverage not dependency. Read this when a design call has no obvious answer.
- **PEDAGOGY.md** — the *why* (learning): the theory of how people learn that the games embody — social constructivism, active/low-floor participation, SEL/belonging (connection family, Aron 1997 / think-pair-share / New Games), formative-not-summative, teacher-as-creator/facilitator. Honest about grounded-vs-hunch. Read this when a design call affects students rather than code.
- **ARCHITECTURE.md** — the *what/how*: system diagram, code map, phase registry, validation pipeline, persistence/restart survival, testing
- **GAME-CONFIG-DESIGN.md** — 9 phase types, data references, hooks system
- **AI-TASK-DESIGN.md** — 6 AI task types with prompts, schemas, validation
- **SAFETY-DESIGN.md** — Threat model with three-layer mitigations
- **AUTHORING-DESIGN.md** — Config style guide, validation, debug mode
- **connection-pack-spec.md** — the no-winner game family (Closer / Snowball / One Voice): design principles, phase strings, merge + one-voice specs, licensing stance, staged voice modes (v1.5 recorded clips / v2 WebRTC — NOT built)
- **CORN-STORY-FEASIBILITY.md** — Implementation analysis and build order
- **COMPARATIVE-ADVANTAGE.md** — positioning thesis (the moat = addressed / chained / shared-fate; competitors verified unable to do any) + the 14-activity slate + licensing gates (PZ = paraphrase-and-rename, email pzlearn@gse.harvard.edu before public launch). Raw research: `docs/research/deepfun-notes.md` (DeKoven/New Games/Liberating Structures) + `docs/research/project-zero-notes.md` (PZ thinking routines). Read these before designing new activities.
- **NEXT-STEPS.md** — living roadmap (Now / Next / Later); check here FIRST when asking "what should we work on?" — its "START HERE next session" block is kept current with concrete next actions
- **COMPLIANCE-TODO.md** — COPPA/FERPA/§49073.1 working checklist (from the 2026-07-19 California student-data review): shipped code items, pre-August documents, teacher console verifications, AB 1159 watch list
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
- `engine/phase-handlers/buzz.js` — buzz phase (exports pure `createBuzzState`/`applyBuzz`/`applyJudge`/`applyNextQuestion` — the buzzer referee)
- `engine/phases/estimate-scoring.js` — pure closeness scoring (`scoreEstimates` closest/graduated modes — rank-based so scale-free — + `estimateStats`)
- `engine/phases/match-scoring.js` — pure match scoring (`normalizePairs`/`scoreMatching`/`matchStats`/`buildResultsList` — position-aligned exact match, per-pair class accuracy)
- `engine/phases/team-grouping.js` — pure team sizing/capacity/auto-fill (`groupCountFor` no-singleton group counts, `teamCapacities` even-split, `autoFill` emptiest-first straggler placement)
- `engine/phases/sort-scoring.js` — pure sort scoring (`normalizeSortItems`/`isGradedSort`/`scoreSorting`/`sortStats`/`buildSortResultsList` — graded vs consensus modes, per-item distributions)
- `engine/phases/checklist-state.js` — pure checklist rules (`normalizeChecklistItems`/`buildChecklistGroups` teams-or-solo, `applyCheck` membership + teacher override, `groupProgress`/`checklistResults`)
- `engine/drawing.js` — pure stroke validation for drawing submissions (`validateDrawing` clamps 0-1 coords/width/color + trims to caps, `isDrawingResponse`); browser side is `screens/shared/drawing.js` (`Draw.attachPad`/`renderStrokes`/`scribble`)
- `engine/room-snapshot.js` — `serializeRoom`/`restoreRoom` (restart survival; JSON-safe, resume-at-phase-start)
- `scripts/sim-harness.js` — shared multi-client simulation primitives (all simulate-*.js scripts build on it)
- `engine/phases/chain-reveal.js` — pure return-to-author chain walker (`buildChainViews` follows `assignedFrom` links, `formatChainContent` renders steps/final views)
- `engine/recipe-*.js` — recipe layer (R1-R7 complete); `recipes/` has 18 built-ins (+ `recipes/prompt-banks/` — along.json 142 attributed prompts/11 decks, closer.json 90, lanyard.json 29 originals; `promptDeck` param type renders a deck picker that can also fill a poll's choices via `choicesParam` + `recipes/user/` for saved ones). Compiler supports `${param}`, dotted paths (`${item.field[0]}`), and structural directives (`$if`/`$value`/`$repeat`/`$map` — see recipe-compiler.js header)

### Environment
- Uses dotenv, set ANTHROPIC_API_KEY in .env for real AI
- Without API key, runs in mock mode (no real AI calls)
- Set DATABASE_URL (Neon connection string) for persistent user-game storage; without it, falls back to filesystem
- Set SITE_PASSWORD to set the site OWNER's password (feedback inbox, owner mode, built-in edits, teacher-console credential — the site itself is public)
- AI cost guards: AI_CALLS_PER_MINUTE (default 20) and AI_DAILY_CAP (default 500) limit real AI calls; 0 disables either
- Express 5.x (path matching is stricter than Express 4)
- Haiku for simple tasks, Sonnet for complex judgment
- Deployed on Render (free tier); auto-deploys from master

### Testing
- `npm test` — runs all 890 Vitest tests (~4s)
- `node scripts/simulate-chaos.js [gameId] [--players N]` — school-wifi chaos suite (server must be running)
- **CI**: `.github/workflows/test.yml` runs the suite on every push/PR; with the `RENDER_DEPLOY_HOOK` secret set (and Render auto-deploy OFF), deploys only happen on green
- `node scripts/simulate-restart.js` — restart-survival proof (spawns its own server, kills it mid-game, restores; needs DATABASE_URL)
- `node scripts/simulate-any-game.js <game-id>` — universal automated playthrough (requires server running)
- `node scripts/simulate-closer.js` / `simulate-snowball.js` / `simulate-one-voice.js` — Connection Pack invariant sims (pass anonymity, pair privacy, draft sync, tap timing)
- New shipped games must be added to the snapshot map in `tests/engine/validator-diagnostics.test.js` (it fails loudly on unknown games)

## Refinement Log
Moved to [docs/CHANGELOG.md](docs/CHANGELOG.md) to keep these instructions lightweight. Append new entries there.
