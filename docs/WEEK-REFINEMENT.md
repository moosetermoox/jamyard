# Refining Lanyard: three questions I needed to answer

**Max Cady — project refinement, week of July 27, 2026**

---

## The project, briefly

Lanyard is a tool for running interactive activities with a class. The teacher projects a screen at the front of the room; every student joins on their own device. The teacher moves the class through a sequence of steps — answer this, pass it to a classmate, merge your answers, vote, look at what we made.

The bet is that **a class thinks better together than thirty students think alone**, and that the software's job is to make that collectivity structural rather than aspirational. There are currently 40 activities and 18 "recipes" (fill-in-the-blanks templates), and the first real classroom tests are in August.

Coming out of last week's presentations, I had a nagging sense that I could describe what Lanyard *does* far better than I could say why it should exist. So the three questions below are all versions of the same worry: **is this actually different, and if it is, why can't anyone tell?**

---

## Question 1 — Is there anything here that other tools structurally cannot do?

### Why this was the first question

I had been telling people "it's not just a quiz tool" without being able to finish the sentence. Kahoot, Blooket, Gimkit, Curipod, Slides With Friends, Pear Deck, Nearpod, Mentimeter, Quizizz and Padlet all put questions on student devices and answers on a projector. If my honest answer was "mine is nicer," the project isn't worth a year.

### What I did

I audited ten competing products against their own documentation rather than their marketing. For Slides With Friends — the closest competitor to my positioning, since they sell social icebreakers rather than quizzes — I went further and read their production JavaScript and their public deck API, because I wanted proof rather than inference.

I tested each product against two questions:

1. **The chaining test.** Can something a student writes in step two become the *material* of step five — the thing another student has to respond to, rate, extend, or argue with?
2. **The no-winner test.** Is there any activity where the class shares an outcome instead of ranking against each other?

### What I found

**On chaining, my original claim was too strong and the corrected version is sharper.** I had assumed no competitor could feed student responses forward at all. Three can — Kahoot's Brainstorm, Mentimeter's "vote on responses," and Curipod's voting round, where each student is shown two classmates' answers and picks one. Curipod's version is genuinely well designed.

But all three are the *same* instance of the pattern, all three chose the cheapest version of it (rate the responses), and in all three the result routes nowhere afterward. No product lets a teacher *compose* a structure where responses become addressable inputs. The precise claim:

> Three vendors hardcoded exactly one collect-then-rate chain. None of them lets the output of that chain feed anything downstream, and none lets a teacher build a different chain.

For Slides With Friends I could prove the ceiling rather than infer it. Every interactive component in their product filters the response pool by the current slide's position — a slide is architecturally incapable of seeing any response but its own. Their deck format has no field for "what comes next" and no way for one slide to reference another. It is a flat list by construction.

A telling piece of evidence came from Mentimeter's own public feature-request board, where a request to reuse word-cloud responses on a later slide — "populate the wordcloud on slide 2 and then look at it again on slide 12" — has sat open and untriaged since August 2023. Worth recording against my own argument: a separate long-standing request, to let students vote on each other's open-ended answers, *was* eventually built. So the gap isn't that these companies can't do peer interaction. It's that even the most trivial imaginable form of one slide referring to another still doesn't exist.

**On the no-winner test:** Kahoot, Pear Deck and Curipod all have scoreless question types, so "no score" is not a differentiator. But scoreless is not the same as cooperative. Not one product has an activity where the class succeeds or fails as a unit. Blooket has no scoreless mode for live whole-class play — every hostable mode competes for points, gold or survival, and its one non-competitive option is solo homework. Gimkit's own site describes it as "a game show for the classroom that requires knowledge, collaboration, and strategy to win." Slides With Friends scores even its social voting.

### The answer

Lanyard's difference is three specific moves, and I can now name them:

- **Addressed** — a student receives a *specific, assigned* classmate's work. This is the claim I had to weaken when I checked it: Curipod does send different content to different devices, showing each student two randomly drawn classmate responses to choose between. But sampling from a pool is not assignment. Lanyard hands a student one particular person's work, guarantees every student's contribution lands with someone, avoids repeat partners across rounds, and can route the result back to its original author at the end. The difference is between *seeing some classmate's answer* and *being responsible for a named one*.
- **Chained** — what the class wrote in step two is the ballot, the raw material, or the argument in step five.
- **Shared fate** — the class has one outcome. Giving this up means giving up the leaderboard, which is the entire engagement model competitors are built on.

### How it changed the project

Two things I hadn't planned. First, a compliance finding that turned out to be strategic: Kahoot's own documentation states that "due to data protection regulations, students under the age of 16 cannot interact with free-form questions," citing GDPR, COPPA and FERPA. The restriction applies to individual K-12 plans, free and paid alike; the way around it is a district-level EDU subscription. So Kahoot's entire free-text feature family is unavailable to precisely the teacher I am building for — the individual one, without a district purchase order. Work I had filed under "boring obligation" — never sending student names to the AI, scrubbing identifying text, requiring teacher approval before anything reaches the projector, letting classroom data expire — is actually **permission to offer what the market leader cannot**.

Second, a warning. A competitor called Along is being discontinued for the 2026-27 school year, and its parent organisation's announcement attributes this in part to educator feedback about the difficulty of adding yet another tool and workflow. (I could not open that page directly to confirm the exact wording, so I am paraphrasing rather than quoting.) It did not lose on concept. My benchmark isn't "better than Kahoot," it's **less friction than a paper handout**.

---

## Question 2 — If the difference is real, why can't anyone see it?

This turned out to have two separate answers, one about the activities and one about the builder.

### 2a. The library was arguing against the engine

I counted how often each type of step appeared across all my activities. The result was uncomfortable:

- **Leaderboard: 18 uses.** Scoring, winners and eliminations: 8 more.
- **Merge, cooperative counting, rating, turn-taking, checklist: one use each** — every one appearing only in the single activity it was built for.

Eighteen of thirty-six activities ended in a score, a winner, or an elimination. Three of the nine activities featured on the public front page ended in a leaderboard. **I had built every distinctive capability and then never used any of them again.** A visitor to the site had no way to perceive the thing I'd spent months building, because nothing on the front page demonstrated it.

This was a content problem, not an engineering problem — which is the good kind. I built three activities that each demonstrate one of the three moves:

- **Whose Eyes?** — the class names everyone a topic touches, then each student is handed a *different* classmate's suggestion and has to think, feel and question from inside it. Thirty perspectives instead of the five a class discussion produces. (Addressed.)
- **Someone's Got You** — everyone shares one small true thing, an assigned classmate writes one line of encouragement back, and the teacher reads every line before any of it appears. Nobody is picked last, because nobody is picked. Scores are impossible in this activity by design, not by convention. (Addressed, shared fate.)
- **Both Sides of the Rope** — students take a position, gather evidence for *both* sides, ask "what if," then vote again. The payload is the difference between the two votes: the class watches its own mind move. (Chained.)

Alongside those: the featured set was rebalanced, all thirty-six activities were tagged so the "I want to connect" filter actually finds anything, and connection activities now carry a visible "no scores, no winners" badge — a promise the system already enforced but nobody could see.

### 2b. The builder is the front door for an audience that mostly doesn't want to build

This is the harder half, and it's the question I most want to be wrong about, because the builder is the part I'm proudest of.

Right now the home page offers two things: host an activity, or build one. The builder has been treated as the product — a visual editor, a plain-English "describe what you want" flow, an AI generator, a recipe system. All of it assumes teachers want to author.

Almost every piece of evidence I gathered says they don't:

- The New Games movement of the 1970s is the closest historical analogue to what I'm attempting. Its founder, Bernie DeKoven, wrote afterward: *"The one aspect of New Games that we had the most difficulty communicating was the idea that people could create their own. The New Games movement largely became based on a fixed, and eventually closed repertoire of games. That was very much contrary to what we (and certainly I) wanted to communicate."*
- Kahoot's real product is a search box over millions of pre-made quizzes, not its editor.
- Curipod's entire pitch is that the AI writes it for you.
- Gimkit ships a genuinely powerful visual builder and I found no evidence of teachers using it at scale.
- Along died citing workflow cost.

And my own evidence is weak: my sample of teachers who enjoy authoring is one, and he writes code.

**My current answer** is to invert the hierarchy. The library becomes the product; the builder becomes a layer you opt into. A teacher arrives, filters by what they want to do today ("connect," "review," "reflect"), and runs something in under a minute. The builder still exists in full, but you *ask* for it — you request to become a builder — rather than being shown a blank canvas you didn't want.

Two reasons this is more than cosmetic. It changes what "success" means: a good week becomes a hundred activities *run*, not ten activities built. And requesting to build is a signal — the teachers who ask are exactly the ones worth talking to, which gives me a feedback channel I currently don't have at all, since the project has no accounts.

The risk is real and I should name it: I might simply be describing my own preferences as market research. The test is cheap, though. If teachers who never touch the builder still come back, I'm right. If the only returning users are the ones who built something, I'm wrong and the builder belongs in front.

---

## Question 3 — Is the structure the intervention, or is the content?

### The finding that unsettled me

The best-known research on structured connection between strangers is Aron, Melinat, Aron, Vallone and Bator (1997), in which pairs of strangers asking each other escalating personal questions ended up measurably closer. It is the study behind "the 36 questions that lead to love," and it is the intellectual foundation of the connection activities I've built.

The part that matters is the control condition. Control pairs got the *same* random pairing, the *same* forty-five minutes, and the *same* three-set structure — with small-talk questions instead of personal ones.

I initially recorded this as "the control produced no effect," and when I checked the paper that turned out to be wrong in a way worth reporting. Small-talk pairs finished at 3.25 on a seven-point closeness measure; the disclosure pairs finished at 4.06. That is a significant gap — roughly nine-tenths of a standard deviation — but it is not nothing on the control side. Structure clearly did some work.

What I can't get around is the authors' own conclusion: the effect "is not simply a matter of putting two people together in any kind of structured interaction for 45 min."

Structure got them into the room. The questions did the rest.

### The uncomfortable arithmetic

I have twenty-eight types of step and one bank of prompts. Whatever makes an activity land is almost entirely in the wording of the question, and I've treated wording as the garnish on the engine.

Question 2b makes this worse rather than better. If teachers mostly don't author — and I now think they mostly don't — then nobody else is going to write those prompts. **The prompt library isn't a nice-to-have around the product. It may be the product, and it is currently one file.**

### Where I've got to

Partial progress: every new activity now ships with a working default, so a teacher can open it and run it without writing anything. That's the right instinct — it beats a paper handout on friction — but a *default* is not the same as a *good, tested bank of prompts for a real topic*.

I don't consider this resolved, and I'd rather present it unresolved than pretend. What I'd do next, in order:

1. Write real prompt banks for the three or four activities most likely to be used weekly, and treat that as engineering work with a schedule, not as copywriting to be done later.
2. Stop counting features and start counting prompts.
3. Test the Aron distinction directly, since I can: run one activity with careful prompts and the same activity with bland ones, and see whether the room feels different. If it doesn't, my thesis is weaker than I think — and I'd want to know that before August, not after.

---

## How this refined the project concept

**Before this week**, I would have described Lanyard as: *a flexible framework for building classroom games, where AI helps process what students write.*

**Now**: *a library of activities in which a class's own words become the material of the next five minutes — because doing it together is the point, not the packaging. The builder exists for the few who want it.*

Three concrete shifts:

- **From engine to library.** The capability is built. What's scarce now is activities and prompts worth running, and a front door that shows them.
- **From "flexible" to three specific claims.** *Addressed, chained, shared fate.* Each one is demonstrable, each one is now visible on the front page, and each one is something I can show a competitor cannot do.
- **From compliance-as-obligation to compliance-as-moat.** Not sending student data where it doesn't belong is the reason this can be offered to the classrooms Kahoot has to turn away.

**What I shipped this week** as a direct result: the three new activities described above, a rebalanced front page, tags across the full library, the no-winner badge, and three engine capabilities the new activities needed — including one that lets a piece of writing travel through several classmates and come back to its author with everyone's additions attached.

---

## What I still don't know

Stated plainly, because these are next week's questions:

1. **Is it any good with actual teenagers?** Every activity has been verified by automated simulation, which proves it doesn't crash. It proves nothing about whether a fifteen-year-old types "idk" and the room goes flat. No student has used this. That is the largest untested assumption in the project and the cheapest to fix.
2. **Are students allowed to have devices?** At least 38 states and the District of Columbia now require districts to ban or restrict student phone use, and 19 states plus D.C. mandate full "bell-to-bell" storage for the entire school day. My design assumed phones *or* Chromebooks; the phone half is unavailable in much of the country. This probably means Chromebook-first — and it may be an opportunity, since those laws were passed specifically to restore face-to-face connection in schools, which is the argument I'm making.
3. **Can reflection survive my own privacy rules?** The most valuable reflective activities compare what a class thought before to what it thinks after. My privacy design deliberately destroys classroom data when the session ends. Those two commitments are in direct conflict and I haven't resolved it.

---

## A note on method

Per the assignment's encouragement, I used AI as a thought partner throughout — but specifically as a *researcher and adversary* rather than a writer. It audited ten competitors against primary documentation, read a competitor's source code to prove a structural limit I could otherwise only assume, gathered the historical and pedagogical material, and then challenged seven assumptions I had not asked it about. Questions 2b and 3 in this document came directly out of that challenge and were the two I least wanted to hear. I then ran a separate verification pass over every external claim in this document, which was worth doing: it caught four errors, including one where I had overstated a research finding in my own favour and one where I claimed a competitor couldn't do something it had since shipped. Both corrections are shown above rather than quietly removed, because the corrected versions are the more interesting arguments.
