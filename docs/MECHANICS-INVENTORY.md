# Mechanics inventory: what we have, what is easy, what is missing

> 2026-09-30. A possibilities document, not a plan. The thesis it serves: as long as nothing needs assets or animation, a library of text-based mechanics that snap together like blocks can express almost any classroom activity. Three layers matter here:
>
> - **Phase types** are the engine's blocks (31, `engine/phase-schemas.js`). Anything the editor can wire by hand.
> - **Bricks** are the Create page's vocabulary (24, `engine/suggest-validate.js`). What the storyboard AI can assemble from a teacher's sentence. A phase with no brick exists but cannot be reached by typing an idea.
> - **Recipes** are fixed assemblies with two to five knobs (28, `recipes/`).
>
> Effort words below: **knob** = a field on an existing block, hours; **compute** = a new step with no student screen, a session; **screen** = a new student or projector screen, days.

## Part 1: what we have

Grouped by what the block does in a lesson, not by its name.

### Gather: students put something in

| Block | What it is | What it can already do |
|---|---|---|
| **collect** | Students type a free-text answer | One box or several labelled boxes; a drawing instead of text; pass allowed; a length cap; append to an inherited text (chains); show only the tail of what came before (the folded pass); a private hand-out of teacher items, one per student; a secret kept until a reveal; emoji-only boxes; a YouTube clip above the question; the answer line says who will read it |
| **collect-choice** | Students pick one of the teacher's choices | A right answer with speed scoring (quiz); live results growing on the projector (poll); choices pooled from the class's own answers with the author's off the ballot (the bluff shape); a fixed chart order with zero rows (a scale); the same question asked twice with a paired before/after chart and a "changed their minds" line |
| **estimate** | Everyone guesses a number | Closest or graduated scoring against an answer; no answer = poll the room; a range becomes a row of numbers to tap or a slider; the teacher can set the answer from the console mid-step |
| **rank** | Drag a list into order | The list is the teacher's or an earlier step's answers; aggregated by average position; as groups (each group's order is its members' average) |
| **match** | Pair items from two lists | Auto-scored, the projector shows which pairs the class nailed or missed |
| **sort** | Put items into named buckets | Correct buckets = graded; no correct buckets = a consensus poll |
| **rate** | Rate something on custom scales | One to many scales, named ends; results as bars; teacher-only or everyone sees; the presenter's name in the question |
| **solo-quiz** | A self-paced question list | Per-student choice order; projector shows progress only; built for rolling start |
| **wager** | Bet points on an option | Auto-resolved or host-resolved |
| **buzz** | First tap wins | Teacher asks out loud, judges right or wrong on the projector; wrong locks you out for that question; many questions in one step; a scores output |
| **relay** | Turn by turn into one shared text | Turn timer; skipped turns dropped; the finished text as one piece |
| **turn** | Charades | One describer, a shared pool, team rotation, per-turn timer |
| **merge** | A group writes one answer together | One pen at a time; agree by both, any, or timer; groups of 2 to 4 or the groups an earlier step made |
| **one-voice** | Count to a target as a class | Two voices at once resets; no winners |
| **checklist** | A group to-do list with live progress | Per team, per pair, or per student; items tagged to a role |

### Arrange: who works with whom, who gets what

| Block | What it is | What it can already do |
|---|---|---|
| **team-split** | Make teams or groups | A count of teams or a group size; random, balanced by score, teacher arranges on the projector, students choose a team, or **jigsaw** (one member of each earlier group in every new group); late joiners seated |
| **team-roles** | A job for every group member | Random or students claim one; capacity per role; stragglers filled at close |
| **pairs** (collect `assign: pairwise`) | Partners | A triple when odd; the same partner for follow-up rounds; new partners each round; partners who answered a pick-one the same, differently, or **far apart** on a scale; two sides dealt one per partner; see what your partner wrote |
| **rotation** (collect `rotateFrom`) | Pass your answer to a classmate | Fixed shift or random no-self deal; blind (the receiver sees nothing) or open; chain per pool |
| **deal** (collect `items`) | A private hand-out | A teacher list dealt one per student |
| **assign** | Hand out choices after a rank | First choices first, spots spread evenly, a cap per item; "your group got" |
| **foreach** | Rounds, one per item | Over answers or a teacher list; a cap on rounds; the people who know the answer sit out; scored per round |

### Decide: the class or the system picks

| Block | What it is | What it can already do |
|---|---|---|
| **vote** | The class chooses | Head-to-head, pick-one, or **approve** (yes or no on every entry, a pass threshold); a **bracket** (seeded rounds, byes, a champion); over teacher options, class answers, or drawings; own answer off the ballot; top N; the next step chosen by the winner (branching) |
| **eliminate** | Remove players | By percent, by a rule, or until N remain; loops back for the next round |
| **ai-eliminate** | The AI judges answers against a rule | Rule-breakers out |
| **leaderboard** | Standings | Sums several rounds; team standings; your own rank highlighted |
| **winner** | Crown someone | Drumroll; shows what they won for |

### Show: what the projector and the screens display

| Block | What it is | What it can already do |
|---|---|---|
| **announce** | A message to everyone | Timer; image; YouTube clip; a drawing; a different projector line from the student line |
| **reveal** | Show content | To the class, to a pair only, or to the author only (return-to-author chains, a blind chain assembled into a sentence); a chart; the finished chains stored as responses so a later step can use them |
| **reveal-one** | One at a time | Host-paced; a random sample; drawings hang as a wall |
| **preview** | The teacher looks first | Approve, reject (start the step over), hide one entry |
| **spotlight** (console action) | Put one student's finished work up | Any collect or chain, from the console |
| **discussion prompt** (field) | A question the teacher can float over any step | Shown when the teacher presses Show |
| **end** | Done | Rolling rooms give each student their own done screen |

### Think: the AI's jobs

| Block | What it is | What it can already do |
|---|---|---|
| **ai-process** | The AI reads data and writes | Summarize, generate, generate choices, compare, rank, judge; one result per student or one for the class; JSON or prose; counts what it left out; never runs on empty input; variety spin on generate |

### Structure and settings (not blocks, but part of the kit)

Rolling start (open straight into the first step, each student done on their own); host-paced payoffs; timers with extend; loops with a back edge; branching by vote winner; anonymous mode (server-assigned play names); language auto-detect with every fixed label translated; word help purse; early-bird joke; sample answers for Try it out; teacher preview gate anywhere; moderation ladder on every student line; the activity report.

### The Create page's bricks (what a typed idea can reach)

announce, collect, collect-two, collect-choice, estimate, reveal, reveal-one, vote (plus approve, top N, bracket), guessing-rounds (guess who), rank (plus by group), assign, quiz, teams (plus jigsaw), chain, deal, pairs (plus pairBy, sides, rounds), roles, draw, summarize, buzz, review, bracket, end.

**Engine blocks with no brick** (a teacher cannot type their way to them, the matcher sends them to a built-in instead): ~~match, sort, rate, merge, relay, turn, wager, checklist (only through roles), one-voice, eliminate rounds, solo-quiz, rolling start~~ (all shipped 2026-09-30 as the bricks match, sort, rate, merge, relay, charades, wager, tasks, count, knockout, solo-quiz, and `rolling: true` on a plan; branch `engine-bricks`), ai-eliminate, leaderboard, winner over scores, perPlayer AI.

## Part 2: easy to add or modify

Ordered roughly by payoff over effort. None needs an asset or an animation.

### A. Bricks for blocks that already exist (prompt + compiler only, no engine code)

> SHIPPED 2026-09-30 (branch `engine-bricks`): every item below is a brick now; see the CHANGELOG entry for the shapes.

1. **match, sort, rate as bricks.** Vocab pairs, fact-vs-opinion buckets, rate a presentation. The engine does all three; the storyboard cannot say them. Each is a brick definition, a golden prompt, and a line in the matcher prompt.
2. **merge** ("write one answer as a pair"), **relay** ("one line each into a class story"), **checklist** on its own ("every group works through these five tasks").
3. **eliminate rounds** ("bottom half out, repeat until three are left"): the knockout the probe declined.
4. **rolling start** as a storyboard flag ("answer whenever you finish"): the exit ticket shape.
5. **solo-quiz** brick ("ten questions at their own pace") beside the existing quiz brick.
6. **wager**, **turn** (charades over a teacher list), **one-voice**: small bricks, occasional use.

### B. Knobs on existing blocks

> SHIPPED 2026-09-30 (branch `engine-knobs`): 9 (groups by answer), 10 (minority routing, as `.most`/`.least` outputs), 12 (candidates from the roster, plus eliminate by most votes), 13 (quiz items from a step, the write-quiz brick), and a correct order on rank (8). SHIPPED the same night (branch `screen-knobs`): 7 (pick several, `maxPicks`), 14 (graded free text, `correctAnswer` on collect), 15 (per-group content, `stations`). 11 (two reviewers per piece) needs nothing: a chain with two hops hands every piece to two readers in turn. Still open: 16 (shuffle and anonymize knobs on a reveal).

7. **Pick several** on collect-choice ("choose up to three"). The chart and the live results already count per choice; the ballot needs a cap and a confirm.
8. **Correct order on rank** ("put these events in order"): a graded rank, scored like match. Timelines, steps of a process, sorting by size.
9. **Groups by answer** on team-split (`groupBy` an earlier pick-one: same answer together, or every answer represented in each group). The pairs version exists (`pairBy`); this is the group version, and it answers "sort them into groups by what they picked".
10. **Minority routing** on vote and collect-choice (`nextByLoser`, or a `.least` output): "the side with fewer hands goes first".
11. **Two reviewers per piece** on rotation (`fanOut: 2` on `rotateFrom`): each answer goes to two classmates; the two-piece peer review from the review list falls out of it with a return-to-author reveal.
12. **Candidates from the roster** on vote: vote over classmates (the accusation vote for secret-role games, "who was the spy"), with a self-vote refused the way own answers are.
13. **Quiz items from a step** on quiz-show and solo-quiz (`questions` as a data ref): students write the questions in a collect-two, the class takes the quiz. Student-authored quizzes with no new screen.
14. **Graded free text** on collect (`correctAnswer` with normalized match, or an AI judge pass): fill in the blank, one-word answers, translate this word.
15. **Per-group content** on announce and collect (`perGroup: [...]`): different stations get different instructions on the same step. Stations rotation is then a foreach over the station list.
16. **Shuffle and anonymize** on reveal and reveal-one (answers in random order, no names) as explicit knobs where the anonymous room setting is too blunt.

### C. Compute steps (no student screen, a projector line at most)

> SHIPPED 2026-09-30 (branch `reveal-styles`), as template suffixes rather than steps: 17 (tally, as `.cloud`) and 18 (random pick, as `.random` on a list and `{{players.random}}`). 19 and 20 remain.

17. **Tally** (word frequency over a collect): the raw material of a **sized word cloud**, "most common answer", "how many said X". A compute plus a reveal style.
18. **Random pick**: one student, one answer, or one item at random, host-paced ("spin the wheel", cold call with a visible fair draw, the next presenter).
19. **Class total** over estimate or a number field (sum, mean, spread): "together we read 412 pages".
20. **Score from a rubric** (an ai-process judge with a fixed JSON shape, points per criterion) so AI-judged rounds feed the leaderboard.

### D. Reveal styles (the projector draws existing data differently)

> SHIPPED 2026-09-30 (branch `reveal-styles`): the word cloud (`.cloud`) and the all-at-once grid (`.cards`); the estimate step already draws the class's spread at close, so no number line; two columns remain a template layout question.

21. **Word cloud** (sized), **all at once grid** (every answer up together, the gallery for text), **two columns** (two groups' answers side by side, For and Against), **a number line** with the class's dots (estimate's distribution as a strip). Each is a display mode on reveal, no new data.

## Part 3: missing and useful

Things a teacher asks for that the kit cannot say yet, and what they would take.

> STATUS 2026-10-01, end of day: Part 3 slice six on branch `secret-pairs`: collect `pairItems` deals every item to two students and checks the names they type; the `findmatch` brick; the Create page's matcher backstopped so the idea is never called off the screens. Left in Part 3: the AI narrator loop (a prompt study first).
>
> STATUS 2026-10-01, later still: Part 3 slice five on branch `hot-seat`: reveal-one `to` sends every item to one student's screen (the projector and the class get the count), and the `hotseat` brick wires the questions, a teacher look, and that reveal, with a vote by name first when asked. Next: secret pairs that find each other.
>
> STATUS 2026-10-01, late night: Part 3 slice four on branch `instant-runoff`: rank `runoff: true` picks one item by instant runoff, the pick and every round on the projector. Next: hot seat to one screen.
>
> STATUS 2026-10-01, night: Part 3 slice three on branch `confidence-knob`: `confidence: true` on the quiz brick (collect-choice `confidenceFor`, a Right | Wrong chart and a line on the answer card, words in the activity's language). It went on the quiz brick rather than a rate step: a graded pick-one question lives there, and the "how sure" must land before the answer card. Next: instant runoff.
>
> STATUS 2026-10-01, evening: Part 3 slice two on branch `quiet-brick`: the `quiet` brick (a timed announce with nothing to type and an optional talk line after), and a timed announce keeps its clock across a refresh. Next: confidence after the answer.
>
> STATUS 2026-10-01, later: Part 3 slice one shipped on branch `feedback-brick`: the `feedback` brick (one or two readers, each reads the draft in their own box, the writer gets every comment back) and the collect knob `showOriginal` (the B11 two-readers case). Next: quiet time.
>
> STATUS 2026-10-01: Part 2 is complete (PRs #144 to #147), and it covered eight rows of this table on the way: accusation vote (vote over students + eliminate most-votes), minority turn (`.least`), groups by answer (team-split byAnswer), student-written quiz (write-quiz), timeline order (rank correct), sized word cloud (`.cloud`), stations (`stations` on a step), fill in the blank (collect with an answer). What remains, in the order the next session takes them: a peer-feedback brick (a name over chain + two hops + the return reveal), quiet time (a named announce with a timer), confidence after the answer, instant runoff, hot seat to one screen, secret pairs that find each other, the AI narrator loop. Scoreboard across activities stays out. The plan with shapes is in `NEXT-STEPS.md`'s START HERE.

| Mechanic | What a teacher means | Nearest thing today | What is missing | Effort |
|---|---|---|---|---|
| **Peer feedback on one classmate's work** | Each student reads one piece and answers three questions about it; the author gets it back | Rotation + multi-box collect + return-to-author reveal | Nothing structural; a **peer-review brick** that wires the three, and B11 for two readers | brick + knob |
| **Accusation vote / vote a player out** | Secret roles, then "who is the spy", the voted player is out and the role is revealed | Deal (secret roles) + vote + eliminate | Vote candidates from the roster (B12), eliminate by vote result, reveal the voted player's dealt item | two knobs + wiring |
| **Minority turn / odd one out** | Whoever picked the rarer option speaks, or is out | Pick-one + nextByWinner | A least-picked output and routing on it (B10) | knob |
| **Groups by answer** | "Put everyone who chose B together" or "one of each in every group" | pairBy on pairs; jigsaw on teams | team-split `groupBy` (B9) | knob |
| **Student-written quiz** | The class writes the questions, then takes them | collect-two, then quiz over a teacher list | Quiz items from a step (B13) | knob |
| **Timeline / order these** | Put events, steps, or sizes in the right order | rank (consensus only) | A correct order on rank (B8) | knob |
| **Sized word cloud** | One word each, biggest word is the most common | reveal list | Tally compute + word cloud style (C17, D21) | compute + style |
| **Stations** | Groups rotate through four tasks, a timer each | announce + checklist per team | Per-group content (B15) over a foreach of stations | knob |
| **Fill in the blank, graded** | One-word answers checked automatically | collect-choice with a right answer | Graded free text (B14) | knob |
| **Instant runoff / ranked ballot** | Rank the options, lowest is dropped until one has a majority | vote bracket, rank | A runoff mode on vote reading rank data | compute |
| **Hot seat with the class's questions** | The class writes questions, one student answers them one at a time | question-share, spotlight | A reveal-one aimed at ONE student's screen (a private gallery, "reveal to one") | screen-ish, small |
| **Secret pairs that find each other** | Each student gets half of something and must find their match in the room | deal | Nothing on the device beyond the deal; a "found my partner" tap and a projector count. An off-screen mechanic by design | knob |
| **Live AI narrator (choose your path)** | The AI tells a story beat, the class votes, it continues | Deferred design in DEFERRED-IDEAS.md: a loop of ai-process, reveal, vote | A story-beat AI task with memory of its own last beat; no new phase | compute + recipe |
| **Confidence after the answer** | Answer, then say how sure you are, then see both | rate; compareTo for a repeated vote | A second quick scale bound to the previous answer, charted together | knob on rate |
| **Think time with a silent clock** | "Two minutes, no typing, then we talk" | announce with a timer | Nothing; worth a brick name ("quiet time") so the storyboard uses it | brick |
| **Scoreboard across activities** | Points carried from one activity to the next class period | leaderboard sums rounds inside one room | Cross-room state; against the no-stored-student-data rule unless kept in the teacher's browser | out of scope for now |

### Not on the list on purpose

Bingo cards, boards, maps, drag-to-a-picture, audio, video recording, animations, timers that race: every one needs an asset or a drawn surface, which is the line the thesis draws. The drawing input stays the one exception.

## What this suggests

- **The engine is ahead of the Create page.** Fourteen blocks exist that no typed idea can reach. Part 2A is the cheapest capacity the project has: pure prompt and compiler work, each with a golden prompt and a live three-of-three.
- **Most "missing" mechanics are one knob away.** Groups by answer, minority routing, a correct order, two reviewers, roster candidates, quiz items from a step: six knobs that unlock a dozen teacher routines from the review lists (accusation vote, two-piece peer review, minority turn, sort into groups, knockouts, student-written quizzes).
- **Two small compute steps (tally, random pick) plus display styles** cover the word cloud and the cold call, the two most-asked projector tricks with no block behind them.
- **A brick needs a name a teacher would use.** Half the probe's declines were blocks that existed; naming is the work.
