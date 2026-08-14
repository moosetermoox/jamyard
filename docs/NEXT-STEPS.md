# Next Steps

Living roadmap. When a session starts with "what should we work on?", start here.
History lives in [CHANGELOG.md](CHANGELOG.md); parked ideas in [DEFERRED-IDEAS.md](DEFERRED-IDEAS.md).

## Now — the pre-August plan (classroom tests start August 2026)

Filter every priority through: *what will matter in the first week of real use?*
The June feature freeze was consciously lifted in July: match, sort, teams
upgrade, and drawing input v1 all shipped 2026-07-06. Freeze back ON —
everything below is polish, testing, and ops.

### START HERE next session (updated 2026-08-13, field-feedback triage)

The 2026-08-13 feedback batch was triaged into four buckets; the quick
wins (bucket 1) SHIPPED same day (see CHANGELOG 2026-08-13: join-line
font, leaderboard ink-on-ink fix, card button order, 3 fun games
featured, recipe #21 Memory Sketch). Remaining, in priority order:

1. ~~**Spanish-case reproduction (the strategic diagnostic).**~~ DONE
   2026-08-13 (see CHANGELOG): root cause was the storyboard grammar
   knowing only 10 of 28 phase types, nothing for scoring/teams. Fixed
   with quiz + teams bricks, prompt honesty rule, approval-UI question
   review; same request now robot-playtests clean end to end. Follow-ups
   surfaced: **team-scored leaderboard** (leaderboard has no team
   aggregation — the one thing "team competition" still can't literally
   mean) and consider recipe-match learning to counter-offer the closest
   recipe instead of a flat no-match.
2. **Speed Quiz editor + per-game setup pass** (pattern-setter for the
   core games, one game at a time, no blanket decisions): a real "mark
   the correct answer" control (not field-order convention), shuffle-
   choices option, question count as a setup/host-time param, and a
   rethought announce step that reads like a sentence. Related trust
   issue: Speed Quiz Builder generated WRONG facts — generated questions
   need an effortless teacher review gate before class.
3. **foreach in the editor is confusing** (teacher's words). Hardest
   editor UX problem; deserves its own session.
4. **Accessibility audit** (blind + colorblind users) before August:
   screen-reader labels on the player screen, contrast, focus order.
   Bigger than a tweak; schedule as a wave.
5. **New activity ideas from feedback** (build as brick stress-tests):
   player-built quiz (students submit Q+A, class plays them — overlaps
   with item 2's correct-answer work), yes-and machine (appendOnly /
   relay bricks), Imposter game (needs ONE new primitive: secret
   asymmetric role deal — unlocks the whole Chameleon/Spyfall genre).

### Previous START HERE (2026-08-08, evening session)

Everything through the 2026-08-08 EVENING session is DEPLOYED (5 commits
on top of the day session, all CI-green). The evening session (see the
six CHANGELOG 2026-08-08 entries from "persona field test" onward):

- **Persona field test**: three agent testers (history teacher / bored
  student / ex-IDEO designer) reviewed the live build independently.
  Report artifact + full findings in the session transcript. The two
  convergent findings were late-join stranding and dead wait screens.
- **Everything actionable shipped same day**: late-join fix (new players
  drop into the current phase; simulate-late-join.js), Customize revise
  envelope fix + concierge min/max clamping, escaped-em-dash sweep +
  scanner hardening (decoded token values), holding screens (lobby
  avatar roster + counts-only room-progress on every wait;
  simulate-holding.js), library findability (keywords on 12 configs +
  any-subject search rescue + ?q=), /privacy page, a11y batch
  (focus-visible ring, 40px mic target, detached-mic fix), host
  pre-room redesign (picker card, roster chips, start hint; found the
  ?game= deep-link updateDesc bug), editor header 3-role button palette.
- **New game #34: Last One Standing** (games/last-one-standing) — the
  teacher's faculty icebreaker: 4 escalating facts, foreach deals cards
  fact-by-fact on the projector, the ROOM stands/sits physically.
  Robot-playtested clean. Lesson recorded in memory: the universal sim
  false-alarms on timerless announce→collect chains (double-advance);
  verify with the robot playtest.
- **Editor: "How many get read"** — foreach/reveal-one limit now
  editable in Simple (inline fragment), Builder, and Advanced.
- **CLAUDE.md slimmed** 9.3k → 1.7k words (history in
  docs/CLAUDE-ARCHIVE.md).

998 tests. Curation DECIDED: one-voice stays override-off, Closer stays
unfeatured (teacher's call, don't re-raise).

Device stance unchanged: **students are on Chromebooks — phones are
banned in schools**; the teacher console is "a second device."

2026-08-09 session (social-studies persona review → onboarding wave), ALL
DEPLOYED (4 CI-green pushes through ce1f1b9):
- **Teacher cheat sheet SHIPPED as /guide** (finally — was the top doc
  pick): what you need, first five minutes, live controls, if-X-do-Y
  table, privacy in a breath. Promoted from the homepage ("First time?"
  line under the primary cards + footer link) and the library footnote.
- **/owner route** replaces the confusing "Show full library (site owner)"
  links (library + designer); 302 → /library?owner=1 unlock flow.
- **TeacherProfile + first-visit setup card** on the library (grade band +
  subjects → localStorage, screens/shared/teacher-profile.js). Card copy
  promises suggestions "when you customize" (not before — teacher's catch).
- **Six subject prompt decks** (social studies / ELA / science claims +
  perspective topics) wired into both-sides-rope + whose-eyes; deck picker
  floats profile-matched decks first ("for your class") and prefills
  untouched defaults. Prompts 261 → 309.
- **Customize knows the class**: profile rides customize-questions (the
  prompt forbids re-asking grade/subject and goes one level deeper, e.g.
  "What specific science topic is your class studying right now?"), the
  dialog shows "Writing for your class: ...", revise gets it too.
  Teacher's live feedback drove this: it was re-asking what the card asked.
- **Story Builder rebuilt everyone-writes** (teacher's call: relay = one
  types, 17 wait): all students open from a shared seed (promptDeck, new
  story-premises deck), 4 appendOnly rotation rounds, reveal scope:"own"
  returns each story to its starter, reveal-one gallery samples
  ${storiesRead}. N students = N stories, five authors each.
  Robot-playtested clean (temp-save → simulateGame → delete pattern).
- CI: checkout/setup-node bumped to v5, test job Node 22 → 24 (matches
  prod); the deprecated-Node-20 warning is gone.
**1010 tests.** Reviewer items consciously deferred: standards filters
(subject keywords cover it), full differentiation support, card metadata
(grade band / noise level / interaction mode on cards — good next-session
candidate, now NEXT PRIORITIES #3). Subject decks for along-bank recipes
(snowball, class-poll) blocked on single-bank spec.bank.

NEXT PRIORITIES (August field tests are NOW):
1. **Fill the /privacy placeholders** — the page is LIVE with visible
   yellow "[operator name]" / "[privacy contact email]" placeholders.
   Two facts from the teacher close it (same facts block the § 1
   compliance documents).
2. **Real-device pass**: mic dictation on an actual Chromebook, the
   concierge with a real lesson, Customize on a real class — now ALSO
   the holding screens + late-join + the new setup card/guide on real
   school wifi.
3. **Activity-card teacher metadata** (from the persona review): grade
   band, ideal class size, noise level, and write/speak/draw/vote
   interaction chips (derivable from the phase graph) on library cards.
4. Field-test copy nits (small): "Answer the question:" hardcoded over
   drawing pads; stray 0/280 counter on choice screens; home/library
   near-identical headlines.
5. Proxy playtests / day-one kit / PZ email — see the numbered items
   below (unchanged).

0.4. **BUILT 2026-08-01 (one arc, one day):** design pass (fonts/theme/
   emoji cleanup), tooltips, surfaces Phase 1 (library = one shelf,
   /designer = Create page), THE BUILDER (palette + suggestion engine +
   rail; Advanced demoted to "Technical view"), agent usability tests +
   fix wave (lobby join line, editor Host btn, Preview rename/auto-launch,
   beforeunload guard), Emoji Movies (#32), and STORYBOARD-BEFORE-GENERATE
   (collect-two + guessing-rounds bricks, compileStoryboard, /api/games/
   storyboard, approval cards). 2026-08-02: Question & Share template SHIPPED; projector style rules
   (docs/PROJECTOR-STYLE.md — headline/body/cards, brand-to-corner) on
   host AND player; Builder palette = one expandable taxonomy + setup
   nudge, loop hidden from rail, quiet + circles; Preview slider fixed.
   Next on this thread: promote storyboard to the DEFAULT "Make it" path
   after real use proves it; usability backlog in SURFACES-PLAN §8
   (single topic field, teacher-language errors, draft-keeping, Simple's
   "+ Add a step" → palette); TEACHER CHEAT SHEET still unwritten (top
   pick); match/sort/drawing recipes still owed. CLAUDE.md is over the
   memory warning threshold (~62.7k chars) — a trim pass was offered and
   deferred 2026-08-02.
0.5. **SURFACES PLAN drafted 2026-08-01** ([SURFACES-PLAN.md](SURFACES-PLAN.md)):
   /designer and /library are near-duplicate grids; plan collapses to
   Library (one shelf) / Create (idea box + recipes, no grid) / Editor,
   plus an editor-palette layout exploration and an AI-assist ladder
   (topic re-skin first). **Plan only — awaiting direction + timing
   decisions.**
0. **STRATEGY SHIFT: library-first** — plan in
   [LIBRARY-FIRST-PLAN.md](LIBRARY-FIRST-PLAN.md), argument in
   [WEEK-REFINEMENT.md](WEEK-REFINEMENT.md). **Phase 1 SHIPPED
   2026-07-28**: `/library` front door (run-focused cards, goal chips,
   builder doorway → `builder-request` signal), home = one primary card,
   `activity_runs` metric live (owner-gated /api/activity-runs).
   **Phase 2 SHIPPED 2026-07-28**: Along corpus ingested (142 attributed
   prompts, 11 decks; 9 wellbeing questions held back for the
   teacher-only-visibility design), lanyard.json originals, `promptDeck`
   param + deck picker (fills poll choices too), five recipes wired.
   Prompt count: **261**. **Next: the Aron A/B at playtests** (careful
   deck vs bland stand-ins — zero code), then remaining banks + the
   wellbeing visibility design.
1. **Proxy playtests — THE remaining July item; the window is nearly
   closed.** Run 2-3 adults on real Chromebooks through the day-one-kit
   candidates AND the thesis slate (Whose Eyes? / Someone's Got You /
   Both Sides of the Rope / One More Thing). `scripts/demo-room.js`
   holds a live room for real-device testing; the 💬 feedback widget
   catches reactions in the moment — check `/feedback` after each
   session.
1.1. **COMPARATIVE-ADVANTAGE follow-ups**: (a) engine asks §7 —
   ~~prefillFromAssigned~~, ~~return-to-author reveal~~, ~~merge
   groupSize:3~~, ~~One More Thing~~ **all SHIPPED 2026-07-27** (+
   `maxLength` on collect, needed for accumulating chains). Remaining:
   append-only merge (silent-conversation board), `revealTail`
   (exquisite corpse), per-group prompts on team-split. (b) **Email
   pzlearn@gse.harvard.edu before any public marketing of PZ-derived
   shapes — teacher action, only you can send it.** (c) Deep Fun tier 1:
   The Mind → `ascend` phase, Just One → clue-cancel module.
2. **Teacher-only actions still open**: (a) email pzlearn@gse.harvard.edu
   (PZ permission — before public marketing of PZ-derived shapes);
   (b) the three compliance facts (operating name, privacy email,
   coordinator) that unblock the four August-gate documents;
   (c) consider Render Starter (~$7/mo) right before August field tests.
   ~~RENDER_DEPLOY_HOOK + UptimeRobot~~ DONE 2026-07-27.
3. **Day-one kit (C)** — POLISH SHIPPED 2026-08-02 against the coherence
   review (docs/GAME-COHERENCE-REVIEW-2026-08-02.md — the review's 7
   feature-worthy games ARE the kit shortlist): both-sides-rope got its
   what-ifs reveal before the re-vote, whose-eyes lost the
   retype-the-viewpoint field (rotation collects now stamp `assigned` onto
   responses → `{{_current.assigned}}` in reveals; also fixed the circle's
   silently-empty `fields.*` tokens), one-more-thing got `appendOnly`
   (server-enforced — vandal sim in scripts/simulate-append-only.js),
   one-voice's ending is honest when the target isn't reached, closer's
   nine share screens now tell pairs to actually TALK + real playTime
   metadata, weekend-poem scales its poem + gained a preview gate,
   art-gallery's gallery got a guess-aloud beat. STILL OPEN: anonymous
   mode and the one-page "if X goes wrong, do Y" teacher cheat sheet (top
   pick).
4. **Recipes for the new stuff** — match/sort/drawing have NO recipes yet, so
   the idea-first front door ("make a vocab quiz for my French class") can't
   route to them. A vocab-match recipe + a sort recipe + an art-gallery recipe
   makes the new features reachable by non-coders. Small, high-leverage.
   (Checklist shipped WITH its recipe on 2026-07-19 — `recipes/group-work.json`
   is the pattern to copy.)
5. **Loose ends from the July push:** caption mode (drawing shown above a
   text box via rotateFrom) works but no shipped game uses it — the
   return-to-author reveal (shipped 2026-07-28) covers TEXT chains;
   Telephone Pictionary still needs chain-reveal to walk DRAWING chains
   (byPlayerDrawing) too; the editor UI for the new widgets (match pairs
   rows, sort buckets/items, drawing toggle, team sizing toggle, chain
   fields) passed validation but was never screenshot-reviewed in the
   browser. ~~class-critique empty reveal template~~ fixed 2026-08-02
   (coherence action wave). Remaining coherence-review backlog (missing
   loop reveal beats, oversized bluffing ballots, two-truths fake scoring,
   mood-check passAllowed) is itemized in
   GAME-COHERENCE-REVIEW-2026-08-02.md.

### The plan itself

- **A. Survive a real class period** ✅ DONE — room snapshots (resume at
  phase start, host-F5 rejoin), deploy-on-green + uptime ping live 2026-07-27.
- **B. Chaos simulator** ✅ DONE — `node scripts/simulate-chaos.js`; every new
  interactive phase gets a chaos run before shipping (now standard practice).
- **C. Day-one kit** — see START HERE #3.
- **D. Proxy playtests (July)** — see START HERE #1.
- **E. If time remains** — accessibility basics (contrast, touch targets,
  keyboard nav); AI-generation eval loop (20 realistic prompts → robot
  playtest all → fix generator weaknesses in batch).

1. **Field-test in a real classroom** — August 2026. Everything above serves this.

## Next

1.2. **UI review waves 2-3** (external review 2026-07-26; wave 1 shipped same
   day — counter seed, join labels, card actions, home hierarchy, console
   doorway). **Wave 2 SHIPPED 2026-07-26:** library search + goal chips +
   favorites + recently-used; descriptive continue buttons on announce/reveal
   (`engine/phases/continue-labels.js`).
   **Console wave SHIPPED 2026-07-27** (top item of the second review):
   stale-guard fix (console's first click was dropped), lobby roster +
   Start activity button, descriptive step labels, pairing announcements,
   two-step PIN reveal with auto-hide.
   **Second review fully closed 2026-07-27:** modal dialog semantics
   (shared Dialog helper), pre-room host states + honest disabled Start,
   editor header hierarchy (More ▾ menu, quiet Saved text), polish batch
   (owner-link rename, chip counts, metadata on all 9 featured).
   **Wave 3 (post-field-test):** AI storyboard-before-generate flow (extend
   the recipe param form), pinned host control bar, collective
   visualizations + illustration/motion system (see DEFERRED-IDEAS).
   Review's framing worth keeping: "the teacher controls the pacing, but
   the class creates the moment."

1.5. **COPPA/FERPA compliance workstream** — full working checklist in
   [COMPLIANCE-TODO.md](COMPLIANCE-TODO.md). Code items shipped 2026-07-19
   (AI name-stripping + re-fill, PIN lockout; snapshot lifecycle already
   complied). Pre-August remainder: four documents (Claude drafts, teacher
   publishes — blocked on operating name / privacy email / coordinator
   confirmation) + PII-scrubbing in the content filter. AB 1159 is the
   watch-list item that matters.

2. **Remaining safety items** (from SAFETY-DESIGN.md): anonymous mode option,
   rate limiting / DoS limits (non-AI socket events; AI endpoints now guarded),
   PII redaction.
3. **Editor odds and ends:**
   - class-critique ships with an empty reveal template (flagged during game sweep)
4. **New phase ideas** (from the 2026-06-10 ideation; buzz + estimate + branching
   votes shipped; **match + sort + teams upgrade shipped 2026-07-06** — see
   games/vocab-match, games/metaphor-or-simile, and team-split's
   teacher/choice methods):
   - **`secret-role`** — hidden per-player info (Spyfall/Chameleon pattern); per-player
     delivery exists ({{X.mine}}), new part is role assignment + projector discipline.
     The most-requested-by-students unbuilt thing once they see bluffing games.
   - **`appreciation`** — everyone writes something kind about an assigned classmate
     (rotation guarantees coverage), teacher previews every note before private
     delivery. Connection-family round 2; needs the new privacy pattern.
   - **Drawing v2: `mural` phase** — live collaborative drawing on the projector.
     Do the TILE WALL first (each student owns one attributable tile of the
     projected grid — moderation is "hide that tile") before any shared free-for-all
     canvas; both need a teacher freeze/clear control. v1 (drawing as a collect
     input — galleries, pass-and-continue, captions) shipped 2026-07-06.
   - **Telephone Pictionary** — draw → caption → redraw chains are already
     possible with inputType:"drawing" + rotateFrom (caption mode works today);
     the missing piece is a CHAIN REVEAL (show each drawing's lineage:
     original → caption → redraw). Needs chain assembly from rotation
     assignment maps.
   - **AI Dungeon Master** — live class-voted choose-your-own-adventure (AI
     narrates, three options per beat, class votes, AI continues). Full design
     sketch banked in DEFERRED-IDEAS.md §Game concepts — no new phase type
     needed, ~one session of work.

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
