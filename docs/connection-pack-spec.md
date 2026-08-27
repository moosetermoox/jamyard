# Lanyard Connection Pack — Spec Sheet

**Three no-winner experiences for trust, community, and fun**
Version 0.1 — design spec for implementation

---

## 1. Purpose & Design Principles

This pack introduces Lanyard's first **no-winner game family**. Every existing
phase string in the library ends in scoring, elimination, or a leaderboard.
These three end in a *collective accomplishment* or a *shared moment*. That is
the point, and it is also the market gap: no incumbent classroom tool
(Kahoot/Quizizz/Blooket/Mentimeter) has a cooperative, connection-first mode.

Design principles that apply to all three experiences:

1. **No winners.** No phase in these strings may route into `leaderboard`,
   `winner`, `eliminate`, or any scoring mechanic. The validator should be able
   to enforce this via a new recipe-level flag (see §6.4).
2. **Emotional safety is a mechanic, not a disclaimer.** Every disclosure-based
   phase supports a per-student **Pass** action that is indistinguishable from
   a slow answer (no "Max passed" broadcast). Teachers preview all prompts
   before launch.
3. **Simultaneity over sequence.** Where students share, answers reveal
   *simultaneously* — nobody bears the social cost of going first.
4. **Zero AI required.** All three run fully on pure-server phases. AI appears
   only as optional garnish (noted per experience). They are free-tier /
   starter-library games: near-zero marginal cost, maximally shareable.
5. **Original expression.** Mechanics are drawn from public-domain facilitation
   patterns (escalating self-disclosure per Aron et al. 1997; think-pair-share;
   New Games-style cooperative counting). All prompt text, names, and copy are
   original to Lanyard. No source's prose, branding, or question text is copied.

---

## 2. Experience A — "Closer" (escalating-disclosure pair conversations)

### 2.1 What it is

Pairs of students answer the same prompt privately, then see each other's
answers simultaneously. Prompts escalate across three depth tiers — from light
("window seat or aisle seat?") to reflective ("what's something you're proud
of that you rarely get to mention?"). Inspired by the *structure* of Aron's
closeness-generating procedure: **escalating, reciprocal self-disclosure** —
not the original 36 questions, which we replace with original, school-safe
prompts.

### 2.2 Recipe: `closer.json`

Recipe params (teacher fills 4 fields):

| Param | Type | Default | Notes |
|---|---|---|---|
| `tier1Prompts` | string[] (3–5) | bank of originals | Light / playful |
| `tier2Prompts` | string[] (3–5) | bank of originals | Values / preferences |
| `tier3Prompts` | string[] (2–3) | bank of originals | Reflective / proud-of / gratitude |
| `pairing` | enum: `random` \| `rotate-each-tier` | `rotate-each-tier` | Rotation = each student meets 3 partners |

A `promptBank.json` ships with ~30 vetted prompts per tier so the default
recipe compiles with zero typing. Teacher can swap any prompt inline.

### 2.3 Phase string (compiled shape)

```
lobby
  → announce            "This isn't a quiz. There are no points. Pass anytime."
  → [TIER LOOP ×3]
      pair-assign       (new modifier on collect: assign:"pairwise" REUSED,
                         pairsFrom: null → random pairing; rotate per tier)
      → collect         prompt drawn from tier bank; visibility:"pair";
                        passAllowed:true; simultaneousReveal:true
      → reveal          template renders BOTH pair answers side-by-side,
                        scoped per-pair (each pair sees only their own two)
      (repeat per prompt in tier, then rotate pairs if configured)
  → collect             "One word for how that felt." (anonymous, whole class)
  → reveal              word cloud / list of the one-word checkout
  → end                 closing copy: "You just had N real conversations."
```

### 2.4 Engine work required

- **Pair-scoped reveal.** `reveal` currently broadcasts to all. Add
  `scope: "pair"` — render the template per-pair using that pair's two
  responses. Pairing data already exists from `assign:"pairwise"`
  (`pairsFrom` machinery); the new part is reveal honoring it.
- **`passAllowed` on collect.** Adds a Pass button client-side; server stores
  `{passed:true}` for that player. Reveal template for a passed student renders
  a neutral card ("chose to listen this round"). Pass must close the phase the
  same way a submission does (counts toward all-submitted).
- **`simultaneousReveal: true` on collect.** Suppress the live submission
  ticker on student screens (host moderation panel still sees live
  submissions); nothing is shown to students until the phase closes, then all
  at once.
- **Pair rotation across phases.** `rotateFrom` exists for rotation chains;
  extend or mirror it as `rotatePairsFrom` so tier N+1 derives a new pairing
  that avoids repeats from tier N (greedy non-repeat matching is fine; perfect
  round-robin unnecessary).
- **Odd class size.** One group of three. Pairwise machinery must support a
  single triple; reveal template iterates over group members rather than
  assuming exactly two.
- **Answer-keyed pairing** *(added 2026-08-26, interop wave 2)*.
  `pairBy: {from: "<collect-choice id>", mode: "opposite" | "same"}` on a
  pairwise collect prefers partners by what they answered in that step
  (the source's `byPlayer` map is the answer key). Preference tiers:
  preferred answer beats repeat-avoidance beats anything; best-effort by
  design, so a lopsided split pairs leftover students with each other and
  nobody is benched for lack of an opposite. Composes with
  `rotatePairsFrom` (avoid-set) and `oddHandling`; conflicts with
  `reusePairsFrom` (validator-rejected — reuse dictates the groups).
  Unlocks: share-your-why-with-someone-who-disagreed, debate pairings,
  find-a-matching-partner. Proven by `scripts/simulate-pairby.js` over
  `games/_sim-pairby`.

### 2.5 Host controls & safety

- Pre-launch prompt preview screen (all tiers visible, edit inline).
- Existing moderation panel (hide/spotlight) applies to the checkout collect.
- Host "skip prompt" button mid-tier (reuses existing host-advance).
- Tier 3 prompts flagged in the editor with a reminder: *reflective — best
  after the class has done Tier 1–2 at least once before.*

### 2.6 Validator rules to add

- `scope:"pair"` reveal requires an upstream collect with `assign:"pairwise"`
  reachable on all paths (same static-reachability machinery as typed dataflow).
- Tier loop must not exceed 12 total prompts (35-min class period guard;
  warn, don't block).

### 2.7 Optional AI garnish (off by default)

After the checkout collect, one `ai-process` step: "Write two warm sentences
about what this class shared today, no names." Cost ≈ one Haiku call.

---

## 3. Experience B — "Snowball" (think-pair-share-all)

### 3.1 What it is

The public-domain think-pair-share pattern, digitally enforced: everyone
answers alone → pairs see each other's answers and merge into one improved
answer → (optional) pairs merge into quads → the class sees the final
distilled set. Nobody can skip the thinking step, every voice enters the
funnel, and the output is a small set of class-owned ideas. Works for content
review ("what's the most important cause of WWI?") *and* community questions
("what should our class norms be?") — same string, different prompt.

### 3.2 Recipe: `snowball.json`

| Param | Type | Default | Notes |
|---|---|---|---|
| `prompt` | string | — | The one question. Required. |
| `rounds` | enum: `1-2-all` \| `1-2-4-all` | `1-2-all` | Quad round optional |
| `mergeInstruction` | string | "Combine your answers into one stronger answer." | Shown during merge |
| `finalVote` | boolean | `false` | If true, class ranks final answers — *rank, not winner;* ends on the ranked list, no author names |

### 3.3 Phase string

```
lobby
  → announce          "Three rounds: alone, together, all of us."
  → collect           solo answer; visibility:"private"; simultaneousReveal n/a
  → pair-merge        NEW PHASE TYPE (see 3.4): pairs see both solo answers,
                      one shared text box, both must tap "agree" to submit
  → [if 1-2-4-all] quad-merge   same phase type, groupSize:4, seeded from pair outputs
  → reveal            all merged answers, anonymous, simultaneous
  → [if finalVote] rank        existing rank phase over merged answers
  → end               "Started with N ideas. Ended with K — built by everyone."
```

### 3.4 New phase type: `merge`

This is the one genuinely new handler in the pack. Spec:

- **Config:** `{ groupSize: 2|4, seedFrom: "<phaseId>.responses" | "<phaseId>.merged", instruction, agreeMode: "both" | "any" | "timer" }`
- **phaseState shape:** `{ groups: [{ members:[playerId], seeds:[{author?, text}], draft: string, agreed: Set<playerId> }] }`
  (JSDoc-typed per the typed-bag convention.)
- **Behavior:** group members share a live text draft with ONE PEN (v2,
  2026-08-21; the v1 last-write-wins field let simultaneous typers silently
  destroy each other's sentences). Writing claims the pen, agreeing releases
  it, and it goes stale after 2.5s idle so "Take the pen" lights up for a
  partner (server enforces the same window lazily — no per-group timers; a
  raced write gets the shared truth snapped back into its box). Still no
  OT/CRDT — deliberate: the pedagogy wants one scribe and a conversation.
  Submit requires `agreeMode` satisfied. Late/disconnected partner → existing
  reconnect machinery; if a member never returns, host can force-close (group's
  current draft submits).
- **Dataflow:** outputs `merged: [{groupId, text}]` so downstream reveal/rank
  resolve it exactly like `collect.responses` — extend the resolver grammar
  with `merge.merged` (one new entry in the single source of truth, which the
  validator and editor inherit automatically).
- **Grouping:** reuse pairwise assignment for groupSize 2; quads formed by
  joining adjacent pairs (deterministic, no new matcher needed).

### 3.5 Validator rules

- `merge.seedFrom` must resolve to a list-typed output (existing typed-dataflow
  check covers this once `merged` is in the grammar).
- `quad-merge` requires an upstream `pair-merge` on all paths.
- Warn if `finalVote:true` and prompt looks like an opinion/values question
  (heuristic optional; a static warning string in the recipe UI is enough v1).

### 3.6 Why this one matters strategically

`merge` is not just this game — it's a **reusable cooperation primitive**. Once
it exists, dozens of facilitation patterns (consensus building, norm setting,
peer feedback synthesis, debate prep) become recipe-expressible. Highest
engine-leverage item in the pack.

---

## 4. Experience C — "One Voice" (cooperative counting)

### 4.1 What it is

The class tries to count to a target number together. Anyone may "say" the
next number at any moment — but if two people speak inside the same collision
window, the count resets to zero. No turn order, no talking strategy allowed
on screen, no winner: the class either reaches 20 together or laughs and tries
again. The digital version is *better than the gym original*: server
timestamps adjudicate collisions instantly and fairly, and the shared counter
on the projector gives the group a heartbeat to watch.

### 4.2 Recipe: `one-voice.json`

| Param | Type | Default | Notes |
|---|---|---|---|
| `target` | int 10–100 | 20 | Number to reach |
| `collisionWindowMs` | int 100–1500 | 400 | Two taps inside window = reset |
| `mode` | enum: `tap` \| `voice` | `tap` | Voice = push-to-talk (see 4.5) |
| `attempts` | int \| `unlimited` | unlimited | Soft cap; ends on success either way |

### 4.3 Phase string

```
lobby
  → announce          rules + "no pointing at who gets the next number"
  → one-voice         NEW PHASE TYPE (see 4.4)
  → reveal            stats: best run, number of attempts, total resets —
                      framed as a shared story, not a score ("We made it on
                      attempt 7. Our longest near-miss was 17.")
  → end
```

### 4.4 New phase type: `one-voice`

- **Config:** `{ target, collisionWindowMs, mode }`
- **phaseState:** `{ count, attempt, bestRun, resets, lastTapAt, lastTapBy, history:[{attempt, reachedCount}] }`
- **Mechanic (tap mode):** student screen shows one large button labeled with
  the *next* number. On tap, server compares `now - lastTapAt`:
  - `> collisionWindowMs` → increment count, broadcast new count + a subtle
    per-student "you said 7" confirmation (no public attribution — attribution
    invites blame).
  - `≤ collisionWindowMs` → **reset**: count→0, attempt++, broadcast a
    good-humored reset animation ("two voices! back to one…"). Record
    `bestRun = max(bestRun, count)`.
  - Same student may not tap twice in a row (server-enforced; prevents one kid
    soloing to 20 — participation breadth is the game).
- **Server-authoritative everywhere.** All timing decisions on the server with
  socket receive timestamps; never trust client clocks. This slots into the
  existing stale-event-guard discipline.
- **Teacher screen** is the shared display: big count, attempt number,
  best-run bar creeping toward target. On success: full-screen celebration,
  no names anywhere.
- **End condition:** count reaches target → auto-advance after celebration
  (existing timer-advance convention), or host force-advance.

### 4.5 Voice mode ("your laptop is the microphone") — staged

The hold-space push-to-talk idea is genuinely great and genuinely a different
engineering weight class than everything else here. Stage it:

- **v1 (ship with pack): tap mode + teacher-speaker audio.** Every successful
  tap plays the number through the *teacher's* machine via Web Speech API
  (`speechSynthesis.speak("seven")`) or pre-recorded clips. The room hears one
  shared voice counting upward — 80% of the magic, ~30 lines of code, zero
  new infrastructure, zero mic permissions, works on locked-down Chromebooks.
- **v1.5: recorded-voice mode.** During lobby, each student records themselves
  saying numbers 1–N (or just a short "hey!") via `MediaRecorder`; clips upload
  once. On a successful tap, the *tapper's own recorded voice* plays from the
  teacher machine. Personal, delightful, still no live streaming — just static
  audio blobs served to one client.
- **v2: live push-to-talk.** Hold-to-talk streams student mic → teacher
  machine via WebRTC (one-way audio, student=sender, teacher=receiver;
  socket layer is the signaling channel you already have). Honest costs to
  budget before committing: getUserMedia permission prompts on managed
  ChromeOS devices (often admin-blocked), NAT traversal needing a TURN server
  (real hosting cost — note for the usage-accounting/budget work), echo when
  student devices are in the same room as the teacher speaker, and 100–300ms
  latency interacting with `collisionWindowMs`. v2 is a separate spec; don't
  block the pack on it. If v2 lands, the same pipe powers future experiences
  (council circle with real voices, audio storytelling relay).

### 4.6 Validator rules

- `one-voice` must not be followed by any scoring phase (covered by §6.4 flag).
- `collisionWindowMs` < 100 → block (physically unwinnable); > 1500 → warn.

---

## 5. Library framing (per the De Koven browse-by-feeling direction)

Tag all three with a new `feel` metadata field consumed by the library UI and
the AI recipe matcher:

| Game | `feel` tags |
|---|---|
| Closer | `belonging`, `trust`, `calm` |
| Snowball | `every-voice`, `focus`, `consensus` |
| One Voice | `laughter`, `togetherness`, `wonder` |

`feel` is additive metadata — no engine impact, but it seeds the
browse-by-feeling library surface and improves `from-description` matching
("I want my class to laugh together" → One Voice).

---

## 6. Shared infrastructure (build once, all three use it)

Ordered by leverage:

1. **`merge` phase type** (§3.4) — new handler + one resolver-grammar entry.
2. **`scope:"pair"` on reveal** (§2.4) — unlocks Closer and every future
   pair-based experience (peer feedback, bluffing variants).
3. **`passAllowed` + `simultaneousReveal` on collect** (§2.4) — small flags,
   used by all disclosure-style games forever.
4. **No-winner enforcement:** recipe-level `"family": "connection"` flag; the
   validator rejects any phase string in this family that contains
   `leaderboard`, `winner`, `eliminate`, `wager`, or `speedBonus`. One rule,
   permanent guarantee that the family keeps its promise.
5. **`one-voice` handler** (§4.4) — self-contained, no cross-cutting changes.
6. **Teacher-speaker audio util** (§4.5 v1) — tiny client util on the host
   bundle; later shared by any phase wanting room audio.

Suggested build order: 3 → 2 → Closer ships → 1 → Snowball ships →
5 + 6 → One Voice ships. Three releases, each independently demo-able.

---

## 7. Licensing & attribution stance

- Mechanics implemented here are public-domain facilitation/game *patterns*:
  escalating reciprocal disclosure (structure studied in Aron et al., 1997),
  think-pair-share (decades-old pedagogy), cooperative group counting (New
  Games-era folk play). Patterns and processes are not copyrightable
  expression; all names, prompt text, UI copy, and descriptions in this pack
  are original.
- Do **not** use the names "36 Questions," "1-2-4-All," "Liberating
  Structures," or reproduce any source's question text or prose.
- A "Lineage" note in each game's library description ("inspired by the
  cooperative play tradition of the New Games movement" / "built on the
  think-pair-share pattern") is honest, classy, and good marketing — cite
  traditions, not trademarks.
- Standard caveat: this is design guidance, not legal advice; have a lawyer
  sanity-check before the commercial launch.

---

## 8. Success criteria

- A teacher with zero training launches any of the three from the recipe
  picker in under 60 seconds, default prompts intact.
- Closer: 0 instances where a student's pass status is publicly attributable.
- Snowball: every student's solo answer demonstrably exists before any pair
  output (enforced by phase order, verifiable in phaseState).
- One Voice: collision adjudication is deterministic under the existing
  headless multi-client simulation harness (extend `simulate-corn-story.js`
  pattern with scripted tap timings).
- None of the three makes a single AI call in default configuration.
