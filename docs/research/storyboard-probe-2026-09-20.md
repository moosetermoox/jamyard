# Storyboard capability probe, 2026-09-20

What the Create page's step-by-step builder (the storyboard, Sonnet 5 at low effort) can and cannot make, measured against what the engine already has. 27 challenges written the way a teacher would type them, 3 storyboard runs each (81 Sonnet calls), plus one matcher run each (27 Haiku calls) to see where the real Create page would send the idea before the storyboard ever runs.

Harness: `run-challenges.mjs` + `challenges.json` (scratchpad, not in the repo); every built plan was compiled with `compileStoryboard` and run through the validator. All 63 built plans compiled and validated with zero problems.

## Results

Group A: bricks exist, should build every time.

| # | Challenge | Matcher | Storyboard | Grade |
|---|---|---|---|---|
| 1 | Exit check, learned + wondering | host exit-ticket | built 3/3 | faithful |
| 2 | Fractions speed quiz, no questions given | noMatch | built 3/3 | faithful; run 3 had one ambiguous question (1/2 and 6/12 both right) |
| 3 | Vocab riddles, class guesses | recipe creative-vote | built 3/3 | faithful (collect-two + guessing-rounds) |
| 4 | Team trivia, teams of four | recipe quiz-show | built 3/3 | faithful (teams + quiz) |
| 5 | Rank six causes of WWI | recipe choice-draft | built 3/3 | faithful (rank with items) |
| 6 | Folded story, last few words | recipe exquisite-corpse | built 2/3, 1 JSON error | faithful (chain tail) |
| 7 | Would you rather, split, defend | recipe class-poll | built 3/3 | run 3 dropped the split reveal (three rounds, no reveal) |
| 8 | Peer feedback, returns to author | recipe snowball | built 1/3, 2 JSON errors | faithful when it parses (chain, one hop) |
| 9 | Whole-class debate, pick the best | recipe creative-vote | built 3/3 | faithful (collect, reveal, vote) |
| 10 | Exit check in Spanish | recipe exit-ticket | built 3/3 | faithful, every word in Spanish |

Group B: the engine can, the storyboard's brick vocabulary cannot.

| # | Challenge | Engine has | Matcher | Storyboard | Grade |
|---|---|---|---|---|---|
| 11 | Draw a monster, wall, vote | collect drawing + preview + vote | host art-gallery | declined 3/3 | honest decline; matcher covers |
| 12 | Debate pairs, swap sides | pairwise collect, rotatePairsFrom | noMatch | declined 3/3 | NOTHING for the teacher |
| 13 | Sum answers into three themes | ai-process summarize | recipe discussion-starter | declined 3/3 | honest decline; matcher covers |
| 14 | Rate the lesson 1 to 5, bar chart | rate | recipe class-poll | built 3/3 | fair lookalike (estimate scale 1..5) |
| 15 | Sort ten animals into three buckets | sort | host metaphor-or-simile | built 3/3 | quiz lookalike by design; fine |
| 16 | Match eight vocab words | match | noMatch | built 2/3, 1 JSON error | quiz lookalike; one run added a speed leaderboard unasked |
| 17 | Buzzer round | buzz | host lightning-round | declined 3/3 | honest decline; matcher covers |
| 18 | Count to 20, one voice | one-voice | host one-voice | declined 3/3 | honest decline; matcher covers |
| 19 | Groups of four, a job each, to-do list | team-roles + checklist | recipe group-work-day | built 3/3 | BROKEN lookalike: teams > rank byGroup > assign hands one job per GROUP, the announce promises one per member; no to-do list |
| 20 | Joke-off, bottom half out, repeat | eliminate + loopBack | recipe elimination-tournament | declined 3/3 | honest decline; matcher covers |
| 21 | Anonymous test worries | anonymous: true | recipe anonymous-feedback | built 3/3 | mostly kept: the projector list prints text only, but the console and report still carry names; the promise "no names attached" is stronger than the plan |
| 22 | Watch a YouTube clip, two questions | announce video | noMatch | declined 3/3 | NOTHING for the teacher |
| 23 | Jelly beans, closest guess wins | estimate scoring closest | "game" estimation-station (a recipe id in the game slot, the route treats it as unknown and says noMatch) | built 3/3 | estimate with no answer and no scoring; one run promises "comes out on top" |
| 24 | Exit ticket, answer whenever done | start: rolling | host exit-ticket | declined 3/3 | honest decline; matcher covers |

Group C: nothing on the platform does this.

| # | Challenge | Matcher | Storyboard | Grade |
|---|---|---|---|---|
| 25 | Haiku, the AI writes one, guess which | host who-said-it (Human vs AI would have been closer) | declined 3/3 | honest; one run offered guess-who instead |
| 26 | Record a podcast segment | noMatch with a clear reason | declined 3/3 | honest; one run offered a written version |
| 27 | Quiz on this week's news | noMatch | declined 3/3 | honest, every run asked for the facts to be pasted |

Timing: most runs 2 to 8 s. One slow outlier of 17 to 25 s in each of #6, #11, #17, #21, #22, #23.

## Findings

1. JSON parse failures: 4 of 81 runs (5%), and 1 of 4 in a re-probe with the raw text kept. The reply ends in `}]` with the object's closing brace missing; `_parseStoryboard`'s regex fallback then trims to the last `}` and fails with "Expected ',' or ']' after array element". Three of the five were chain plans (#6, #8). A brace-balancing repair before giving up would recover all of them.
2. The storyboard is honest. Every decline named the missing mechanic in a teacher voice and never built a hollow plan for a mechanic the prompt bans. The prompt's honesty rules work.
3. The honest declines mostly hide engine features. Drawing, AI summary, buzzer, one-voice, elimination, and rolling start all exist; the storyboard cannot name them. For six of those eight the matcher sends the teacher to a built-in or recipe first, so the Create page is fine.
4. Two ideas leave the teacher with nothing: debate pairs (#12) and a video clip with questions (#22). Both are noMatch upstream and declined downstream. The engine has pairwise collect with pair rotation, and announce has a video field.
5. One lookalike is broken and compiles clean: jobs per member built as teams > rank byGroup > assign (#19) hands one job per group. The matcher catches this on the Create page (Group Work Day), but the storyboard itself needs either a roles brick or a rule that member jobs never go through rank + assign.
6. Matcher slot confusion: for #23 Haiku put the recipe id `estimation-station` in the `game` slot. The route's unknown-game branch declares noMatch instead of checking recipes, so the teacher falls through to an unscored storyboard.
7. Estimate has no answer or scoring in the storyboard, so "closest wins" cannot be honest; the words drift toward promising a winner.
8. Per-minute throttle: 9 of the first 27 matcher calls hit the 20/min cap because of the harness's concurrency (re-run clean), not a product bug. Note that `matchRecipe` turns the budget error into a noMatch with reason "AI matcher failed", which the Create page then treats like any no-match.

## Ranked follow-ups (1 and 5 shipped the same evening, branch storyboard-repairs)

1. DONE: brace-balance repair in `_parseStoryboard` (`closeUnbalancedJson`).
2. A `pairs` brick: pairwise collect, swap, rebuttal, pair-scoped reveal. Golden prompt: #12.
3. `video` on the announce brick. Golden prompt: #22.
4. Roles: a `roles` brick over team-roles (and a checklist), or a prompt rule against rank + assign for per-member jobs. Golden prompt: #19.
5. DONE: `matchRecipe` reads an offered recipe id out of the game slot as a recipe pick.
6. `answer` + closest scoring on the estimate brick so "closest wins" is real.
7. A `draw` brick (collect drawing + preview gate + reveal-one or vote), since Draw Gallery only covers the plain gallery.
8. A `summarize` brick over ai-process for the "themes on the board" ask; the Create page already covers it through Discussion Starter.
