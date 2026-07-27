# Comparative Advantage

*Written 2026-07-27. Positioning thesis + a slate of activities that only Lanyard can run.*
*Raw research: [research/deepfun-notes.md](research/deepfun-notes.md), [research/project-zero-notes.md](research/project-zero-notes.md).
Companion docs: [PEDAGOGY.md](PEDAGOGY.md) (why this is good for learning), [DESIGN-PHILOSOPHY.md](DESIGN-PHILOSOPHY.md) (why the engine looks like this).*

---

## 0. The one-paragraph version

Every classroom response tool on the market is a **collector**: student -> system -> teacher.
Some of them let students see an aggregate of each other's answers. Three of them let students rate each other's answers, once, inside one welded-shut activity type. **None of them lets a class's own words become the material of the next five minutes.** Lanyard's moat is not "students can see each other's answers" — seven competitors do that. It's that Lanyard can *address* a student (here is **Maya's** idea, specifically, and you are the one who has to extend it), *chain* (what the class wrote in step 2 is the ballot in step 5), and *share fate* (we succeed together or we laugh and try again). Those three moves are the entire vocabulary of connection, reflection, and collaborative learning — and the market cannot express any of them.

---

## 1. What the competition actually is

Verified July 2026 against vendor documentation, and for Slides With Friends against their production JS bundles and public deck API. Full evidence in the research notes.

### The chaining test

| Product | Can student responses become the input to a later step? |
|---|---|
| Kahoot | **Once.** Brainstorm: submit -> AI groups -> peers vote -> 1000 pts/vote. One question type. Winners route nowhere. Paid. |
| Mentimeter | **Once.** "Vote on Responses" — one slide, one round, rate-only. |
| Curipod | **Once.** Post-brainstorm voting: each student gets 2 random responses, picks one, repeat. Genuinely good design. Terminal — nothing consumes the winners. |
| Slides With Friends | **No.** Proven from source: every interactive component filters `responses` by `slidePosition === this.slide.order`. A slide can only ever see its own responses. The deck schema has no `next`, no branch, no reference field. |
| Nearpod | **No.** Collaborate Board is the best peer surface in edtech — students post, see each other, heart them, comment (Premium Plus). But nothing can *seed* it from prior responses. |
| Pear Deck / Wayground (Quizizz) / Blooket / Gimkit / Padlet / Poll Everywhere | **No.** Not in any documented activity type. |
| Kialo Edu | Partial — recursive claim tree, and "write claims under others' claims" is a *system-enforced, countable* task. But temporal control is a start date and a deadline. No phases. |

**The single best piece of evidence:** Mentimeter's public feature board has "Reuse Wordcloud responses on another slide" open since 2023, and "Upvote/downvote on open-ended questions" sitting at *under review since 2020*. Users have been begging for the most trivial imaginable cross-slide reference for six years and it does not exist.

**Nobody ships:** rotation chains, non-repeat pairing, pair-scoped reveal, merge/shared draft, relay, foreach-over-peer-responses, branching by vote outcome, a reference syntax, conditionals. Lanyard has all nine.

### The no-winner test

- **Kahoot:** scoreless question types exist (poll, word cloud, open-ended, scale). Brainstorm is *not* one — 1000 points per vote received.
- **Blooket:** no scoreless mode exists. 25+ modes are skins over one multiple-choice/typing loop.
- **Gimkit:** self-describes as requiring "knowledge, collaboration, and strategy to **win**." One Way Out is a whole-group win — still a win condition.
- **Slides With Friends:** scoring is pervasive and structural (`isScorable`, `voteScoreMultiplier`, speed tiebreaks, cumulative event leaderboard). Even `userVote` is scorable.
- **Curipod, Pear Deck, Mentimeter question slides:** genuinely scoreless. But scoreless is not cooperative — there is no activity in any of them where the class has a shared outcome.

**Nobody has a cooperative primitive.** Lanyard has `one-voice` (shared success/failure, collision resets, no winner) and `merge` (one output per group, agree-to-submit), plus a validator that *permanently rejects* leaderboard/winner/eliminate/wager/graded scoring on `family:"connection"` activities. That last part is the interesting one: it's a promise enforced by code, not a marketing claim.

### Three findings that change the strategy

1. **Harmony SEL is the demand proof, and it runs on paper.** Rotating non-repeat partner prompts ("Buddy Up"), CASEL-listed, used at scale, free — implemented as physical cards. That is `rotatePairsFrom`. The demand for this software is established; the software has never been built.

2. **Kahoot legally cannot do free text in ordinary K-12 classrooms.** Their own docs: "Due to data protection regulations, students under the age of 16 cannot interact with free-form questions... to ensure compliance with the GDPR, COPPA, FERPA." A support agent, Feb 2025: word cloud "is not currently available with our current individual K-12 school plans due to Children's Data Privacy laws." Their entire peer-visible family is locked out without an EDU subscription. Lanyard's compliance work (pseudonymous IDs to the LLM, PII scrub at the API boundary, teacher preview gate before class-wide reveal, room state that dies with the room) is not overhead — **it is permission to sell the thing the market leader can't ship.**

3. **Along died of workflow cost, not concept.** Gradient Learning's own sunset note quotes educators saying it was "difficult to add another tool and workflow to engage students." The bar is not "better than Kahoot." The bar is **lower friction than a paper Buddy Up card.** Every design decision below is filtered through that.

Also worth knowing: Classcraft was killed by its acquirer (HMH, June 2024) — a seven-year power user's post-mortem opens *"there is absolutely nothing that does what Classcraft did."* Flip retired Sept 2024. There is a real vacuum here, and ISTELive 26's Best of Show had **zero** SEL/belonging/community winners.

---

## 2. What Lanyard's library actually looks like right now

36 built-in activities. The phase-usage census is the honest diagnostic:

```
announce 83 | collect 51 | reveal 33 | ai-process 20 | leaderboard 18 | foreach 11
vote 8 | collect-choice 6 | reveal-one 5 | winner 5 | preview 4 | turn 3 | eliminate 3
team-split 2 | estimate 2 | sort 2 | match 2
rate 1 | rank 1 | relay 1 | checklist 1 | buzz 1 | one-voice 1 | merge 1
```

**Every distinctive primitive is used exactly once — in the game that shipped it.** `merge` appears in Snowball and nowhere else. `one-voice` in One Voice. `rate` in Class Critique. `relay` in Dream Vacation. Meanwhile `leaderboard` appears 18 times and `eliminate`/`winner` eight more.

Roughly 20 of 36 activities end in a score, a winner, or an elimination. Three are `family:"connection"`. Of the 9 **featured** activities on the public front door — the ones a first-time visitor sees — five read as quiz or competition (Speed Quiz, Vocab Match, Who Said It, Story Quest, Art Gallery).

> **The library currently makes the argument that Lanyard is a nicer Kahoot. The engine makes a completely different argument. Nobody visiting the site can see it.**

This is a content problem, not an engine problem — which is good news, because content is the cheap thing to fix before August.

---

## 3. The thesis, stated so it can be tested

**Doing it together beats doing it alone, and "together" has three distinct mechanical meanings.** Lanyard should own all three; competitors own none.

| Move | What it means mechanically | Existing primitives | Why the market can't copy it |
|---|---|---|---|
| **Addressed** | You get a *specific* named classmate's work, not a pool | `rotateFrom`, `assign:"pairwise"`, `rotatePairsFrom`, `reusePairsFrom`, `reveal scope:"pair"` | Requires per-recipient payloads. Every competitor broadcasts one payload to all devices. |
| **Chained** | Step 5's ballot is step 2's output | `{{phase.field}}` resolver, `foreach`, `seedFrom`, `choicePool`, `nextByWinner` | Requires a reference grammar and a phase graph. Competitors have flat ordered decks. |
| **Shared fate** | The class succeeds or fails as one | `one-voice`, `merge` + `agreeMode`, `family:"connection"` validator | Requires giving up the leaderboard, which is their entire engagement model. |

Three supporting claims worth defending:

- **The projector is documentation, not decoration.** Project Zero's fifth feature of documentation: *"Documentation is not only retrospective, it is also prospective. It shapes the design of future contexts for learning."* Feed-forward is a literal machine implementation of that sentence. A reveal that just lists 30 responses is a **display**; documentation needs an interpretation layer (clustering, frequency, spread), a prospective hook (output feeds the next phase), or a process trace (before/after movement). *Worth a "Check for Errors" warning rule.*
- **The teacher is the low-visibility referee.** DeKoven ran New Games with two: a high-visibility one kindling enthusiasm and teaching rules, and a low-visibility one "explaining the game to stragglers, inviting people in or out... modeling how to play" — and *"as soon as enough people were playing, the high-visibility referee would leave."* That is exactly the host screen (high-visibility, should get out of the way) and the teacher console (low-visibility, never leaves). This architecture is already right; the docs should say why.
- **The play community changes the rules; the sports community changes the players.** DeKoven: *"In the sports community, the rules and officials decide if the players are good enough to play. If not, they change players. In the play community, the players decide if the game is good enough to play; if not, they change rules... Every game in the play community is continually being designed."* The teacher-facing editor is not a feature, it's the thesis. And DeKoven's own post-mortem is the warning: *"The one aspect of New Games that we had the most difficulty communicating was the idea that people could create their own. The New Games movement largely became based on a fixed, and eventually closed repertoire."*

---

## 4. Licensing gate — read before naming anything

**Harvard Project Zero: 89 of 95 toolbox routines are CC BY-NC-ND 4.0.** The binding clause is **ND**, not NC. Section 2(a)(1)(B) permits reproduction but *"not Share, Adapted Material."* Splitting a routine's steps across host/player screens, adding timers, adding AI clustering, and shipping it **is** Adapted Material. Being free does not help — free addresses NC, not ND. Section 6(a) terminates retroactively if you monetize later.

**The safe path, and it's a clean one:**

1. **Ship the shape, write your own words, use your own name.** 17 U.S.C. 102(b) excludes "procedure, process, system, method of operation" from copyright. The *method* — observe -> interpret -> question; write -> pass -> add one -> return — is unprotected. Only PZ's *expression* is protected.
2. **Never ship PZ's PURPOSE / APPLICATION / LAUNCH prose.** That's the unambiguously protected part, and unfortunately it's the part you most want (the collective mechanics hide there). Extract the mechanic, discard the sentences.
3. **Zero use of "Project Zero," "Harvard," "Visible Thinking," "Making Thinking Visible," or the shield.** Section 2(a)(6) also forbids implying endorsement. Hard line regardless of the copyright analysis.
4. **Link out** to the PZ page for teachers who want the original. Free, safe, good for them.
5. **Email `pzlearn@gse.harvard.edu` before public launch.** There is no permissions page (`/terms`, `/permissions`, `/copyright`, `/legal` all 404) and no precedent — no commercial ed-tech product has a disclosed PZ arrangement. A written yes beats every inference above. Mention that **Artful Thinking is CC BY-NC with no ND**, and carries 18 routines that also appear in the toolbox under BY-NC-ND — the same routine under two conflicting licenses is a good-faith opening, not a defense.

**Do not touch at all** (third parties hold rights PZ can't clear): Step Inside; What Makes You Say That?; The Story Routine; Ladder of Feedback (Wiley/Perkins); Micro Lab Protocol (NSRF/Weissglass, not PZ). Chalk Talk is murky (adapted from Hilton Smith of the Foxfire Fund; no copyright line on the PDF).

**Other sources:**
- **Liberating Structures** — CC BY-NC. The NC clause bites if Lanyard ever charges. Attribute Lipmanowicz & McCandless on any derived recipe card. ("Positive Gossip" is separately CC BY-SA 4.0 — cleanly reusable.)
- **DeKoven / deepfun.com** — in copyright, maintained after his 2018 death. Quotation with attribution and URL is fine (that's what the research notes do); reproducing whole essays is not. If his ideas become load-bearing in PEDAGOGY.md, **credit him by name in the docs and in-product.**
- **Board games** — mechanics aren't copyrightable (102(b), *Baker v. Selden*); rulebook *prose* and *titles* are. Never ship "The Mind," "Just One," "Wavelength," "Codenames," or "Hanabi" as a product name.

**Operating rule: ship the mechanic, write your own words, use your own name, credit the source in the docs.** *(Not legal advice.)*

---

## 5. The activity slate

All 14 are **buildable today** with the 28 shipped phase types — no engine work. Ordered by leverage. Each names what it borrows, but every prompt gets rewritten in Lanyard's own voice per section 4.

Legend: [C] connection/no-winner | [R] reflection | [T] collaborative thinking | ~ estimated class time

---

### Tier 1 — build these first (highest differentiation per minute of work)

**1. Whose Eyes? [T][C] ~12min** — *borrows the perspective-circle move*
```
collect  "Name one person, creature, or thing affected by <topic>."
   |
collect  rotateFrom: viewpoints        <- each student gets a DIFFERENT classmate's answer
         fields: ["From this viewpoint, I think...",
                  "From this viewpoint, I feel...",
                  "A question I'd ask from here is..."]
   |
reveal-one   (host reveals one voice at a time)
```
The class *becomes* the circle — 30 perspectives, not the 5 a discussion produces. `rotateFrom` guarantees no two students get the same viewpoint, which is the exact thing no competitor can do. Works on any topic in any subject: a historical decision, a chemical spill, a novel's climax, a school policy.

**2. Someone's Got You [C] ~10min** — *borrows the "warm shower" appreciation structure*
```
collect  "One thing you're working on or proud of this week." (passAllowed)
   |
collect  rotateFrom: notes
         "Read your classmate's note. Write one line of genuine encouragement."
   |
preview  <- TEACHER GATES EVERY LINE (non-negotiable)
   |
reveal-one
```
Every student receives exactly one, nobody is missed, nobody is chosen last. `family:"connection"` so it can never grow a leaderboard. **The teacher preview gate is a requirement, not an option** — same rule as drawings. This is the single highest-value advisory activity in the slate and it takes ten minutes to build.

**3. Both Sides of the Rope [T] ~15min** — *borrows the tug-of-war-for-truth move*
```
collect-choice  "Where do you stand?"  [Yes / Lean yes / Not sure / Lean no / No]
                (host shows a counter, not a tally — no anchoring on the first vote)
   |
collect  fields: ["Which side does this pull?", "Your evidence"]
   |
reveal   the rope, weighted, both sides visible
   |
collect  "A 'what if...?' question about the rope itself."
   |
collect-choice  same stance question again
   |
reveal   THE DELTA — "we went 60/40 -> 45/55"
```
The stance delta is the payload and no competitor can compute it (Mentimeter's Segmentation is the closest thing in the market — and it's a teacher-facing cross-tab that never changes what a student is asked). Note the two opposite reveal disciplines in one activity: **commitment steps hide until close; generative steps accrete live.** `collect-choice` already gets this right by default (its host toggles are prompt/image/video/counter/timer/closeButton — there is no live tally to anchor on), and `collect` has `simultaneousReveal` for the same purpose. But the discipline is currently an accident of two separate defaults rather than a concept a teacher can see. Make it a first-class editor idea. *Verified: `simultaneousReveal` and `passAllowed` exist on `collect` only, not on `collect-choice`.*

**4. One More Thing [T] ~10min** — *borrows the pass-and-elaborate move*
```
collect  "Three things you remember from <lesson>. From memory — no notes."
   |
collect  rotateFrom: recall  "Here's a classmate's list. Add ONE thing they missed."
   |
collect  rotateFrom: add1    (different classmate, again)
   |
ai-process (compare)  cluster the additions
   |
reveal   "Here's what the class collectively remembered."
```
Retrieval practice that is structurally social. *Engine note: the full original routine returns each sheet to its author with all additions attached — that needs `prefillFromAssigned` + a return-to-author reveal. See section 7. This version works today and is still good.*

---

### Tier 2 — strong, subject-agnostic, easy

**5. Word / Phrase / Sentence [T] ~10min** — the AI-clustering showcase
`collect` with `fields: ["A word", "A phrase", "A sentence"]` from any text -> `ai-process(compare)` -> `reveal` themes -> `collect` "What did we choose *not* to notice?" The overlap **is** the finding; the frequency chart is the lesson. Works on a poem, a primary source, a lab writeup, a news article.

**6. Claim -> Support -> Question [T] ~15min** — three-hop rotation
`collect` your claim -> `rotateFrom` *someone else's* claim, find support for it -> `rotateFrom` again, a third student questions both. Structurally impossible to "just agree or disagree," because you are never arguing with your own position. Social studies, science, ELA.

**7. Red Flag / Yellow Flag [T] ~8min** — media literacy, uses `sort` as-is
`sort` in consensus mode over 6-10 headlines or claims, buckets `[Red flag, Yellow flag, Looks fine]`. Per-item class distributions *are* the discussion. Then one `collect`: "Which one did we disagree about most, and why?"

**8. Where Do You Stand? [T][R] ~10min** — variance as the content
Three or four `estimate` steps in poll-the-room mode (no answer set) — "0 to 100: how much do you agree that...". Host shows the mean **and the spread**. High spread = the one to discuss. A continuous cousin of `sort` that no competitor can render, because nobody else has a scoreless numeric distribution.

**9. Chain Poem [T][C] ~10min** — *borrows linked-verse (renga) alternation*
`collect` line one -> `rotateFrom` "answer the line you were given" -> `rotateFrom` again -> `reveal` all chains. Two alternating jobs (open a move / close a move) is a far better scaffold than "write a poem." Real ELA curricular cover, zero AI, zero scoring.

---

### Tier 3 — connection-family and norms work

**10. Bring Me a Problem [C] ~12min** — *two-person consulting, borrows the turn-away move*
`collect assign:"pairwise"` "One thing you're stuck on" -> `reveal scope:"pair"` -> `collect reusePairsFrom` "Your partner's stuck. Three questions you'd ask — questions, not advice" -> `reveal scope:"pair"`. The classic version has the client physically turn away so they can't get defensive; **in text that separation is free and perfectly enforced.**

**11. How to Ruin This Class [C][R] ~12min** — *borrows the TRIZ inversion*
`collect` "Describe the worst possible version of this class" -> `merge` (pairs, `agreeMode:"both"`) -> `reveal` -> `collect` "Which of these do we already do, a little?" Permission through absurdity: the earnest question ("how could this class be better?") gets nothing; this one gets everything. Safest known way to let students critique a classroom. `family:"connection"`.

**12. First Word, Same Word [C] ~6min** — *borrows the mind-meld convergence move*
`collect assign:"pairwise"` + `simultaneousReveal`, one word each -> `reveal scope:"pair"` -> `collect-choice` "Did you match?" -> repeat with `reusePairsFrom`. Convergence under simultaneity: you can't win by conceding, only by modelling the other person's mind. **Strictly better on a server than in person** — simultaneity is guaranteed rather than policed. Host shows a wall of pair-cards lighting up.

**13. Three Whys [R] ~10min**
Three *sequential* single-field `collect` steps — why might this matter to me / to people around me / to the world — then `ai-process(compare)` and a reveal of what this class collectively cares about. The clustering step is expensive on paper and free here.

**14. Then and Now [R] ~lesson-length**
`collect` "What do you think you know about <topic>?" -> `announce` (teacher teaches, taps Continue when done) -> `collect` "What do you think now? What changed your mind?" -> `reveal` both. The before/after trace is documentation in PZ's sense — it shows *learning*, not activity.

---

## 6. What to do with the shopfront

The slate is worthless if the front door still says "quiz tool."

1. **Rebalance the featured 9.** Currently 5 of 9 read as quiz/competition. Target roughly 3 connect, 2 reflect, 2 create/discuss, 2 review-or-energize. Keep Speed Quiz and Vocab Match (they earn trust and teachers search for them) — but the first row a visitor sees should include Whose Eyes?, Someone's Got You, and Snowball.
2. **Tag everything.** Only ~14 of 36 configs carry goal chips. The chips are the discovery surface for "I want to *connect*," which is the differentiated query. Untagged activities are invisible to it.
3. **Lead the copy with the verb, not the tech.** Not "28 phase types" — "the class's own words become the next five minutes."
4. **Honor the Along lesson.** Every Tier-1 activity needs a genuinely zero-prep default: open it, project it, go. If a teacher has to write six prompts first, it loses to a paper card. The recipe layer already solves this — every activity in section 5 should ship *with* a recipe, not just a config.
5. **Name the no-winner family in the UI.** `family:"connection"` is enforced by the validator but invisible to a browsing teacher. A "no scores, no winners" badge is both a filter and a promise.

---

## 7. The small engine asks these surfaced

None of section 5 is blocked on these. They're ordered by unlocked-activities-per-line-of-code.

1. **`prefillFromAssigned` on `collect`** — drawings already preload onto the recipient's pad; text does not (it renders read-only above an empty box). One flag makes accumulating chains work: pass-and-add-a-line, collaborative lists, exquisite-corpse-with-context. *Highest value per line in the whole report.*
2. **Return-to-author reveal** — after N rotations, show each student what became of the thing they started. `rotateOffset` can't express it (the return offset depends on live player count). Unlocks the full pass-and-elaborate routine and the drawing-chain lineage reveal that Telephone Pictionary has been waiting on.
3. **`merge` with `groupSize: 3`** — currently 2 or 4 only. Trios are the canonical size for consulting/listening protocols (one speaks, two listen), and `oddHandling:"triple"` proves the pairing engine can already form them.
4. **Append-only mode on `merge`** — last-write-wins is right for a shared draft, wrong for a shared *board*. An append variant gives a silent-conversation board where students add to each other's ideas without overwriting.
5. **`revealTail` on `rotateFrom`** — show only the last N words (or mask strokes above a y-cutoff) so the recipient builds on a fragment. This is the exquisite-corpse mechanic; it removes authorial responsibility, which drops the participation floor to the floor.
6. **Per-group prompts on `team-split`** — every group currently gets the same next phase. Jigsaw structures (group A takes facts, group B takes values...) need divergent prompts.

---

## 8. Guardrails carried over from the research

- **Never build "who is MOST X," even flattering.** The harm vector isn't the wording, it's the public zero count — every student can tally their own votes. The safe inverse is incident-based: *who helped, what happened*. No scarcity, no expressible bottom.
- **Require the incident field.** One-word compliment boxes produce worthless output. "Kind" is noise; "stayed after to help me redo the titration" is not.
- **Shuffle every roster per device.** Alphabetical position measurably biases peer nominations, roughly twice as badly for negative ones. Worth a validator rule.
- **Don't claim the synchrony neuroscience.** There's a 60-experiment meta-analysis with a medium effect, but also a null school field experiment, an expectancy-effects critique, and nobody has tested network-mediated tapping. Claim the *structure* — shared fate, no winners, mutual attention — not the mechanism. Aron's own control condition is the warning: same pairing, same 45 minutes, small-talk content -> no effect. **Structure alone does nothing; the content is the intervention.**
- **Keep the freedom to quit.** DeKoven ran a literal hour of "Quitting Practice." `passAllowed` is that, and it should be the default on every connection-family collect — a pass must be byte-identical to a missing answer everywhere, including the journal.
- **Rotation beats volunteering.** Every activity above that assigns work does so mechanically. Nobody is chosen last, nobody has to raise a hand, and the shy student's contribution arrives on someone's screen whether or not they'd have spoken.

---

## 9. Suggested order of work

1. Build **Whose Eyes?** and **Someone's Got You** as configs + recipes. Both are pure `rotateFrom`; neither needs new engine code. Run them through the robot playtest and a chaos run. *(~one session)*
2. **Rebalance the featured set and tag every config.** Cheap, and it's what makes the rest visible. *(~an hour)*
3. Build **Both Sides of the Rope** — it's the most impressive single demo in the slate and the clearest "Kahoot cannot do this."
4. Ship **`prefillFromAssigned`**, then **One More Thing** and the return-to-author reveal.
5. Take three of them to the July proxy playtests. The feedback widget is already in place.
6. Email `pzlearn@gse.harvard.edu` before anything PZ-derived goes public.

---

*Sources for sections 1 and 4 are listed in full in [research/project-zero-notes.md](research/project-zero-notes.md) and [research/deepfun-notes.md](research/deepfun-notes.md).*
