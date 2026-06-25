# Lanyard — Design Philosophy

> ARCHITECTURE.md explains *what the system is and how it works*. This
> document explains *why it is shaped that way* — the values and bets
> that should keep future decisions coherent. When a design question
> doesn't have an obvious answer, the tiebreaker is here.

---

## The North Star: the one-shot

A teacher decides on Tuesday night to try a game on Wednesday morning.
They have one shot. If it confuses the class, stalls on a frozen screen,
or shows `[object Object]` to thirty kids, they don't file a bug — they
close the tab and never come back.

**Everything else in this document is downstream of that.** The product
isn't "a game engine" or "an editor"; it's the distance between *"I have
an idea"* and *"my class is playing it and it works."* Shrinking that
distance — and removing every way it can go wrong on the first attempt —
is the whole job.

This is why the project spends far more code on *safety nets* than on
*features*. A new phase type is exciting; a validator rule that catches
a broken `{{token}}` before a class sees it is what actually moves the
North Star.

---

## The central tension: agency vs. structure

Other classroom tools sit at one of two extremes. Kahoot-style products
give you **structure with no agency**: a fixed quiz format, fill in the
blanks, no way to invent a new kind of game. A raw framework gives you
**agency with no structure**: infinite power, but you have to be a
programmer and most attempts break.

Lanyard's bet is the **missing middle**: more customization than the
template tools, far less friction than code. You should be able to build
something genuinely novel — a branching story, a bluffing game, a
cooperative count — by *composing* tested blocks, never by writing logic.

This tension is permanent and intentional. Almost every design choice is
really a question of *where on that spectrum does this land?* — and the
answer is usually "give them a new block to compose, not a new knob to
misconfigure." When in doubt, push power into **reusable primitives**
(phase types, recipe directives) rather than per-game escape hatches.

---

## 1. Catch errors at save time; survive the ones you can't

Most teacher mistakes are *silent*: a typo'd data reference, an array
rendered as text, a `winner` phase with no `next` that freezes the game.
None throw at edit time on their own — they detonate in front of a class.

So the validator (`engine/game-loader.js`) runs on **every save** and
catches as much as it possibly can statically: missing fields, dead
references, type mismatches, unreachable phases, cycles, special-scope
tokens used where they can't resolve, connection-family violations. The
bar for a new validator rule is simply: *would this otherwise surface in
front of students?* If yes, it's worth the code.

But static analysis has a ceiling. A server can restart mid-game; a
kid's wifi can drop during a vote. You can't *prevent* those — so the
architecture **survives** them instead: room snapshots resurrect a game
after a crash, id-migration follows a player across a reconnect, the
chaos simulator proves it holds. The principle generalizes: **prevent
what you can detect, recover from what you can't.**

---

## 2. Design for the bad day, not the demo

A demo has 4 cooperative players on good wifi. A real seventh-period
class has 31 kids, three of whom are double-tapping the buzzer, two
reconnecting, one on a Chromebook that drops every ninety seconds, and a
projector laptop that someone will definitely F5.

The defensive machinery exists because that's the *actual* operating
environment, not an edge case:

- Every socket handler is wrapped so one bad room can't crash the
  process and end *every* class on the server.
- Close handlers are idempotent and `kind`-guarded because the
  all-inputs-in auto-advance *will* race a late host click.
- A host disconnect holds the room for five minutes instead of deleting
  it, because an F5 shouldn't kill the game for thirty people.
- The chaos simulator is a first-class tool, not a nicety — it found
  five real bugs the polite sims never would.

If a feature only works when everyone behaves, it doesn't work.

---

## 3. Phases are the unit of expressiveness

The whole system is **a config-driven state machine of phase types**. A
game is JSON: phases + transitions. This is the load-bearing decision,
and it pays for itself constantly:

- **Composition over features.** New games come from *arranging* the 25
  existing blocks, not from new code. Most "can we build X?" questions
  are recipe questions, not engineering questions.
- **A new phase type is the most expensive thing in the codebase** —
  handler, schema, validator, editor UI, Simple-view sentence, AI
  prompt docs, sim coverage. So the bar is deliberately high: a phase
  type must be a genuinely new *interaction pattern* that can't be
  composed from existing ones. "Spot the lie" isn't a phase type; it's
  a `foreach` with the right config.
- **The state machine gives correctness for free.** Strict transitions
  catch typos, explicit `loopBack` makes loops auditable, BFS-from-lobby
  flags orphans. Properties fall out of the shape rather than being
  enforced by hand.

When tempted to add a feature flag to an existing phase, first ask
whether it's really a new primitive that other games would compose too.

---

## 4. One source of truth; drift is a bug factory

The same fact described in two places will eventually disagree, and the
disagreement will be a bug. So facts live **once**:

- `engine/phase-schemas.js` is the single declaration of every phase
  type. The validator reads it, the AI generation prompts derive from
  it, the editor's field lists populate from it. Add a phase to the
  schema and all three update.
- `engine/resolver-grammar.js` is the one definition of `{{...}}`
  syntax. Both the validator and the runtime resolver dispatch through
  it, so "what's a valid token" can't fork.

The remaining duplication (the editor mirrors some validation client-side
for instant feedback) is a known, deliberate exception — and even that is
being pulled toward the schema endpoint. The instinct should always be:
*if I'm writing this rule down a second time, can I derive it instead?*

---

## 5. Pure logic in the center, I/O at the edges

Every non-trivial decision — closeness scoring, tap collision
adjudication, matchup generation, the buzz referee, id-migration, vote
branching — is a **pure function** with no sockets, no timers, no
`room`. The socket handlers are thin shells that gather inputs, call the
pure core, and emit the result.

The reasons compound:

- **You can unit-test the hard part to the millisecond** without
  standing up a server. One-voice's collision window is tested with an
  injected clock; you'd never get that coverage over real sockets.
- **The logic is readable in isolation.** `adjudicateTap(state, player,
  now)` tells you exactly what a collision is, with nothing else in the
  frame.
- **Bugs have one home.** "The bottom-35%-of-4-players rounding" lives
  in one tested function, not smeared across a handler.

TDD is the default here (write the test first) precisely because the
pure-function seam makes it cheap and the stakes — a miscount in front of
a class — make it worth it.

---

## 6. Teachers never see code

A teacher is not a programmer, and the moment they see `{{ai-mashup.list}}`
or a phase-graph DAG, the tool has failed its audience. So the editor is
built on **progressive disclosure**:

- **Simple view is the default** — each step is a plain-English sentence
  with its editable text inline. The phase graph is demoted to
  "Advanced," there if you want it, invisible if you don't.
- **Tokens render as friendly chips**, never raw syntax. "list of
  answers from step 5," not `{{x.list}}`. The underlying config stays
  byte-exact; only the *display* is humanized.
- **Recipes are the front door.** "What do you want to play with your
  class?" → a working game. The DAG is compiler output, not something
  the teacher models in their head.

The same instinct governs the runtime: the host screen says "(each
student gets their own)" where a per-player token would otherwise leak.
If a teacher can see implementation, that's a bug, not a power feature.

---

## 7. The tool shapes values — not everything is a competition

It would have been easy to make every game a leaderboard. The
**connection family** (Closer, Snowball, One Voice) is a deliberate
statement that the framework is for *belonging* as much as for points —
the five minutes after a test, rebuilding class culture, counting to
twenty together and laughing when it resets.

And because it's a *value*, it's **enforced, not merely offered**: a
`family: "connection"` game cannot contain a leaderboard, winner,
elimination, or scoring phase — the validator rejects it permanently. A
pass renders byte-identical to a missing answer so no one can be singled
out. Anonymity and non-attribution are structural, not optional.

The broader principle: **the defaults and constraints a tool ships with
are a moral choice.** Lanyard should make the kind thing easy and the
exposing thing hard.

The same logic drove the teacher console: the host screen is a
*projector*, so anything teacher-private (moderation, a kid's name, a
preview) must live on a private second device. "Don't put private info on
a public screen" is now a standing design rule.

---

## 8. AI is leverage, never a dependency

Claude shows up in two roles, and both are deliberately *bounded*:

- **At edit time** it's a productivity boost — describe a game, get a
  recipe match; ask for a fix, get a constrained edit. But its output
  *never* ships unchecked: every AI response runs through
  `stripUnknownFields()` + `validate()`, and the robot playtest actually
  *plays* the generated game before the teacher trusts it. The AI can
  make design mistakes; it structurally *cannot* make illegal ones.
- **At run time** it's one phase type among 25. Mock mode returns
  fixtures so the entire system — tests, sims, the robot playtest —
  runs with zero API spend and zero network.

The recipe matcher exists *because* asking the AI to emit a 200-line
config was a real failure mode: it malformed roughly 1-in-N times. The
fix wasn't a better prompt; it was **shrinking the AI's job** to a tiny
structured object the recipe compiler expands deterministically. The
pattern recurs: when AI output is unreliable, give it *less* to produce
and let trusted code do the rest. And spend has hard guards
(`ai-budget.js`) because a stuck client must never quietly run up a bill.

---

## 9. Fail loud in development, never crash the room in production

Two rules that sound contradictory and aren't:

- **Don't swallow errors.** A `catch` that hides a problem just moves
  the failure somewhere harder to find. Surface it — log it, journal it,
  show the teacher the phase-error recovery screen.
- **But a failure must never take down the class.** A throwing handler
  logs and the *room survives*; an unhandled rejection logs and the
  *process survives*; a broken phase pauses for Retry/Skip instead of
  freezing the game.

The synthesis: errors are **loud and contained**. You hear about them,
but they're isolated to the smallest possible blast radius — ideally one
phase, never one classroom, never the whole server.

---

## 10. Keep it boring

Vanilla JS. No framework, no build step, no transpiler, no bundler.
`<script src>` and go. This is a real constraint, held on purpose:

- The author is a novice coder building by "vibe coding." A build
  pipeline is a second system to debug; every dependency is a future
  breakage and a migration.
- Boring tech ages well. Plain ES modules and socket.io will still run
  in five years with no churn. The interesting complexity should be in
  the *domain* (phases, validation, recovery), not in the toolchain.
- "Each file does one thing" and "no hardcoded values — use config"
  keep the surface legible to one person who has to hold it all.

Novelty belongs in what the games can *do*, not in how the code is
assembled. Reach for the dependency only when the domain genuinely needs
it (Neon for persistence, the Anthropic SDK for AI) — never for
developer fashion.

---

## Tensions we hold on purpose

Good design is mostly choosing which tension to live inside. The
unresolved-by-design ones:

- **Power vs. guardrails.** Advanced mode exists for the teacher who
  wants the DAG; Simple mode and recipes exist for everyone else. We
  serve both rather than picking.
- **Survival vs. scale.** Snapshots solved surviving a restart, *not*
  running across many processes. In-memory room state is correct for one
  school and a known wall for multi-tenant scale — a bridge to cross
  only if real usage demands it.
- **Validate more vs. ship.** The validator could always catch one more
  subtle design hole. Past a point that's diminishing returns against
  just *playing the game* (the robot playtest) — so we invest in both
  and let each cover the other's blind spot.

---

## What this means for the next decision

When you're unsure, in order:

1. **Does it serve the one-shot?** Does it make the first attempt more
   likely to just work? If not, it's probably lower priority than it
   feels.
2. **Catch, or survive?** A new failure mode needs either a save-time
   check or a runtime recovery — decide which and build that, not a
   vague "be careful."
3. **Compose, don't special-case.** Prefer a new primitive teachers can
   reuse over a one-off flag on an existing phase.
4. **Derive, don't duplicate.** If you're writing a fact down twice, find
   the single source it should come from.
5. **Would it survive seventh period?** 31 kids, bad wifi, an F5. If the
   answer is "only if everyone behaves," it isn't done.

And the meta-rule, given the August 2026 field test: **the real
classroom will reorder all of this.** Every priority above is an
educated guess until students touch it. Build for the one-shot, harden
for the bad day, and let the first real period teach us what we got
wrong.
