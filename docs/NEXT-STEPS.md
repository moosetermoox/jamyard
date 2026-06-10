# Next Steps

Living roadmap. When a session starts with "what should we work on?", start here.
History lives in [CHANGELOG.md](CHANGELOG.md); parked ideas in [DEFERRED-IDEAS.md](DEFERRED-IDEAS.md).

## Now (highest value, ready to start)

1. **Field-test in a real classroom.** Everything below is guesswork until students
   touch it. Most games are sim-tested but not human-tested. The teacher console,
   Connection Pack, and Simple view all shipped recently and have never met a real
   class. Capture what confuses kids, what stalls, what the teacher reaches for and
   can't find. `scripts/demo-room.js` makes phone-in-hand testing easy meanwhile.
2. **AI cost guards.** No app-level rate limit or spend cap on AI endpoints; a
   stuck client or abusive user could burn real money. At minimum: per-room
   request throttle + daily cap env var. (Anthropic Console spend limit is the
   only guard today.)

## Next

3. **Recipe compiler conditionals.** Hit 3× during Connection Pack (Closer's
   `pairing`, Snowball's `rounds`/`finalVote`, One Voice's `attempts` all dropped
   from recipes because `${param}` can't include/exclude fields or phases).
   Design: some `"$if": "param"` construct in recipe JSON. Unlocks the deferred
   quiz-show recipe (array-driven phase generation) too.
4. **Remaining safety items** (from SAFETY-DESIGN.md): anonymous mode option,
   rate limiting / DoS limits, PII redaction.
5. **Editor odds and ends:**
   - `{{}}` chips in screen-control templates still insert raw syntax — needs friendly labels
   - vote phase "own options" (same teacher-typed-list treatment rank got)
   - class-critique ships with an empty reveal template (flagged during game sweep)

## Later (needs accounts or more users first)

6. **Accounts / owner model.** Game configs already persist in Neon Postgres;
   accounts unlock per-teacher libraries, recipe sharing/marketplace, content
   moderation surface. The `recipes/user/` gitignore boundary already marks the
   user-content line.
7. **Connection Pack voice modes** — v1.5 recorded clips, v2 WebRTC (staged in
   connection-pack-spec.md; deliberately NOT built yet).
8. **game-loader as a compiler** (architecture review item — see DEFERRED-IDEAS.md).
   Biggest long-term win for AI-generated config reliability; ~a week of work.

## Recently done (context for "why isn't X on the list")

- Strategic review items 1–4: idea-first front door, robot playtest, Simple view,
  juice pack (sounds/confetti/avatars — `screens/shared/juice.js`) ✅
- Connection Pack (Closer / Snowball / One Voice), 23 phase types ✅
- Teacher console (private second-device moderation) ✅
- Persistence (Neon), password gate, safety pipeline v1 ✅
- Recipe layer R1–R6 ✅
