# Next Steps

Living roadmap. When a session starts with "what should we work on?", start here.
History lives in [CHANGELOG.md](CHANGELOG.md); parked ideas in [DEFERRED-IDEAS.md](DEFERRED-IDEAS.md).

## Now — the pre-August plan (classroom tests start August 2026)

Filter every priority through: *what will matter in the first week of real use?*
The June feature freeze was consciously lifted in July: match, sort, teams
upgrade, and drawing input v1 all shipped 2026-07-06. Freeze back ON —
everything below is polish, testing, and ops.

### START HERE next session (notes from 2026-07-06, updated 2026-07-26)

0. **⚠️ Before/at the next deploy: set `SITE_PASSWORD` on Render.** The
   2026-07-26 rework made the site public (curated 8-activity front door)
   and turned `SITE_PASSWORD` into the OWNER password. If it's unset on the
   deployed server, ANYONE can open the feedback inbox, toggle featured
   flags, and edit built-ins. If it was already set: deploying this change
   opens /host and /designer to the public — that's the intended product
   decision. Owner flow: designer grid → "Site owner? Show everything".
1. **Proxy playtests (D) — this is the week.** July is the window; August is
   too late to act on what they find. Push the unpushed commits (Render
   deploys on push), then run 2-3 adults on real phones through the
   day-one-kit candidates. `scripts/demo-room.js` holds a room for phone
   testing. The new 💬 feedback widget means testers can file reactions
   in the moment — check `/feedback` after each session.
2. **Two 5-minute ops steps only the teacher can do** (pending since June):
   set the `RENDER_DEPLOY_HOOK` secret + turn Render auto-deploy OFF
   (deploy-on-green instructions in `.github/workflows/test.yml`), and add an
   UptimeRobot ping (or paid tier) so the free dyno doesn't sleep mid-class.
3. **Day-one kit (C)** — pick the 3-5 launch games and polish deeply.
   Candidates now: One Voice / Closer (connection), Quiz Show, Lightning
   Round, **Vocab Match**, **Metaphor or Simile?**, **Art Gallery** (the new
   ones are bread-and-butter classroom material), **Group Work Day**
   (checklist phase, 2026-07-19 — not-a-game classroom utility teachers can
   use any ordinary day, recipe included). Plus anonymous mode and the
   one-page "if X goes wrong, do Y" teacher cheat sheet.
4. **Recipes for the new stuff** — match/sort/drawing have NO recipes yet, so
   the idea-first front door ("make a vocab quiz for my French class") can't
   route to them. A vocab-match recipe + a sort recipe + an art-gallery recipe
   makes the new features reachable by non-coders. Small, high-leverage.
   (Checklist shipped WITH its recipe on 2026-07-19 — `recipes/group-work.json`
   is the pattern to copy.)
5. **Loose ends from the July push:** caption mode (drawing shown above a
   text box via rotateFrom) works but no shipped game uses it — Telephone
   Pictionary needs the chain reveal (see Next below); the editor UI for the
   new widgets (match pairs rows, sort buckets/items, drawing toggle, team
   sizing toggle) passed validation but was never screenshot-reviewed in the
   browser; class-critique still ships an empty reveal template.

### The plan itself

- **A. Survive a real class period** ✅ CODE DONE — room snapshots (resume at
  phase start, host-F5 rejoin), CI deploy-on-green wiring. Remaining: the two
  manual ops steps in START HERE #2.
- **B. Chaos simulator** ✅ DONE — `node scripts/simulate-chaos.js`; every new
  interactive phase gets a chaos run before shipping (now standard practice).
- **C. Day-one kit** — see START HERE #3.
- **D. Proxy playtests (July)** — see START HERE #1.
- **E. If time remains** — accessibility basics (contrast, touch targets,
  keyboard nav); AI-generation eval loop (20 realistic prompts → robot
  playtest all → fix generator weaknesses in batch).

1. **Field-test in a real classroom** — August 2026. Everything above serves this.

## Next

1.5. **COPPA/FERPA compliance workstream** — full working checklist in
   [COMPLIANCE-TODO.md](COMPLIANCE-TODO.md). Code items shipped 2026-07-19
   (AI name-stripping + re-fill, PIN lockout; snapshot lifecycle already
   complied). Pre-August remainder: four documents (Claude drafts, teacher
   publishes — blocked on operating name / privacy email / coordinator
   confirmation) + PII-scrubbing in the content filter. AB 1159 is the
   watch-list item that matters.

2. **Remaining safety items** (from SAFETY-DESIGN.md): anonymous mode option,
   rate limiting / DoS limits (non-AI socket events; AI endpoints now guarded),
   PII redaction.
3. **Editor odds and ends:**
   - class-critique ships with an empty reveal template (flagged during game sweep)
4. **New phase ideas** (from the 2026-06-10 ideation; buzz + estimate + branching
   votes shipped; **match + sort + teams upgrade shipped 2026-07-06** — see
   games/vocab-match, games/metaphor-or-simile, and team-split's
   teacher/choice methods):
   - **`secret-role`** — hidden per-player info (Spyfall/Chameleon pattern); per-player
     delivery exists ({{X.mine}}), new part is role assignment + projector discipline.
     The most-requested-by-students unbuilt thing once they see bluffing games.
   - **`appreciation`** — everyone writes something kind about an assigned classmate
     (rotation guarantees coverage), teacher previews every note before private
     delivery. Connection-family round 2; needs the new privacy pattern.
   - **Drawing v2: `mural` phase** — live collaborative drawing on the projector.
     Do the TILE WALL first (each student owns one attributable tile of the
     projected grid — moderation is "hide that tile") before any shared free-for-all
     canvas; both need a teacher freeze/clear control. v1 (drawing as a collect
     input — galleries, pass-and-continue, captions) shipped 2026-07-06.
   - **Telephone Pictionary** — draw → caption → redraw chains are already
     possible with inputType:"drawing" + rotateFrom (caption mode works today);
     the missing piece is a CHAIN REVEAL (show each drawing's lineage:
     original → caption → redraw). Needs chain assembly from rotation
     assignment maps.
   - **AI Dungeon Master** — live class-voted choose-your-own-adventure (AI
     narrates, three options per beat, class votes, AI continues). Full design
     sketch banked in DEFERRED-IDEAS.md §Game concepts — no new phase type
     needed, ~one session of work.

## Later (needs accounts or more users first)

4. **Accounts / owner model.** Game configs already persist in Neon Postgres;
   accounts unlock per-teacher libraries, recipe sharing/marketplace, content
   moderation surface. The `recipes/user/` gitignore boundary already marks the
   user-content line.
5. **Connection Pack voice modes** — v1.5 recorded clips, v2 WebRTC (staged in
   connection-pack-spec.md; deliberately NOT built yet).
6. **game-loader as a compiler** (architecture review item — see DEFERRED-IDEAS.md).
   Biggest long-term win for AI-generated config reliability; ~a week of work.

## Recently done (context for "why isn't X on the list")

- Branching votes (`vote.nextByWinner` + literal vote options + editor branch UI)
  — Story Quest CYOA shipped; fixed latent close-voting crash + broken sim votes ✅
- Buzz + estimate phases (25 types) + Lightning Round ✅

- Recipe compiler conditionals R7 ($if/$value/$repeat/$map, transition rewiring,
  object params) + One Voice/Snowball/Closer recipe upgrades + Quiz Show shipped ✅
- AI cost guards (`services/ai-budget.js` — AI_CALLS_PER_MINUTE + AI_DAILY_CAP,
  Neon-persisted day counter, 429s + phase-error pause) ✅
- Friendly tokens everywhere + SPECIAL_SCOPE_OUT_OF_CONTEXT validator rule ✅
- Strategic review items 1–4: idea-first front door, robot playtest, Simple view,
  juice pack (sounds/confetti/avatars — `screens/shared/juice.js`) ✅
- Connection Pack (Closer / Snowball / One Voice), 23 phase types ✅
- Teacher console (private second-device moderation) ✅
- Persistence (Neon), password gate, safety pipeline v1 ✅
- Recipe layer R1–R6 ✅
