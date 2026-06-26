# Lanyard — Pedagogy

> DESIGN-PHILOSOPHY.md explains the *engineering* values; this document
> explains the *learning* ones. It answers: what theory of how people
> learn is built into these games, and why is the tool shaped to serve
> it? Where a feature decision affects students rather than code, the
> tiebreaker is here.
>
> **A note on honesty.** Lanyard was built engineering-first. Much of
> the pedagogy below is *embodied in the design* rather than cited from
> the start — it is the theory the choices already imply. This document
> makes it explicit, and deliberately separates **what we can defend**
> from **what is still a hunch the August 2026 field test will judge.**

---

## The one-sentence version

Learning is a social act: a class thinks better together than thirty
students think alone, and a class that feels safe and connected thinks
better still — so the tool's job is to make collective participation
easy, dignified, and visible to the room.

Everything below unpacks that sentence.

---

## The five commitments

### 1. Learning is social and collective (social constructivism)

The load-bearing pedagogical choice is the **shared screen**. A game is
not thirty parallel solo quizzes; it is one room processing the *whole
class's* input together. Answers are collected, combined, and reflected
back so the group can see its own thinking — `reveal`, `rate`,
`leaderboard`, and the AI `summarize` task all exist to make collective
cognition *visible to the people who produced it*.

This is Vygotsky's premise — knowledge is constructed between people
before it is held by one — turned into an architecture. The AI's
standing instruction ("collect data in scripts, send a summary to the
LLM") is the same idea: its job is to surface what the group thought,
not to replace the thinking.

- **Grounded:** the entire engine is built around shared, aggregated
  input. This is a real, structural commitment, not a slogan.
- **Hunch:** that the *aggregation itself* (vs. just collecting answers)
  is what drives the learning. The field test should watch whether
  classes actually engage with the reflected-back summary or skim it.

### 2. Participation must be active and low-floor (active learning)

Every phase demands an action — answer, vote, rank, count, build on a
peer's idea. There is no passive-consumption mode, by design. The unit
of the system is *interaction*, not delivery.

The "low-floor" half matters as much as the "active" half: a one-word
answer, a tap, a Pass all count as full participation. The cost of
joining in is kept deliberately tiny so the quiet student and the fast
student are both *in the room*, not spectating.

- **Grounded:** no phase type is passive; all 25 require student input
  or are momentary transitions between inputs.
- **Hunch:** that low-floor participation converts to *deeper*
  engagement rather than just more taps. To verify, not assume.

### 3. Safety and belonging come before performance (SEL / relational)

This is the project's clearest and best-cited pedagogical stance, and it
is **enforced in code, not offered as advice**:

- The **connection family** (Closer, Snowball, One Voice) is built for
  belonging rather than points. A `family: "connection"` game
  *structurally cannot* contain a leaderboard, elimination, or scoring
  phase — the validator rejects it permanently.
- **"Emotional safety is a mechanic, not a disclaimer."** A per-student
  **Pass** renders byte-identical to a slow answer — no "Max passed"
  broadcast, ever. Sharing is **simultaneous**, so no one pays the
  social cost of going first. Anonymity and non-attribution are
  structural.

The implicit theory is the un-controversial one teachers live daily: a
student who feels exposed or unsafe does not learn well (Maslow before
Bloom). The design draws on named, public-domain facilitation research —
**escalating reciprocal self-disclosure (Aron et al., 1997)** for
Closer, **think-pair-share** for Snowball's merge phase, and **New
Games-style cooperative play** for One Voice.

- **Grounded:** the cited basis is real and the enforcement is real;
  this is the most defensible claim in the document.
- **Hunch:** that these specific mechanics build *durable* class culture
  in a school setting (Aron's procedure was studied between strangers,
  not in a graded classroom). Watch for it.

### 4. Assessment is formative and ephemeral, not summative

Most games exist to *surface and discuss* thinking, not to grade it.
Scores, where they appear, are low-stakes and disappear when the room
closes — nothing is recorded against a student. Even competitive games
are framed as play. The connection family removes scoring entirely.

The stance: making thinking visible to the class is more valuable than
ranking it, and the fear of a permanent grade suppresses the risk-taking
that learning requires.

- **Grounded:** room state is ephemeral by architecture; no gradebook,
  no per-student history, no records survive the session.
- **Hunch:** that teachers *want* ephemerality rather than experiencing
  it as a missing feature. Some may ask for score export; the field
  test decides whether that's a real need or a reflex.

### 5. The teacher is a creator and a facilitator, not a deliverer
(constructionism)

Two ideas, one root in Papert's constructionism — *people learn by
building meaningful things with low-floor, high-ceiling tools.*

- **For the teacher-as-builder:** the agency-vs-structure bet (compose
  tested phase blocks, never write code) is constructionism applied to
  *authoring*. Recipes → Simple view → advanced graph is a scaffolded
  ramp — a zone of proximal development for a non-coder building a game.
- **For the teacher-in-the-room:** the host screen *orchestrates* and
  the AI *processes*, so the teacher steers a conversation rather than
  delivering content. The technology mediates a discussion; it does not
  replace the teacher.

- **Grounded:** the three-rung authoring ramp exists and is the
  product's core UX bet.
- **Hunch:** that teachers will climb the ramp (recipe → Simple →
  advanced) rather than camping on rung one. The middle rung was added
  precisely because this is unproven.

---

## How the theory shows up in the phase types

| Pedagogical idea            | Where it lives in the engine                          |
|-----------------------------|-------------------------------------------------------|
| Collective sense-making     | `ai-process` (summarize), `reveal`, `rate`            |
| Active, low-floor input     | every phase requires an action; Pass counts           |
| Build-on-each-other         | `merge` (think-pair-share), `relay`, `rotateFrom`     |
| Belonging over competition  | connection `family`; `passAllowed`; `simultaneousReveal` |
| Cooperative (non-zero-sum)  | `one-voice` (the class wins or no one does)           |
| Formative & ephemeral       | scores wiped on room close; no gradebook              |
| Teacher as facilitator      | host screen orchestrates; AI summarizes, never grades |
| Teacher as creator          | recipes → Simple view → advanced phase graph          |

When a new phase type or feature is proposed, a fair question is: *which
row does it serve?* A mechanic that serves none of them — that only adds
competition or extraction — should be viewed with suspicion.

---

## What we are NOT claiming

Intellectual honesty requires naming the limits:

- **No efficacy data.** Nothing here has been measured in a classroom
  yet. Every "grounded" claim above is grounded in *design*, not in
  *outcomes*. The August 2026 field test is the first real evidence.
- **Not a curriculum or a standards-alignment tool.** Lanyard provides
  the *interaction layer*; the learning objectives live in the teacher's
  prompts and choices, not in the framework.
- **Not a claim that games beat other methods.** The claim is narrower:
  *if* you want whole-class interactive participation, this makes it
  easy, safe, and customizable. That's it.
- **Borrowed structure, original content.** Where the design draws on
  published facilitation research (Aron, think-pair-share, New Games),
  it borrows the *structure* and writes all prompts, names, and copy
  fresh. No source's question text or prose is reproduced.

---

## What this means for the next decision

When a choice affects students rather than code, in order:

1. **Does it make participation easier or safer?** Lowering the floor
   and protecting dignity beat adding depth most students won't reach.
2. **Collective or extractive?** Prefer mechanics where the class
   thinks *together* over ones that merely harvest individual answers.
3. **Does it protect the quiet student?** Pass, simultaneity, and
   anonymity are defaults to defend, not features to trade away.
4. **Is the score worth the stakes?** Competition is fine as play;
   ask whether the ranking adds learning or just pressure.

And the meta-rule, shared with DESIGN-PHILOSOPHY.md: **the real classroom
will reorder all of this.** The pedagogy above is a coherent set of
educated bets. Build for connection and participation, harden for the
bad day, and let the first real period tell us which of these
commitments actually hold.
