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

### START HERE next session (updated 2026-09-13: PRs #18 and #19 merged and live, 1936 tests)

**2026-09-13 in one paragraph.** PR #18 (home feedback): the red door says PICK THIS ONE, plank hover shows the ways, five nits. PR #19 (the make page, four design tries on a canvas, https://claude.ai/code/artifact/25f054d7-99dc-451c-bf40-c5121360dfe7): the More fold became **Make it fit your class**, rows of chips under the doors (the AI asks one question, two at most, choice or text; class, names, joke as rows); the reword keeps only the words the teacher CHANGED; **See how it reads** runs the fit once and redraws the print AND What happens, the doors reuse the copy; a quiz's panel sits right under the doors; **The pairs** panel with **+ round** for matching activities (under the fit rows); the yard's door says Pick this one too; the designer link reads "Make it even more yours in the designer". Owner: "good enough right now to merge, it's definitely an improvement", with follow-ups open.

**Late 2026-09-13 (branch `host-corner-and-tabs`, CHANGELOG entry of the same date):** the projector's JAM YARD mark links home (asks first with a room open), its sound and full screen chips are the bench's ♪ and ⛶ at 26px and 55%, the teacher view's header has "‹ The yard", and the live user activity is now "Guess Who: Rose, Bud, Thorn" with the emojis and em dashes gone (edited on jamyard.org through the API, not in the repo). NOT done: the owner wanted Host to keep the pressed tab as the projector and open the console behind it without focus; measured impossible from a page in Chromium (details in the CHANGELOG and the Host rule in CLAUDE.md), the live arrangement stays. **Open from the owner's same list:** the yard's My yard shelf still shows the old mini planks (`buildMiniPlank` in library.js) while the grid above it is drawn prints (`shared/yard-prints.js`); the owner said "we have to think about that". Options: draw the shelf with the same prints at pocket size (one module, nothing drifts), or keep planks as a deliberately different "your shelf" look. Also: `tests/screens/make-fit-rows.test.js` has one assertion that fails on a Windows checkout only (a `\n` literal against a CRLF file); CI on Linux passes.

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

**2026-09-10, night: the 15b home is built on `home-15b` off master (CHANGELOG "design handoff 15b").** Decisions fixed with the owner before code: mechanic line under the planks (jobs-to-be-done order), planks + sticky chips are one control, every home door goes to the make page (no real start from the carousel), "Try it out" and "To just have fun" stay, labels changed but goal keys did not, jamyard.org everywhere. Not yet seen on a real screen. OPEN: (1) the `yard-home-tries` PR (#7) carries the old eight-boards home and the yard's time-chip removal; when it merges after this, the home file conflicts and 15b wins, the yard changes should be kept. (2) The home's "N in the room" and timer are dealt decoration; the sample-answer chips are real template content. (3) Templates without `sampleAnswers` (Speed Quiz, Vocab Match, Both Sides of the Rope, Rose Bud Thorn, Group Work Day) show an empty answer pile and blank student screens on their slide; a set per template would fill them. (4) `screens/home/shots/` + regen-carousel-shots.js are unused by the home now; delete or repurpose.


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
**Batch 2 SHIPPED 2026-09-07** (CHANGELOG "batch 2, item 1" and "items 2 and 3"): sample answers per template (`sampleAnswers`, seat-dealt, matched to the classmate's line on screen), the audience line under every answer box (`engine/audience.js`, graph-computed), and Someone's Got You's private "Someone wrote this for you:" reveal before the wall. Left open from it: `services/simulator.js` (Test with Robots) still uses its flat bot bank; recipe-born copies of templates other than Doodle Bluff do not inherit a sample set; the "thank you" reply is parked; the audience line is English-computed then translated, so a foreign-language activity's line reads right but the map rider copy does not change. Original plan, for the record:
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
5. **Stale sim noticed in passing**: scripts/simulate-dream-vacation.js
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
   carousel screenshot pipeline (regen-carousel-shots.js) may help.
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
Carousel projector shots (regen-carousel-shots.js; STANDING CHORE:
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
