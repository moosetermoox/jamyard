# Harvard Project Zero thinking routines — raw research notes

> **Raw research notes, gathered 2026-07-27** by a one-shot research agent (web research over pz.harvard.edu, ronritchhart.com, mlvpz.org, creativecommons.org, NSRF). Reproduced as written apart from JSON-unescaping. Source URLs are preserved inline and in the Sources list at the bottom. Nothing here is legal advice; the licensing section in particular is a research summary, not a legal opinion.

---

# Harvard Project Zero thinking routines — research report for a collective-response classroom platform

---

## 0. Headline findings (read these first)

1. **PZ's collective structure is almost entirely in the LAUNCH/APPLICATION prose, not in the routine steps.** The numbered prompts are written in second-person singular ("What do you see?"). The passing, rotating, aggregating, charting, and rounds instructions live in the tips section — which is exactly the layer that gets stripped out of every third-party summary of these routines. That is your unfair advantage: **you'd be building the part of PZ that almost nobody implements.** Only three routines have collectivity baked into the *steps* themselves: Chalk Talk, The Elaboration Game, and Think-Pair-Share.

2. **The single best philosophical hook for your product is PZ's fifth feature of documentation:** *"Documentation is not only retrospective, it is also prospective. It shapes the design of future contexts for learning."* ([mlvpz.org](http://www.mlvpz.org/index6e95.html)) — Your feed-forward architecture (responses becoming the candidate pool for the next phase) is a literal machine implementation of that sentence. No chart-paper classroom can do it.

3. **The `+1 Routine` is a byte-for-byte match for your existing `rotateFrom` primitive** — write, pass right, add one, pass, pass, return to owner. It's on pz.harvard.edu, CC-licensed, and you already have the engine. Highest-fidelity, lowest-effort shipping target in the whole toolbox.

4. **Licensing is the gate, and it's tighter than you'd hope.** 89 of 95 toolbox routines are **CC BY-NC-ND 4.0** — *NoDerivatives*. You may not publicly share adapted material, free or paid. The clean path is to paraphrase in your own voice and rename. Details in §1.

5. **The toolbox is exactly 95 routines** (confirmed via `POST https://pz.harvard.edu/thinking-routines/filter` with `{}`). Several routines you named — **Zoom In, Give One Get One, Question Sorts, Micro Lab Protocol** — are *not* PZ toolbox routines at all.

---

## 1. Licensing and attribution — the gating constraint

**Not legal advice.** Get a lawyer, or just email `pzlearn@gse.harvard.edu`.

### The standard block (89 of 95 routines, ~94%)

Verbatim, from [See, Think, Wonder](https://pz.harvard.edu/resources/see-think-wonder):

> © 2022 President and Fellows of Harvard College and Project Zero. This work is licensed under a Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International License (CC BY-NC-ND). This license allows users to share this work with others, but it cannot be used commercially. To reference this work, please use the following: The "See, Think, Wonder" thinking routine was developed by Project Zero, a research center at the Harvard Graduate School of Education

### What CC BY-NC-ND actually permits

From the [legal code](https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode.en), §2(a)(1):

> "(A) reproduce and **Share** the Licensed Material, in whole or in part, for NonCommercial purposes only; and (B) **produce and reproduce, but not Share, Adapted Material** for NonCommercial purposes only."

§3(a)(1): *"For the avoidance of doubt, **You do not have permission under this Public License to Share Adapted Material.**"*

**Practical translation for Lanyard:**

| What you want to do | Status |
|---|---|
| Reproduce a routine verbatim, unmodified, with attribution, in a free tool | ✅ Permitted |
| Split a routine's steps across host/player screens, add timers, add AI clustering | ❌ That's Adapted Material — ND blocks it, **at any price** |
| Same, but your product is free | ❌ Free helps on NC, does nothing on ND |
| Same, but you charge later | ❌❌ Loses NC *and* §6(a) auto-terminates the license retroactively over your prior distribution |
| Use the routine **name** only | ⚠️ Copyright: names/short phrases aren't copyrightable (37 CFR §202.1(a)). Trademark is the real exposure and is **explicitly not licensed** (§2(b): *"Patent and trademark rights are not licensed under this Public License"*) |
| Write your **own paraphrased prompts** for the same thinking move | ✅ **Clean.** 17 U.S.C. §102(b): copyright doesn't extend to "any idea, procedure, process, system, method of operation." "Observe → interpret → question" is an uncopyrightable method. |

### The one interesting loophole

**Artful Thinking is CC BY-NC — no NoDerivatives.** [pz.harvard.edu/projects/artful-thinking](https://pz.harvard.edu/projects/artful-thinking) and [pzartfulthinking.org](http://pzartfulthinking.org/?page_id=2) footer:

> "Artful Thinking by Project Zero is licensed under a Creative Commons Attribution-NonCommercial 4.0 International License."

Its Thinking Palette hosts 18 routines including See/Think/Wonder, Headlines, Connect/Extend/Challenge, Circle of Viewpoints, Step Inside, Parts/Purposes/Complexities, Claim/Support/Question, Think/Puzzle/Explore. **The same routines exist under two conflicting PZ licenses.** Don't bet on it (a court would likely read the newer toolbox terms as governing), but absolutely cite it if you email PZ for permission. Similarly, PZ's [Selecting a Thinking Routine](https://pz.harvard.edu/sites/default/files/Selecting%20a%20Thinking%20Routine%209%204%2021.pdf) tool is **CC BY-NC-SA** — derivatives allowed.

### Routines to avoid entirely (third parties hold rights PZ can't clear)

| Routine | Rights problem |
|---|---|
| [Step Inside](https://pz.harvard.edu/resources/step-inside) | **No CC license.** Adapted from DeCordova Museum + Underground Railway Theater (2002) |
| [What Makes You Say That?](https://pz.harvard.edu/resources/what-makes-you-say) | **No CC license.** Adapted from Yenawine (1998) |
| [The Story Routine: Main, Side, Hidden](https://pz.harvard.edu/resources/story-routine-main-side-hidden) | **"© 2020 Ron Ritchhart and Mark Church. All rights reserved."** |
| [Ladder of Feedback](https://pz.harvard.edu/resources/ladder-of-feedback) | No license block; PDF credits **David Perkins / John Wiley Press (2003)**. Treat as closed. |
| Micro Lab Protocol | **Not PZ.** Julian Weissglass / NCEE-UCSB, distributed by [NSRF](https://nsrfharmony.org/) and School Reform Initiative |
| Chalk Talk | PZ claims the standard block, but the page body says *"adapted from Hilton Smith of the Foxfire Fund"* and the PDF has no copyright line at all |
| Making the Future, Mapping Systems Experiences, Playing Around with Roles | **No copyright block at all** → default all-rights-reserved |

### Trademark

The CC license grants you **nothing** on "Project Zero," "Visible Thinking," "Making Thinking Visible," "Harvard," the shield, or the PZ logo. §2(a)(6) also forbids implying endorsement. Harvard is aggressive about marks. Hard line regardless of what you conclude about copyright.

### There is no permissions page

I verified exhaustively: [/who-we-are/faqs](https://pz.harvard.edu/who-we-are/faqs) has zero content on reuse. `/terms`, `/permissions`, `/copyright`, `/legal` all 404. No sitemap. **There is no precedent for what you're proposing** — the observable pattern is verbatim redistribution by non-profits with the PZ footer preserved (e.g. [Smithsonian Learning Lab](https://learninglab.si.edu/collections/project-zero-thinking-routines/oWYbEjpf19oxcFUp), [NMWA](https://nmwa.org/wp-content/uploads/2022/03/HPZ-Thinking-Routine-intro-and-supporting-docs.pdf)). No commercial ed-tech product with a disclosed PZ arrangement was found.

### Recommended posture

1. **Paraphrase and rename.** Your recipe layer already stores teacher-facing prompts as JSON params — write your own wording, give the recipe your own name, describe the *shape* in the description (uncopyrightable method).
2. **Never ship PZ's verbatim PURPOSE / APPLICATION / LAUNCH paragraphs.** Those are the unambiguously protected part.
3. **Link out** to the PZ page for teachers who want the original. Free, safe, better for PZ.
4. **Zero use of PZ/Harvard/Visible Thinking marks** anywhere in UI or marketing.
5. **Email `pzlearn@gse.harvard.edu`.** Given no permissions page and no precedent, a short "free classroom tool, here's what I'd like to do" email is the highest-value action available. Ask about commercial terms *now* so you don't reopen it later.

---

## 2. The philosophical frame — Ritchhart's 8 cultural forces + PZ on documentation

### 2a. The 8 forces

Three canonical namings exist; know which you're citing.

**2002 original** (*Intellectual Character*, via [Otterbein scan](https://www.otterbein.edu/wp-content/uploads/2019/10/8-Cultural-Forces.pdf)) — "THE 8 CULTURAL FORCES THAT DEFINE OUR CLASSROOMS," each with a "directed toward thinking by" clause. The one directly relevant to you:

> **Physical Environment** — "Making thinking visible by displaying the process of thinking and development of ideas. Arranging the space to facilitate thoughtful interactions."

**2015 book chapter titles** ([PZ's official one-pager PDF](https://pz.harvard.edu/sites/default/files/cot_8ForcesThatShapeGroupCulture_update.pdf)):
- EXPECTATIONS: Recognizing How Our Beliefs Shape Our Behavior
- LANGUAGE: Appreciating Its Subtle Yet Profound Power
- TIME: Learning to Be Its Master Rather than Its Victim
- MODELING: Seeing Ourselves through Our Students' Eyes
- OPPORTUNITIES: Crafting the Vehicles for Learning
- ROUTINES: Supporting and Scaffolding Learning and Thinking
- INTERACTIONS: Forging Relationships that Empower Learners
- ENVIRONMENT: Using Space to Support Learning and Thinking

**Current PZ definitions** (same PDF). The Environment one is the money quote for a projected host screen:

> "As a culture shaper, the physical environment is the **'body language' of an organization**, conveying its values and key messages even in the absence of its inhabitants."

**Important correction to a common assumption:** Ritchhart does **not** publish one canonical reflective question per force. The 2015 subtitles are declarative. What he publishes are goal-specific question sets — one for [agency](https://www.ronritchhart.com/s/CFs-and-Agency.pdf) (2025), one for [assessing a culture of thinking](https://www.ronritchhart.com/s/Assessing-a-Culture-of-Thinking_2017.pdf) (2017). If you need "the eight questions," you're choosing a variant, not quoting a canon.

### 2b. The Environment rubric — effectively a spec for your host screen

From Ritchhart's [2017 assessment tool](https://www.ronritchhart.com/s/Assessing-a-Culture-of-Thinking_2017.pdf), verbatim:

> - "Are students' questions, words, ideas, and thoughts documented and on display?"
> - "**Do wall displays have an ongoing, inchoate, and/or dialogic nature to them versus a static display of finished work?**"
> - "Are there teacher reflections and comments accompanying wall displays?"
> - "Through the wall displays, can one discern the **learning of the class as opposed to just the activity**?"
> - "Through the wall displays, is the **learning process of the group** evident?"

Read those as acceptance criteria. "Ongoing, inchoate, dialogic" versus "static display of finished work" is the difference between a Kahoot leaderboard and documentation.

### 2c. Documentation vs. display — the sharpest distinction

From PZ's [Documentation and Display: What's the Difference?](http://www.mlvpz.org/index3b36.html), quoting Forman & Fyfe:

> "A set of photographs pasted to posterboard showing a trip to the farm is a display. A set of photographs **captioned with the children's words would still be a display**. The panel needs commentary to qualify as documentation…"

> "**Documentation invites inquiry about the children's thinking and invites predictions about effective teaching… Display invites pleasure and satisfaction, but is not deliberately designed to provoke hypotheses. Documentation is a research report used to enhance discourse rather than a record of a past event.**"

**This is a direct warning about your reveal phases.** Showing 30 student answers on the projector = display. It only becomes documentation when something *interprets* it and *feeds it forward*.

### 2d. The Five Features of Documentation

From [mlvpz.org](http://www.mlvpz.org/index6e95.html), verbatim:

1. "Documentation involves a **specific question that guides the process**, often with an epistemological focus."
2. "Documentation involves **collectively analyzing, interpreting, and evaluating** individual and group observations; it is strengthened by multiple perspectives."
3. "Documentation makes use of **multiple languages** (different ways of representing and expressing thinking in various media and symbol systems)."
4. "Documentation **makes learning visible; it is not private.** Documentation becomes public when it is shared with learners."
5. "Documentation is **not only retrospective, it is also prospective. It shapes the design of future contexts for learning.**"

Also: *"Among many other possibilities, **documentation is visible listening**."* And the trap: *"In the U.S., when we think about documentation, we typically have more of a **record-keeping than a learning mentality**. The Reggio teachers see documentation as a research tool."*

**Feature-by-feature audit of your platform:**

| Feature | Lanyard status |
|---|---|
| 1. Guiding question | ✅ Every phase has a prompt |
| 2. Collective analysis, multiple perspectives | ⚠️ Your AI clusters, but the *class* doesn't analyze the aggregate — a gap worth a phase type |
| 3. Multiple languages | ✅ Text + drawing + color + rank + sort + estimate |
| 4. Public, shared **back to learners** | ✅✅ **Your differentiator** — chart paper is only visible from where you sit; you push the aggregate to 31 screens |
| 5. Prospective | ✅✅ **Your differentiator** — feed-forward *is* this |

### 2e. "Making thinking visible" as culture, not activity

PZ's definition of a Culture of Thinking ([project page](https://pz.harvard.edu/projects/cultures-of-thinking)):

> "places where **a group's collective as well as individual thinking is valued, visible, and actively promoted** as part of the regular, day-to-day experience of all group members."

From [Perkins & Ritchhart, "Six Key Principles"](https://pz.harvard.edu/sites/default/files/cot_6KeyPrinciplesOfTheCulturesOfThinkingProject.pdf) — the most directly applicable line for a shared projected screen:

> "Good thinking utilizes a variety of resources and is facilitated by the use of **external tools to 'download' or 'distribute' one's thinking. Papers, logs, computers, conversation, and various means of recording and keeping track of ideas and thoughts free the mind up to engage in new and deeper thinking and help ensure that our thinking doesn't get lost.**"

Cameron Paterson, quoted in [The Power of MTV](https://www.ronritchhart.com/power-of-mtv):

> "**When I make students' thinking visible, it becomes shared, so it is 'our' thinking, bounced off each other, rather than locked inside their heads. This process of publicly sharing thinking builds our collective understanding.**"

And from MTV (2011), the anti-worksheet line you should put in your design docs:

> "When a worksheet is being filled out, invariably the amount of interaction is reduced and the focus becomes doing the work rather than learning. **The worksheet killed the thinking.**"

That's your "not 30 parallel individual worksheets" thesis, in Ritchhart's own words.

---

## 3. The routines, ranked by collective potential

Format per routine: **verbatim steps** → thinking move → group version → what's made visible to whom → engine mapping.

---

### TIER 1 — Collectivity is in the steps themselves. Ship these first.

#### 3.1 `+1 Routine` — PZ Connect — [URL](https://pz.harvard.edu/resources/1-routine)

*"A routine for the identifying important ideas worth remembering."*

**Verbatim steps:**
> After reading a text, watching a movie, listening to a lecture, or being presented with new information or ideas in some manner, a group of learners does the following:
> - **Recall** — In 2-3 minutes and working individually, each learner generates a list of key ideas that he or she recalls from the presentation that he/she feels is important to hang onto. Learners do this from memory rather than reviewing notes or material.
> - **Add (+) 1** — Learners pass their papers to the right. Taking 1-2 minutes, each student reads through the list in front of him/her and adds one new thing to the list. The addition might be an elaboration (adding a detail), a new point (adding something that was missing), or a connection (adding a relationship between ideas). **Repeat this process at least two times.**
> - **Act** — Return the papers back to the original owner. Learners read through and review all the additions that have been made on their sheets. At the same time they may add any ideas they have picked up from reading other's sheets that they thought were worthwhile.

**Thinking move:** synthesis + memory consolidation + distributed elaboration.
**Group version:** it has no solo version. PZ: *"this routine harnesses the power of the group to enhance everyone's notes while providing individuals with a written record."*
**What's visible to whom:** each student sees only the sheet currently in front of them (private, sequential); at the end, each owner sees their own artifact enriched by 3 anonymous peers. Nothing needs to hit the projector at all — the visibility is peer-to-peer.
**Engine mapping:** `collect` → `rotateFrom` ×3 → return-to-owner reveal. **You already have every piece.** The only new thing is a "return to author" variant of `rotateFrom`. This is the highest-fidelity, lowest-effort target in the entire toolbox.

---

#### 3.2 `Chalk Talk` — Cultures of Thinking — [URL](https://pz.harvard.edu/resources/chalk-talk)

*"A routine for silently considering ideas, questions, or problems and responding to others."*

**Verbatim steps:**
> Looking at the topical question written on the chart paper:
> - What ideas come to mind when you consider this idea, question, or problem?
> - What connections can you make to the others' responses?
> - What questions arise as you think about the ideas and consider the responses and comments of others?

**Verbatim LAUNCH (abridged to the structural parts):**
> 2. **Present the "Chalk Talk" Prompt** — Invite learners to think about their reactions to the prompt and record the ideas and questions. Encourage learners to read and to **add to each other's responses** with additional comments and questions.
> 3. **Circulate** — If working in groups you may want them to stay with one recording sheet for 5 min. to allow conversation to develop. **Groups can then rotate en masse to another group's paper, silently reading what is written there, and adding their reactions and questions to the paper.**
> 4. **Facilitate** — May need to prompt the group about the types of responses they can make as they read: connecting ideas, elaborating on others' ideas, commenting on what others have written, asking others to respond with more detail.
> 5. **Share the Thinking** — If people have rotated as a group, allow them to return to their original starting places to read what others have written on "their" Chalk Talk paper. **Ask the group what themes they noticed emerging.** What did they see as common issues and reactions? What questions surprise them? Debrief the process itself, asking the group how their thinking developed during the "Chalk Talk" process.

**Thinking move:** connection-making + questioning, under a deliberate *silence* constraint.
**Why silence matters:** PZ — *"This 'silent conversation' provides learners with time to follow through thoughts without interruption by choosing when they are ready to consider other points of view."* And on risk-taking: *"there is a degree of an anonymity that will free up some learners to take more risk."*
**What's visible to whom:** the accumulating board is visible to whoever is standing at it. Rotation controls *which* board you can see. Nothing is teacher-mediated.
**Engine mapping:** `team-split` (groupSize 4-5) → `collect` on a shared, live-accreting board scoped per group (your `merge` phase's live-draft plumbing, but append-only rather than last-write-wins) → `rotatePairsFrom`-style group rotation → return to origin → `ai-process(compare)` for "what themes emerged." **This is arguably the single best fit between PZ and your architecture, and the closest thing PZ has to a natively digital routine.** Chalk Talk was designed around a physical constraint (one board, N markers) that a screen dissolves entirely.
**Caution:** licensing is murky here (adapted from Foxfire; PDF has no copyright line).

---

#### 3.3 `The Elaboration Game` — Artful Thinking — [URL](https://pz.harvard.edu/resources/elaboration-game)

*"A routine for encouraging close looking."*

**Verbatim steps:**
> As a group, observe and describe several different sections of an artwork.
> - Another person **elaborates on the first person's observations** by adding more detail about the section.
> - A **third person elaborates further** by adding yet more detail, **and a fourth person adds yet more**.
> - Observers: Only describe what you see. Hold off giving your ideas about the art until the last step of the routine.
> - After four people have described a section in detail, **another person identifies a new section** and the process starts over.

**Verbatim LAUNCH:**
> "This is a great routine to launch a collaborative conversation about an artwork or object. With an object or sculpture you can ask students to view it from different sides or viewpoints. With an artwork or two-dimensional piece, students have the opportunity to tackle smaller sections at a time. You could use a viewfinder or have the students use their hands to create a viewfinder to focus in on their section."

**Thinking move:** observation discipline + forced escalation of specificity. The genius is the *ban on interpretation* — pure description, four levels deep.
**Group version:** it IS the group version. Four-person relay per section, then a new section.
**What's visible to whom:** the artwork is public (projected); each contribution is public and attributed; the escalation is the artifact.
**Engine mapping:** `relay` phase, 4 turns per item, wrapped in `foreach` over sections. Your relay already does turn-by-turn collaborative input. Add an image with a section-selector. **Artful Thinking = CC BY-NC (no ND)** — this one is on the more permissive footing.

---

#### 3.4 `Think, Pair, Share` — [URL](https://pz.harvard.edu/resources/think-pair-share)

You already ship this as **Snowball**. Two details from PZ you may not have:

**Verbatim LAUNCH:**
> "One way to encourage students to listen actively to each other is to tell them that when they have completed their conversations, **you will ask some students to explain their partner's thinking**." … "Sometimes it is useful to have **pairs or groups summarize their ideas for the whole class**."

**"Explain your partner's thinking" is a mechanic you don't have and should.** It's `collect` with `assign:"pairwise"` where the prompt is *"What did your partner say, and why?"* — reading comprehension of a peer, and a strong accountability device. Also note PZ credits this to "Project Zero" despite it originating with Frank Lyman (1981) — attribution sloppiness on their end.

---

### TIER 2 — Whole-class by design; the aggregate is the artifact

#### 3.5 `Tug of War` / `Tug for Truth` — [Tug of War](https://pz.harvard.edu/resources/tug-war) · [Tug for Truth](https://pz.harvard.edu/resources/tug-truth)

**Tug of War, verbatim steps** (*"A routine for exploring the complexity of fairness dilemmas"*):
> 1. Present a fairness dilemma.
> 2. Identify the factors that "pull" at each side of the dilemma. These are the two sides of the tug of war.
> 3. Ask students to think of "tugs", or reasons why they support a certain side of the dilemma. Ask them to try to think of reasons on the other side of the dilemma as well.
> 4. Generate "what if?" questions to explore the topic further.

**Tug for Truth, verbatim steps** (*"A routine for exploring tensions of truth"*):
> 1. Identify a question of truth—a controversial claim that something is true or false—where you know there is some evidence on both sides that students can bring forward.
> 2. Ask students if they have an opinion about it (**it's okay not to have one**).
> 3. Draw a tug of war diagram on the board (or tape a piece of rope on the wall and use Post-its to make it more dramatic). Explain that students can add two kinds of things. One is **evidence**—tugs in the Yes, True direction or the No, False direction. The other thing to add is a **question** about the tug of war itself, a question that asks for more information or about "what if" we tried this or we tried that, what would the results be?
> 4. Finish the lesson by asking students what new ideas they have about the question of truth. **Can we decide now? Do some people lean one way and some the other? Is the best answer in a "gray area"**—most of the time true but not always, or half the time? How could we settle it if we had to?

**⭐ The single most important passage PZ has written for your product** — Tug of War LAUNCH, verbatim:

> "**The display of the tugs and What if's? on the rope helps to make students' thinking visible. Most importantly, their ideas are displayed in a way that shows their interconnectedness. The collaborative thinking process of the group as a whole is represented through the 'action' of the tug of war. This is a key point about making thinking visible: It shows the dynamic interaction of people's thoughts in a context of a shared inquiry. Documenting thinking and making it visible in the classroom can facilitate this interaction in order to make the inquiry richer.**"

That paragraph is your product thesis, written by Project Zero in 2019.

**Thinking move:** complexity-finding, resisting binary framing.
**What's visible to whom:** the rope is fully public and grows live. Note step 2 of Tug for Truth — *"it's okay not to have one"* — a native fit for your `passAllowed` primitive.
**Engine mapping:** `collect-choice` (which side pulls you, + a "not sure" option) → `collect` (your tug, tagged to a side) → live host rope with weighted tugs on each side → second `collect` for "what if" questions above the rope → `rate`/`vote` on which tugs are strongest → **re-poll the original stance to show class movement**. That final delta ("we started 60/40, we ended 45/55") is documentation in Ritchhart's sense and no paper rope can do it.

---

#### 3.6 `Compass Points` — [URL](https://pz.harvard.edu/resources/compass-points)

**Verbatim steps:**
> 1. **E = Excited** — What excites you about this idea or propositions? What's the upside?
> 2. **W = Worrisome** — What do you find worrisome about this idea or proposition? What's the downside?
> 3. **N = Need to Know** — What else do you need to know or find out about this idea or proposition? What additional information would help you to evaluate things?
> 4. **S = Stance or Suggestion for Moving Forward** — What is your current stance or opinion on the idea or proposition? How might you move forward in your evaluation of this idea or proposition?

**Verbatim LAUNCH — a direct design instruction:**
> "**The routine needs to be modeled with the whole group initially with responses recorded for the entire class to see. This enables students to build on each other's ideas.**" … "It is generally easiest for students to begin with what is exciting or positive… Students might be asked to write down their individual stance or suggestion for moving forward **after the initial group discussion**. You can also ask students to **make an initial judgment or evaluation of the idea or proposition before doing the compass points and then ask them how their thinking has changed after discussion**."

**⚠️ A crucial design distinction hides here.** PZ explicitly wants E/W/N *live and public so students build on each other*, but wants S (stance) *committed individually after*. That maps cleanly onto your existing controls:

> **Design rule extracted from PZ: divergent/generative steps → show live (accretion is the point). Commitment/stance steps → `simultaneousReveal`, hide until close (independence is the point).** Your platform is one of very few that can do both in one activity.

**Engine mapping:** 3× `collect` (E, W, N) with live public accretion → `ai-process(compare)` to cluster each quadrant → host renders a compass → `collect` for S with `simultaneousReveal` → optional before/after stance delta.

---

#### 3.7 `Circle of Viewpoints` — [URL](https://pz.harvard.edu/resources/circle-of-viewpoints)

**Verbatim steps:**
> 1. Brainstorm a list of difference perspectives.
> 2. Choose one perspective to explore, using these sentence-starters:
>    - I am thinking of ... *the topic* ... from the viewpoint of ... *the viewpoint you've chosen*
>    - I think ... *describe the topic from your viewpoint. Be an actor—take on the character of your viewpoint.*
>    - A question I have from this viewpoint is ... *ask a question from this viewpoint*

(This page has **no LAUNCH section** — PZ's most-downloaded routine, and they never wrote the tips.)

**⭐ This is the routine your architecture transforms most.** In a paper classroom, step 1 produces a list on the board and then maybe 5 kids speak. On your platform:

**Engine mapping:**
1. `collect` — "name a perspective on this" → the class generates 30 candidate viewpoints
2. `ai-process(compare)` — dedupe/cluster into ~25 distinct viewpoints
3. **Distribute one distinct viewpoint to each student** (this is `rotateFrom` semantics over a class-generated pool — you already have `{{X.assigned}}`)
4. `collect` with the three sentence stems as three fields, `{{_current.viewpoint}}` in the prompt
5. `reveal-one` — the circle assembles on the projector, one voice at a time
6. The collected *questions* become the candidate pool for the next phase

**The class literally becomes the circle.** 30 viewpoints instead of 5, nobody idle, and the viewpoint list is the class's own, not the teacher's. This is the clearest demonstration of "the whole class's thinking is the object" in the entire toolbox. It's also the highest-download PZ routine, so recognition is free.

**What's visible to whom:** each student privately sees only their assigned viewpoint while writing (prevents anchoring); everything becomes public at reveal. `preview` gate available if you want teacher moderation first.

---

#### 3.8 `Claim, Support, Question` — [URL](https://pz.harvard.edu/resources/claim-support-question)

**Verbatim steps:**
> Drawing on your investigation, experience, prior knowledge, or reading:
> - Make a claim about (or give an explanation for, or offer an interpretation of) the topic
> - Identify support (things you see, feel, know) for your claim
> - Ask a question related to your claim or the supports. What isn't explained?

**Verbatim LAUNCH (structural parts):**
> "This routine can work well for individuals, small groups, and whole groups. Begin by modeling the routine in the whole group: Identify a claim, **ask the group for evidence that supports the claim**, then invite students to question the claim or any of the evidence that has been offered… you may want to **write the claim on chart paper, then draw two columns, one for supports and one for questions**." … "invite individuals or small groups to **share their claims, supports, and questions with the whole group. Leave time for the other students to respond with additional supports for the claim or to raise additional questions.**" … "Keep in mind that students are often in the habit of simply agreeing or disagreeing with claims. **You might need to slow down and give students time to think** as they generate supports and questions about a claim."

**⭐ The three-hop distributed version is the standout adaptation:**

**Engine mapping:** `collect` (your claim) → `rotateFrom` (support *someone else's* claim — you must argue for a position you didn't pick) → `rotateFrom` again (a third student questions the claim *and* the support). Return the three-part artifact to the original claimant. That's exactly your SCAMPER rotation chain, and it structurally defeats the "just agree or disagree" failure mode PZ warns about, because you literally cannot disagree — your job is to strengthen someone else's claim.

---

#### 3.9 `Word-Phrase-Sentence` / `Sentence-Phrase-Word` — [URL](https://pz.harvard.edu/resources/word-phrase-sentence) · [SPW PDF](https://pz.harvard.edu/sites/default/files/Sentence%20Phrase%20Word.pdf)

**Verbatim steps:**
> As an individual, review a text and then select a:
> - **Word** that captured your attention or struck you as powerful
> - **Phrase** that moved, engaged, or provoked you
> - **Sentence** that was meaningful to you, that you felt captures the core idea of the text
>
> **As a group, discuss and record your choices.** Begin by sharing your words, then phrases, then sentences. Explain why you made the selections you did. **Looking at your group's collective choices** of words, phrases, and sentences, reflect on the conversation by identifying:
> - What themes emerge?
> - What implications or predictions can be drawn?
> - Were there aspects of the text not captured in your choices?

**Verbatim LAUNCH steps 3-5:**
> 3. **Share selections.** In groups of 4-6 people, ask learners to share and record their choices, explaining why they selected them. **Sharing and discussion should occur in rounds**, so the discussion is facilitated. First participant shares a word and explains why she chose it, inviting others to comment and discuss. The words are recorded and then the next person shares, records, and discusses until everyone has their turn. The group then moves to phrases and finally to sentences.
> 4. **Invite reflection on the conversation.** Each group looks at its documented responses. They identify common themes that emerge from these responses and then the implications and/or predictions they suggested. Finally the group identifies **any aspects of the text that were not represented** in their choice of sentences, phrases, and words.
> 5. **Share the thinking.** **Post documentation from all the groups.** Allow time to look at the sentences, phrases, and words chosen and the themes and implications drawn.

**Why this is a top-tier fit:** the steps *explicitly instruct the group to analyze its own collective output* ("What themes emerge? What was NOT captured?"). That is Documentation Feature #2 (collective analysis) written into a routine. And "what themes emerge" is precisely the job your `ai-process(compare)` does — it's the step teachers most often skip because it's hard to do live with 30 sticky notes.

**Engine mapping:** 3-field `collect` → host word-cloud sized by frequency (**the overlap itself is the finding** — when 8 students pick the same word, that's data no individual has) → `ai-process(compare)` for themes → `collect` "what did we miss?" A wonderful demonstration case because the aggregate view is genuinely impossible on paper.

**Note the copy-paste error:** the official SPW PDF's footer misattributes it as "The 3-2-1 Bridge thinking routine." PZ doesn't proofread these blocks.

---

#### 3.10 `Take Note` — PZ Connect — [URL](https://pz.harvard.edu/resources/take-note)

**Verbatim steps:**
> After a lecture, film, reading, or discussion learners "take note" of ONE of the following:
> - What is the most important point?
> - What are you finding challenging, puzzling or difficult to understand?
> - What question would you most like to discuss?
> - What is something you found interesting?

**Verbatim LAUNCH — the distribution mechanics:**
> "At regular intervals… pass out index cards and ask each student to make note using any one of the above prompts. **Have students record their thinking anonymously.**… Whether done at intervals or at the end, there needs to be some kind of sharing of the notes. This could be done in a number of ways:
> - Have small groups share and discuss what they have written.
> - **Have one group collect their index cards and pass them to another group. Upon receiving the new note cards, the cards are randomly distributed and each student reads and responds to the card they receive. Cards are then recollected and passed back to the group from which they came.**
> - **The teacher collects all note cards and redistributes them randomly. Students then read aloud the note card they receive.** The teacher may document and organize the responses.
> - If using the exit ticket method, the teacher collects, reads, and summarizes the Take Note cards as a form of formative assessment."

**Thinking move:** distillation + surfacing confusion safely.
**Why it matters for you:** it's **explicitly anonymous**, and the anonymity is what makes "I'm confused" sayable. PZ names three distinct distribution topologies, all of which are one-line config changes in your engine.
**Engine mapping:** `collect` with a student-chosen prompt (a 4-way `collect-choice` gating a `collect`) → `rotateFrom` with anonymity → respond → return. Or straight to `ai-process(summarize)` for teacher-console formative feedback. Your `passAllowed`/anonymity plumbing from the Connection Pack already handles the "never attributable" requirement.

---

#### 3.11 `Color, Symbol, Image` — [URL](https://pz.harvard.edu/resources/color-symbol-image)

**Verbatim steps:**
> As you are reading, listening, or watching, make note of things that you find interesting, important, or insightful. When you finish:
> - Choose a **color** that you feel best represents or captures the essence of a key idea
> - Choose a **symbol** that you feel best represents or captures the essence of a key idea
> - Choose an **image** that you feel best represents or captures the essence of a key idea
>
> **With a partner or group, first share your color and then share the item from your reading that it represents. Tell why you chose that color as a representation of that idea. Repeat the sharing process until every member of the group has shared his or her Color, Symbol, and Image.**

**⭐ The best possible use of your drawing primitive.** Color = a swatch picker. Symbol = a stroke drawing (PZ: *"a simple line representation or uncomplicated drawing"*). Image = a richer drawing. Documentation Feature #3 ("multiple languages") in one routine.

**Engine mapping:** `collect` with `inputType:"drawing"` × 2 fields + a color field → `preview` (teacher gate, per your drawing-safety rule) → `reveal-one` animated gallery. Host shows the class's color field as a palette wall — 30 students' color choices for the same text is a genuinely striking visual and a real finding (convergence vs. divergence of mood).

---

#### 3.12 `The Complexity Scale` — Artful Thinking — [URL](https://pz.harvard.edu/resources/complexity-scale)

**Verbatim steps:**
> - Say some broad things you know about a topic—observations, facts, ideas. Think of different kinds of things.
> - Place each statement somewhere on the complexity scale. `Simple ─────────── Complex`
> - Explain why you want to place it there.
> - **Reflect:** What new insights and questions do you have about the topic?

**Verbatim LAUNCH:**
> "Put up a scale with simple on one end and complex on the other. **Have students write statements on post it notes** about what they know about a topic. **Then, have them place statements along the continuum. Feel free to discuss placement.** You can even place a statement in more than one spot on the line (sometimes things are simple in one way, but complex in another)."

**Engine mapping:** `collect` (statements) → `foreach` over the class's own statements, each student places every statement on a 1-10 continuum (`estimate`-style) → host shows mean **and spread**. **The spread is the pedagogical payload**: high variance on a statement = the class disagrees about how complex it is = that's the thing to discuss. Paper post-its can show position but not disagreement magnitude. Artful Thinking licensing (CC BY-NC) applies.

---

#### 3.13 `Sticking Points` — PZ Connect — [URL](https://pz.harvard.edu/resources/sticking-points)

*"A routine for mapping messy controversies."*

**Verbatim steps:**
> Choose a big issue and look at these four facets:
> - **Facts:** What facts do people differ on? What facts do they agree on?
> - **Values:** What values do people differ on? What values do they agree on?
> - **Interests:** What practical interests (e.g., investments, land, group loyalty) do people differ on? What practical interests do they share?
> - **Policies:** What policies (i.e., general actions to take) do people differ on? What policies do they agree on?

**Verbatim APPLICATION/LAUNCH:**
> "Lead a class discussion. Students might get ready with small group discussions beforehand. As students talk, **make their thinking visible with a concept map on the whiteboard, or have your students post Post-its.**"
> "Controversies are about disagreement. **Why does the routine also ask where people agree?** Because advocates tend to foreground the disagreements, often it seems there is disagreement on everything! It's good for learners to appreciate where the agreements are, because they are a starting point for resolving, or at least reducing, the controversy."
> "**You could ask students to form clusters and chart the Facts-Values-Interests-Policies for different groups.** A question prompt could be: How does the pattern of Facts-Values-Interests-Policies differ by different groups (e.g. scientists, people from different political parties, business people, workers, different nationalities, etc.)?"
> "Does the class have to agree on a resolution? **No, that would be asking too much.**"

**Engine mapping:** an 8-cell matrix (4 facets × agree/differ) built by 30 students at once. `team-split` where each group takes one facet → `merge` within group → assemble the full matrix on the host. Explicitly **no-winner** — a natural addition to your `family:"connection"` set, and a rare civics-grade routine that doesn't collapse into debate.

---

#### 3.14 `The 3 Whys` — PZ Connect — [URL](https://pz.harvard.edu/resources/3-whys)

**Verbatim steps:**
> - Why might this (topic/question) matter to me?
> - Why might it matter to people around me (family, friends, city, nation)?
> - Why might it matter to the world?

**Verbatim LAUNCH — the collective step:**
> "**Invite students to work on one step at a time. If they try to work on all three questions at once, nuances and distinctions between the personal, local, and global may be lost.** If time allows, **compare and group students' thoughts to find shared motivations and rationales for learning the topic under study.**"

That last sentence is an AI clustering job PZ describes as optional ("if time allows") because doing it by hand is expensive. **For you it's free and instant.** The output — "here is what this class collectively cares about regarding this topic" — is a genuinely new artifact, and it's the ideal opener for a unit. Three sequential single-field `collect` phases (PZ explicitly warns against one 3-field form) → `ai-process(compare)` → `reveal`.

---

### TIER 3 — Strong fit, straightforward mapping

| Routine | Verbatim steps (condensed) | Collective mechanic | Engine mapping |
|---|---|---|---|
| **[See, Think, Wonder](https://pz.harvard.edu/resources/see-think-wonder)** | "What do you **see**? / What do you **think** about that? / What does it make you **wonder**?" | PZ: *"generally works well in a group discussion. You may want to document the students' responses and post them in a place where all students can see them"*; *"ask students to try the routine quietly on their own first… before discussing in a group"* | 3-field `collect` with `image` → `ai-process(compare)` → the class's **wonders become the candidate pool for the next phase**. That feed-forward is the whole demo. |
| **[Think, Puzzle, Explore](https://pz.harvard.edu/resources/think-puzzle-explore)** | "What do you think you know about this topic? / What questions or puzzles do you have? / How might you explore your puzzles?" | PZ: *"As you're documenting students' responses, **be sure to list these initial conceptions so all ideas are available for reconsideration after further study**"* | 3-field `collect` → cluster puzzles → `vote`/`rank` which puzzle to pursue → **the class's own puzzle becomes the unit's driving question.** Store the initial conceptions for a later "I used to think" callback. |
| **[Connect, Extend, Challenge](https://pz.harvard.edu/resources/connect-extend-challenge)** | "How are the ideas and information **connected** to what you already know? / What new ideas broadened or **extended** your thinking? / What **challenges** or puzzles emerge for you?" | PZ: *"document their comments either in a public space for all to see"* | 3-field `collect` → cluster the Challenges → those become the next lesson's agenda |
| **[Headlines](https://pz.harvard.edu/resources/headlines)** | "Write a headline that captures the most important aspect of this topic/issue. How does your headline differ from what you would have said yesterday?" | PZ: *"Share your headline with your neighbor"* … *"**Who heard a headline from someone else that they thought was particularly good at getting to the core of things?**"* | `collect` → `vote` pick-one, but frame it as PZ does — *nominate someone else's*, not vote for the best. That's a no-winner framing of a competitive mechanic. |
| **[The Explanation Game](https://pz.harvard.edu/resources/explanation-game)** | "I notice that… / Why is it that way? or Why did it happen that way?" | PZ: *"**The group works together to build explanations rather than merely deferring to an outside source**"*; a **4-column chart**: Observation / Question / Explanations / Reasons | `collect` (I notice… why?) → `rotateFrom` (others explain) → `rotateFrom` (What makes you think so?) → host renders PZ's 4-column chart. Same 3-hop chain as Claim-Support-Question. |
| **[Creative Question Starts](https://pz.harvard.edu/resources/creative-question-starts)** | "Why…? / What if…? / What is the purpose of…? / How would it be different if…? / Suppose that…? / What if we knew…? / What would change if…?" then "Review your list, identify the most interesting questions, and select one to discuss" then "**Reflect:** What new ideas do you have…?" | PZ: *"step 1 as a whole group, step 2 in pairs, and return to the whole group discussion in step 3"*; *"**create a collage out of students' individual lists and put it on display**"* | `collect` (many questions) → `rank`/`vote` most interesting → `foreach` investigate the top 3. The "collage" is your host screen. |
| **[Red Light, Yellow Light](https://pz.harvard.edu/resources/red-light-yellow-light)** | Look for "red lights" and "yellow lights" — signs of a possible puzzle of truth. "**Round up students' observations. Make a list** of specific points marked R for red or Y for yellow… Also identify **'red zones' and 'yellow zones'**… **Write them on the board in circles.** / Ask: **What have we learned**…?" | Whole-class aggregation is step 3 of the routine itself | Your **`sort` phase**, verbatim: R/Y buckets over shared source material, consensus mode (no correct answer). Per-item class distributions are exactly the "round up" step. Media-literacy flagship. |
| **[Generate-Sort-Connect-Elaborate](https://pz.harvard.edu/resources/generate-sort-connect-elaborate)** | "Generate a list of ideas… / **Sort** your ideas according to how central or tangential they are… / **Connect** your ideas by drawing connecting lines… / **Elaborate** on any of the ideas" | PZ: *"**Individual maps can be used as the basis for construction of a whole classroom map.**"* | `collect` → `sort`/`rank` for centrality → aggregate positions into a **class map**. The class map is exactly the thing PZ names but no teacher has time to build. |
| **[Options Explosion](https://pz.harvard.edu/resources/options-explosion)** | "List the obvious options… / Now brainstorm all sorts of different options to find the 'hidden' options… **Piggyback on ideas already up, combine ideas to get new ones**… / Ask: **What have we learned** about the situation from finding these options?" | PZ: *"Put the ideas on the blackboard or have students write them on Post-its and stick them up"*; *"you can just **take a quick vote**"* | Live-accreting `collect` (piggybacking requires seeing others' ideas — do NOT use `simultaneousReveal` here) → `vote` |
| **[Parts, Purposes, Complexities](https://pz.harvard.edu/resources/parts-purposes-complexities)** | "What are its **parts**? / What are its **purposes**? (of each part) / What are its **complexities**?" | PZ: *"provides an opportunity to make students' thinking visible as they create lists, maps, and drawings"* | Distribute: `collect` parts → each student is assigned a *different* part to analyze (`rotateFrom` over the class's own list) → class assembles the whole system. Also works with `inputType:"drawing"`. |
| **[Parts, People, Interactions](https://pz.harvard.edu/resources/parts-people-interactions)** | "What are the parts of the system? / Who are the people connected to the system? / How do the people interact…? / **How does a change in one element affect the various parts and people**?" | PZ: *"Working in groups… map out their system on chart paper to make the interactions between all of the parts and people visible"* | Same distributed pattern. The 4th question is the systems-thinking payload. |
| **[Think, Feel, Care](https://pz.harvard.edu/resources/think-feel-care)** | "**Think:** How does this person understand this system and their role within it? / **Feel:** What is this person's emotional response…? / **Care:** What are this person's values, priorities, or motivations…?" | PZ: *"assume the role of various people in their system… **with each student portraying a different person's perspective**"*; and the caution: *"encourage your students to develop **specific people** to play… as opposed to **types** of people"* | Same assign-a-role-per-student pattern as Circle of Viewpoints. Note PZ's explicit anti-stereotype guardrail — bake it into the prompt. |
| **[Same, Different, Connect, Engage](https://pz.harvard.edu/resources/same-different-connect-engage)** | "**Same** — In what ways might this person and you be similar? / **Different** — In what ways might the person and you be different? / **Connect** — In what ways might the person and you be connected as human beings? / **Engage** — What would you like to ask, say, or do with the person if you had the chance?" | (Page has no LAUNCH — steps + Origins only) | **Pure Connection Pack material.** `collect` with `assign:"pairwise"` where "this person" is your actual partner → `reveal` with `scope:"pair"`. No-winner, `family:"connection"`. Sits right next to Closer. |
| **[Here Now / There Then](https://pz.harvard.edu/resources/here-now-there-then)** | "**Column A:** List present stances, values and judgments about the topic. / …imagine you could travel back to a time when attitudes were different. / **Column B:** List past stances… / Compare… Why do you think things have changed?" | PZ: *"**This routine works well as a whole class discussion**… Make these ideas visible."* | Two-column `collect` → class-built comparison table. Strong history/civics fit. |
| **[The 4 Cs](https://pz.harvard.edu/resources/4-cs)** | "**Connections** / **Challenge** / **Concepts** / **Changes**" (full prompts on page) | PZ: *"discussion begins by one person sharing… **The next member of the group then shares**… until each member has shared… The group then moves on to the next 'C'"* | `team-split` + round-robin `collect` per C per group. Mostly a speaking protocol; digital adds the shared record. |
| **[3-2-1 Bridge](https://pz.harvard.edu/resources/3-2-1-bridge)** | Before learning: **3** words, **2** questions, **1** metaphor/simile. After learning: same 3-2-1. Then: "**Explain how your new responses connect to or changed from your initial responses.**" | Before/after state across a learning experience | Your `loop` system + stored phase data. **⚠️ Product gap:** rooms die at the end phase (correctly, per §49073.1). A before/after routine spanning a *unit* has nowhere to live. See §5. |
| **[I Used to Think... Now I Think...](https://pz.harvard.edu/resources/i-used-think-now-i-think)** | "I used to think... / Now I think..." | PZ: *"**Have students share and explain their shifts in thinking.** When you first begin using this routine, it is often helpful to do it as a whole group"* | Same. The collective version — *"as a class, what did we collectively used to think?"* — is an `ai-process(compare)` over before/after pairs and is genuinely new. |

---

### TIER 4 — Named in your brief, but flagged

| Routine | Finding |
|---|---|
| **Micro Lab Protocol** | **Not a PZ routine.** Developed by Julian Weissglass (NCEE/UCSB), distributed by [NSRF](https://nsrfharmony.org/wp-content/uploads/2017/10/microlabs_0.pdf) and School Reform Initiative. Verbatim from NSRF: *"Form triads… Number off — 1, 2, 3… Each person will have one minute to talk about a question when it's their turn. While the person is speaking, the other two in the group simply listen… **On the first question, begin with person #1, then #2, then #3. On the second question, begin with #2, then #3, then #1. On the third question, begin with #3, then #1, then #2.**"* Also: *"if the person is done speaking before time is up, the three people should sit in silence, using the time to reflect."* **Mapping:** `team-split groupSize:3` + your `turn` phase's server-authoritative timer + the rotating-start scheduler (a pure function). It's a *speaking* routine, so a text platform mostly contributes timing and turn enforcement — a modest but real fit. Rights sit with NSRF/SRI/Weissglass, not PZ. |
| **Ladder of Feedback** | [Resource-library item, not a thinking routine](https://pz.harvard.edu/resources/ladder-of-feedback). No CC block. PDF credits *"David Perkins, King Arthur's Round Table (John Wiley Press, 2003)."* Four rungs: Clarify → Value → Concerns → Suggest. **Rights likely Wiley/Perkins. Treat as closed.** (The four-rung sequence is a *method* and therefore not itself protected — you could ship your own peer-feedback ladder with your own wording, which your `rotateFrom` + `rate` primitives handle well.) |
| **Zoom In** | **Not in the PZ toolbox** (404). Book-only — *Making Thinking Visible* (2011). I could not verify verbatim steps from a primary source before my search budget ran out; the widely-circulated form is: reveal a portion → "What do you see or notice? What's your hypothesis or interpretation based on what you're seeing?" → reveal more → "What new things do you see? How does this change your hypothesis?" → repeat → "What lingering questions remain?" **Treat as unverified.** Mechanically it's a superb fit (`foreach` over progressive image reveals, tracking how the class's collective hypothesis shifts at each reveal — a *hypothesis-drift chart* no paper version can produce), but it's book-only, so write your own. |
| **Give One Get One** | **Not a PZ routine at all** — generic cooperative-learning strategy that appears in Ritchhart's books/workshops. No PZ page. No license to worry about; also no PZ authority to borrow. |
| **Question Starts** | `/resources/question-starts` **301-redirects** to [Creative Question Starts](https://pz.harvard.edu/resources/creative-question-starts). A [legacy standalone PDF](https://pz.harvard.edu/sites/default/files/Question%20Starts.pdf) survives with the standard CC block. |
| **Question Sorts / The Four If's** | Do not exist as PZ pages. Not in the 95. |
| **Beauty and Truth** | [Exists](https://pz.harvard.edu/resources/beauty-and-truth). Steps: *"Can you find beauty in this [image, story]? / Can you find truth in this? / How might beauty **reveal** truth? / How might beauty **conceal** truth?"* Discussion-heavy, weak collective mechanic in PZ's own text — the LAUNCH just says "allow time for individual students to share ideas." Lower priority. |
| **Peel the Fruit** | [Exists](https://pz.harvard.edu/resources/peel-fruit) but PZ says outright: *"**It's not a routine** but a way of planning and tracking over time the exploration of a topic."* Collective element: *"When the map is used collectively by a class, you may want to invite students to **put up post-its on the map over time** to mark insights."* This is a **unit-spanning persistent artifact** — see the product gap in §5. |
| **Step Inside** | Great routine, **no CC license** (DeCordova/Underground Railway Theater). Use the *method* (assign each student a different viewpoint) with your own wording; don't ship the name or text. Steps for reference: *"1. What can the person or thing perceive? 2. What might the person or thing know about or believe? 3. What might the person or thing care about?"* |

---

## 4. What "making thinking visible" means concretely on your platform

You have five distinct visibility channels. PZ's routines want different ones at different moments, and getting this mapping right *is* the pedagogy.

| Channel | PZ concept | Use for |
|---|---|---|
| **Host screen (projected, public)** | Environment force / the shared artifact | Aggregates, maps, ropes, compasses, word clouds, class distributions. Ritchhart's test: *"ongoing, inchoate, dialogic"* — must show the process, not a finished product |
| **Player screen (private)** | Individual thinking before social influence | The write step, assigned viewpoints, drafts |
| **Player screen receiving the aggregate** | Documentation Feature #4: *"shared with learners"* | **Your biggest under-exploited asset.** Chart paper is visible only from where you sit. You can push the class map to 31 devices. |
| **`scope:"pair"` reveal** | Pair privacy | Same-Different-Connect-Engage, partner-thinking report-outs |
| **Teacher console + `preview`** | Teacher-as-listener; safety gate | Drawing gates, moderation, formative reads on Take Note |

**Two design rules extracted from PZ's own text:**

1. **Divergent/generative steps → live public accretion.** Compass Points: *"responses recorded for the entire class to see… **This enables students to build on each other's ideas**."* Options Explosion: *"Piggyback on ideas already up."* Chalk Talk: *"add to each other's responses."* Using `simultaneousReveal` here would *break* the routine.

2. **Commitment/stance steps → `simultaneousReveal`, hidden until close.** Compass Points' S step comes *after* discussion and is individual; Tug for Truth wants an honest personal lean. Anchoring is the enemy here.

Your platform is one of very few that can do both **within a single activity**. Make that a first-class editor concept, not an accident of config.

**Third rule, from the display/documentation distinction:** a reveal that just lists 30 responses is a *display*. To be documentation it needs at least one of: (a) an interpretation layer (AI clustering, frequency, spread, "what themes emerged"), (b) a prospective hook (this output becomes the next phase's input), or (c) a process trace (before/after, how the class's position moved). **Consider making that a validator rule** — a `reveal` with no downstream consumer and no aggregation is a display, and could earn a warning in "Check for Errors."

---

## 5. Product gap this research surfaces

**PZ routines assume a persistent classroom artifact that outlives the lesson.** Peel the Fruit is a unit-long wall map. 3-2-1 Bridge spans a learning experience. I Used to Think requires remembering what you used to think. Think-Puzzle-Explore says *"list these initial conceptions so all ideas are available for reconsideration after further study."* Creative Question Starts says *"display the list in a visible place so that students can see how their questions about the topic evolve."*

Your rooms die at the end phase, and room snapshots TTL-sweep at 6h — correctly, per your §49073.1 teacher-save-purity rule. So the entire "across a unit" family of PZ routines has nowhere to live.

Three honest options, in increasing cost:
1. **Accept it.** Ship only within-session routines. Perfectly defensible, and there are 40+ of them.
2. **Teacher-carried continuity.** The teacher exports/screenshots a de-identified class-level summary (themes, counts, the class's question list — *no student text*) and re-enters it as a param in the sequel activity. Keeps you clean on student data, since aggregate themes aren't student records in the same way.
3. **A "unit" object with disclosed retention.** Full student-data treatment. Expensive, and your own CLAUDE.md rule says prefer never taking it.

Option 2 is the interesting one and is almost free — the AI already produces exactly that summary artifact.

---

## 6. Recommended build order

1. **`+1 Routine`** — near-zero engine work (`rotateFrom` + return-to-owner), instantly demonstrates "the class's thinking is the object"
2. **Circle of Viewpoints pattern** — assign-one-distinct-item-per-student from a class-generated pool. This unlocks Circle of Viewpoints, Step Inside, Think Feel Care, and Parts/Purposes/Complexities all at once. Highest leverage single primitive.
3. **Chalk Talk** — needs an append-only shared board (a variant of `merge`'s live draft) + group rotation. The most natively-digital routine PZ has.
4. **Tug of War / Tug for Truth** — needs a rope visualization + stance-delta tracking. The best story to tell teachers, and PZ's own text hands you the pitch.
5. **The three-hop rotation family** — Claim-Support-Question and The Explanation Game, both already expressible in your SCAMPER chain.
6. **Word/Sentence-Phrase-Word** — best showcase for AI clustering, since "what themes emerge?" is a step PZ wrote and teachers routinely skip.

**Before shipping any of them publicly: send the email to `pzlearn@gse.harvard.edu`.** There's no permissions page, no precedent, and you'd be first. A written yes is worth more than every inference in §1. In the meantime, paraphrase and rename — the *methods* are yours to use freely; only PZ's *expression* is protected.

---

## Sources

[PZ Thinking Routines Toolbox](https://pz.harvard.edu/thinking-routines) · [See, Think, Wonder](https://pz.harvard.edu/resources/see-think-wonder) · [Circle of Viewpoints](https://pz.harvard.edu/resources/circle-of-viewpoints) · [Compass Points](https://pz.harvard.edu/resources/compass-points) · [Claim, Support, Question](https://pz.harvard.edu/resources/claim-support-question) · [I Used to Think… Now I Think…](https://pz.harvard.edu/resources/i-used-think-now-i-think) · [Chalk Talk](https://pz.harvard.edu/resources/chalk-talk) · [Tug of War](https://pz.harvard.edu/resources/tug-war) · [Tug for Truth](https://pz.harvard.edu/resources/tug-truth) · [Think, Puzzle, Explore](https://pz.harvard.edu/resources/think-puzzle-explore) · [Connect, Extend, Challenge](https://pz.harvard.edu/resources/connect-extend-challenge) · [Step Inside](https://pz.harvard.edu/resources/step-inside) · [Parts, Purposes, Complexities](https://pz.harvard.edu/resources/parts-purposes-complexities) · [Generate-Sort-Connect-Elaborate](https://pz.harvard.edu/resources/generate-sort-connect-elaborate) · [The 3 Whys](https://pz.harvard.edu/resources/3-whys) · [Peel the Fruit](https://pz.harvard.edu/resources/peel-fruit) · [+1 Routine](https://pz.harvard.edu/resources/1-routine) · [Word-Phrase-Sentence](https://pz.harvard.edu/resources/word-phrase-sentence) · [Sentence Phrase Word PDF](https://pz.harvard.edu/sites/default/files/Sentence%20Phrase%20Word.pdf) · [3-2-1 Bridge](https://pz.harvard.edu/resources/3-2-1-bridge) · [The 4 Cs](https://pz.harvard.edu/resources/4-cs) · [Color, Symbol, Image](https://pz.harvard.edu/resources/color-symbol-image) · [The Elaboration Game](https://pz.harvard.edu/resources/elaboration-game) · [The Complexity Scale](https://pz.harvard.edu/resources/complexity-scale) · [Take Note](https://pz.harvard.edu/resources/take-note) · [Sticking Points](https://pz.harvard.edu/resources/sticking-points) · [Red Light, Yellow Light](https://pz.harvard.edu/resources/red-light-yellow-light) · [Options Explosion](https://pz.harvard.edu/resources/options-explosion) · [The Explanation Game](https://pz.harvard.edu/resources/explanation-game) · [Headlines](https://pz.harvard.edu/resources/headlines) · [Creative Question Starts](https://pz.harvard.edu/resources/creative-question-starts) · [Think, Pair, Share](https://pz.harvard.edu/resources/think-pair-share) · [Think, Feel, Care](https://pz.harvard.edu/resources/think-feel-care) · [Parts, People, Interactions](https://pz.harvard.edu/resources/parts-people-interactions) · [Same, Different, Connect, Engage](https://pz.harvard.edu/resources/same-different-connect-engage) · [Here Now / There Then](https://pz.harvard.edu/resources/here-now-there-then) · [Beauty and Truth](https://pz.harvard.edu/resources/beauty-and-truth) · [Ladder of Feedback](https://pz.harvard.edu/resources/ladder-of-feedback) · [Cultures of Thinking](https://pz.harvard.edu/projects/cultures-of-thinking) · [The 8 Forces That Shape Group Culture (PDF)](https://pz.harvard.edu/sites/default/files/cot_8ForcesThatShapeGroupCulture_update.pdf) · [Six Key Principles (PDF)](https://pz.harvard.edu/sites/default/files/cot_6KeyPrinciplesOfTheCulturesOfThinkingProject.pdf) · [Ritchhart & Perkins, "Making Thinking Visible," EL 2008](https://pz.harvard.edu/sites/default/files/makingthinkingvisibleEL.pdf) · [Assessing a Culture of Thinking (Ritchhart 2017)](https://www.ronritchhart.com/s/Assessing-a-Culture-of-Thinking_2017.pdf) · [Cultural Forces and Agency (2025)](https://www.ronritchhart.com/s/CFs-and-Agency.pdf) · [ronritchhart.com — Power of MTV](https://www.ronritchhart.com/power-of-mtv) · [8 Cultural Forces, Intellectual Character 2002 (Otterbein scan)](https://www.otterbein.edu/wp-content/uploads/2019/10/8-Cultural-Forces.pdf) · [Making Learning Visible](https://pz.harvard.edu/projects/making-learning-visible) · [What is Documentation?](http://www.mlvpz.org/indexfd69.html) · [Five Features of Documentation](http://www.mlvpz.org/index6e95.html) · [Documentation and Display: What's the Difference?](http://www.mlvpz.org/index3b36.html) · [Other Aspects of Documentation](http://www.mlvpz.org/indexf90c.html) · [Artful Thinking (CC BY-NC)](https://pz.harvard.edu/projects/artful-thinking) · [Artful Thinking Palette](http://pzartfulthinking.org/?page_id=2) · [Selecting a Thinking Routine (CC BY-NC-SA)](https://pz.harvard.edu/sites/default/files/Selecting%20a%20Thinking%20Routine%209%204%2021.pdf) · [CC BY-NC-ND 4.0 legal code](https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode.en) · [PZ FAQs](https://pz.harvard.edu/who-we-are/faqs) · [NSRF Microlabs protocol (PDF)](https://nsrfharmony.org/wp-content/uploads/2017/10/microlabs_0.pdf) · [Smithsonian Learning Lab — PZ Thinking Routines](https://learninglab.si.edu/collections/project-zero-thinking-routines/oWYbEjpf19oxcFUp) · [Thinking Pathways — Microlab Protocol](https://thinkingpathwayz.weebly.com/microlabprotocol.html)
