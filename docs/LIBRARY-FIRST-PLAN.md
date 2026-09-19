# Library-First: the plan

*Written 2026-07-28. Plan only — no changes shipped with this document.*
*Sources: the week-of-July-27 refinement memo (the strategy argument; not in the repository),
the "Along Reflection Questions" handout (the prompt corpus, transcribed into recipes/prompt-banks/along.json with each prompt's author; the PDF itself is not in the repository),
[COMPARATIVE-ADVANTAGE.md](COMPARATIVE-ADVANTAGE.md) (the positioning evidence).*

---

## 1. The shift, in one paragraph

The main offering becomes **the library: activities with great prompts, focused on
doing things together.** A teacher arrives, filters by what they want their class
to do today, and is running something in under a minute — without writing a word,
because the prompts are already good. The designer doesn't shrink and doesn't
hide; it becomes a **second layer you actively seek** ("I want to build my own"),
not the front door. Success stops meaning "activities built" and starts meaning
**activities run** — and prompts become engineering work with a schedule, not
copywriting to be done later.

Why (compressed from the refinement memo):
- Nearly all evidence says teachers don't want to author (DeKoven's New Games
  post-mortem, Kahoot's search-not-editor reality, Curipod's AI-writes-it pitch,
  Along dying of workflow cost). Our sample of teachers who love building is one,
  and he writes code.
- Aron 1997's control condition: same structure, bland questions → **no effect.
  The prompts are the intervention.** We have 28 step types and roughly one file
  of prompts. If teachers don't author, nobody else writes those prompts either.
- The engine is built. The scarce thing now is *things worth running*.

## 2. What success means now (and how we'd know)

| Old metric | New metric |
|---|---|
| Features shipped | **Prompts shipped** (counted per activity, in the changelog like test counts) |
| Activities built | **Activities RUN per week** |
| Editor capability | Time-to-running-something for a first-time visitor (target: under 60s) |
| — | **Builder requests** (teachers who ask to build = the feedback channel we don't have) |

**Instrumentation this requires (privacy-clean, no student data):**
- `activity_runs` Neon table: `game_id, recipe_id?, started_at, player_count`
  — a row when a room reaches its first non-lobby phase. No names, no content,
  no room codes. This is the "count runs, not builds" gauge and it doesn't exist yet.
- Builder-request signal: rides the existing `feedback` table (category
  `builder-request`), written when someone opts into the designer layer.

## 3. Workstream A — the front door becomes the library

**A1. `/library` is the teacher home.** The designer grid already *is* the
library UI (search, goal chips with counts, cards with ▶ Host / Try it / ♥,
no-winner badges) — it's just mounted underneath an authoring page. Move it to
its own surface, ordered for running (Connect first), with the idea-box and
"start from scratch" gone from it. Home's primary card points here. The student
join box stays on `/` untouched.

**A2. The builder becomes a doorway you open.** A quiet "Want to build your
own?" link on the library → a single small moment ("What do you want to make?"
— one optional sentence) → designer unlocks for that browser (localStorage,
same pattern as owner mode) and the sentence lands in the feedback inbox as a
`builder-request`. Everything in the designer stays exactly as it is — editor,
Ask AI, recipes, Simple view. Nothing is removed; it's re-doored.
*(Design question to settle at build time: does "host from the library" keep
routing through `/host?game=` — probably yes, zero new plumbing.)*

**A3. Cards say what the class DOES together.** Card copy leads with the
experience ("Your list comes back grown", "The class watches its own mind
move"), then the logistics. A later nicety, not phase-one: a small detail view
per activity (what students see, what the projector shows, the prompts inside).

**A4. `/host`'s dropdown picker retires** in favor of the library (deep links
`/host?game=` keep working — prototype mode and card buttons depend on them).

## 4. Workstream B — prompts as the product

**B1. A real prompt-bank format.** One JSON shape, one folder
(`recipes/prompt-banks/`), already seeded by Closer's bank. Each entry:
`{ id, text, choices?, tone, sensitivity, author, source, activities: [...] }`.
Banks are data, not code — same argument as recipes (they migrate to the DB
cleanly if accounts ever come).

**B2. Ingest the Along corpus.** 151 research-aligned questions across 8
collections, every one attributed (CZI/Gradient Learning 71, Transcend 43,
Black Teacher Collaborative 18, Search Institute 13, Character Lab 5,
Re-imagining Migration 1), and ~half carry ready-made 4-way answer choices
(instant collect-choice/poll decks). The mapping:

| Along collection | Feeds |
|---|---|
| 1. Get acquainted & have fun (fun/favorites, gratitude, "imagine if", conversation starters) | Closer tier 1, Snowball warm-ups, Class Poll decks, Mood Check openers |
| 2. Connect to prior learning | One More Thing framings, Snowball academic, Think/Puzzle-style openers |
| 3. Community, belonging & affirmation | Someone's Got You note prompts, "what should our class try" (Snowball/Both Sides), norms work |
| 4. Rigorous learning & critical thinking | Whose Eyes? topics, Both Sides claims, reflect closers |
| 5. Relevance & motivation | Both Sides / discussion decks, agency polls |
| 6. Wellbeing at school | Mood Check / reflect decks — **sensitivity-flagged; default to teacher-only visibility** |
| 7. Student agency & choice | Decide-goal activities (polls, rank, class decisions) |
| 8. Building Blocks for Learning | Reflect/review decks |

**Licensing posture (not legal advice):** the PDF's own "How to use" section
explicitly invites reuse — *"Use the questions in other tools that you regularly
use to communicate with students… You can copy and paste the questions into
those other tools."* That is materially friendlier than PZ's ND license. We keep
the per-question author attribution in the bank data and credit the collections
in-product where prompts surface. Wellbeing items get an extra editorial pass
(district-sensitive-topics rule from the PDF's own note).

**B3. Teachers pick, never write: the deck picker.** A recipe parameter type
`promptDeck` — instead of a blank text box, the recipe form offers curated
decks ("Week-one icebreakers", "Gratitude", "Belonging") with a preview of
what's inside, plus "surprise me" rotation for looping activities. The recipe
system already owns parameter UI; this is one new param type, not a new system.

**B4. First banks, in order of weekly-use likelihood:**
Snowball → Someone's Got You → Class Poll/Mood Check (the choice-questions land
here nearly free) → Closer (extend the existing bank with Along C1/C3) →
Whose Eyes? topics → Both Sides claims. Target: every featured activity opens
with a deck, not a default string.

**B5. Count prompts.** Changelog entries carry a prompt count the way they
carry a test count.

## 5. Workstream C — prove it with the Aron test

At the proxy playtests (and again with real students in August): run one
activity twice — once with a careful deck, once with bland stand-ins. Same
structure, same group. If the room feels the same both times, the thesis is
weaker than claimed and we want to know **before** August. This is the cheapest
important experiment available and it needs zero code.

## 6. Later / explicitly deferred

- **Activity detail pages** (A3's nicety) and richer library browsing.
- **Reflection-over-time** ("what did we think in September?") — the honest
  conflict with our destroy-on-end privacy rule. The resolution path on file is
  the teacher-carried, de-identified class summary (themes and counts, no
  student text, re-entered as a param in the sequel activity — PZ notes §5,
  option 2). Design after August, informed by real classroom use.
- **Builder-request follow-through** (what unlocking "builder" eventually
  offers beyond today's designer — coaching, templates, sharing).

## 7. What does NOT change

- The designer, editor, Ask AI, recipes, Simple view — all stay, fully
  functional, at their current URLs. This is a re-doored hierarchy, not a
  removal.
- Internals: `games/`, `gameId`, socket events, API routes (standing rule).
- The compliance posture (it's the moat — nothing here adds student data;
  `activity_runs` carries none).
- Chromebooks-not-phones, "activity"-not-"game" (standing rules).

## 8. Sequencing (August-aware)

| Phase | What | Size | When |
|---|---|---|---|
| 1 | Library front door (A1, A2, A4) + `activity_runs` + builder-request signal | ~1 session | Before August if playtests allow; it's low-risk re-mounting of existing UI |
| 2 | Prompt-bank format + Along ingestion + deck picker + first 3 banks (B1-B4 start) | ~1-2 sessions | Before/alongside August tests — this is the part the Aron test needs |
| 3 | Aron A/B at playtests (C) | zero code | With whatever playtests happen |
| 4 | Remaining banks, prompt-count discipline, card copy pass (B4 finish, A3, B5) | ongoing | As used |
| 5 | Deferred items (§6) | — | Post-field-test |

## 9. Risks and kill-tests

- **"I'm describing my own preferences as market research."** (Named in
  the refinement memo.) Kill-test: if the only returning users are ones who built
  something, the builder belongs in front — invert back. The `activity_runs`
  table plus builder-request counts make this measurable.
- **Prompt quality is subjective.** Mitigation: start from a research-aligned,
  attributed corpus rather than writing 151 questions ourselves; the Aron A/B
  is the empirical check.
- **Library-first makes the site feel smaller.** Mitigation: the library IS the
  full 30+ activities with search and goals; only the *front door* narrows.
- **Along attribution drift.** The bank format carries `author`/`source` per
  entry so attribution can't get lost in a refactor.
