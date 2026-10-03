# Next Steps

Living roadmap. When a session starts with "what should we work on?", start here.
History lives in [CHANGELOG.md](CHANGELOG.md); parked ideas in [DEFERRED-IDEAS.md](DEFERRED-IDEAS.md).

## Now — the pre-August plan (classroom tests start August 2026)

Filter every priority through: *what will matter in the first week of real use?*
The June feature freeze was consciously lifted in July: match, sort, teams
upgrade, and drawing input v1 all shipped 2026-07-06. Freeze back ON —
everything below is polish, testing, and ops.

### Designer expressiveness track (opened 2026-08-30, exquisite corpse shipped)

The owner's exquisite-corpse prompt exposed the gap: the engine can express
far more than the Create storyboard's 12 bricks. Shipped same day (see
CHANGELOG): chainDisplay:"template" sentence assembly, recipe #23
exquisite-corpse (blind chains were already free — {{X.assigned}} is
opt-in), collect.showTail (the fold, appendOnly-only, server-side
masking), and the golden-prompt harness (CI test for deliverability +
scripts/eval-designer-prompts.js for real-matcher before/after diffs,
baseline 9/12). **`chain` brick SHIPPED 2026-08-31** (see CHANGELOG):
start + per-hop hops + visibility (all | tail | blind) + blind-only
sentence template; compiler owns all wiring; both prompts taught it;
eval's new storyboard-generator leg went refused → hostable on
hypothesis-relay, 3/3. THE RULE it establishes: bricks are mechanics,
not phases — the AI never wires multi-phase mechanics. Next brick
candidates when wanted: pairs (pairwise collect + pair reveal),
bluff-rounds. Still queued:
- **Matcher finding (baseline, parked)**: on vocab-riddles the matcher
  faked a weak recipe fit (creative-vote) instead of noMatch → storyboard
  handoff. Same prompt-edit rules apply.
- **Folded-story recipe** on collect.showTail (the corpus's
  folded-story-tail entry currently settles for a near-match).
- Grow the corpus as new famous-game prompts come in; a prompt that fails
  in the wild becomes a corpus entry first, then a fix.

### START HERE next session (updated 2026-10-03, evening: #167 to #170 MERGED and live; branch `advance-switch-guard` = cause 4's fourth rule, PR open; CI runs the small-class sweep before every deploy, about 10 minutes; restart :3000 before using it locally)

**Where things stand.**
- **`advance-switch-guard` (cause 4, third pass):** the advance-phase switch named 13 of the 16 `phaseState.kind`s; a console Next step mid-wager, mid-relay, or mid-turn skipped past the bets, the story, and the round's scores. All three close now (bets returned when no winner was named, the text so far kept, the scores stored); `tests/engine/advance-switch.test.js` fails on any stored kind the switch does not name; proof `scripts/simulate-advance-closes.js` 16 of 16.
- **#170 `owner-key-gate` (cause 4, second pass, MERGED):** the owner-key test sweeps every write route under `/api/games/:gameId` for the gate and found two open: the featured toggle (any browser could feature an activity into every yard; owner-only now) and the asset upload (wrote into any activity's folder; key-gated, owner for built-ins). The proof has 29 checks. Both holes were live on jamyard.org until this deploys.
- **#169 `rules-into-tests` (cause 4, first pass, MERGED):** two CLAUDE.md rules are chokepoints now. `engine/socket-guard.js` is the one gate on every socket event (payload check against `EVENT_SCHEMAS`, stale-phase drop when the schema declares `phaseInstanceId`, try/catch); schemas added for ten events that had none, one of which (`role-pick`) was calling the check and validating nothing. `stampingSocket` (phase-context.js) stamps the phase id on every `onReconnect` emit. `tests/engine/socket-guard.test.js` guards both and fails on a listened event with no schema. CLAUDE.md's two rules are pointers.
- **#168 `restated-settings` (cause 1, MERGED):** `engine/restated-settings.js` + `tests/style/restated-settings.test.js` fail on any recipe or plain-activity sentence that states a number a setting controls (a parameter's default, a make-page list's length, the step's own numbers, any timer for a time phrase). Seventeen strings rewritten (the review's count was 13; the lint reads number words and "two minutes" too). Three coincidences sit in `ALLOWED` with reasons. CLAUDE.md has the pointer. The live re-checks from #165 are done except the crown: Anonymous Feedback's console says "Anonymous", a live poll's bars stay at zero until the third answer, the console header shows the PIN (all seen on jamyard.org through Try it out).
- **#165 `review-oct2`:** two outside reviews, 101 findings, 98 fixed (18 and 53 were already fixed or not bugs; 2 and 46 of the second list did not reproduce). Six parallel worktree agents (A to F, then G to J) on one merged branch. Owner's calls that day: the crown (winner step) is host-paced, its 10 s auto-advance is gone; an empty ballot at time-up is NO vote, never a random one; no owner-key reattach tool (the reviewer wiped a testing browser's key; the owner password bypasses the check).
- **#166 `small-class-sweep`:** `docs/ARCHITECTURE-REVIEW-2026-10.md` answers "is the bug rate an architecture problem" (no: five causes, a fix each, in order) and ships cause 3: **`npm run sweep`** plays every visible built-in with 1, 2, 3 students and once with every answer step closed empty, on its own server; CI job `small-classes` gates the deploy (9.5 min on GitHub). 192 of 192 green. Engine bugs it found and fixed: match-submit threw on every match, the crown crashed with no scores, human-vs-ai crashed with no human ideas, and **a collect or collect-choice nobody can answer closes itself** (`engine/phases/nobody-can-answer.js`; never rolling, never zero students). The universal sim drives every step type now, presses continue after a quiet stretch, waits once per loop, and dedupes opening events by `phaseInstanceId`.

Tests 3713 (one Windows-only CRLF failure, `make-fit-rows`).

**Next, in the review's order.**
1. ~~The restated-settings check~~ DONE (#168). Left open from it: a number that is structural, not a setting ("After 4 rounds" in Idea Chain, "four facts" in Last One Standing's intro, the rope's "two sides"), is not flagged and does not need to be; if a count like that ever becomes a knob, the lint catches the prose the moment the knob exists.
2. **CLAUDE.md rules into tests** (cause 4, slow, ongoing): one or two of the 27 "a new X must also do Y" rules per session become a guard test or a chokepoint; the CLAUDE.md line shrinks to a pointer. Done: the socket gate and the reconnect stamp (#169), the owner-gate route sweep (#170, two open routes found), the advance-switch sweep (`advance-switch-guard`, three kinds found skipping). Every sweep so far found a real hole on its first run. Good next candidates, cheapest first: (c) "a new place a name enters the room must call `filterName`" (join, rename, console rename: a sweep over `players.add` call sites); (d) the "six places" transition-field rule (one list the graph, validator, BFS, recipe rewiring, and editor all read). CLAUDE.md is 41k tokens, the largest thing in every session.
3. Then the validator served to the browser instead of mirrored in editor.js (cause 5), and server.js's socket handlers split by step family.
4. Quick ones: `scripts/simulate-append-only.js` still expects Whose Eyes?'s old wording (changed in #163); the ten re-checks on jamyard.org listed under the previous START HERE still stand, plus one from #165 (the crown waits for the teacher; the other three were seen live 2026-10-02).
5. **The narrator loop stays PARKED** by the owner. Ask before starting it.

**Sweep gotchas (so nobody relearns them):** the sweep's first full run took 2.5 hours and reported 35 failures, nearly all the rig's own: sequential two-second waits per step type (now `waitForAnyOf` + `PEEK`), and a late second-student copy of an opening event read as a new step and pressed continue twice (now `nextEvent`). Force-removing an agent worktree that had junctioned `node_modules` emptied it; `npm ci` restores.

### Previous START HERE (2026-10-02, end of day: #161, #162, #163 ALL MERGED and live; restart :3000 before using it locally)

**Where things stand.** Three PRs today, all merged and deployed through CI:
- **#161 `review-oct1-night`:** a reviewer's walk of the seven night checks.
  - The find-your-match late-joiner list was broken on the student screen: `classmates-update` read a variable that only exists inside the `game-started` handler, so it threw.
  - The hot seat always moves at least once, and the Simple view edits its turn.
  - A vote's own question now reaches both screens.
  - A second peer reader's pretend answers now answer the draft.
  - Answer-box lines for a returned comment, two readers, and private totals.
  - The student leaderboard is bars.
- **#162 `small-fixes-oct2`:**
  - The guessing clock survives a refresh.
  - A Spanish idea's plan reads in Spanish: the builder's own lines are translated through `COMPILER_TEXT` / `localizeCompiled` in step-suggestions.js. `tests/designer/compiler-language.test.js` guards it.
- **#163 `review-live-oct2`:** a reviewer's ten findings on jamyard.org.
  - A fresh yard pick wrote over the copy already made in that tab. The make page's tab copy is now reused only on Back or a reload (`sameVisit`).
  - Pretend answers read the activity's other screens for the topic (`otherScreensText`).
  - A typed card finds its closest sample reply.
  - The report keeps a right answer nobody picked, and shows AI prose as formatting under a plain label.
  - The newest projector card scrolls above Continue.
  - Whose Eyes? boxes are questions.
  - Pretend merges join two sentences.
  - Copy names come from the topic.
  - No "none s" on an empty timer.

Tests 3449 (one Windows-only CRLF failure, `make-fit-rows`).

**Next.**
1. Re-check on jamyard.org with pretend students:
   - Pick the same yard activity twice: two copies, the first untouched.
   - Find your match with a late joiner.
   - A four-student hot seat.
   - The feedback return.
   - A refresh mid-guess.
   - One Spanish idea through Create.
   - A Whose Eyes? run to the end of the circle.
2. **The narrator loop is PARKED by the owner** ("save it for later"). Ask before starting it.
3. Small, noticed:
   - A Spanish hot-seat plan still built a vote step before a `hotseat` with pick vote, so the class votes twice. The likely fix is a compiler guard that drops a vote-over-students step right before such a hotseat.
   - The reviewer's test copies are still in My yard on the live site.
   - The overwritten live copies (the lab-partner Snowball, the first Live Poll) cannot be restored from code.

**Gotchas from the day.**
- **A passing server proof is not a working screen.** The find-your-match bug was client-only. Reproduce a reviewer's report in a real browser: several `/player?prototype=true&code=X&name=Y` iframes on one page.
- **Inline `node -e` and Bash heredocs eat regex backslashes and `\n`.** It happened four times today. Use the Edit tool, or a script file written with Write in the scratchpad. Git Bash `sed -i` turns a CRLF file to LF.
- **The Create page compiles plans on the client.** `designer.js` rebuilds the storyboard object, so a new top-level plan field must be carried there.
- **The sample-answer writer only sees answer steps** unless it is handed the other screens.

### Previous START HERE (2026-10-02, midday: #161 `review-oct1-night` MERGED and live; `small-fixes-oct2` PR open; restart :3000 before using it locally)

**Where things stand.** The inventory's Part 3 is done except the AI narrator loop, which the owner parked on 2026-10-02 ("we'll save the narrator loop for later"). A reviewer walked the night's seven checks and #161 fixed what they found:
- A second peer reader's pretend answers replied to the first comment instead of the draft (the card itself was right).
- The feedback return showed Folded Pass's projector line.
- A four-question hot seat never moved. The Simple view had no turn setting, and a vote's own question never reached a screen.
- The student screen's late-joiner name update threw, so no find-your-match list ever grew.
- Empty "…" cards on the projector, and answer-box lines that named the wrong reader.
- The student leaderboard is now bars too.

Then `small-fixes-oct2`:
- **The guessing clock survives a refresh.** The estimate step keeps `timerEndsAt`, and the reconnect sends the time left plus `phaseInstanceId`. Proof `scripts/simulate-estimate-refresh.js`, 4 checks.
- **A Spanish idea's plan reads in Spanish.** The builder's own lines ("The class picked:", "Round 1:", "You wrote:", about 85 of them) follow the plan's `language`. The server reads it off the idea and the plan's words (`withPlanLanguage`), and `COMPILER_TEXT` / `localizeCompiled` in step-suggestions.js swap them after compiling. `tests/designer/compiler-language.test.js` compiles every golden storyboard in Spanish and fails on English left behind. Live: six Spanish ideas, 6 of 6 now fully Spanish (before: English on 4 of 6).

**Next.**
1. Merge `small-fixes-oct2` after green CI.
2. When there is a moment, re-check on jamyard.org with pretend students: a late joiner on find your match, a four-student hot seat, the feedback return, a refresh mid-guess, and one Spanish idea through Create.
3. The narrator loop waits for the owner.

**Noticed, not fixed.** A Spanish hot-seat idea built a vote step before a `hotseat` with pick vote, so the class votes twice. This is the same wobble as 2026-10-01, despite the prompt line; a compiler guard is the likely fix (drop a vote-over-students step right before a hotseat with pick vote).

**Gotchas.**
- The Create page compiles on the client (`designer.js` builds the storyboard object again from the plan dialog), so a new top-level plan field must be carried there too. `language` nearly got lost that way.
- A line the builder writes for students must get a row in `COMPILER_TEXT`, or the Spanish test fails.
- Confidence words are translated when the room starts (`localizeConfidence`), not in the builder.

### Previous START HERE (2026-10-01, night: #149 to #159 ALL MERGED and live; restart :3000 before using it locally)

**Where things stand.** The inventory's Part 3 is done except the AI narrator loop: (1) peer feedback #149, (2) quiet time #150, (3) confidence after the answer #151, (4) instant runoff #152, (5) the hot seat #153, (6) find your match #154. The owner then walked all six on the local server and asked for changes, all shipped the same night: #155 a template's sample answers drop when the question changes (an outside reviewer's natural-selection Snowball answered about fractions), #156 Skip timer on every step of Try it out, #157 feedback in labelled boxes (Star 1 / Star 2 / Wish), a classmate's words on a paper card in a system serif, the confidence answer card as a DIAL plus "Sure but wrong: n of m." with each student's confidence in the report, and the leaderboard as bars, #158 the hot seat rotates every few questions with each question on the projector ("For Maya (2 of 3)"), and find your match is a tap on a classmate's name (no spelling), #159 guesses scored by how close (estimate scoring "distance", smaller over larger) with a speed bonus, a scoreboard after a run. Tests 3366 (one Windows-only CRLF failure). Every slice has a `scripts/simulate-<name>.js` proof on a hidden `games/_sim-*` fixture.

**Next.** (1) The owner was about to re-walk the changes on the local server; the checklist is the seven items in the 2026-10-01 night message: feedback boxes + paper cards, the confidence dial + the report's How sure column, bar standings, the rotating hot seat, the name-tap find your match (with a late joiner), Skip timer on Doodle Bluff's intro, Snowball's sample answers with a science class set; plus the Yemen quiz ("Geography estimation: how many square kilometers is Yemen ... points based on how close you are, and a speed bonus"). Act on what they report. (2) Part 3 item 7, the AI narrator loop: a PROMPT STUDY first (sample story beats from the model, shown to the owner), and ask before building. (3) Noticed, not fixed: a storyboard idea written in Spanish sometimes comes back with English brick text (the "every word students read is in the idea's language" rule slips); the estimate step's reconnect still sends `timer: null` (a refreshed screen loses the guess clock; the announce fix in #150 is the pattern).

**Gotchas from the night.** After a merge + checkout the working tree turns CRLF on some files: node heredoc patch scripts miss multi-line anchors, Git Bash `sed -i` silently rewrites a CRLF file to LF (a cross-file text test then fails), and heredocs eat regex backslashes; use the Edit tool or a .cjs script in the scratchpad that detects the EOL. Never sed a backtick pattern: in GNU sed `` \` `` is a start-of-buffer anchor (it once prefixed every line of this file). Read the live-eval plans, not only the pass counts (a hot-seat plan "passed" while voting twice). The Create page runs the MATCHER before the storyboard: test a new idea shape through `POST /api/games/from-description` on a real-key server too (find your match passed the storyboard but the matcher called it offScreen; `engine/find-match-idea.js` is the backstop). A late joiner is the normal case: any per-player list sent at step start needs `onLateJoin` (the name-tap list missed it until the proof).

### Previous START HERE (2026-10-01, end of day: Part 3 slices one to six; #149 to #153 MERGED and live, slice six `secret-pairs` PR open)

**Done today:** (1) peer feedback (#149), (2) quiet time (#150), (3) confidence after the answer (#151), (4) instant runoff (#152), (5) the hot seat (#153), (6) find your match (collect `pairItems`, the `findmatch` brick, a server backstop for the matcher's offScreen; proof `scripts/simulate-find-match.js` 6 of 6, live 12 of 12 plus the route 6 of 6, tests 3330). **Next:** (7) the AI narrator loop from `docs/DEFERRED-IDEAS.md`, which the plan says needs real playtests of its prompt first, so it starts with a prompt study, not code. Live checks for slices one to six are in each slice's CHANGELOG entry; run them on jamyard.org with pretend students when there is a moment.

### Previous START HERE (2026-10-01, later still: slices one to five, `hot-seat` PR open)

**Done today:** (1) peer feedback (#149), (2) quiet time (#150), (3) confidence after the answer (#151), (4) instant runoff (#152), (5) the hot seat (reveal-one `to`, the `hotseat` brick; proof `scripts/simulate-hot-seat.js` 12 of 12, live eval 16 of 16 after a double-vote fix, tests 3314). **Next:** (6) secret pairs that find each other, then (7) the AI narrator loop. Live check when there is a moment: on jamyard.org, "hot seat: the class votes who plays Brian from Hatchet and sends questions" in Create, run with three pretend students, and switch between the student screens in Try it out.

### Previous START HERE (2026-10-01, late night: slices one to four, `instant-runoff` PR open)

**Done today:** (1) peer feedback (#149), (2) quiet time (#150), (3) confidence after the answer (#151), (4) instant runoff (rank `runoff: true`, `engine/phases/runoff.js`; proof `scripts/simulate-runoff.js` 6 of 6, live eval 14 of 14, tests 3304). **Next:** (5) hot seat to one screen, then (6) and (7) as listed below. Live check when there is a moment: on jamyard.org, "rank four field trips and pick one by instant runoff" in Create, run with pretend students, and read the rounds on the projector.

### Previous START HERE (2026-10-01, night: slices one to three, `confidence-knob` PR open)

**Done today:** (1) peer feedback (#149), (2) quiet time (#150), (3) confidence after the answer (quiz brick `confidence: true`, collect-choice `confidenceFor`, a Right | Wrong chart on the answer card, the words in the activity's language). Confidence proof `scripts/simulate-confidence.js` 12 of 12, live eval 12 of 12, tests 3292. **Next:** (4) instant runoff, then (5) to (7) as listed below. Live check when there is a moment: on jamyard.org, "a four-question water cycle quiz where students say how sure they are" in Create, run with pretend students, and look at the answer card.

### Previous START HERE (2026-10-01, evening: Part 3 slices one and two; #149 MERGED, `quiet-brick` PR open)

**Done today:** (1) the peer-feedback brick (#149) and (2) the quiet brick (`text`, `timer`, optional `talk`; a timed announce now keeps its clock across a refresh). Quiet proof `scripts/simulate-quiet.js` 8 of 8, live eval 14 of 14, tests 3275. **Next:** (3) confidence after the answer, then (4) to (7) as listed below. Live check when there is a moment: on jamyard.org, "two minutes of silent thinking about zoos, then we talk" in Create, run with pretend students, refresh a student screen mid-quiet and see the clock come back.

### Previous START HERE (2026-10-01, later: Part 3 slice one, the `feedback` brick, on branch `feedback-brick`, PR open)

**Done:** the peer-feedback brick (`draft`, `text`, `readers` 1 or 2) plus the collect knob `showOriginal` that lets a second reader read the draft, not the first comment. Proof `scripts/simulate-feedback.js` 11 of 11; live eval 8 of 8; tests 3266. **Next:** (2) quiet time, then (3) to (7) as listed in the block below. Live check when there is a moment: on jamyard.org, type "two stars and a wish on each other's lab conclusions" into Create, build it, run it with three pretend students, and read the return on a student screen.

### Previous START HERE (2026-10-01: the mechanics inventory's Part 2 is COMPLETE, #144 `engine-bricks`, #145 `engine-knobs`, #146 `reveal-styles`, #147 `screen-knobs` ALL MERGED and live via CI; restart :3000 before using it locally)

**The inventory day, in one paragraph.** The owner asked what blocks we have, what is easy, and what is missing (`docs/MECHANICS-INVENTORY.md`), then said do the easy additions and give the Create page the blocks it could not reach. Four PRs did Part 2 of that document: eleven bricks over existing step types plus a rolling flag (#144, live eval 22 of 22), six engine knobs and the write-quiz brick (#145, 8 of 8, proof 15 checks), the reveal styles as template suffixes (#146, 4 of 4, 6 checks), and the three screen knobs (#147: pick several, a graded open answer, a line per group; picks 3 of 3, blank 2 of 2, stations 2 of 3; 7 checks). Tests 3250. The Create page now reaches 42 bricks and knobs that the engine had or got that day; what it still cannot say is Part 3 of the inventory.

**Next: Part 3 of the inventory, in this order, each its own branch and PR with a golden prompt, a live eval of the storyboard leg, and a room proof.** (1) **A peer-feedback brick** (`feedback`): the chain brick with two hops and a return reveal already does it, so this is a NAME the teacher and the model reach for ("each student reads a classmate's draft and writes one strength and one question, the writer gets both back"), compiled to chain start + hops + the own-scope reveal, with `readers: 1|2`. (2) **Quiet time** (`quiet`): an announce with a timer and no typing, named so "two minutes of silent thinking, then we talk" lands on it instead of a collect. (3) **Confidence after the answer**: a `confidence: true` knob on collect and collect-choice that appends a rate step with one scale bound to the previous answer and a paired reveal (how sure the right ones were vs the wrong ones, read off `rightByPlayer` and `byPlayer`). (4) **Instant runoff**: a `runoff: true` knob on rank over a teacher list, a compute at close that drops the last-place item round by round until one has a majority of first choices (`engine/phases/runoff.js`, pure, outputs `winner`, `rounds`, `runoffList`), a reveal of the rounds in words. (5) **Hot seat to one screen**: a reveal-one with `to: "<player ref>"` (the vote over students' winner, or `players.random`) that shows the class's questions one at a time on ONE student's screen while the projector shows the count; the smallest new screen behavior in the list. (6) **Secret pairs that find each other**: a `collect` with `items` dealt in pairs (`pairItems: true`, each item twice) and a "found my match" tap that the projector counts; off-screen by design, so the storyboard prompt must not call it offScreen. (7) **The AI narrator loop** from `docs/DEFERRED-IDEAS.md` (no new phase type: ai-process, reveal, vote in a loop with a story-beat task and memory of its own last beat) only after 1 to 6, since it needs real playtests of the prompt. Scoreboard across activities stays out (stored student data). Live checks for Part 2 are in the four previous START HERE blocks below; run them on jamyard.org with pretend students when there is a moment.

**Gotchas from the day, worth not relearning:** a patch script that edits by string must have a unique anchor or it aborts after earlier files were already written (the editor's shuffle block appears twice); `git add docs` sweeps the owner's untracked review notes, zips, and the design handoff into a commit, so add docs files by name; a global string replace can hit a helper's own body; a live eval script must construct `new AIService({ mode: 'real' })` or it silently runs mock; the harness buffers host events, so read the last buffered one for a live tally; golden storyboard entries wobble in the matcher leg when a built-in exists, so eval the storyboard leg directly.

### Previous START HERE (2026-09-30, late night: `screen-knobs` PR open, the mechanics inventory part four; #144, #145, #146 MERGED and live)

**Part four of the inventory, in one paragraph.** The three knobs that touch the student screen: pick several on a choice step (`maxPicks`, a tap-up-to-N ballot, every pick counted), a graded open answer (`correctAnswer` + `acceptedAnswers`, normalized match, scores and counts for a reveal and the standings), and a line per group (`stations` on announce, collect, or collect-choice, `{{id.station}}` per student, a placeholder on the projector). Bricks for each, the prompts, the editor's settings and mirrored rules, three golden prompts, live eval pick several 3 of 3 (maxPicks 3 every run), fill in the blank 2 of 2 (the answer and an accepted spelling every run), stations 2 of 3 (the model puts them on the tasks brick, which now compiles to the per-group announce before the list; one run built a plain list), every plan compiled and validated clean, proof `scripts/simulate-screen-knobs.js` 7 checks. Tests 3250. With #144 (eleven bricks + rolling), #145 (six knobs + write-quiz), #146 (reveal styles), and this, the inventory's Part 2 is COMPLETE; two reviewers per piece is already a chain with two hops.

**Next:** the inventory's Part 3 table, each a brick or a knob over what exists now: a peer-feedback brick (chain with two hops + a return reveal, named for the teacher), instant runoff on a rank step's data, a hot-seat reveal to one student's screen, confidence after the answer (a rate step bound to the previous answer), and the AI narrator loop in DEFERRED-IDEAS. Live checks for part four: on the Create page type "six causes of World War I, pick up to three, see the tally" (the ballot locks at three, the chart counts every pick), "fill in the blank: the powerhouse of the cell is the ____, marked automatically" (Paris-style matching, the standings), and "four lab stations, each group a different task on their screens" (each pretend student reads a different line, the projector a placeholder); play each with pretend students.

### Previous START HERE (2026-09-30, night: `reveal-styles` PR open, the mechanics inventory part three; #144 and #145 MERGED and live)

**Part three of the inventory, in one paragraph.** Reveal styles with no new step type: `{{ask.responses.cloud}}` (a sized word cloud), `.cards` (every answer as a card), `.random` (one at random), `{{players.random}}` (one student's name, a fair cold call); the engine renders line shapes, the shared chart module draws them on both screens, the reveal brick takes `style`. Live eval: 4 of 4, the cloud style on both runs, the cards style plus {{players.random}} in the next announce on both runs (4 to 7 s a plan); proof `scripts/simulate-reveal-styles.js` 6 checks. Tests 3225. With #144 (eleven bricks + rolling), #145 (six knobs + write-quiz), and this, the inventory's Part 2 is done except the knobs that need a student screen.

**Next, in order:** (1) the student-screen knobs: pick several on collect-choice, two reviewers per piece on rotation, graded free text on collect, per-group content on announce and collect; (2) the inventory's Part 3 table (a peer-feedback brick over chain + two readers, instant runoff, a hot seat reveal to one screen, confidence after the answer, the AI narrator loop from DEFERRED-IDEAS). Live checks for part three: on the Create page type "one word for how you feel about the exam, then a word cloud" (the cloud on the projector, sized), "every fundraiser idea up at once, then draw a random presenter" (cards, then a name); play each with pretend students and look at the projector.

### Previous START HERE (2026-09-30, later: `engine-knobs` PR open, the mechanics inventory part two; #144 `engine-bricks` MERGED and live)

**Part two of the inventory, in one paragraph.** Six knobs on existing blocks, all engine-side (no new student screen): groups by answer (team-split byAnswer, same or mixed), a poll's .most and .least, a vote over the students by name, the most-voted out (eliminate most-votes), a graded rank order (correctOrder, shown shuffled, points per right slot), and a quiz built from the class's own questions (solo-quiz questionsFrom); as bricks: teams groupBy, vote over students (+ out), rank correct, and write-quiz. Live eval 8 of 8 with every knob set; proof `scripts/simulate-knobs.js` 15 checks through a real room. Tests 3211.

**Next, in order:** (1) the knobs that need a student screen (part three): pick several on collect-choice, two reviewers per piece on rotation, graded free text on collect, per-group content on announce and collect; (2) compute steps: a tally (word frequency) and a random pick; (3) reveal styles: word cloud, all-at-once grid, two columns, a number line; then the inventory's Part 3 table (peer feedback brick, instant runoff, hot seat to one screen, confidence after the answer). Live checks for part two: on the Create page type "everyone picks a side on banning homework, then same-answer groups of four build the argument" (groups named Yes / No / Not sure), "secret spies among the crew, write a sentence, vote a suspect out" (the ballot by name, one student out), "put six Revolution events in order, points per right slot" (shuffled list, both orders after), and "each student writes a quiz question, then everyone takes the class's quiz" (the keyed boxes, then the self-paced quiz); build each and play it with pretend students.

### Previous START HERE (2026-09-30: `engine-bricks` PR open, the mechanics inventory part one; #143 `review-twenty` MERGED and live)

**The mechanics inventory, in one paragraph.** The owner asked what blocks we have, what is easy, and what is missing (`docs/MECHANICS-INVENTORY.md`), then said: do the easy additions and give the Create page the blocks it could not reach. Part one is on `engine-bricks`: eleven bricks over existing step types (match, sort, rate, solo-quiz, wager, merge, relay, tasks, knockout, charades, count) plus `rolling: true` on a plan, each compiling to validator-clean steps with its payoff built in, the three prompts taught, the plan dialog showing what each adds, eleven golden prompts, 28 tests. Live eval on Sonnet 5 low, two runs each: 22 of 22, every prompt picked its brick on both runs, every plan compiled and validated clean, the rolling ticket carried the flag both times (3 to 7 s a plan, one 15 s outlier).

**Next, in order (the inventory's Part 2B to 2D, each a PR):** (1) knobs: pick several on collect-choice, a correct order on rank, `groupBy` an earlier pick-one on team-split, minority routing (`.least` / `nextByLoser`), `fanOut: 2` on rotation (two reviewers per piece), vote candidates from the roster, quiz items from a step, graded free text on collect, per-group content on announce and collect; (2) compute steps: a tally (word frequency) and a random pick; (3) reveal styles: word cloud, all-at-once grid, two columns, a number line. Then the missing-and-useful table (peer feedback brick, vote a player out, student-written quiz, timeline order). Live checks for part one: on the Create page type "match five dates to events, then sort eight statements into fact or opinion" (match + sort, one standings), "joke-off, bottom half out each round" (knockout), "charades in two teams with the class's movie titles" (charades), and "as students finish the test they rate their confidence 1 to 5, no waiting" (rolling); build each and play it with pretend students.

### Previous START HERE (2026-09-29, later: #143 `review-twenty` on its way; #140 and #141 MERGED and live; restart :3000 before using it locally)

**A twentieth outside review, in one paragraph.** Two Truths and a Lie and Closer with real students. Three bugs, all fixed on `review-twenty`: "I have a f u c k i n g cat" went up as a choice with no review (the answer filter now closes up spaced letters, `spacedRuns`, and reads a blocked word inside the run; "k y s" too); "Ben is a loser" went up with Ben in the room (a roster name next to an insult is refused by rule, `filterAboutClassmate`, on the collect submit, the merge close and draft, and a relay line, before the AI check that saw "someone is a loser" and scored it mild; `THREATS` like kys and go die join the blocklist; the Haiku judge is told what "someone" means); a second click on Next step about 60 ms after the first skipped Closer's friend question (both teacher screens drop a forward press within 500 ms of the last one, `pressAdvance()` on the projector). Guarded by `tests/screens/review-twenty.test.js` and new blocks in `tests/engine/content-filter.test.js`; proof `scripts/simulate-review-twenty.js` (7 checks, a server running).

**Next:** on the live site, in Two Truths with three pretend students: type "I have a f u c k i n g cat" (refused), "Ben is a loser" with a Ben in the room (refused, "Leave your classmates out of it."), "kys" (refused), and "Ben is great at soccer" (accepted); then double-click Next step fast on the console during Closer and watch that only one step moves. Still open from the reviewer's list: phone numbers and Snapchat handles in an answer rest on the AI check alone (the scrub hides them from OpenAI, so a bare number is accepted at the first rung); a deterministic contact-info refusal in `checkSubmission` is the next step if the owner wants it.

### Previous START HERE (2026-09-29: #140 `demo-eve-review` and #141 `review-nineteen` BOTH MERGED, master deploys via CI; every merged branch was swept, only `master` and `when-setting` (PR #64, stale, decide: rebase or close) remain; restart :3000 before using it locally)

**A nineteenth outside review, in one paragraph.** The reviewer's full plays with a phone plus the items from the older rounds, every one verified against the code first: a spaced swear name passed the filter (closed-up check), a blank name took a dropped classmate's seat (never again), an empty box lost the whole answer with no word ("Fill in every box." and a lenient expiry), the projector's Remove box showed to the class (Remove is the console's), the joke bubble over "You have been removed", the Charades card on the projector, Two Truths' lie vote saying "Only your teacher sees your answers" (a new `scored` audience key for rounds), Live Poll's console note contradicting the live bars (`tally`), Solo Quiz answers lost on a restart (snapshot per answer), Emoji Movies clues in letters (`emojiOnly` field), the lie reaching the AI summary (`inputFields`), guessable copy ids (random tails), and the designer's native dialogs (`Dialog.alert`). CHANGELOG has the detail.

**Next:** on the live site: join as "S h i t" (refused), play Two Truths with three pretend students and read the lie vote's small print and the summary, play Charades and look at the projector during a turn, save a copy and read its id in the address bar (a random tail). The practice funder demo is Tue 2026-09-29, the real one Tue 2026-10-06 (the demo path, home to Snowball's reveal, was walked live on the merged code the night before: clean). Three calls made in #141 that the owner may flip: the Charades card never reaches the projector, a blank name never reclaims a seat, and Fat, Ugly, Pig are refused as names. Not built: editor controls for `emojiOnly` and `inputFields`; the other reconnect emits without `phaseInstanceId` (rate, rank, estimate, team-split, reveal-one); a concurrent same-id save can overwrite (upsert); the engine gaps from earlier rounds. Then the older readiness list below.

### START HERE next session (updated 2026-09-28, late night: #136 `review-eighteen`, #137 `review-eighteen-polish`, #138 `buzz-locked-visible` ALL MERGED and live; restart :3000 before using it locally)

**Funder demo, the plan changed (owner 2026-09-28):** the owner runs the demo LIVE on jamyard.org; the video part is now a ~40 s montage of real footage showing the range of student and projector interactions, `~/Videos/jamyard-montage-v3.mp4` (42 s, 12 clips on one Moon unit: write, shared box, tap then submit, live bars, draw, the wall one at a time, match, buzz, rate, guess a number, quiz, the rope's before/after; captions, the ad's music, cross-fades). The owner: "looks good". Rig `scripts/video/montage/` UNCOMMITTED (README there, ~2 min record + assemble). Honesty rule the owner set: never a screen the product cannot do (every activity saved through /api/games, bots on real socket events, page changes cosmetic only). Practice Tue 2026-09-29, real Tue 2026-10-06. The old live-stage plan (`scripts/video/demo/LIVE-STAGE-PLAN.md`) and video v1 are superseded unless the owner says otherwise.

**The live check of #136 (the reviewer, all five passed):** PIN lockout, Solo Quiz one tap, pick-then-confirm on votes, the Feedback button at laptop size, the make page's timer and restore. Its rough edges went into #137: a reloaded console reconnects by itself, "The answer was Mercury." with the right choice ringed green, the Vote / Submit button sticky at the bottom of the student screen, the long-question note only for words the teacher typed. #138: the projector's "Maya buzzed in!" card was blank (paper on paper), found while filming.

### Previous START HERE (2026-09-28, night: #136 `review-eighteen` MERGED and verified live by the reviewer)

**An eighteenth outside review plus the owner's asks, in one paragraph.** Four passes by one reviewer (layout, popups and Try it out, full plays with a phone, ten teacher ideas through Create), fixed as seven parallel slices: a guessing student could lock the teacher out of the console (now a per-room teacher key the host's browser carries, typed PINs still throttled) and anyone could list every saved activity (bare list owner-only, `ids` gone, the server dedupes save ids); Solo Quiz said "Correct!" on a wrong answer after a right one; Vocab Match dealt matched pairs and stranded late joiners; an empty AI step put the model's "paste the list" on the projector; the make page read a typed "2" as ten seconds and lost edits on reload, and its quiz panel made duplicate copies; Try it out's Feedback bar covered both panels at laptop height; plus the home and designer lists (CHANGELOG has all of it). The owner's asks shipped: Change my name in the lobby, pick-then-confirm voting, m:ss timers, a long-text pass (before/after shots were in the session scratchpad), and the answer on Show (below).

**Owner decisions, all made 2026-09-28:** quiz questions (a right answer) stay one tap, confirm is for votes and polls; no rename in rolling rooms; unsaved make-page edits live in the tab only (reload or Back); Show stays hidden where a partner reads the answer; old Choice Draft copies are left alone (never rebuild over hand edits); the madlib spin gap and the fold picture hidden under 600px stay; the privacy page now says saved activities are not listed publicly.

**Next:** (verified live, see above) The engine gaps the Create pass named (sort into groups, knockouts, a sized word cloud, feedback on one classmate's work, and the accusation vote / two-piece peer review / minority turn from before) are still unbuilt, decide before building.

### Previous START HERE (updated 2026-09-28, later: #133 `review-sixteen` and #134 `review-seventeen` BOTH MERGED, master deploys via CI; restart :3000 before using it locally)

**Two outside reviews, in one paragraph.** Sixteen (a teacher's ordinary pass): Live Poll labels broke mid-word on the projector (the tally shrink-wrapped in the collect section's flex column and `overflow-wrap: anywhere` collapsed the label column; `width: 100%` + `break-word`), fist to five's poll said "One classmate will read this" (a `pairBy.from` ref alone is no reader), a pair step now names the partner ("Your partner: Jordan", `partnerLineFor` in collect.js), and Try it out's off-pager students finish a solo quiz (hidden frames crawl, `sqBotStep`). Seventeen (all 48 built-ins through Try it out): **the relay step was broken for real classes** (turn events had no `phaseInstanceId`, every line dropped as stale, each turn "(skipped)"), Dream Vacation's runner-up `{{...}}` slots (now the ranked list), name insults (jackass/dumbass on the profanity list, `NAME_INSULTS` for names only), a rating or live poll says "The class sees the totals, not who gave which answer." (`AUDIENCE.TALLY`), "1 pt", the Create page's false "already exists" (`carriesContent` → "The closest ready-made activity" and `&idea=` to the make page, whose pair writer runs on it), a mood check's choices, a dead share link's wording, empty make-page sections, spoken names on reorder arrows, better pretend-student answers and relay turns.

**Next:** on the live site, play Dream Vacation (or any relay) with real phones or Try it out: every line lands in the pitch; join as "jackass" (refused); type "Spanish 1 vocabulary review: match the color words to their English meanings" on the Create page (the closest card, Make it yours writes rojo/azul pairs; the right side came back as descriptions like "the color of a stop sign", a pair-writer prompt tweak if the owner wants plain translations). Open item: mock mode's Dream Vacation shortlist resolves to the literal "shortlist.result" (local only). Then the three engine gaps from the round below (accusation vote, two-piece peer review, minority turn) and the untested list (a class of 25 to 30 on real devices).

### Previous START HERE (2026-09-28: #129 `create-capabilities` and #130 `create-round-two` BOTH MERGED, master deploys via CI; the local :3000 server runs it)

**Two Create-page rounds from one outside reviewer, in one paragraph.** The reviewer ran fifteen common classroom routines (jigsaw, hot seat, book bracket, buzzer round, zoo debate, fist to five, anonymous question box, secret saboteurs, peer review...) through the Create page: the first time none came out working, because the AI builder knew less than the engine. #129: five bricks (`buzz`, `review` = a teacher gate then one at a time, `bracket`, `teams` with `jigsaw: true`, `pairs` with `pairBy`), two bounded engine shapes (a `vote` with `bracket: true` chained by `.winners`; a `team-split` with `method: "jigsaw"` + `regroupFrom`), a vote's `.resultsList` in every mode, a block of text wired into a list slot as an ERROR in plain words (the reviewer's blank cards had passed Apply and autosave as a jargon warning), a refusal that carries the part the bricks can build ("Build the part we can"), the owner's call that secret roles are fine and a killing theme is not, and a live eval (all five new golden prompts hand off and build; a PAIRING BY ANSWER matcher rule went in when the zoo debate still matched Both Sides of the Rope). The second pass ran six of fifteen end to end; #130 took the nine left: `pairBy: "far"` (the ends of a scale together, "opposite" only meant different), pretend students finishing a head-to-head ballot, five bracket rounds with spare rounds and their cards passing themselves (adjacent hops only, the state machine refuses a jump), `showRejected: false` + `top: N` on the vote brick (the anonymous question box), roles that fit the group, a projector line on pair steps, Plan it step by step beside a match that drops part of the idea, no bracketed placeholder params, and a plain no-match opening the plan straight away. Proofs `scripts/simulate-bracket-jigsaw.js` (24) and `scripts/simulate-round-two.js` (19). Suite 2905, the Windows CRLF assertion the only failure.

**Next:** on the live site, type "fist to five on fractions, then pair the 0s with the 5s" and "anonymous question box, upvote, top five" on the Create page: each should open the plan straight away (no card), build, and in Try it out the 0 sits with a 5 and the question box's results show five questions and no Did not pass. Type "eight books in a bracket" and play it with six pretend students: three rounds, then the champion, no empty cards. The reviewer's remaining list is real engine work, decide before building: an accusation vote for secret-role games (Mafia without the murder), two classmates' pieces to one reviewer with feedback back, the minority-only turn (would you rather). Then the readiness list below.
### Previous START HERE (2026-09-27, later: #127 `review-fifteen` MERGED, master deploys via CI; the local :3000 server runs it)

**A fifteenth outside review, in one paragraph.** The reviewer tried to break things: odd names, removing a student, a long question, closing the projector mid-Closer, an impossible idea for the AI builder. Fixed on `review-fifteen`: student names go through the filter (`filterName`: the answer check plus compounds like shithead and fuckface, surnames like Dickson and Spicer pass; refused with "That name cannot go on the big screen. Use your first name." in every language), a closed projector tab comes back (the console's **Open the projector again** door, `host-rejoin` by teacher PIN through the console throttle, and a fresh `/host` on the projector computer picks the room up from localStorage for six hours), the room is held while a console is connected (and a room a student's refresh restores is held and then closed, never a zombie), the console lobby lists every student with **Rename** and **Remove** (Rename fixes a rude name without locking the student out; every screen follows), the console shows the words on the projector under the status row, the AI builder's card leads with Pick from Recipes and drops the plan when the matcher says the idea lives off the screens (`offScreen`; and both Create routes now forward `harm`, which the designer read but never received), the make page warns past 160 characters that a long question shows smaller, and the projector's name planks wrap long names instead of "MAXIMILI...". Already fixed before this review: the "Show the message" label (review twelve). Proof `scripts/simulate-review-fifteen.js` (16 checks). Suite 2852, the Windows CRLF assertion the only failure.

**Next:** merge on the owner's word, restart :3000, then on the live site: join a room as "shithead" from a phone (refused, the line in the room's language); close the projector tab mid-activity, press Open the projector again on the console (the new tab is on the same step, the students move on), and separately open jamyard.org/host on the projector computer (it picks the room up by itself); Rename a student from the console lobby and watch the projector plank and the student's screen; type "a 3D printed jetpack race where students fly around the room" on the Create page (the card should read "Screens cannot do that part" with Pick from Recipes red, no plan button; a Haiku call, so check the wording once). Then the readiness list below.

### Previous START HERE (2026-09-27, late night: #123 `review-fourteen` MERGED, master deploys via CI; the local :3000 server runs it)

**A fourteenth outside review, in one paragraph.** Doodle Bluff and Convince Me! with four pretend students plus the content filter (which held). Fixed on `review-fourteen`: a join landing while Start moves the room now waits for the first step (`room.starting`; the reviewer's stranded pair was not reproducible, the window is closed; proof `scripts/simulate-join-at-start.js`, 7 checks), the Approve & Show line's grammar, Doodle Bluff's contradictory fake-title ask and its copyable example (kinds instead; recipe + stamped param + recompile), Convince Me!'s stray comma, its topics line that ran ahead of the devices, and its bare "…" on the projector (a `hostTemplate` line), Try it out's Reset (starts the same activity over), the done screen's blocks off the right edge (no sideways scroll). Left as designed: the blocked-message notice never carries the words; pretend-student seats follow the activity's shape. Suite 2835, the Windows CRLF assertion the only failure.

**Readiness, as told to the owner 2026-09-27:** ready for the friendly pilot, not a wide launch. Gates: (1) no real class of 25 to 30 on real devices yet, the join rush, the submit race, and a wifi drop are the unknowns (the load half: `node scripts/simulate-any-game.js <game> 30` against a local server); (2) the Project Zero licensing email before public marketing (docs/COMPARATIVE-ADVANTAGE.md); (3) the four compliance documents blocked on owner facts and COPPA unmentioned on the privacy page (docs/COMPLIANCE-TODO.md), which a district will ask about; (4) the owner key is a day old and claims copies on each teacher's next visit, give it a week of pilot without a vanished-yard report. Suggested order: load test, one real class, the email, then set the date after two quiet pilot weeks watching /rooms and /feedback.

**Next:** the untested list is the real next step: a class of 25 to 30 on real devices (`node scripts/simulate-any-game.js <game> 30` against a local server for the load half), Doodle Bluff through to final scores, Kick (it goes through `Dialog.confirm`, never `window.confirm`), a true first visit in an incognito window. Then the older list below.

### Previous START HERE (2026-09-27, late night: #121 `review-thirteen` MERGED, master deploys via CI; the local :3000 server runs it)

**A thirteenth outside review, in one paragraph.** A live Draw Gallery run across all three screens. Fixed on `review-thirteen`: the gallery's invention lines after a changed prompt (topic-free now, and the intro says "after your teacher takes a look"), the projector's one-tap Approve & Show (asks first unless the list was opened on that screen), bare "Cannot GET" (a not-found page with Join a room and The yard; `/join` and `/play` go to the student page), the timer running on after everyone submitted ("Everyone is in" and Close pulses, still the teacher's press), "Continue" on the console after All done (hidden), "Class: Sam" on the report ("Students:"), no skip link, faint lobby names, small footer links. Left as designed: per-activity next labels, the Totem lobby layout, the demo pictures' small text; the Enter-reset join was not reproducible. Suite 2828, the Windows CRLF assertion the only failure.

**Next:** merge on the owner's word, restart :3000, then on the live site: `jamyard.org/join` lands on the student page and `jamyard.org/anything` shows the not-found page; a Draw Gallery room from the projector alone (Approve & Show asks, Show on this screen then Approve does not); the counter at the last submission. The reviewer's own list of what is still untested stands: real phones, a class of 25 to 30, a wifi drop mid-activity, Trivia Bluff / Both Sides / a quiz live, and the Create page's Let's figure it out and Browse recipes paths. Then the older list below.

### Previous START HERE (2026-09-27, night: #119 `review-twelve` MERGED, master deploys via CI; the local :3000 server runs it)

**A twelfth outside review, in one paragraph.** A first-time-teacher walk on desktop and at 390px. Fixed on `review-twelve`: the match card's raw JSON and true/false (words and On/Off now), the talk note on a quiz plan (a three-to-one rule), link previews and a tab icon (og-image.png, favicon.svg on every page), the example note claiming the whole page ("The first question is filled in for ..."), the projector's rating results (bars per value, one header, bigger), "Room not found" (now says to check the big screen, every language), the feedback button over + Add another student, Nunito (never loaded), the Create page's box beside Make it on a phone, the join page with no wordmark, the no-results line under a chip, "Show the message" on a message already up ("Next step"), skip ahead's silence (a live line), the word MIC (a drawn mic). Owner's calls: the content cards' blank planks at rest stay (the reviewer read them as a failed load); the contact address later; COPPA is a compliance-doc question, not code. Suite 2817, the Windows CRLF assertion the only failure.

**Next:** merge on the owner's word, restart :3000, then on the live site: paste the home link into Slack or a text and see the card; open the Create page and type a quiz idea to see the match card read as words; a Class Critique or rating room to see the bars. Then the older list below.

### Previous START HERE (2026-09-27, late: #117 `review-eleven` MERGED 20ae1de, master deploys via CI; the local :3000 server runs it)

**An eleventh outside review, in one paragraph.** The reviewer re-checked the live site and listed six must-fixes; four had shipped in #106 to #114 before the check (Anonymous Feedback's private summary, Draw Gallery's Reject and Hide, the drawing surviving a refresh, Both Sides and Idea Chain endings) and two were real: the Guess Who gate never reached the live row (a transition card sits between the collect and the rounds, and the read repair only fired on a direct link; `reachesThroughAnnounces` in `engine/review-gate.js` now walks announces, checked against the dev branch's row through the server), and "In French" crashed because `LANGUAGE_CODES` was never imported into server.js (a real French call checked). Also: five more jokes cut (451), Class Critique's "Talk it out" is the rate step's `discussionPrompt` so the chart stays up, a storyboard poll gets `liveResults` and a results reveal, the no-recipe card leads with Plan it step by step, the intro's "Use them," and "create your own." are links, and My yard says how many remembered copies are gone instead of dropping them. Suite 2790, the Windows CRLF assertion the only failure.

**Next:** merge on the owner's word, then check the live site: open the Guess Who row (`/host?game=rose-bud-thorn`), answer as a student, close, and confirm the review step lands on the console before the transition card (the server log says `[repair] ... review step added`); the make page's In French row on any activity; a Class Critique room (Close, the chart, Show on the console floats the question over it). **The owner key shipped on the same branch** (the owner said build it): every browser mints one secret, every `/api/games` request carries it, the server stores its hash with each saved row and refuses another browser's overwrite or delete; rows from before are claimed by the browser that lists them as its own. On the live site, the first visit from each teacher's browser after the deploy claims their copies; a teacher who opens one of their own activities by pasted URL on a second computer gets "saved from another browser" on save and should Share it instead. Local dev with no `SITE_PASSWORD` never refuses (every request is the owner); run `SITE_PASSWORD=x node server.js` and `SITE_PASSWORD=x node scripts/simulate-owner-key.js` to see the gate. Suite 2801. Then the older list below.

### Previous START HERE (2026-09-27: #113 `madlib-intro`, #114 `review-ten`, #115 `fact-scout` ALL MERGED, master deployed via CI; the local :3000 server runs the merged code)

**Three PRs in one session, all merged on the owner's word.** #113 the madlib intro (the home opens on "JAMYARD is a [blank] of whole-class activities for [blank]. Use them, [blank] them, or create your own." with reel blocks from the design handoff in `docs/design_handoff_jamyard_madlib_intro`; scroll fades it and the wordmark flies into the header; `shared/madlib-intro.js` + `.css`; the fold's headline hides, the question over the planks is the headline, the demo code is KQTW; idle re-spins stop after three; returning visitors still get the full intro, the handoff's open question). #114 review ten (a copy saved under Anonymous Feedback v1 put the teacher's summary on the projector again: recipes name versions to replace on read, `engine/recipe-upgrade.js`, and `games/user/` files get the same repairs as database rows; every prose AI step over answers counts what it left out, "LEFT OUT: n" read off by `parseLeftOut`, the console hears "The AI summed up 2 of 3 answers and left 1 out", the report prints it; no title line under a heading; the corner-chip strip moved to the body, unzoomed). #115 the fact scout, below.

**The fact scout, in one paragraph.** The owner wanted Trivia Bluff's facts ridiculous, obscure, not on any fun-facts list, school-appropriate, and checkable without the teacher fact-checking. `engine/fact-scout.js` (pure) + `services/fact-scout.js` read about ten Wikipedia article BODIES on a topic and propose rounds quoted from the text with the sentence and a link: a small model keeps the pages about the topic itself, the big model extracts under the owner's rules (never a number, a place, a person's name, a brand, a list-completion, a rite, a gross word, alcohol, or a bold claim; the blank on the strangest word; who, where, and when in the sentence), and a second small model that never saw the sources takes a lineup test. The owner rated five rounds of ten topics (39 hits, 25 misses, `engine/fact-scout-taste.json`, the prompt reads it). Recipe v2 (`replaceOnRead: ["1"]`) has no live mode and no AI step; the built-in ships three of the owner's hits (marrying, sausage flies, wallpaper); the panel's doors are the teacher's own facts and "Find facts about a topic" (`POST /api/games/fact-scout`, ticked rounds join the list); `generateBluffFacts` and `/api/games/bluff-facts` are gone. CLI `node scripts/fact-scout.js "<topic>"`. Suite 2787, the Windows CRLF assertion the only failure.

**Next:** check the live site: the home's intro plays and fades, the wordmark lands in the header (a phone width too); `/make?game=trivia-bluff` shows the two doors and Find facts returns rounds with links (three model calls and about a minute; the per-minute AI budget is the first limit if teachers take to it); an Anonymous Feedback copy from before shows the review step on the console. Owner calls open: returning visitors and the intro (skip, short version, or always); found facts replace the template's three defaults on the first add (stack instead?); a named thing ("the Statue of Liberty") can still slip through as a truth. Then the older list below.

### Previous START HERE (2026-09-27, early: #109 `phone-round`, #110 `rope-round`, #111 `guess-who-gate` ALL MERGED, master deployed via CI; the local :3000 server needs a RESTART, it still runs pre-#111 engine code)

**Three reviewer rounds in one night, all merged on the owner's word.** #109 phone round (Reject asks first on both teacher surfaces, Hide per entry on the projector's review list, step-note to students, a drawing and its clock survive a refresh, dead ?game= note, visible colour ring). #110 rope round (collect-choice `chartOrder` + `compareTo`, the paired chart with Before / After heads and the moved line, a WHERE WE START reveal, the counter follows a late joiner, the corner-chip strip, Back to the yard on a dead make link) plus the make page's "Words on the students' screens" row (As written / In French, the copy translated on the way out; the owner picked this over hand-written examples per language). #111 below.

**Guess who gate, in one paragraph.** A reviewer's Guess Who: Rose, Bud, Thorn run put "My parents are getting divorced and I can't sleep" straight on the projector with the class asked to guess who wrote it. Branch `guess-who-gate`: the compiler puts a preview between the question and any guessing rounds; `engine/review-gate.js` adds the gate ON READ to copies saved before (secret-author rounds only, from `repairSavedConfig`, which is how the live Guess Who row gets it without touching the database); Who Said It? gated; validator `AUTHOR_UNGATED` (advice on the wider name-the-author shape, Excuse Machine carries it); the author's screen reads the plain waiting line and the projector count treats the author as in; the answer box says "Your class will see this and try to guess who wrote it, after your teacher reviews it."; `engine/heavy-topics.js` flags a heavy disclosure "Needs a look" on the console and the review list, never blocks. Merged just before it in #110: the make page's "Words on the students' screens" row (As written / In French) translates the copy on the way out (`POST /api/games/translate`), the owner's pick over hand-written examples per language. Proof `scripts/simulate-guess-who-gate.js` (13). Suite 2725, the Windows CRLF assertion the only failure.

**Next:** restart :3000, then check the live site: open the Guess Who row as a student, submit, close, and confirm the review step lands on the console before any round (the read repair is the only path for that row; a server log line "[repair] ... review step added" says it ran); a Both Sides room (the start reveal, the paired ending); a Draw Gallery room from a phone (Reject asks, Hide per drawing, a refresh keeps the strokes and the clock); the make page with a 6-8 French class (the language row, In French, the copy in French). Owner calls still open from these rounds: keep the Thorn out of Guess Who's rounds or not; the fit's "share real things?" question default (AI-written); the sticky Submit over a tall answer box. Then the older list below.

### Previous START HERE (2026-09-26, late night: #109 `phone-round` MERGED; branch `rope-round`, PR open)

**Rope round, in one paragraph.** A reviewer ran Both Sides of the Rope with five pretend students (one joining mid-vote) and could not read the ending: two lists sorted by count, zero rows gone, no "how many moved". Branch `rope-round`: a pick-one step takes `chartOrder: "choices"` (its bar chart keeps the choice order, zeros shown) and `compareTo: "<earlier pick-one step>"` (`engine/phases/stance-shift.js`: `beforeAfter`, one paired chart with both counts per choice, drawn by `shared/chart-render.js` on both screens as a five-column grid with Before / After heads; `movedLine`, "3 of 5 students changed their minds." in every language; the validator checks the earlier step). The rope's built-in and recipe carry both, a host-paced WHERE WE START reveal after the first vote, and the paired ending. Also: the projector's counter follows a late joiner (`submission-count`), the active section keeps a 72px strip clear of the corner chip, a dead make link offers Back to the yard. Proof `scripts/simulate-rope-round.js` (14). Suite 2700, the Windows CRLF assertion the only failure. Left open from the round: the yard's class examples in the class's language (authored, never AI-written); the popup's steps scrolling under the sticky door (by design); the Feedback button over a card's hover line.

**Next:** merge on the owner's word, restart :3000, check the live site (a Both Sides room: the start reveal, the paired ending). Then the older list below.

### Previous START HERE (2026-09-26, night: branch `phone-round`, PR open)

**2026-09-26, night, in one paragraph.** An outside reviewer tested on a phone-sized screen; branch `phone-round` answers it. Reject on the review screen asks first on both the projector and the console (`Dialog.confirm`, "Start this step over?", Keep them / Start over; the console's Kick moved off `window.confirm` too; the projector's button reads Try again like the console's). The projector's private review list has a Hide per entry, and a Hide re-sends the list to both teacher surfaces marked `refresh` (the projector keeps its private toggle open). A reject sends `step-note` to every student, shown over the restarted step's prompt in every language ("Your teacher asked everyone to do this step again."). A drawing survives a refresh (`jamyard.drawDraft`: own strokes keyed by room, seat, step; restored with `Draw.addStrokes`; cleared on `response-accepted`), and so does the timer (`phaseState.timerEndsAt` recorded on collect enter, bumped by more time, `secondsLeft` on reconnect). A rejoin in the lobby shows the waiting screen. A dead `?game=` on the host shows a note instead of a picker set to Draw Gallery. The picked colour has a visible ring (Totem's torn-paper clip on buttons clipped it: `.draw-swatch { clip-path: none }`), an answered notice keeps its room so Submit stays put, the joke bubble and the host's code blocks have sub-480px rules. Not reproduced: My yard as a sideways scroller at 390px. Proof `scripts/simulate-phone-round.js` (12). Suite 2676, the Windows CRLF assertion the only failure. Checked in Chrome through a 390px iframe (Chrome will not shrink a window below about 500px): the joke bubble, the ring, the note, the restored drawing, the projector's dialog and Hide, the host note.

**Next:** merge on the owner's word, restart :3000, check the live site (a Draw Gallery room from a phone: Reject asks, Hide per drawing on the projector's list, refresh mid-drawing keeps the strokes and the clock). The reviewer's "Submit moves about 20 px after the first stroke" did not reproduce in the frame (Submit is sticky; the notice change covers the one in-flow cause); if it is the mobile URL bar, nothing on our side fixes it. Then the older list below.

### Previous START HERE (2026-09-26, evening: PRs #104 to #107 ALL MERGED, live on jamyard.org and checked there)

**2026-09-26, afternoon and evening, in one paragraph.** Four PRs, each merged on the owner's word and checked on the live site. #104 `yard-hover-lift`: the yard card's hover lift is measured per card so a three-line prompt never lands on the picture. #105 `review-seven` (an outside reviewer's seventh round plus two catches from a live walk): a Spanish idea gets a Spanish activity (`engine/activity-text.js` + `AIService.translateActivityText` on the match route, `language` pinned; the recipe's own English prose was copied through and tipped Auto to English), `engine/plan-check.js` gates a plan with no student step (one forced try on the first runner-up, then an honest no), 21 jokes cut, the joke's settle window only in a rolling room, the Vocab Match projector lists the terms, bluff number boxes clamp, a Hide moves `byPlayer` aside too (Someone's Got You carried a hidden line to its recipient), Closer's top card follows a library fill. #106 `review-eight-nine` (rounds eight and nine plus the owner's ask): Idea Chain recipe v2 (it had NO chain reveal: now an own-scope steps reveal and a gallery of every chain start to finish), Anonymous Feedback recipe v2 (the teacher's summary behind a `preview` gate on the console, a group-level "What we said" for the class, nobody singled out), `capName` in the compiler (ten recipes folded the question into the title), fields are wrapping textareas with no question as placeholder, the projector lists a multi-field step's questions, the timer chip's last seconds were orange on orange, the fit question knows the answer cap, sample answers follow a chain and the bench asks for every seat, the make page re-reads the class on restore, an AI draft with no student step cannot be applied, three more jokes cut (456 left), and **Which language?** (World languages opens a popup: Spanish, French, German, Mandarin, or type one; `languageText` on the profile, "6-8 · Spanish" on the chip, "World languages (Spanish)" in the class line the AI reads). #107 `bluff-default`: Trivia Bluff's facts come from the teacher by default (recipe default `prepared` with three checked default facts, the built-in recompiled over them with a lies sample set, the panel opens on "I write my own facts"). Proofs: `scripts/simulate-hide-after-close.js` (11), `scripts/simulate-review-eight-nine.js` (30). Suite 2654, the Windows CRLF assertion the only failure.

**Owner's calls today, final (do not re-raise):** jokes ON by default; the four language chips stay (no Latin in place of one); Trivia Bluff never the AI by default.

**Left open, on purpose:** Choice Draft's generic choices (no class example table outside the yard) and its ranking instruction in large type; Estimation Station's AI answers shown before class (out of the yard); the fit's follow-up question quality ("What tone should the ending message have?"); the storyboard compiler's own fixed English strings on a non-English idea (only the recipe path translates; the storyboard prompt is told to write in the idea's language); the reviewer's Exit Ticket copy left in My yard on the live site (delete it).

**Next:** whatever the next review brings; the class examples for World languages could read the chosen language (they name none today); a `reveal` `scope: "teacher"` would be the proper engine feature behind Anonymous Feedback's preview trick if another recipe needs a console-only result. The local :3000 server must be restarted after these pulls (recipes and the engine load at start).

### Previous START HERE (2026-09-26, night: PRs #97 to #102 ALL MERGED, master deployed via CI)

**2026-09-26 in one paragraph.** Six PRs from three outside reviews and the owner's own Make page pass, all merged. #97 `convention-floor` (third Convention review: sample yes/no votes, turnout, Did not pass, the projector lists proposals while a vote is open, count tags, joke only for lobby joiners). #98 `quiz-and-joke` (shuffled quiz choices per student, honest scores, the make page redraws as the quiz panel changes, Dialog.confirm, the joke folds on the first move). #99 `gallery-grid` (drawing tools above the pad, the wall as a grid, Close asks when nobody answered, Draw Gallery wording). #100 `make-pass` (the fit never asks for words the top of the page holds; See how it reads only after an answer; keep-note once; Closer prints its first question). #102 `make-more` (Vocab Match pairs writer; Closer's tiers editable with a one-row question library, two new original sets, plain chip names, no hint, short print, no Your class row on a talk-only activity; Your class swaps the yard example into untouched boxes elsewhere; the pairs above the fit rows). #101 `hide-per-line` (a Hide after the close reaches stored rows and the reveal queue, Hide per line on the console's review screen, teacher-blocked notices, AI JSON retry then a clear error, Trivia Bluff fact self-check + Start the round + options on the projector, harm refusals read as a no).

**Owner decisions today:** no whole-class majority for a yes/no vote (votes cast decide, turnout shown); wait on TypeSafe's Jev; the make page is minimal: the top holds the words, nothing that does nothing, no big words, one row of chips beats per-item pickers; never the word Along on a chip (the credit line carries the source).

**Left open, on purpose:** the pretend students' sample lies cannot match a live Trivia Bluff fact (no AI in Try it out); the pinned Submit over a tall answer box in Try it out; copies with the same name look alike on My yard and own prints do not redraw after edits; upload a picture from the computer; reorder editor steps by hand; drawing Vocab Match's pairs IN the print as the student sees them (owner unsure); folding Warm-up, Values, Reflective into Original if the chip row is still too long.

**Next:** check the live site after the deploy (Closer's make page: the chip row, a tap filling all tiers, Original restoring; Vocab Match: the pairs writer and a class pick swapping the example; Someone's Got You: Hide on the console's review screen). Then whatever the next review brings. The owner's :3000 server was restarted on master.

### Previous START HERE (2026-09-26, early: PRs #86 to #95 ALL MERGED, master deployed via CI)

**The night of 2026-09-25 in one paragraph.** A third outside review (Exquisite Corpse rebuilt by the AI into a water-cycle chain) was answered in #86 `show-the-chains`: a return-to-author reveal stores every finished chain as `responses` (a gallery, a vote, a rate step, the report, and the console can read them), **Spotlight** (Show on the console's Finished chains list and on every Live entry puts one student's work on the projector, `engine/spotlight.js`), the recipe's own gallery step, the AI taught to rewrite templates, intros, and names when a chain changes, validator `PAYOFF_TIMED`, a recipe-picker search, the retired duplicate Group Work recipe, editor step gists, growing choice boxes. Then the owner's calls: Exquisite Corpse is **Folded Pass** (#87); the yard swap (#88, #89, #91, #92: Speed Quiz, Trivia Bluff, One More Thing out, then One More Thing and Trivia Bluff back; Folded Pass and a new **Estimation Station** built-in in, then both out again: "not ready" and "not a default"); **the yard is fifteen**: Exit Ticket, Live Poll, Class Critique, Draw Gallery, Snowball, Solo Quiz, Someone's Got You, Vocab Match, Both Sides of the Rope, One More Thing, Trivia Bluff, Doodle Bluff, Whose Eyes?, Closer, Group Work Day (built but out: Speed Quiz, Folded Pass, Estimation Station). Then **rate scales typed in place** (#90, #93, #94, #95): the Simple view's Rate on scales card edits the scales (name, range, end labels, x, + Add a scale) with no AI; on the make page a rating step's scales sit INSIDE the print, drawn as the student screen draws them (name, end words, a row of red number buttons), the name and end words as boxes, a round x on each (never the last), "+ scale" under the list; the fit asks nothing and shows no See how it reads then (`AIService.asksAboutTypedContent` also drops any question about the scales, pairs, or choices), so Make it fit your class is Your class, Student names, the dad joke. Proofs: `node scripts/simulate-show-the-chains.js` (20 checks). Tests: `show-the-chains.test.js`, `rate-scales.test.js`, `estimation-station-recipe-born.test.js`. Suite 2564, only the Windows CRLF assertion fails. **GOTCHA relearned:** the local server must be RESTARTED after a pull (the owner saw the old make page: static files come fresh from disk, the engine module stays in memory).

**Next:** check the live site after the deploy (the yard's fifteen, Class Critique's make page with the scales in the print, the console's Finished chains list on a Folded Pass room, the library console for ★ drift since DB overrides beat repo flags); ask the owner what makes Folded Pass "not ready"; the owner's pass on class examples (Class Critique's line-only example is a first draft); the same in-place treatment could fit other panel-less steps (a sort step's buckets, an estimate step's range). Then the older list below.

### Previous START HERE (2026-09-25, night: #86 show-the-chains MERGED, #87 folded-pass MERGED, the yard swap on branch `yard-swap`)

**2026-09-25, night, the owner's three calls after the third review:** merge (done, #86, the proof green on master); Exquisite Corpse is **Folded Pass** (#87 MERGED, ids unchanged); the yard swap (branch `yard-swap`): OUT Speed Quiz, Trivia Bluff, One More Thing; IN Folded Pass, Class Critique, and a new **Estimation Station** built-in compiled from its recipe (drift-guarded), each with a `when` line, class examples, a pictogram in the block style, and Folded Pass's sample set in the recipe template. The suite is 2553 with the Windows CRLF assertion the only failure; the yard was shot headless with the fifteen in place. **Then the owner pulled Estimation Station back out** ("I'm not sure why we would do that"): then put One More Thing back: then swapped Folded Pass out for Trivia Bluff ("not ready"): the yard is FIFTEEN (Speed Quiz, Folded Pass, Estimation Station out); PR #90 `rate-scales` (scales typed in place on the Simple view and the make page) is open with CI green. **Next:** after the deploy, boot master, check the yard on the live site after the deploy (and the library console for ★ drift: a database override beats the repo flag, so any of the six ever flipped on jamyard.org keeps its old state until flipped again); then the class examples the owner has not passed on yet (the three new cards' examples are first drafts: Estimation Station's nine how-many numbers, Folded Pass's theme line, Class Critique's line), the map's red X stays as it is (owner: not worried).

### Previous START HERE (2026-09-25, later: branch `show-the-chains`, the third review answered, PR open)

**2026-09-25, later: a third outside reviewer built a water-cycle cause-and-effect chain on the Exquisite Corpse recipe through the AI rewrite and ran it with four pretend students. The chains came back to each student but the class never saw one; the rating poll came after the chain had left the screen and its results were never shown; the report listed six word lists instead of the chains; the AI left "six words, five classmates" over a four-student science chain; Group Work Day was listed twice; the recipe list had no search; six Open answers were indistinguishable in the editor; the Multiple Choice card cut answers off. Branch `show-the-chains` answers every item that is code: the return-to-author reveal stores every chain (`{{poem.responses}}` for a gallery, a vote, or a rate step; the report's chain section), Spotlight (Show on the console's chain list and on every Live entry puts one student's work on the projector; `engine/spotlight.js`), the recipe's own `share` gallery and honest copy, the AI taught to rewrite templates, intros, and names when a chain changes, a `PAYOFF_TIMED` validator warning, the recipe picker's search and the retired duplicate, the editor stack's step gists, the choice boxes that grow. CHANGELOG 2026-09-25 (the third entry) has every piece. Proof: `node scripts/simulate-show-the-chains.js` (own server, twenty checks). Probed with the real AI: the reviewer's rewrite request now returns "The Water Cycle Relay", every message rewritten, an arrow template, the gallery, and a yes-or-no vote over the chains with a results screen, zero warnings.** **Next:** merge the PR once CI is green, boot master, run the proof; then re-run the reviewer's flow on the live site (Browse recipes, Exquisite Corpse, the AI rewrite to a water-cycle chain: expect the intro rewritten, a template with arrows, the console's Finished chains list with Show during the reveal, the gallery after it, the report's chain section). **Owner's calls left open:** rename Exquisite Corpse ("Fold and Pass"?) since "corpse" on a middle-school projector; which of Estimation Station, Exquisite Corpse, Idea Chain, Story Builder, Quiz Show, Class Critique, and Choice Draft should be in the yard; the activity map's red X at the wrap-up (read as "left out"). A rate-each-chain brick (a rate step fed by `{{poem.responses}}` with a results reveal) is the natural next brick if the reviewer's "could really happen / pure nonsense" shape comes up again.

### Previous START HERE (2026-09-25: PR #84 `approve-vote` MERGED, master booted, proof green, deploying via CI)

**2026-09-25: the reviewer re-ran the Constitutional Convention and said the builder is better but the clauses are never shown and a vote picks one favorite. PR #84 `approve-vote` (MERGED 2026-09-25, owner: "merge") answers it: a yes-or-no vote (`vote.mode: "approve"`, every student says yes or no to every answer, the ones with more yes than no pass, `{{vote.approvedList}}` for the reveal), the storyboard's vote brick with `approve: true` building that vote plus a reveal of what passed, the chat and editing AI taught it, a validator warning on a vote nobody reads, the chat never showing raw JSON (1800 tokens and a salvage), steps named by number in the chat and on the proposal card, the hand-out visible in the plan and on the Question card, the projector's Close Voting label, the timer chip, the feedback corner.** CHANGELOG 2026-09-25 has every piece. Proof: `node scripts/simulate-approve-vote.js` (own server, eighteen checks). Probed with the real AI: the reviewer's exact idea comes back with an approve vote; the chat's "every clause with a majority should pass" edit turns the vote to approve, adds a reveal titled The Constitution, drops the crown; "30 students but 13 states" gets "some students will share the same state". **Next:** re-run the reviewer's idea on the live Create page after the deploy (expect: the plan shows the vote line "yes or no to every answer" and the added reveal; hosting shows the passed list as numbered cards). The dad joke default and the yard's cards were left as the owner called them. Then the older list below.

### Previous START HERE (2026-09-25 early: PRs #79, #80, #81, #82 ALL MERGED, master booted and both proofs green, deploying via CI)

**The owner's calls on what the reviews left open are MERGED (PR #82, owner: "merge it"):** no Save button (the editor always autosaves, a brand-new activity saves on its first edit); Try it out's projector shrinks the doorway card, code, and QR; the console's Before you project card carries a drawn two-window picture (shot headless, reads well); `POST /api/games/:id/sample-answers` writes a set once for a teacher's own activity (Haiku, saved on the copy, built-ins refused; probed against a fresh server); the joke row reads "Dad joke for the first students to join" and stays on by default. Owner said leave the yard's cards alone. After the merge, master was booted (home, editor, make, Try it out, console all answer; the sample-answers route refuses a built-in) and both proofs passed. **Next:** once Render deploys, re-run the reviewer's Constitutional Convention idea on the live Create page (expect: the matcher declines it to the builder, a hand-out step in the plan with the waiting room and crown shown, a clause on the results screen, never an id); then the older list: the owner's pass on the class examples, the teacher test, Render off the free tier before September 29, PR #64.

**2026-09-24, late: two outside reviewers walked the site (one built a Constitutional Convention through the storyboard, one ran Live Poll, Vocab Match, and an Exit Ticket through Try it out and a real room). Every bug they hit was traced to code and fixed in three stacked PRs, MERGED in order 2026-09-25: #79 `ready-made-trust`, #80 `storyboard-truth`, #81 `editor-small` (a rebase merge renumbers the chain's commits, so each stacked branch was rebased onto the new master with `git rebase --onto` before its turn).** Boot master and run the two new proofs: `node scripts/simulate-ready-made-trust.js` and `node scripts/simulate-secret-handout.js` (each spawns its own server, 11 and 13 checks). CHANGELOG 2026-09-24 has the three entries in full. What the chain does:

1. **#79 Ready-made trust:** a question edited on the make page reaches every step that quoted it (Live Poll's results screen showed the default; `swapWords` in make-print.js now walks every text field and the recipe stamp); a refreshed student screen rejoins its seat (`playerRoom` in sessionStorage beside the token, checked in headless Edge); Try it out's NEXT card reads the host's Continue after a self-scoring step and match submits count on the teacher channel; a dropped Close answers `close-ignored` and the host rejoins and retries once on `not-host`.
2. **#80 Storyboard truth:** a vote over answers stores `winnerText` (the reveal that printed a socket id), the chip and the AI's list use it, the validator warns, the compiler rewrites; **a private hand-out brick** (`collect` with `items`, dealt one per student, `{{thisStep.assigned}}` bound to the step id, a blank on the projector; assign marked PUBLIC; the matcher declines secret hand-outs to the builder; golden prompt `constitutional-convention`); the projector shows `…` for a per-student token instead of a note in our words; bold markers rendered or stripped on every remaining sink and a ballot never blank; the matcher is shown every recipe's and activity's step list with a legend and answers `missing`, shown on the card as "This version does not have: ..."; the ready-made list is featured only (Story Builder was offered); the chat card lists what the draft really changes (`shared/config-diff.js`); the plan dialog shows the added waiting room and crown; the model's notes stay backstage; the rewrite call gets 110 s.
3. **#81 Editor and small:** the Simple view wraps under the step stack with a 320px floor and a first visit under 1400px starts with Settings folded; Check for Problems lists the problems; one arrow on the back link; the join hint readable; an applied chat proposal autosaves.

**Owner's calls left from the reviews (not done, on purpose):** the Save button beside autosave; the join code and QR filling the practice screen's teacher panel; a two-window hosting picture; "Build it" near the top and a line under every card (against the yard's design); AI-written sample answers for a storyboard build (the generic bank shows "Pizza is the best food" on a civics activity); the early-bird joke default (it has an Off row in the editor's Settings and on the make page). **Next:** merge the chain, boot, run both proofs, then re-run the reviewer's Constitutional Convention idea on the live Create page (expect: noMatch from the matcher, a storyboard with collect + items, the plan showing the waiting room and crown, no id on the results screen). Still open from before: the owner's pass on the class examples, the teacher test, Render off the free tier before September 29, PR #64.

### Previous START HERE (2026-09-24, late night: PRs #75, #76, #77 MERGED, live via CI, 2478 tests)

**2026-09-24, night: Your class on the home, and every card in the teacher's subject. Three PRs merged in order after CI: #75 (the big one), #76 (editable poll answers), #77 (topic swaps, back links).** Master booted after each and probed (the home, the make route with a quiz example and a swap). CHANGELOG 2026-09-24 has every entry, the class-examples memory file has the mechanics. What is live:

1. **Your class chip** first on the left of the yard's sticky row (the four jobs pushed right), opening a paper panel with the grade band and ONE subject at a time (a tap replaces, a second tap clears). The picker moved out of make-it-yours.js into `screens/shared/class-picker.js` + `.css`; the "Something else" popup is styled there too.
2. **Authored class examples** (`screens/shared/class-examples.js`, owner's call: authored, never AI-written on the way to the home): every featured activity in six subjects at three bands (adult reads 9-12). The eight content cards redraw their words; Draw Gallery and Doodle Bluff draw authored drawings (`screens/shared/yard-doodles.js`, some sixty by name); the panel-owned five carry recipe params (54 checked quiz questions shared by Solo Quiz and Speed Quiz, the same facts as blanks for Trivia Bluff, three phrases for Doodle Bluff, four tasks for Group Work Day); the rope, Whose Eyes?, and Closer carry `swaps` that replace the topic everywhere in the copy (the intro, the second vote, Closer's first question) and drop the template's sample answers.
3. **The example follows the teacher**: the card's link carries `&ex=<subject>.<band>`; the popup's What happens map is built from the example (`ActivityMap.attach` posts the example's edits to the make route); the make page opens with the words in the question box, the labels, the pairs, the choices (now editable boxes for any pick-one step), or the recipe panel, with "Filled in for science, grades 6-8" and Use the original words under the print.
4. **Back to home from the make page lands on `/#yard`** (the back link and the wordmark).

**Owner has NOT yet said they read the table.** Ask before the teacher test. **Next:** (1) the owner's own pass on the live site: set a class, hover cards, open a quiz and the rope; (2) the teacher test the content cards were built for; (3) Vocab Match's example gives three pairs a round and the quizzes three questions (the templates have six and five): more per entry if a teacher notices; (4) the PostHog `profile_set` event is still only offered (an allowlist row and a privacy line). Still open from before: the Chromebook websocket check on a school network, the chaos suite against the starter five, Render off the free tier before the September 29 week, PR #64 (the `when` editor field) waiting on the owner. **Gotchas for the code:** `class-examples.js` holds real curly quotes (patch anchors must too); every repo file on this checkout is CRLF (a scratchpad exact-match patch script with EOL preserved did every edit); the Chrome extension was offline and `scripts/screenshot.js` with `SHOT_CLICK` on `.class-chip` and the picker's chips did the viewing; `gh pr merge` right after a push can refuse until the CI check lands.

### Previous START HERE (2026-09-24 night: PRs #70, #71, #72, #73 all MERGED, deploying via CI, 2461 tests)

**2026-09-24, one long day, four PRs merged in this order, each after CI went green: #70 the yard's content cards, #73 the 18d shelf, #71 Start here, #72 subject examples.** Master booted and checked after each merge (home, make page, the list's glimpses, the shelf module); the whole suite on master passes apart from the known Windows CRLF assertion. CHANGELOG 2026-09-24 has every entry. What is live once Render deploys:

1. **Eight content cards in the yard** (Live Poll, Draw Gallery, Snowball, Both Sides of the Rope, Whose Eyes?, Closer, Vocab Match, Someone's Got You): the activity's own words and drawings in the 17g window, text planks BLANK at rest and rolling out on hover (owner's call after seeing it), names (MAYA, JORDAN) saying whose idea is whose, never a caption of ours. Snowball asks "What is the most important idea from this unit?" over a fractions unit (owner: class norms read as once a year; the fold picture follows). Vocab Match is literary terms, not French. **Owner's rule, keep it:** show with names and the activity's own words, never explain with a sentence; if a card's mechanic is "someone's words reach you" or "two ideas become one", names on the slips and visible containment do the work.
2. **My yard 18d**: a teacher's own copies print on a sanded mat with a kicker (the template's name or MADE WITH AI), the copy's topic as a word block on the template's pictogram (in place, under, or in the window's bottom corner on a content card), a custom game's initials over the pile, five tools under the name row with share among them, and a changed copy's own question as its hover line. A copy of Whose Eyes? once threw and hid the whole yard (a mangled regex escape); the "build a card for every user row" eval in the session memory catches that class of bug, run it before handing any shelf change over.
3. **Start here**, a first-time-browser card under the how strip (owner's condition on merging): shown only when there is no host key, no copy, no heart, no recent, and the door was never pressed; the red Try Live Poll door lands on the make page with `from=start`, where a yellow line says to press Try it with pretend students; `start` is an analytics entry point.
4. **Subject examples**: One More Thing's sample answers are the causes of World War I beside Exit Ticket's photosynthesis; a multi-field collect's card asks its questions (Exit Ticket no longer shows "Answer in a sentence or two.").

**Next:** (1) the teacher test the cards were built for: show a teacher the yard and ask "what do students do in each of these?"; if the eight hold, the other eight get the same treatment (`HOVER_LINES` in `yard-pictograms.js` grows with them); (2) check the live site after the deploy: the yard, the shelf with a real copy, the Start here card in a fresh browser and its absence in a used one; (3) the PostHog `profile_set` event is still only offered. Still open from before: the Chromebook websocket check on a school network, the chaos suite against the starter five, Render off the free tier before the September 29 week, PR #64 (the `when` editor field) waiting on the owner.

### Previous START HERE (2026-09-24 morning and afternoon, the same day's earlier blocks)


**2026-09-24, evening: PR #70 (the eight content cards, four passes) MERGED on the owner's "I think this looks good"; 18d (My yard) built on branch `my-yard-18d`, PR open for review; #71 (Start here) and #72 (subject examples) still open, viewed and liked, not yet called merged.** 18d: own copies print on a sanded mat with the template's name over their own, the copy's topic as a word block on the pictogram (under it, or in the window's corner on a content card), a custom game's initials over the pile, five tools under the name row with share among them. CHANGELOG 2026-09-24 has the detail. **Ask the owner:** merge #71 and #72 too? The three-plus-18d local branch `view-all` runs on :3000.

**2026-09-24, morning: three PRs from the reviewer's notes merged in order (#66, #67, #68), master booted and checked (the projector, the console, and the student script all serve the merged code), the local test branch deleted.** What shipped: (1) **the Create page carries the idea** (`engine/idea-settings.js` reads "anonymous" off the idea, `engine/match-refit.js` refits a recipe-born built-in pick to its recipe, the matcher's ready-made list tags recipe-born built-ins, choices are the teacher's own, the "already exists" card says the idea is not copied in); (2) **five rehearsal nits** (the classmate line counts heads, the early joke folds on the next step, the console's Live entries hint by audience, "Check for problems", Try it out seats from the shape); (3) **projection, privacy, saving** (the console's Before you project card once per browser, the report rule everywhere, the make page keep note, the guide's setups; the projector lobby inside Try it out drops its checklist and share row, zoom 0.54 to 0.79 in the frame). CHANGELOG 2026-09-23 has the detail. **Owner's calls this session:** skip plain-language descriptions on the cards (the three layers we have are right; the still should carry the mechanic without words); PostHog subjects are NOT collected (the profile is localStorage only) and a `profile_set` event is offered, not asked for yet.

**2026-09-24, later: subject examples are on branch `subject-examples`, PR open FOR VIEWING (off master, independent of the other two).** One More Thing's sample answers are a history lesson (the causes of World War I) beside Exit Ticket's photosynthesis; the glimpse reads a multi-field collect's labels, so Exit Ticket's card asks its two questions instead of showing "Answer in a sentence or two." CHANGELOG 2026-09-24 has the detail. Not moved: Live Poll's feelings check, Snowball's norms, the homework debate on Both Sides and Whose Eyes? (the owner's content; say the word and any of them gets a subject default). **All three agreed items are now on branches: #70 thumbnails, #71 Start here, and this one.** The PostHog `profile_set` event is still only offered.
**2026-09-24, later: the Start here route is on branch `start-here`, PR open FOR VIEWING (off master, independent of the thumbnail branch).** One recommended first run on the home: a card under the how strip with the page's one red door, Try Live Poll, to the make page with `from=start`, where a yellow line says to press Try it with pretend students; "or browse the yard" keeps browsing open; `start` is an analytics entry point. CHANGELOG 2026-09-24 has the detail. Open call for the owner: Live Poll or Exit Ticket as the first run (Live Poll chosen: the projector visibly moves in the first minute). Then (3) subject examples, below.
**2026-09-24, later: the thumbnail experiment is on branch `thumb-content`, PR open FOR VIEWING.** Six cards in the yard carry a little of the activity's own content at rest: the three agreed (Live Poll's labelled bars, Snowball's two answers funnelling into one, Draw Gallery's drawings on the wall) plus the three the owner's note named as the most ambiguous (Whose Eyes?, Both Sides of the Rope, Closer). Words are the activity's own only, never a caption of ours; the hover line is dropped where the picture already asks the question. CHANGELOG 2026-09-24 has the detail. Second pass on the owner's look ("I think this is great"): Snowball is any week (a fractions unit, not class norms; the fold picture follows), Vocab Match is literary terms (not French) and the seventh content card, Draw Gallery's wall is two by two, "We agree" is a stamp, Both Sides lands its second vote; third pass: names (Maya, Jordan) mark whose idea is whose on Snowball, and Someone's Got You is the eighth content card (a note, a reply, the classmate's name lands); fourth pass: six cards' text planks are BLANK at rest and the words roll out on hover (`fill: true` on a slip), the owner's "I want to see what this would look like", not yet a call. **Ask a teacher "what do students do in each of these?" over the eight before touching the other eight.** If the pattern holds, the other ten get the same treatment (Exit Ticket, Speed Quiz, Solo Quiz, Someone's Got You, Vocab Match, One More Thing, Doodle Bluff, Trivia Bluff, Group Work Day, Rose Bud Thorn) and `HOVER_LINES` grows with them. Then (2) the Start here route and (3) subject examples, below.

**Next, in the order the owner agreed to ("lets go"):** (1) **the three-thumbnail experiment**: redo Live Poll (four labelled bars growing), Snowball (two short readable answers sliding into one), and Draw Gallery (a few student-style drawings landing on the wall) in the 17g window with a little real content, on a branch FOR VIEWING, then the owner shows a teacher and asks "what do students do in each of these" before the other thirteen; (2) **a Start here route** on the home: one recommended first rehearsal (Exit Ticket or Live Poll, two minutes), browsing still open; (3) **subject examples** in glimpses and sample answers (a history question, a vocabulary check) so the site reads as more than icebreakers. Still open from before: the Chromebook websocket check on a school network, the chaos suite against the starter five, Render off the free tier before the September 29 week, PR #64 (the `when` editor field) waiting on the owner. **Not watched in a browser:** the joke fold, the seat count, and the console card were guarded by string tests and one headless shot of the bench lobby.

### Previous START HERE (2026-09-21: PRs #57, #58, #59 merged and live, 2360 tests)

**2026-09-21, evening: the home's positioning pass, branch `home-whole-class`, PR open FOR VIEWING (owner: "I'd like to see all of these on a branch before we do anything").** Five things on it, from a reviewer's note plus the owner's ask: an identity line over the question ("Get the whole class in on it." then "Quick activities that get every student participating. No student accounts, nothing to install.", the question now an h2 over the planks), the plank ways always visible, a row of moment chips under the yard head (curated ids per moment in the page script), and `when` on every featured built-in (the classroom moment it is for; the hover card shows it, the popup keeps the description, the search reads it). CHANGELOG has the detail and the not-done list (no editor field for `when`; Rose, Bud, Thorn is a live database row with no line; moments curated by hand). Nothing merges until the owner has looked; if they want only some of the five, split the branch.

**2026-09-21, later: the owner's calls on the pilot list, and two small items closed.** The owner has texted and emailed the first eleven friends. Decided, do not re-raise: **anonymous mode stays opt-in** (not the default for new rooms); **no support phone number** anywhere (the console, the email); the Project Zero email is the owner's to send or not (COMPARATIVE-ADVANTAGE § 4 says why it was on the list: the built-ins ship no Project Zero words or names, so it is a courtesy, not a gate). Closed: the golden-prompt eval's matcher leg ran live over the six new bricks (23 of 25, both misses the known baseline pair; storyboard 14 of 14), and the `elimination-tournament` duplicate (a games/user/ file beside its database row; the file also shadowed the row on load and re-migrated over it on every restart; `builtInOnly` in game-loader, insert-if-absent migration; local only, never live). **Still open:** the Chromebook websocket check on a school network, the chaos suite against the starter five, Render off the free tier before the September 29 week, and the older items below.

**2026-09-21, morning: everything below is merged and live.** #57 (repairs) and #58 (six bricks, the console answer box, the drawing vote with a crown, the browser proof, the two wording fixes) merged in order with merge commits, master booted and simmed, both branches deleted. Then the owner tried "everyone draws a picture of me and we vote on the best" on the live site and got a TEXT box: the Create page runs the recipe matcher first, every recipe's answer box is typed, and the idea matched Creative Vote or Draw Gallery instead of falling to the storyboard. **#59 MERGED**: a DRAWING IDEAS rule in the matcher prompt (no recipe ever fits a drawing idea; a plain wall is Draw Gallery, the caption game is Doodle Bluff; drawing + vote/favorite/captions/rank is noMatch so the step builder makes draw then vote); live 3 of 3 each way before merge. **Rule learned:** a new brick that changes what the storyboard can do needs a matching matcher-prompt line, or the matcher steals the idea for a lookalike recipe. Verified on the deployed site: the owner's exact wording posted to the live Create route answered noMatch ("every recipe's answer box is a text box..."), so the page goes on to the step builder. **Open:** (1) the owner has not yet re-tried the portrait idea themselves on the live site (the storyboard half was proven locally, draw then vote with a drawing pad); (2) `elimination-tournament` twice in the games list, the Chromebook websocket check, and the other items from 2026-09-20 below still stand; (3) `scripts/eval-designer-prompts.js` needs `AI_CALLS_PER_MINUTE=200` in front of it now (24 prompts); the matcher leg's two misses (vocab riddles to Creative Vote, a one-run wobble on the stress scale) predate this work.

### Previous START HERE (2026-09-20 night: PR #57 and the stacked bricks PR open, 2328 tests)

**2026-09-20, night: the storyboard probe and its whole repair list, two PRs open.** The owner asked for data, not building: 27 teacher-typed challenges through the live storyboard (3 runs each, Sonnet 5 low) and the matcher; 63 of 81 built and all compiled clean, 4 of 81 JSON parse errors, every decline honest; report with the ranked list in `docs/research/storyboard-probe-2026-09-20.md`. Then "do it in order": **PR #57** (branch `storyboard-repairs`) carries the two repairs (`closeUnbalancedJson` rung in `_parseStoryboard`; a recipe id in the matcher's game slot is a recipe pick). **Branch `storyboard-bricks`** (stacked on #57, its PR against master) carries six bricks or fields, each with a golden prompt and a live 3-of-3 on its probe idea: **pairs** (partner exchanges in rounds, `sides` dealt, `{{X.partner}}` / `{{X.side}}` / `{{X.partnerSide}}` in the engine, proof `scripts/simulate-debate-pairs.js` 18 checks), **video** on announce / collect / collect-choice, **roles** (team-roles + a checklist over the last teams or pairs step, never rank + assign for jobs), **estimate answer** (+ unit + scoring; no answer = a poll and no promised winner), **draw** (drawing collect, teacher preview gate, gallery; a favorite is a show of hands, a vote over drawings is refused), **summarize** (ai-process over the last collect + the reveal, the heading never names the AI). Four of the six needed a second prompt rule after the first live run; CHANGELOG has each. Merge order: #57 first, then the bricks PR (it shows only its own commits once #57 is in; never delete `storyboard-repairs` before the bricks PR merges, a stacked PR closes with its base). **Open:** (1) DONE late the same night: the console's "The answer" box on an open Guess the Number step (`estimate-set-answer`, proof `scripts/simulate-estimate-answer.js`); (2) DONE the same night: the vote over drawings (thumbnails on the ballot, the winning drawing under the crown, `scripts/simulate-drawing-vote.js`) and a crown after every storyboard vote over the class's work; classmate captions over drawings stay Doodle Bluff's recipe; (3) DONE the same night: all three seen in a headless Edge (projector + one real student page + bots), one projector fix came out of it (pair tokens read as notes on the projector, `tests/engine/host-prompt-notes.test.js`); both nits fixed the same night (the partner's piece rides beside the prompt as `partnerText` and shows on a paper card; the role screens say "Tap the role you want" and "Confirm roles", five languages); (4) `scripts/eval-designer-prompts.js` has not been run over the six new golden entries live (the matcher leg; the storyboard leg ran per idea); (5) the probe harness lives in the session scratchpad (`run-challenges.mjs`, `challenges.json`), rebuild from the report if needed.

### Previous START HERE (2026-09-20: PRs #54 and #55 merged and live, 2258 tests)

**2026-09-20: two snappiness passes, PRs #54 and #55, both MERGED and LIVE (2258 tests).** The owner asked how much snappier a different AI model would make Jamyard; measured first (every real prompt through AIService against Haiku 4.5, Sonnet 5 at medium / low / no thinking, Opus 5 low, fast mode): **no model swap helps** (the Haiku paths sit at 1 to 2.5 s, the writers are bounded by output length, Opus 5 on the storyboard built the pair-students lookalikes the prompt forbids where Sonnet honestly declined, fast mode is off for the org, Gemini 3.8 Flash was not benchmarked and its public time-to-first-token is worse). CLAUDE.md now says not to re-run that question without new evidence. **#54** (branch `snappier-ai`): the storyboard call at effort low (the 29 s thinking outlier gone), **the storyboard streams** (`POST /api/games/storyboard/stream`, server-sent events thinking / name / step / done; `AIService._streamClaude` + `_prepareParams` the chokepoint; `engine/storyboard-partial.js`; `screens/shared/sse-reader.js`; the Create page's plan dialog shows steps landing), the revise and recipe-match system prompts cached (`cache: true`; cost only, no speed change, measured). **#55** (branch `snappy-pass`), measured on the live site over CDP cold/warm/school-wifi plus socket round trips: `GET /api/games?mine=<own ids>` (the list carried every teacher's activity to every page load, 96 of 143 rows; 92 KB became 36 KB live; `ids` rides back for the copy-id dedupe; no `mine` = everything for /library), the class pages load `socket.io.min.js` and connect websocket first with polling as the fallback plus a revert to polling-first on the first connect error (create-room and join went from 80 to 210 ms to about 32 live; zero polling requests on the projector and student pages now), the two fonts preloaded on every page and cached a year. Live after deploy: home cold load 0.90 s to 0.27 s, Create 0.63 to 0.42, make 0.54 to 0.32. **Open:** (1) the one check no measurement replaces: a real student joining from a Chromebook on a school network (a network that silently drops websockets costs one 20 s connect timeout, then polling from then on); (2) `elimination-tournament` appears twice in the games list (a filesystem user game and its migrated database row, open since August); (3) a teacher with more than 200 copies would lose the oldest from their yard (the id list rides in the URL); (4) every activity id on the server is still visible to any visitor through `ids` (less than before, when names and descriptions were); (5) not done on purpose: bundling the per-page scripts (25 to 39 requests a page, no build step is the rule), a cache on the built-in card list (30 to 45 ms), the analytics calls on load (async); (6) Opus 5 for the storyboard, a second AI vendor, and folding Ask AI's triage into the revise were all considered and rejected with numbers (CHANGELOG 2026-09-20). The measurement harnesses (page timing over CDP, socket round trips, the model bench) lived in the session scratchpad, not the repo; rebuild from the CHANGELOG description if needed. Gotchas: three page files are CRLF so a multi-line replace in a node script misses silently (use the Edit tool); a user row can be featured by its saved config, not only by an override; `pretend: true` on create-room keeps a measurement room out of the pilot count; the Chrome extension was not connected, `scripts/screenshot.js` with `SHOT_EVAL="(showStoryboardFlow('...'), true)"` drives the plan dialog on /designer.

**2026-09-18, evening: the pilot (owner: "I need 50 users by october 5th"), branch `rooms-log`.** A user is a teacher who hosts a room real students join; the count is distinct host browsers with a class room of three or more students. Built: `services/room-log.js` (one row per real room: activity, code, class or pretend, headcount, step of steps, open / ended / closed, minutes, the host page's random `jamyard.hostKey`), the owner-only **/rooms** page with THE number on top and the last 50 rooms, `kind` on every room analytics event plus `room_abandoned` (where a room stalled), and the console's end-of-activity "Know a teacher who would like this?" card whose Copy the link carries `utm_source=colleague`. **Open:** (1) the closed status and `room_abandoned` were not seen live (five-minute host grace); (2) the pilot plan itself: warm channels first (own building, coaches, texted friends), cold reach to top up, a short Terms of Service page, Render off the free tier before the cold wave, the Project Zero email; (3) the rooms log has no per-teacher view yet (rows share a key prefix, that is all); (4) a count start other than the pilot start is a query param on the API, not a setting.

**2026-09-18: Choice Draft merged (PR #45, d3bc8db, not featured), and the LinkedIn cut reworked from the owner's and a reviewer's notes, UNCOMMITTED with the rig.** Choice Draft: who chooses is three ways (Groups of a size / The groups we already have = a count with open caps and its own Students choose / I arrange them row / Each student); the built-in is hidden until the owner flips ★ on the live site; the recipe still matches on the Create page. The feed cut (`jamyard-30s-square.mp4` in ~/Videos, same file name): opens on "Connect, think, review, or just have fun." (its own `intro` copy in cut.json, the closing card unchanged), the caption boxes sit ABOVE the footage (square footage at y=300 in both `FORMATS` and the ground overlay), every shot got about a beat and a half (36.4s), and the code shot starts a second earlier (`square.offset: -3.2`) so the Three rounds announce no longer flashes before Connect. The wide cut is untouched (30s, captions at the bottom). **Open:** (1) the owner has the new feed cut to watch; (2) the wide cut could take the same pace and top captions if the owner wants both alike; (3) the reviewer's "too much text per frame" may still want the job captions trimmed to one word each; (4) commit the rig (`scripts/video/`) when the owner says so. Gotcha: overlay PNGs are cached by their text, not their CSS, so delete `overlays/square-caption-*.png` and `square-ground-*.png` in the take dir after a layout change; after lengthening a shot, sheet the frames for a page change inside the footage.

**2026-09-16, night: collective choices, branch `choice-draft`, PR open.** Owner: students in teams rank four categories and each group is assigned one; the Create page could not build it. Built: `rank` with `teamsFrom` (rank as groups, the group order is the members' average), a new compute step `assign` (Hand out choices: first choices first, spots spread evenly, `perChoice` caps a spot, `{{X.mine}}` = your group's item), the storyboard `assign` brick + rank `byGroup`, and the **Choice Draft** recipe + recipe-born built-in with the owner's four categories as defaults (choices one box each, the question, who chooses, group size, how groups form). Robot playtest and chaos suite clean; the projector card and the student card have NOT been seen in a real browser yet (they reuse the team-split section). **Open:** (1) the owner tries Choice Draft on the make page and a real projector; the hand-out card is three lines on the team card, may want its own look; (2) the matcher has not been run live against the owner's prompt (`scripts/eval-designer-prompts.js` on the two new golden entries); (3) the rank step's own "Waiting for others to rank..." lines are still untranslated (pre-existing); (4) `perChoice` below what the class needs overflows silently past the cap (by design, logged), the make page has no knob for it yet; (5) 2026-09-17: who chooses is three ways (groups of a size / the groups we already have, a count with open caps / each student).

**2026-09-16, fourth pass: advert v4 (reveal opener, per-format plans with a shorter feed cut, caption on frame one, push-in, homepage ending points at the yard). Same two files in Videos. Owner on 2026-09-16: "This looks good but I don't want it live on the website yet." So: NOT on the site, no homepage link, nothing uploaded; the files stay in the owner's Videos folder until they say otherwise. Commit of the rig still pending too.** **2026-09-16, third pass: advert v3 (owner's wording: no install, no free, "No subscription", "from their devices"; reviewer round two: tight crops, gallery grid, captions all at the bottom). Same two files in Videos.** **2026-09-16, later: advert v2 after a reviewer's notes (bigger opener, "Live classroom activities. Everyone joins in.", two-line job captions on outcomes, three-beat setup, QR hidden, per-format end cards; CHANGELOG). Same two files in Videos, overwritten.** **2026-09-16, late night: the 30-second advert, v1 then v2 delivered, UNCOMMITTED.** Two renders from one take are in the owner's Videos folder: `jamyard-30s-wide.mp4` (1920x1080, the homepage link) and `jamyard-30s-square.mp4` (1080x1080, the LinkedIn feed), 30.2s, no narrator (captions carry it, the owner's call), "Sunrise From a Moonbeam" under at -15 LUFS with every cut on the beat. Rig: `scripts/video/ad/` (README there; record.js plays four real rooms on its own :3005 server, assemble.js cuts both formats; CHANGELOG entry the same night). **Next:** (1) the owner watches both; likely asks are caption wording, the hook shot (the answer pile; the encouragement wall landing line by line is recorded too, mark `wall`), and whether the QR on the Live Poll doorway should be hidden for the take; (2) a narrator is one switch away if wanted (Fish Audio key in .env, add a beat list like the old `script.json`); (3) upload unlisted and set the homepage link / GUIDE_VIDEO_ID; (4) commit the rig with the old `scripts/video/` one when the owner is happy (both untracked).

**2026-09-16, night: PR #43 merged (make page, four owner rounds).** The three doors share one line as a GRID (`auto auto minmax(0,1fr)`; the note and the error span the row beneath; a flex-nowrap first cut pulled the note into the row as a fourth item), the answer note is exactly "Host it or try it, and the wording gets fitted to your class." (the owner's words; "Either door" drew "what door?"), See how it reads sits right under the question's own box with "Rewords the screen above and What happens below for your class" (never "AI fit"). The lesson is a Standing Rule in CLAUDE.md: teacher-facing helper copy names what is on the screen, never our words for it.

**2026-09-16, later: three more PRs, all merged and live.** **#41** (owner's two asks): the home's Activities head carries "ready to be made to fit your class" on the same line in smaller type (a first cut repeated "Activities" on a second line; owner: redundant); the make page's big red door is HOST IT NOW (sub "Your class joins with a code") and the paper door beside it is "Try it with pretend students" (ids kept, `#host-btn` big and `#try-btn` side, so `go('host')` still starts HostLaunch inside the click; classes renamed `.big-*` / `.side-btn`). **#42** (owner: "increased backlash against AI, remind them as little as possible", a new Standing Rule in CLAUDE.md): an audit found every student and projector mention (the twin wait-screen tables, never translated; "AI is processing..."; "Let the AI work"; the answer-box footer; "[AI Error]" and "[MOCK AI]" in reveal text; Dream Vacation and Feedback Academy lines). All reworded (the wait screen names the work, six new rows per language table, `UiLang.t` on both screens, "Put it together", "These get summed up for the class.", a plain failure line with the detail on `error`, "(Mock)"); Human vs AI and Mad Lib Mashup KEEP their wording (owner's call), teacher surfaces keep theirs. The writing filter is two layers and no second model pass: `STYLE_RULES` (every call) carries the owner's list of tells and a banned-word list; `RichText.scrub` runs inside `parse` on the reveal path (dashes to commas, digit ranges kept, announcing and summarizing openers dropped), never in `applyInline` (prompts and the Along bank show as written). Guard: `tests/screens/no-ai-mention.test.js`. **Open from these:** (1) the owner has not seen the wait screen or a scrubbed reveal in a real room; if a reveal still reads like a press release, tune `STYLE_RULES` from real output, not the scrub; (2) the scrub's filler list is short on purpose, grow it from what lands on the wall; (3) the big red door now hosts the ORIGINAL when nothing was edited (no copy saved), which was always Host it now's behaviour, only louder now; (4) the teacher console still says "AI is working…" (teacher-only, fine).

**2026-09-14 evening and 2026-09-16 in one paragraph.** Five PRs, all merged to master and deployed. **#35** (branch `gwd-make-rows`, owner: "the bar doesn't need to take up the whole width, it could also be multiple choice; it's easy to mistake a job with a task"): every setup knob on the make page is ONE row of chips (`.knob-*` in `make-it-yours.css`); two new knob kinds, `tags` (names as chips, "Type your own…") and `list` (one growing box per item with an × and a picker from a `tagFrom` knob, wire format `Name: text`), plus `valueLabels` and `setup: {showWhen}` on scalars; Group Work Day is the model (a jobs switch, suggested jobs, one box per task with a job picker). **#36** (branch `late-seating`, owner: "can the system add people as they enter?"): a FRESH join that lands in an open team-split / team-roles / checklist step goes through the handler's `onLateJoin` and gets a seat before its first screen (rolling start was the wrong tool; `engine/phases/late-seating.js`, `scripts/simulate-late-seating.js` 19 checks, the console gets a one-line `teacher-late-seat`). **#37**: the To connect plank's third way reads "Discuss" (owner's wording). **#38** (owner: "make the different categories more visually distinct"): a print's paint is its job, magenta / cyan / green / orange, and the job chips over the yard wear the same swatch so the row is the legend. **#39** (2026-09-16, owner: "is there a way that the Pick this one button is always visible regardless of the size of your browser tab?"): the yard popup's door row is `position: sticky` at the popup's bottom, on its own paper with a faint top shadow; the What happens map scrolls under Pick this one (and under Edit / Try it out / Host this in the My yard popup). **Open:** (1) the popup's sticky strip takes about a third of the popup on a very short window; if the map reads cramped on a real screen, drop the subline under the button ("Change the question first, or try it with pretend students.") for ~30px back; (2) the list knob's growing boxes measure before the web font lands (refit on `document.fonts.ready` is done for them; the make page's fit-plank may have the same latent issue); (3) late seating covers team-split, team-roles, and checklist only, a new roster-bound handler adds its own `onLateJoin`; pair-born groups get no seat by design; (4) the PostHog items below (bot guard on the relay; the owner confirming a `$pageview` shows a country with no `$ip`) still stand; (5) the older home items (owner view absent on the home, search does not filter the carousel, dead shelf rules in `screens/library/styles.css`) still stand. Gotchas from these days, all in the memory notes: an env prefix on `node -e` is lost in this shell, a heredoc into a file picks up CRs and the home html IS CRLF (match the file's own line endings, or use the Write tool), and a CDP click that navigates kills the pending evaluate.

### Previous START HERE (2026-09-14 early: PostHog PRs #29, #30, #32, #33 merged and live, 2013 tests)

**The night of 2026-09-13, analytics, four PRs, all merged and live** (owner: "I want to set up posthog. I need to be careful because I will have minors using the site"). The design is in CLAUDE.md's Standing Rules and CHANGELOG entries of the date: **#29** PostHog behind our own relay (`services/analytics.js` allowlist, `POST /api/track`, `screens/shared/analytics.js` on teacher pages only, nothing on `/player` `/host` `/teacher`, server events per room under a random id, no person profiles); **#30** where a teacher came from (referrer host, `utm_*` tags, country and region from the requester's address, PostHog's "Discard client IP data" is load-bearing and the owner turned it on); **#32** session replay on the six authoring pages only (`screens/shared/replay.js`, the ONE vendor script, inputs and teacher text masked, iframes blocked, `POSTHOG_REPLAY=0` kill switch; the owner turned on "Record user sessions" and set the shortest retention); **#33** the relay speaks PostHog's dialect (`$pageview` / `$pageleave` / `$session_id`, the owner saw zero active users until then; the recorder shares the visit id). Verified live from headless Edge: a real recorded visit shipped snapshots, the SDK's session id equals the relay's visit id. `docs/COMPLIANCE-TODO.md` § 1b holds the PostHog project checklist. **Open:** (1) a bot guard on the relay, offered and not built: skip the browser module when `navigator.webdriver` is set, and drop `/api/track` posts whose user agent is on PostHog's crawler list (today a headless browser that runs the page's JS counts as a teacher; crawlers don't run JS, so it is a small hole); (2) the owner has not yet confirmed in the PostHog UI that a `$pageview` shows a country with no `$ip`, nor opened the test recording; (3) the earlier open items below (owner view on the home, search vs carousel, dead shelf CSS) still stand. Gotchas learned: posthog-js drops everything under `navigator.webdriver` OR Do Not Track, and headless Edge has both (spoof them in CDP checks); deleting a stacked PR's base branch closes the stacked PR.

### Previous START HERE (2026-09-13 evening: PRs #18 to #23 merged and live, 1948 tests)

**The evening of 2026-09-13, four more PRs, all merged (#20 to #23), the owner tried each on a real screen.** #20: the projector's JAM YARD mark links home (asks first with a room open), its sound and full screen chips are the bench's ♪ and ⛶ at 26px, the teacher view has "‹ The yard", and the live user activity is "Guess Who: Rose, Bud, Thorn" without emojis (edited on jamyard.org through the API). Measured impossible and recorded in CLAUDE.md: Host keeping the pressed tab as the projector with the console opening BEHIND it (Chromium turns a synthetic ctrl-click into a foreground tab and refuses opener focus). #21: the My yard shelf draws the grid's prints, each with tiny tools on the paper (play hosts, pen edits or makes it yours, heart, bin where delete is allowed); two owner rounds fixed the hover card landing on the tools and a button's content-width print overlapping the shelf. #22, **one yard**: the home page IS the yard (`screens/shared/my-yard.js` shelf above "The yard" with a search beside the chips, deep links `?about` / `?highlight` / `?q` on the home), `/library` is the owner's curation console only (via `/owner`) and redirects everything else to `/#yard`, every way-back link is `/#yard`; the owner's first try fixed the search rescue calling a shelf hit nothing, the anchor landing at the top of the page (the section is hidden until the list loads: `settleHash`), and MY YARD reading as a label for what came next (a heading above the prints now). #23: the make page's designer link reads "Customize it more in the designer" (the owner's wording, the one "Customize" in teacher copy). **Open from the evening:** owner view has no presence on the home (curation lives on /library); the search does not filter the carousel; `screens/library/styles.css` still carries dead shelf and popup rules; the old yard page's "New here?" strip is gone with no replacement (the fold does that job); `tests/screens/make-fit-rows.test.js` has one assertion that fails on Windows checkouts only (CRLF vs a `
` literal), CI passes.

### Previous START HERE (2026-09-13 midday: PRs #18 and #19 merged and live, 1936 tests)

**2026-09-13 in one paragraph.** PR #18 (home feedback): the red door says PICK THIS ONE, plank hover shows the ways, five nits. PR #19 (the make page, four design tries on a canvas, https://claude.ai/code/artifact/25f054d7-99dc-451c-bf40-c5121360dfe7): the More fold became **Make it fit your class**, rows of chips under the doors (the AI asks one question, two at most, choice or text; class, names, joke as rows); the reword keeps only the words the teacher CHANGED; **See how it reads** runs the fit once and redraws the print AND What happens, the doors reuse the copy; a quiz's panel sits right under the doors; **The pairs** panel with **+ round** for matching activities (under the fit rows); the yard's door says Pick this one too; the designer link reads "Make it even more yours in the designer". Owner: "good enough right now to merge, it's definitely an improvement", with follow-ups open.

**Later still, 2026-09-13 (branch `one-yard`, CHANGELOG "The home page is the yard"):** PR #21 (shelf prints + tools) merged; then the owner: "maybe the homepage becomes the yard and there's just one place to view the activities". Done: the shelf is `screens/shared/my-yard.js` on the home under the carousel, the grid is "The yard" with a search beside the chips, deep links (`?about`, `?highlight`, `?q`) answered on the home, `/library` redirects to `/#yard` except the owner doorway (`/owner`, the curation console), every way-back link is `/#yard`. OPEN after this: the owner has not seen it on a real screen; the home's "New here?" strip never existed (the old yard page had one, dropped with the teacher view; the fold's headline does that job); the search does not filter the carousel; owner mode is invisible on the home (owner curation lives on /library only).

**Late 2026-09-13 (branch `host-corner-and-tabs`, CHANGELOG entry of the same date):** the projector's JAM YARD mark links home (asks first with a room open), its sound and full screen chips are the bench's ♪ and ⛶ at 26px and 55%, the teacher view's header has "‹ The yard", and the live user activity is now "Guess Who: Rose, Bud, Thorn" with the emojis and em dashes gone (edited on jamyard.org through the API, not in the repo). NOT done: the owner wanted Host to keep the pressed tab as the projector and open the console behind it without focus; measured impossible from a page in Chromium (details in the CHANGELOG and the Host rule in CLAUDE.md), the live arrangement stays. **Then, same evening (PR #20 merged; branch `yard-shelf-prints`):** the My yard shelf draws the grid's prints (owner: "go with the prints and have one visual"); the mini planks are gone from the yard; each shelf print carries tiny tools under it (play hosts, pen edits or makes it yours, heart, bin where delete is allowed). Also: `tests/screens/make-fit-rows.test.js` has one assertion that fails on a Windows checkout only (a `\n` literal against a CRLF file); CI on Linux passes.

**Open after PR #19 (owner: "a few things we can continue working on"):**
- The AI's question quality varies run to run (an early run asked "Target number"; Vocab Match still says "round 1" in a question). Watch real runs; tighten the prompt with examples if a bad one recurs.
- The question at the top only shows it took hold when a door or See how it reads is pressed; a small "your question is in" line under the print when it differs from the original would close that.
- Live Poll asked for the answer choices while the print shows them read-only; the fit handles it, but the choices could be editable on the print like the pairs are.
- The pairs panel does not remove a template round (only rounds the teacher added have a drop x).
- Timing claims for a fitted copy are not re-estimated; a copy with added rounds runs longer than the yard says.

### Previous START HERE (updated 2026-09-12 night: six PRs merged and live, #12 to #17, 1917 tests)

**2026-09-12, night: the day in one paragraph.** All on master and deployed to jamyard.org, each verified headless over CDP before merge (the Chrome extension was off; `scripts/screenshot.js` and throwaway CDP drivers in the session scratchpad did the driving; the GOTCHA is that heredocs into `node -` eat backslashes, so multi-line or regex edits go through the Edit/Write tools). PR #12: four review defects (told reword failure on the make page, no raw `{{X.assigned}}`, draw notice clears, field cap). PR #13: the six small review items (`--t-red-text`, phone-width projector mock, sticky host and student action buttons, doors hint under Launch, design.css stripped of the paste-up system, feedback select painted, em dashes out of server.js with the style test widened to it). PR #14: Play Again inside Try it out resets and relaunches the bench. PR #15: every Make it yours lands on `/make` (the Create page was the holdout; an own copy saves back to itself with PUT). PR #16: Host opens the projector in a NEW tab in front and the teacher console in the pressed tab, signed in (`shared/host-launch.js`, nonce pairing through localStorage + BroadcastChannel; the first cut put the console in front and the owner said no). PR #17: an estimate step with a known range is a row of numbers to tap or a slider, the range read from "on a scale of 1 to 10" when the step has none (`engine/phases/estimate-range.js`); the storyboard's estimate brick carries min/max. NEXT, in this order: (1) the owner's own eyes on the two-tab Host flow from the yard and from Create on the live site, and on the scale picker in Guess the Class (the "predict the class average" step stays typed until its question says "from 1 to 10"); (2) the sticky Start button over a long lobby and the student Submit over a drawing pad on a short Chromebook, still not seen on a real screen; (3) the quiz and bluff panels' own `makeCopy` still spawns a copy for an own activity on the make page; (4) the review's two adoption blockers are unchanged, browser-only saved work (no owner model) and the missing district terms (docs/COMPLIANCE-TODO.md).

**2026-09-12, evening: the six small items from the review, branch `review-open-items-2026-09-12`, 1885 tests (CHANGELOG 2026-09-12 "the six small items").** Shipped: `--t-red-text` for small red text (errors, links; buttons keep the action red), the home's projector mock stacked and resized under 600px plus `overflow-x: clip`, sticky Start/Reveal/Continue on the host and sticky Submit on the student screen, the doors' one-line hint under Launch, design.css stripped to focus ring + mic + two legacy text tokens (six dead font files removed), the feedback select painted, server.js em dashes out with the style test widened to it. Worth a real-screen look: the sticky host button over a long lobby (does it cover the last roster plank?), the student Submit riding the bottom edge over a drawing pad on a short Chromebook, and the doors hint's line length in the yard's dialog. Left alone on purpose: the designer's electric blue (the editor's live accent, not a leftover).

**2026-09-12, later: outside review (three AI agents) triaged, four fixes on branch `review-fixes-2026-09-12`, MERGED as PR #12 (6bf1b9b), 1877 tests (CHANGELOG 2026-09-12 "outside review").** Fixed: the Make page's silent AI-reword fallback (now told, with "Use it as written"), raw `{{X.assigned}}` reaching a student when nobody answered the source step (plain line in the activity language, `engine/per-player-template.js`), the draw pad notice that never cleared, the missing cap on multi-field answers. The six verified-but-unfixed items shipped the same evening (entry above). The two adoption blockers the reviewer named (browser-only saved work, no district terms) are the owner-model gap and docs/COMPLIANCE-TODO.md, not bugs.

**2026-09-12: Early-bird joke shipped on branch `early-bird-joke` (fbf5882), PR #11 OPEN, 1867 tests (CHANGELOG 2026-09-12 "owner's ask").** The first 10 students to join see a dad joke, told by one of the meadow's painted blocks in a speech bubble, punchline 5s behind thinking dots; ON BY DEFAULT (absent = 10, `earlyJoke: false` = off, `{first: N}` = count) with an editor Settings select and a /make More checkbox. The list is `engine/dad-jokes.json` (480) built from `docs/500-all-ages-dad-jokes.md` by `scripts/build-dad-jokes.js` after two owner passes (bar, innuendo, condition jokes out; religion puns and bathroom humor kept by choice); a test fails when the JSON is stale. NEXT: merge PR #11 (deploys on green), then watch a real class join: does the 5s pause read as a beat or a stall, and should the joke also greet late joiners in a rolling room (it does not today, seats are by join order only)? The top-level-setting wiring checklist is in CLAUDE.md Gotchas.

**2026-09-10, night: the 15b home is built on `home-15b` off master (CHANGELOG "design handoff 15b").** Decisions fixed with the owner before code: mechanic line under the planks (jobs-to-be-done order), planks + sticky chips are one control, every home door goes to the make page (no real start from the carousel), "Try it out" and "To just have fun" stay, labels changed but goal keys did not, jamyard.org everywhere. Not yet seen on a real screen. OPEN: (1) the `yard-home-tries` PR (#7) carries the old eight-boards home and the yard's time-chip removal; when it merges after this, the home file conflicts and 15b wins, the yard changes should be kept. (2) The home's "N in the room" and timer are dealt decoration; the sample-answer chips are real template content. (3) Templates without `sampleAnswers` (Speed Quiz, Vocab Match, Both Sides of the Rope, Rose Bud Thorn, Group Work Day) show an empty answer pile and blank student screens on their slide; a set per template would fill them. (4) `the old carousel shots folder (removed 2026-09-19) ` + the old carousel shot script (retired 2026-09-19) are unused by the home now; delete or repurpose.


**2026-09-10, late: three fixes cherry-picked straight to master (e890edf, 501e3f8, 1373db9; CHANGELOG 2026-09-10 "classroom bug", "owner's first two asks", "owner's third ask"; 1822 tests).** (1) The projector rebinds to its room on every socket reconnect (`screens/host/host-session.js`); the old ?game= guard skipped the rejoin after a wifi blip or a tab put to sleep behind the teacher console, so students landed on the console and never on the projector. The console now shows a red "projector not connected" line (`hostConnected` on `teacher-roster`). (2) Elimination Tournament: the eliminated keep voting, `excludeAuthors` now works on pick-one (own answer off the ballot, server refuses self-votes), new eliminate field `untilRemaining` ends the rounds once one student is left (rounds knob = cap), a full tie eliminates nobody. (3) Fresh-facts honesty: `FRESH_FACTS_RULE` in every fact-writing prompt; a current-events quiz gets a refusal (needsTeacherFacts / cantBuild / noMatch) instead of invented questions. The `yard-home-tries` branch also carries copies of these three commits on top of its own work (PR still open). Not yet seen on a real screen: the console notice, the tie copy, the tournament with a real class. The owner is starting a UI change next (fresh context).


**2026-09-09, later: Make it yours is a page (branch `make-page`, PR open).** The owner's think-through ("make it feel faster, fewer buttons, more open space, fewer words"): mocked three directions, picked the page, built version one (CHANGELOG 2026-09-09 "Make it yours is a page"). (1) DONE the same day: Speed Quiz, Solo Quiz, Trivia Bluff, and Doodle Bluff open the page too, their editors mounted under the doors (`MakeItYours.mountPanel`); the "topic sentence as the one box" idea from the mock is still open (the quiz panel keeps its own topic row). Open from it: (2) background reword of the surrounding copy after launch (needs a room whose config can change, or first-step-now / rest-before-you-reach-it); (3) the two threaded templates still wait on the AI, the More questions are their box, worth a real-screen look; (4) the timer on recipe-born copies (map a *Timer knob to the chip); (5) delete the old dialog's generic path once the four panels move.

**2026-09-09: Try it out rebuilt to the 14a/15a handoff (PR #5, MERGED to master as 90ff983 the same day after the owner's look; CHANGELOG 2026-09-09).** Same-day additions from that look: Teacher controls says it is a second screen, × on the NEXT card, the host hides its own sound/full-screen chips in the bench, Exit Ticket's doorway sits flat, and a nine-stop first-visit tour (help card: Take the tour). One header row (name chip, plan as blocks, icon toolbar), teacher screen + ONE student screen with a pager, the yellow NEXT card that points at the control to press. Verified over CDP on Snowball and Mad Lib Mashup; axe clean; 1775 tests. Worth a real-screen look: the NEXT card over a preview gate ("Open Teacher controls to approve", not exercised in the tour because the AI step costs a call), the card's three-presses dismissal (is it too eager for a first-timer?), and Doodle Bluff with 8 students added one by one.

**State on 2026-09-07 evening (commits c5403a3 through cc42d7b, all pushed, CI deploys on green, 1720 tests):** the owner's six home/Create/host asks shipped (fuller board, 14.5s slides, three rows of five tiles with the shared hover card, Make it yours + map on the Create page's existing-activity match, Back to the yard after hosting, rolling-start tag); then outside review #2 in three batches, all shipped (see "Outside review #2" below and CHANGELOG 2026-09-07): small fixes + waiting copy, sample answers + audience line + "Someone wrote this for you", Teacher controls tab in Try it out + discussion prompts + quiz explanations. Three owner catches fixed the same evening: the bold painter on the student screen (a real regression from word help), the recipe match's doors, and a stale dev server (restart after pulling; an old validator drops activities that carry new fields). Fish Audio skills installed and committed for the video rig (`FISH_API_KEY` in .env when used).

**Suggested order next time:**
1. Look at the new pieces on a real screen once: the home shelf hover cards, the audience line under a prompt, Someone's Got You end to end in Try it out (the "Someone wrote this for you" moment and the Teacher controls tab), Speed Quiz's results step with the explanation and the console's "Something to ask".
2. Open items from review #2 (in the Batch notes below): sample answers for the robot playtest (`services/simulator.js`), sample sets inherited by recipe-born copies, `explanation` on Trivia Bluff / Solo Quiz, the parked "thank you" reply.
3. Then the list that was already queued: the five-teacher usability study, Doodle Bluff follow-ups, duration-estimate calibration, the one-minute video (voice via Fish Audio now an option, music track "Happy Tails" is in the repo root untracked, move it to scripts/video).

**Previous state on 2026-09-07 (morning):** PR #4 (`doodle-bluff-two-ways`) merged to master as `b2cf696`, CI green, deployed and verified live (credit line, Review chips, time chips, Rose, Bud, Thorn under Connect, "Try it out"). Local checkout is on master. 1686 tests. The JSON column ALTER ran on prod's Neon at that boot. Nothing is open from the outside review except the usability study.

**Suggested order for the next session:**
1. The five-teacher usability study (one task: "You have ten minutes tomorrow to help your class discuss a topic. Find an activity and get ready to run it."). Nothing else on this list is worth more than what it will show.
2. Doodle Bluff follow-ups 1 and 2 below (play it in Try it out with 8 pretend students; tighten the AI phrase length).
3. Calibrate `engine/duration-estimate.js`: its allowances (join 60s, transition 10s, reading 30s, overrun 15s, untimed input 90s, AI 25s, seat move 30s) are round-number guesses; time one real class and adjust the table. The yard's time chips read playTime first, so a wrong estimate only shows on activities without one.
4. Small things noticed and left alone: the yard's goal chip counts tally every game carrying a tag while each plank is placed once (a chip's number can exceed its pile); Feedback Academy was retagged reflect+discuss because its "review" meant peer review; the a11y audit's remaining serious findings are white text on the red action buttons and red links, accepted by the owner.
5. Word help for multiple-choice options (Doodle Bluff follow-up 3) when the Spanish teacher asks.

**Outside review (2026-09-06, on branch `doodle-bluff-two-ways`, CHANGELOG "outside review, items 1 and 2").** A reviewer walked the homepage, yard, Make it yours, simulator, guide, privacy page, and editor. Shipped from their list: (1) the student screen says "submitted" only after the server's `response-accepted` ack (the "2 of 4 vs four submitted" contradiction), Bot Fill finishes merge steps in one click, regression `scripts/simulate-submit-race.js`; (2) `engine/duration-estimate.js` computes minutes from the timers, the matcher never claims a timing fit, over-budget matches get a "Trim the timers" button, matched copies get a contextual name ("Snowball: Causes of WWI"). Same day: Review became the fourth goal pile, Rose, Bud, Thorn moved to Connect (tag set on prod), the footer credit reads "This project is supported by Assembly Code". Also shipped the same evening (CHANGELOG "items 3 and 5" and the a11y entry): (3) hook lines on every plank, time chips (Under 5/10/20 min) beside the goal chips, the My yard note on where copies live; (4) simulator iframe titles, the seat picker as a radio group, `scripts/a11y-audit.js` (axe-core over headless Edge; run with `MSYS_NO_PATHCONV=1` from Git Bash so `/player` is not turned into a path), serious findings 78 -> 33 across eight pages, all remaining ones brand-color contrast; (5) the editor's Settings and Ask AI panels fold to a rail, the host lobby lists the four hosting steps once the room is open.
Paints DECIDED 2026-09-07: the lighter paints stay; the yard's small plank text on cyan/green/orange is ink (rule at the end of screens/library/styles.css). The remaining contrast findings (white on the red action buttons, red links) are accepted; do not re-raise.
Also DECIDED 2026-09-07: "Try it out" (with pretend students) replaces "Simulate" in every teacher-facing string (CLAUDE.md vocabulary rule revised); the hero subline now leads with what the arrangement is FOR. Nothing from the outside review is open except the usability study: five teachers, one task, ten minutes tomorrow.

**Outside review #2 (2026-09-07, desktop rehearsal of Someone's Got You, Speed Quiz, One More Thing).** Theme: make each activity feel purposeful, personal, and effortless while it runs, without teacher setup. Triaged into three batches; the owner approved the order. **Batch 1 SHIPPED 2026-09-07** (CHANGELOG "outside review #2, batch 1"): stray character counter on choice steps, search rescue keeps the time chip and says "mentions" not "is named", Someone's Got You intro and encouragement prompt made approachable, waiting copy that says what to do ("You're done for now. Look up at the class screen.", "Your teacher is checking the answers before sharing them."), Bot Fill renamed Add sample answers. Corrections to the review worth remembering: the pass screen is identical to the answer screen ON PURPOSE (a neighbor cannot tell), so a pass-specific message is out; One More Thing already returns each chain to its author (it lacks a highlight, not the mechanic); Rose, Bud, Thorn is a user-built activity on prod, not a template; "Open teacher controls" on the host would put the console on the projector (copy-link is the rule).
**Batch 2 SHIPPED 2026-09-07** (CHANGELOG "batch 2, item 1" and "items 2 and 3"): sample answers per template (`sampleAnswers`, seat-dealt, matched to the classmate's line on screen), the audience line under every answer box (`engine/audience.js`, graph-computed), and Someone's Got You's private "Someone wrote this for you:" reveal before the wall. Left open from it: `services/simulator.js` (Check for problems, the robot review) still uses its flat bot bank; recipe-born copies of templates other than Doodle Bluff do not inherit a sample set; the "thank you" reply is parked; the audience line is English-computed then translated, so a foreign-language activity's line reads right but the map rider copy does not change. Original plan, for the record:
1. **Hand-authored sample answers per template.** A `sampleAnswers` map (step id -> lines) on the config or recipe; the prototype's Add sample answers reads it before the keyword bot (`screens/shared/bot-brain.js`); simulator.js can read it too. No AI call. The real cost is authoring coherent sets for the fifteen shelf templates (goal + matching encouragement for Someone's Got You, etc.). Recipe-born built-ins carry them in the recipe (drift guards).
2. **Audience label beside the answer box**, computed from the phase graph, never configured: a rotated collect -> "One classmate will read this"; a preview downstream -> "Shown to the class after your teacher reviews it"; reveal/reveal-one downstream -> "Shown to the class"; only an AI step downstream -> "The AI reads these, not the class"; nothing downstream -> "Teacher only". Names follow the anonymous setting. New module `engine/audience.js` with tests; labels through i18n. The same lookahead gives the wait screen "Next, you'll get a classmate's idea" before a rotation.
3. **The private payoff in Someone's Got You**: a `reveal` with `scope:"own"` + `chainFrom:["notes","boost"]` placed AFTER the teacher's check (only reviewed lines go back), with a configurable header ("Someone wrote this for you") on the own-reveal; the wall still follows on the projector. Recipe change + recompile. The "thank you" reply is parked (a second exchange).
**Batch 3 SHIPPED 2026-09-07** (CHANGELOG "batch 3"): the Teacher controls tab in Try it out, `discussionPrompt` on every step with "Show on the class screen", quiz `explanation`/`discussionPrompt` items (Speed Quiz filled in), closing prompts on Snowball / One More Thing / Someone's Got You. Not done from the review: the "one closing question" is authored per template, not generated; other quiz-shaped templates (Trivia Bluff, Solo Quiz) have no explanation field yet. Original plan: (a) a Teacher controls pane in Try it out, the real /teacher console in a third iframe (the silent join-teacher socket that drives the map rail already exists), with one sample entry to approve and one to hide; (b) per-question `explanation` + `discussionPrompt` on collect-choice / quiz items, shown on the teacher console with a "Show on the class screen" button, and one closing question for collective activities.
Parked from this review: contribution animations (the meadow and the host pile already grow per submission), teacher notes / "save this version" / "run with another class" (built-ins are not the teacher's rows; Play Again + Make it yours cover it), ready-made sequences ("Five-minute arrival"), Rose/Bud/Thorn as a two-mode recipe (reflection vs guess who), task-style map labels (need authored wording per step; the type names are honest).

**Merged to master and deployed (2026-09-06):** PR #1 the 13a home (owner's design handoff, then five feedback rounds: yard board carousel on the right, headline + one red PICK A TEMPLATE on the left, 1-2-3 three across under the board, teacher lines, notched block; PR #2 painted code blocks on join-first shelf cards); PR #3 **word help** (tap a word in a prompt, spend a token, see it translated; ledger + lookup are separate systems, `engine/word-help.js`; editor Settings "Word help" + "Translate into"; console + report list the tapped words). Tests 1616 -> 1637 there.

**OPEN: PR #4 `doodle-bluff-two-ways` (branch, NOT merged, owner reviews).** Everything in CHANGELOG 2026-09-06 under "Doodle Bluff, two ways". Summary: one recipe (v3) with `phraseSource` students | teacher | ai (Make it yours knob; teacher shows a one-per-line phrase box, ai a topic box, via new setup-knob kinds `lines`/`text` + `showWhen`); the sit-out primitive (`engine/phases/sit-out.js`: drawer, the phrase's writer, and anyone handed the same phrase all sit the round out); `collect.dealItems`; the deal covers non-submitters and late joiners; a closing `gallery` of the drawings the round sample skipped (`{{rounds.skipped}}`); the teacher console shows the round's drawing; **the root cause of "only one option": user_games.config was JSONB, which sorts keys, and foreach sub-phases run in key order** (columns are JSON now, old rows repaired on read from the recipe stamp, AI edits carry the order, validator warns). 1664 tests. When merging, note: the JSON column ALTER runs on prod's Neon on first boot (idempotent); prod copies of Doodle Bluff are repaired on read.
Follow-ups after merge, in order:
1. Owner plays Doodle Bluff in the simulator with 8 practice students (students mode) and with the teacher list; then a real class. Watch the same-phrase holding line and the gallery captions ("Name: phrase").
2. AI-written phrases ran long (10-12 words vs the 4-9 asked); tighten the `ai-phrases` instruction in recipes/doodle-bluff.json and recompile the built-in (drift guard).
3. Word help: multiple-choice OPTIONS and button labels are not tappable, only prompt sinks (`setRichText`); the Spanish teacher may want choices too. The answer-box placeholder is untranslated (pre-existing).
4. Other recipes with `subPhases`: any user copy saved before 2026-09-06 that is NOT recipe-born keeps jsonb's key order (the validator only warns). Grep user_games for foreach phases whose sub-phase order looks length-sorted if a teacher reports a round running backwards.
5. The old "Design review setup*.zip" files and `scripts/video/` are still untracked in the repo root.

### Previous START HERE (2026-09-04 evening, small-fixes list shipped, video rig paused)

**2026-09-04 evening, commit `d83e85f` (pushed, CI deploys on green; CHANGELOG entry "owner's list of smaller fixes").** Doodle Bluff's one-title ballot was a submit/close RACE (moderation-ladder await), fixed by `engine/pending-submits.js`; Trivia Bluff got one shared ballot per step, a no-numbers rule for bluff facts (recipe + prepared-facts prompt, config recompiled), and a design chat that writes questions when asked; the Next button reads the announce it will show; the simulator has a three-line first-run card. 1605 tests. Follow-ups to watch:
1. Play Trivia Bluff live for a few rounds: are the AI facts now word-shaped and obscure? If numbers still slip through, tighten the recipe instruction (drift guard: recompile `games/trivia-bluff/config.json` after).
2. Ask the design chat for new questions on a Trivia Bluff copy: it should propose an edit, not offer to brainstorm. If the Sonnet revise mangles the live-round steps, the fix is a recipe-aware path (switch `questionSource` to prepared and recompile) instead of free-form phase edits.
3. The first-run card is only seen headless; check it on a laptop screen once, then decide whether the yard's "See it in the simulator" door needs anything more.
4. The Next-button context labels are heuristics on the announce text (`announceLabel` in engine/phases/continue-labels.js); collect wrong ones from real activities and add cases.

**The one-minute video (2026-09-03, CHANGELOG entry "the one-minute video rig").** First cut `jamyard-one-minute-v3.mp4` (69s) is in the owner's Videos folder; the rig is `scripts/video/` (README there), UNCOMMITTED at pause. Owner's verdict: keep going, but **music is required and the voice must be better** than OpenAI `gpt-4o-mini-tts` "coral". Resume order:
1. Voice: try OpenAI's other voices (`ash`, `ballad`, `sage`, `verse`) with stronger `instructions` in `script.json`, or an ElevenLabs account (needs a key; add a provider switch in `narrate.js`). Render each candidate's hook line only and let the owner pick by ear before doing all beats.
2. Music: owner picks a track (YouTube Audio Library), pass it as the 4th arg to `assemble.js` (mixed at 0.14, faded). Consider ducking under the voice (sidechaincompress) once a track exists.
3. Trim toward 60s (drop the "two clicks" beat or shorten lines; `VOICE_LEAD`/`TAIL` in assemble.js).
4. Wording pass on `script.json` with the owner; `narrate.js --reuse` re-speaks only changed beats, no re-recording needed.
5. Then upload unlisted to YouTube and set GUIDE_VIDEO_ID (screens/guide/index.html); this also closes item 2 of the 2026-09-02 list below.
Recording recipe: `PORT=3005 node server.js`, flip `featured` on games/exquisite-corpse/config.json for the take only, `SIM_SERVER=http://localhost:3005 node scripts/video/record.js <freshDir>`, revert the flag. Whether to feature Exquisite Corpse for real is still the owner's call (the video implies it is in the yard).

### Previous START HERE (2026-09-02, rolling start shipped)

**2026-09-02 in three commits** (all pushed, CI deploys on green): `9929635` chat bigger + Just do it, preview map-rail skip-ahead, activity language (engine/i18n), assemblycode.org credit, guide says yard; `c55c945` class picker inside Make it yours (questions refresh on picks), slim yard strip, home declutter, guide folded + video slot; `b08bbb8` rolling start primitive + Exit Ticket / Live Poll / Solo Quiz (phase #30), live report for the open step, doorway card. 1574 tests.

**Open from today, in priority order:**
1. Owner is field-testing Exit Ticket on a real projector. Watch for: doorway card size/placement on a real 1080p screen (only seen headless at 1600 wide), the console during a rolling step (should show entries live; the solo-quiz progress board is NOT on the console yet), the report's "Still open" section.
2. Record the one-minute guide video (script: docs/GUIDE-VIDEO-SCRIPT.md), paste the id into GUIDE_VIDEO_ID in screens/guide/index.html.
3. Yard placement: the three rolling activities land on the Think shelf by default; a quick-checks spot or goal tag would suit them.
4. Create page: matcher phrases ("exit ticket", "quick poll", "quiz they do on their own") should route to the new recipes; add golden-prompt corpus entries and run scripts/eval-designer-prompts.js before/after.
5. Language coverage: dynamic status prose, projector join instructions, and the teacher console are still English-only (rows go in every table in engine/i18n/index.js).
6. Skip-ahead in preview follows the main next-chain only; a step behind a vote branch is unreachable (gives up after ~2.7 min).

**2026-09-02 owner batch shipped** (CHANGELOG): chat panel bigger + Just do it, skip-ahead by clicking the preview's map rail (owner moved it out of the editor), activity language (engine/i18n, auto-detect + Settings select), assemblycode.org credit, guide says yard. Follow-ons:
- Language coverage: dynamic status prose ("You matched 3 of 5"), the projector join instructions, and the teacher console are still English-only; add rows to every table in engine/i18n/index.js.
- Record the one-minute guide video (script: docs/GUIDE-VIDEO-SCRIPT.md), upload, paste the id into GUIDE_VIDEO_ID in screens/guide/index.html. The written guide is folded behind "The first five minutes" meanwhile.
- Rolling start shipped (Exit Ticket, Live Poll, Solo Quiz; CHANGELOG 2026-09-02). Follow-ons: a `goal`/pile tag so the three land in a "quick checks" spot instead of Think by default; Create-page matcher phrases ("exit ticket", "quick poll", "quiz they do on their own") should route to these recipes (golden-prompt corpus entries); teacher console could show the solo-quiz progress board; rolling doorway card on a real projector still unseen.
- Skip-ahead can only follow the main next-chain; a step behind a vote branch may not be reachable (it gives up after ~2.7 min and hands over). No going back: an earlier stop tells you to Reset.

**THE SHARING SYSTEM SHIPPED 2026-08-30** (see CHANGELOG): share links,
copy-import semantics. `/share/<id>` lands a colleague on an import page
(name + description + treasure map) whose one button calls
`POST /api/games/:id/copy` (featured stripped, deduped new id, per-IP
rate limit) and MyGames.adds the copy; a Share button in the yard popup
(own activities) copies the link. Built-ins redirect to
`/library?about=`; dead links get an honest page. Decisions made: raw
ids in links, no minted short codes (user ids are already readable
slugs; a code table adds nothing until ids stop being guessable-fine),
and only user games get the import page. Follow-ons if wanted:
- Share from the editor too (header More menu) — today it's only the
  yard popup.
- A "shared with me" mark in the yard (imported copies are currently
  indistinguishable from own creations — probably fine).
- Real-device check: the clipboard fallback ladder + the landing page
  on a school Chromebook.

Next in line: guide visuals + the rest of the yard/library naming sweep
(observation wave), and the parked follow-ons (teacher-console map
rail, role-aware turn rotation, secret roles, team-split capacity knob).

### Owner feedback batch 2026-08-30 (bugs shipped same day; features queued)

Owner used the site and filed eight items. Shipped same day (see
CHANGELOG): invisible caret fixed (caret-color + un-rotated idea box),
textarea scrollbars themed, homepage totem labels spelled out, /privacy
operator facts filled, and the big one: **`rotateShuffle` shuffled-deal
primitive + Story Ingredients** (the creative-writing activity the
creator couldn't build; scripts/simulate-story-ingredients.js proves the
deal). Queued, with investigation findings baked in:

1. ~~**Image/video settings in the editor.**~~ **SHIPPED 2026-08-30
   (same day, owner's call: URL + YouTube only, no uploads):**
   `mediaEditor()` in simple-view.js renders a collapsed "+ Add a
   picture or video" on the Simple-view card for
   announce/collect/collect-choice/reveal (estimate: picture only),
   expanding to a Picture URL row (live thumbnail proves the address
   loads) and a YouTube row (soft warning on non-YouTube links,
   "plays on the projector" note). No upload path on purpose: uploaded
   assets land on Render's ephemeral disk (server.js:1704) and die on
   every deploy; the old `addImageUploadWidget`/`POST assets` code
   still exists behind the parked All-settings surface if a durable
   store (Neon bytea) ever justifies reviving it.
2. ~~**Preview mode map rail.**~~ **SHIPPED 2026-08-30:** /prototype
   grew a left rail drawing the treasure map with a yellow "you are
   here" that follows the live room. Wiring: map stops now carry the
   phase ids they cover (`ids` on every stop, engine/activity-map.js);
   the host iframe's room-created postMessage hands the parent the
   teacher PIN (same-origin), and the preview page pairs a silent
   teacher-console socket (join-teacher) to receive teacher-phase
   events; unmatched ids (a round's inner steps) keep the last mark.
   The host's "Teacher device connected" chip is suppressed in
   prototype mode so the rail's pairing doesn't ghost-announce.
   Follow-on idea: same rail on the /teacher console.
3. ~~**Recipe maps (parity with activities).**~~ **SHIPPED 2026-08-30:**
   the compile endpoint and /api/games/from-description now return
   `map`, `GET /api/recipes/:id/map` draws a defaults-compiled map
   (400 for recipes without defaults, clients quietly skip), and the
   recipe picker form + AI match preview render a "What happens" trail
   via the shared `appendRecipeMap` in designer.js.
4. ~~**Group Work Day roles.**~~ **SHIPPED 2026-08-30:** phase type #29
   `team-roles` (teamsFrom + roles + method random|choice; choice =
   claim-a-role with per-group capacity, re-picks, auto-fill sweep via
   the team-split confirm button; output byPlayer so {{X.mine}} = your
   role) + checklist `rolesFrom` with `{text, role}` role-tagged items
   (label + your-job highlight, trust model unchanged). Group Work Day
   now runs split → pick roles → role-tagged checklist; proven by
   scripts/simulate-team-roles.js (collision bounce included) and a
   clean robot playtest. Follow-ons parked: role-aware turn rotation,
   secret roles (the projector-discipline half of the old wishlist
   entry).
5. ~~**Sharing what you made.**~~ **SHIPPED 2026-08-30** (see the
   START HERE block above and CHANGELOG): share links + copy-import,
   no live co-ownership; ordinary user-game copies, so it survives the
   Postgres-first accounts thread in "Later".

### Waiting meadow + yard shed (shipped 2026-08-27; follow-ups)

Shipped from the owner's brainstorm (CHANGELOG entry has full detail):
the meadow (submitted classmates as anonymous walk-in blocks on the
player wait screens, one nudge with a 3s cooldown, counts-only) and the
yard pass (hearted-first/recents/newest ordering + the shed archive).
Open follow-ups:

1. **Feel-check the meadow in a real room.** The design bet is that it's
   calm enough not to teach rushing. If kids fiddle anyway, the fallback
   dial is one flag: pass `{you:false}` at the two nudgeable mounts in
   player.js and it becomes watch-only.
2. **The generic waiting screen's meadow is watch-only on purpose**
   (non-eligible players share #game-waiting-section, so "you" might not
   be one of the counted). If rank/match/sort/rate/wager students deserve
   the nudge, the fix is a per-phase submitted flag in player.js.
3. **Naming**: the field is unnamed in copy today. "Recess" was floated
   (your block goes out to recess) and fits the yard theme; decide when
   the yard-vs-library naming question (below) gets settled.
4. **DATA CLEANUP, owner decision**: /api/games serves
   `elimination-tournament` TWICE — a filesystem-era copy in
   `games/user/elimination-tournament/` AND a Neon user row share the id.
   The library now dedupes visually, but the API still double-serves;
   delete one copy (the disk one is presumably stale since prod went
   Neon-backed 2026-08-27, but verify which is newer first).
5. **Stale sim noticed in passing**: scripts/simulate-dream-vacation.js (removed 2026-09-19)
   times out waiting for rank-start because the config gained a
   host-paced reveal (show-suggestions) it never advances past —
   pre-existing, unrelated to the meadow wave; fix the sim when touched.

**DONE 2026-08-27, the DB-less era is over:** owner set `DATABASE_URL`
on the "Classroom Games" Render service (classroom-games-58vg, the one
that owns jamyard.xyz) — verified live: /api/games serves 41 built-ins
plus 45 Neon user games, and feedback/snapshots/featured/AI-cap are
durable now. Same sweep: duplicate `good-question-bad-question` USER row
deleted from Neon (built-in remains), SITE_PASSWORD + ANTHROPIC_API_KEY
confirmed on the live service, UptimeRobot repointed to jamyard.xyz,
GitHub `RENDER_DEPLOY_HOOK` secret updated to the live service's hook,
and the stray duplicate service "LANYARD" (classroom-games-szi5, born
from the render.yaml blueprint, redeploying on every push) suspended.

### Observation wave 2026-08-27 (small fixes shipped; design projects queued)

Owner watched real people use the site. Shipped same day: home carousel
click opens the activity popup instead of Customize (`/library?about=`),
home FIND block now reads "Pick an activity", yard planks grew hover
cards (description without a click), plan-intro dialog cut to three
icon rows, big yellow Preview block under the editor's step stack,
preview mode defaults to one-at-a-time + 4 players with Bot Fill/Skip
timer moved to a bottom bench bar.

Queued design projects from the same observations, in rough order:
1. ~~**Activity map / path view.**~~ **SHIPPED v1 2026-08-27** (owner:
   "inspired by a treasure map, but stick with the theme"): both
   activity popups (library plank + home carousel) now draw a
   pencil-dashed trail from an "Everyone joins" chip through painted
   family-colored stops to a red X at the wrap-up. Engine:
   `engine/activity-map.js` (pure; primary-path walk, foreach and
   repeated runs fold into "N rounds" stops, short quoted excerpts of
   each step's own words) served by `GET /api/games/:id/map`; renderer
   `screens/shared/activity-map.js` + `.css`. Possible v2 homes: the
   guide, the Customize dialog, richer branch drawing (today a
   branching vote shows "the class's pick decides the path").
2. **Guide needs visuals.** /guide is a wall of words; observed teachers
   won't read it. Rework around pictures: annotated screenshots or the
   same drawn-map language as (1), with the text as captions. The
   carousel screenshot pipeline (the old carousel shot script (retired 2026-09-19)) may help.
3. **"Yard" vs "library" naming.** PARTIAL CALL 2026-08-30: the owner
   asked for "back to yard" on the designer, so the back links on the
   editor, create page, and preview now say "the yard". Remaining: the
   library page's own heading/copy, the home carousel's "From the
   library" label, and the guide — sweep them to match (or an explicit
   pairing like "the Yard, our activity library") in one pass.
   Internals/routes stay `/library`.
4. **Preview default player count.** Now 4 (was 2). Owner's instinct
   said 8; went with 4 because one-at-a-time is now the default view
   (8 unseen screens add weight, not picture), pairs/teams still work,
   and 9 live iframes strain school Chromebooks. Revisit after feeling
   out a real preview run; it is one number in
   `screens/prototype/index.html`.

### Phase interop workstream (review done 2026-08-26, wave 1 shipped)

Full producer/consumer review of how phases compose (stress case: rounds
of student-written would-you-rather questions, answer each other's, then
pair by OPPOSITE answer and share a why). Verdict: the typed-ref lanes
are solid; the weak seam is grouping. Wave 1 (shipped, see CHANGELOG
2026-08-26) made the foreach container honest: rotation/pairing fields
are now schema-restricted to top level (loud validator error both sides)
and the remap layer covers instruction/correctAnswer/choices.

Remaining, in priority order:
1. ~~**Answer-keyed grouping — the missing brick.**~~ **SHIPPED
   2026-08-26 (wave 2):** `pairBy: {from: "<collect-choice id>", mode:
   "opposite" | "same"}` on pairwise collect; best-effort preference
   (lopsided splits pair leftovers with each other, nobody benched),
   composes with rotatePairsFrom/oddHandling and all pairs consumers.
   Proven by scripts/simulate-pairby.js. Follow-up idea: let a recipe
   showcase it (a "Would You Rather, and Why" recipe is now one-shot
   buildable).
2. ~~**Pairs/teams unification.**~~ **SHIPPED 2026-08-26 (wave 3):**
   two bridges via shared `groupsFromSource()` — collect
   `reusePairsFrom` accepts a team-split (teacher-arranged pairs feed
   the pair pipeline), and merge gained `groupsFrom` (pairwise collect
   or team-split; same partners write together). Proven by
   scripts/simulate-groups-bridge.js. **Wave 4 added bridge C:**
   checklist `teamsFrom` accepts a pairwise collect (pairs share a list
   labeled "Maya & Sam"). Still unbridged, low value: rotatePairsFrom's
   avoid-set stays pairwise-only.
3. **Reveal inside foreach — PARKED, owner call needed (2026-08-26).**
   A broadcast reveal inside a round duplicates what announce already
   does; the valuable version is pair-private sharing per round, which
   requires the in-round pairing wave 1 deliberately banned (pairs land
   under `_fe:` ids, cross-round pair memory inexpressible). Building it
   properly = remap pairing fields into rounds + pair reveal in foreach
   + cross-round pair addressing. Substantial; decide whether classroom
   demand justifies it before starting.
4. ~~Small: `pairsFrom` author exclusion.~~ **SHIPPED 2026-08-26
   (wave 4):** `assignPromptsToGroups` — a pair is never handed its own
   member's item when any alternative exists.

### Previous START HERE (2026-08-24, feedback wave)

**Six field-test fixes shipped 2026-08-24** (CHANGELOG entry has full
detail): plan-intro dialog now spotlights the Design with AI chat;
opening an activity without editing no longer puts a copy in the yard
(draft-copy flow, first edit creates it); projected join URL enlarged;
rank/match drag grip made visible + rank hint line; double-join
prevention (token takeover + connected-name refusal, new
engine/join-policy.js + session-replaced event); "A bit more time" v2
(engine/phase-timer.js re-armable server timer — merge/rank/match/sort/
rate/checklist/wager now extendable; rule: any step with one shared
class countdown). 1241 tests.

Follow-ups from this wave:
- **Feel-check the six fixes in a real room**, especially the
  name-refusal copy (is the message clear to a 12-year-old?) and the
  draft-copy flow (does "my yard" now match teacher expectations?).
- The takeover/name-refusal paths have unit tests via classifyJoin but
  no socket-level integration test (none exist in the repo yet); the
  chaos suite covers reconnects only.

### Previous session block (2026-08-21, five-ship day)

**Five ships, all pushed and deployed** (2026-08-21, master 7012379,
CI green, 1197 tests): (1) Closer rebuilt TALK-ONLY and refeatured
under Connect (announce-driven conversations, physical partners,
one-tap rate checkout; the recipe deliberately keeps the typed
simultaneous-reveal version, both live on). (2) "A bit more time"
+30s button on running input timers (projector + teacher console;
collect/choice/vote/estimate; server-armed phases parked for a v2
re-armable timer). (3) Totem hover fix (one slab at a time). (4)
Carousel projector shots (the old carousel shot script (retired 2026-09-19); STANDING CHORE:
rerun + commit PNGs after any redesign or featured change). (5) Merge
pen: the shared draft is one-writer-at-a-time (claim by writing,
release on agree, 2.5s idle steal). Details: CHANGELOG 2026-08-21
entries + the five memory files.

Fresh follow-ups (before the older list below):

- **"Questions for Michael" was never saved** — the owner's Snowball
  revision exists only in their browser tab (if still open: save from
  there; watch for "Save failed" in the header). Once saved, owner-★
  works now: featured USER games show publicly (game-visibility fix).
  Heads-up: user creation "Rose, Bud, Thorn" carries featured:true in
  the DB and is now publicly visible; un-star it if unwanted.
- **Classroom-feel checks on the new mechanics**: the merge pen's 2.5s
  idle window (MERGE_PEN_IDLE_MS, one constant) and the +30s button,
  both built on sims, neither felt in a real room yet.
- **Watch the live one-editor with real users**: the chat is the only
  path for structural edits — if that pinches, the parked pieces
  (scrap bin, add-step slot, All-settings expander via
  SV_ALL_SETTINGS_ENABLED, hidden Simple|Builder toggle) are one-flag
  re-enables.
- **Host a real activity on jamyard.xyz** end to end (still only
  locally verified since the Totem merge).

Remaining from the setup-mode era, in priority order:

1. **Accessibility audit** (blind + colorblind users) — NOW THE TOP
   ITEM and overdue: field tests are live this August. Screen-reader
   labels on the player screen, contrast, focus order. Bigger than a
   tweak; schedule as a wave.
2. **foreach in the editor is confusing** (teacher's words). Hardest
   editor UX problem; deserves its own session.
3. **New activity ideas from feedback** (build as brick stress-tests):
   player-built quiz (students submit Q+A, class plays them — the quiz
   brick + collect-multi-field cover most of it now), yes-and machine
   (appendOnly / relay bricks), Imposter game (needs ONE new primitive:
   secret asymmetric role deal — unlocks the Chameleon/Spyfall genre).
4. **Fill-in-the-blank question format** (owner deferred 2026-08-14):
   needs graded typed answers in the engine with forgiving matching
   (case/spaces/small typos — slow spellers must not be punished);
   then it becomes a quiz-panel format toggle.
5. **Smaller follow-ups from the setup-mode day**: flag setup params on
   more recipes (knobs are free once flagged), review gate for the
   standalone quiz Builder path, recipe-match counter-offering the
   closest recipe instead of a flat no-match, empty 0-pt teams render
   when teamCount > player count (degenerate in real classes, low).

### Previous START HERE (2026-08-13, field-feedback triage)

The 2026-08-13 feedback batch was triaged into four buckets; the quick
wins (bucket 1) SHIPPED same day (see CHANGELOG 2026-08-13: join-line
font, leaderboard ink-on-ink fix, card button order, 3 fun games
featured, recipe #21 Memory Sketch). Remaining, in priority order:

1. ~~**Spanish-case reproduction (the strategic diagnostic).**~~ DONE
   2026-08-13 (see CHANGELOG): root cause was the storyboard grammar
   knowing only 10 of 28 phase types, nothing for scoring/teams. Fixed
   with quiz + teams bricks, prompt honesty rule, approval-UI question
   review; same request now robot-playtests clean end to end. Follow-ups
   surfaced: ~~team-scored leaderboard~~ (SHIPPED same day:
   leaderboard.teamsFrom + team-standings.js + auto-wired in teams+quiz
   storyboards; "team competition" is now literal) and consider
   recipe-match learning to counter-offer the closest recipe instead of
   a flat no-match. ~~Team leaderboard browser eyeball~~ DONE 2026-08-14:
   host + player rendering verified live (fixed a "Team Team 1" player
   headline on the way); quiz-show also gained teams/teamCount setup
   knobs, so Speed Quiz copies can be team competitions from Customize.
2. ~~**Speed Quiz editor pass**~~ DONE across 2026-08-13/14 (see
   CHANGELOG): ✓ correct-answer toggle in Simple + sidebar, shuffle
   checkbox, typo-trap validator warning, leaderboard score-wiring (Σ
   sum-every-scored-step button + .scores finally in the dropdown).
   Announce clarity: Simple view's token chips already read well.
   Wrong-facts review gate: shipped for storyboard quizzes (approval
   UI); the standalone Speed Quiz Builder path still deserves one.
   ~~Per-game setup mode~~ SHIPPED 2026-08-14 the owner's way: setup
   knobs (question count, timer, speed bonus) live in the library
   Customize dialog, choices persist into the copy, then Preview →
   Host (next time just Host). Built on recipe provenance stamps +
   multi-phase $repeat; Speed Quiz re-authored as a quiz-show compile
   (drift-guarded). SAME DAY: the **quiz Customize panel** (teacher
   follow-up feedback): setupPanel:"quiz" recipes skip the generic AI
   interview and get an editable question list + topic box (AI writes
   questions, teacher fact-checks in the dialog). Follow-up candidates:
   flag setup params on more recipes (knobs are free once flagged),
   **fill-in-the-blank question format** (owner deferred it: needs
   graded typed answers in the engine with forgiving matching), a
   review gate for the standalone quiz Builder path.
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
   the week-of-July-27 refinement memo (a working document removed from the repository on 2026-09-19; the history is in CHANGELOG.md). **Phase 1 SHIPPED
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
   review (the 2026-08-02 game coherence review (a working document removed from the repository on 2026-09-19; the history is in CHANGELOG.md) — the review's 7
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
   the 2026-08-02 game coherence review (a working document removed from the repository on 2026-09-19; the history is in CHANGELOG.md).

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
