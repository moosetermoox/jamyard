# COPPA / FERPA Compliance To-Do

Working checklist from the 2026-07-19 California student-data review
(COPPA amended rule, FERPA, Cal. Ed. Code § 49073.1, pending AB 1159).
Ordered by the review's own sequencing. Check items off as they land;
history in [CHANGELOG.md](CHANGELOG.md).

## Done (shipped 2026-07-19)

- [x] **Snapshot lifetime** — purge on game end + 6h TTL sweep (pre-dated the
      review; tighter than the advised 24–48h backstop)
- [x] **AI data minimization** — student names never sent to the Claude API;
      prompts carry pseudonymous playerIds only; `engine/ai-name-fill.js`
      re-fills real names into AI output server-side
- [x] **Teacher-PIN brute-force lockout** — `engine/pin-throttle.js`, room-keyed,
      5 wrong PINs → 5-minute lock even for the correct PIN
- [x] **Architectural rules recorded in CLAUDE.md** — no student name in any
      outbound API payload; saved objects never contain student-generated content

## For reviewers: where the shipped controls live

| Control | Implementation | Verified by |
|---|---|---|
| Snapshot purge on activity end | `server.js` `handlePhase()` end-phase branch → `discardRoomSnapshot` | `simulate-restart.js` + code path |
| Snapshot TTL (6h) + on-touch expiry | `sweepRoomSnapshots` hourly; TTL check in `tryRestoreRoom` | unit tests |
| Names never sent to AI | `AIService._buildUserMessage` (playerIds only); ai-eliminate playerList | unit test fails on any name in outbound message; real-API playthrough |
| Name re-fill after AI (templates keep working) | `engine/ai-name-fill.js`, wired in `ai-process` post-parse | 5 unit tests |
| PIN brute-force lockout | `engine/pin-throttle.js` (pure, injected clock) + `join-teacher` wiring | 7 unit tests + console-sim invariant |
| Teacher-save purity | structural: "Save as Recipe" reads config only; student content lives in room state + snapshots only | code audit 2026-07-19 |
| Projector-is-public routing | teacher console (`/teacher`, PIN-gated) holds names/moderation/previews | `simulate-teacher-console.js` |

**Independent review completed 2026-07-19** (senior-engineer pass; all
shipped controls verified against code, 810 tests confirmed). Answers to
the open questions: socket ids are an acceptable pseudonym (synthetic
indexes would trade paper compliance for real mis-mapping risk); the
logging fear was CONFIRMED as the biggest retention gap (now § 1 below);
lockout-as-DoS is acceptable, with two refinements queued (§ 2). New
findings folded into the sections below.

## 1. Before any real classroom use (August gate)

Code items (from the 2026-07-19 independent review — small, do first):

- [ ] **P0: Teacher-gate the flow-control socket events** — `start-game`,
      `close-submissions`, `close-voting`, `advance-phase`,
      `relay-finish-all` currently accept emits from ANY socket
      (`isTeacherSocket` gates moderation/preview but these were never
      enrolled); a student with devtools can skip phases or close
      submissions mid-typing. Add the guard + an intruder-can't-advance
      sim invariant. (~1-2h)
- [ ] **P0: Stop logging student content** — server logs echo student
      names and full submission text (worst: ai-eliminate logs every
      answer per round) onto Render's log store, outliving the 6h
      snapshot TTL. Delete or DEBUG-gate content-bearing lines; log
      counts/ids instead. (~half day)
- [ ] **PII-scrub student free text** (moved up from § 2 on the
      reviewer's recommendation — free text flows to the API, snapshots,
      AND logs from day one): scrub emails/phones/full names in the
      content filter before persistence and any API call. (~a morning)

All documents — draftable by Claude, published by the teacher.
Blocked on three facts: operating name (person or LLC?), a dedicated
privacy-contact email, confirmation of the named security coordinator.
The privacy policy's retention table must name everything a room
snapshot contains: responses, drawings, player names, reconnect tokens,
teacher PIN.

- [ ] **Privacy policy with embedded retention policy** — verbatim: what is
      kept, why, exactly when destroyed. Mandatory under the amended COPPA
      rule ("we don't plan to keep it" does not count). Substance is already
      true in code; write it down and put it on the site.
- [ ] **§ 49073.1 provisions in the Terms of Service** — all nine, the
      California student-data terms districts look for.
- [ ] **Written information-security program** — named coordinator, current
      measures cited (TLS, Neon AES-256 at rest, env-var secrets, PIN
      lockout, crash-isolated handlers), annual documented risk assessment
      and review cadence.
- [ ] **Retention/deletion SOP + breach-response one-pager** — who does what
      on a deletion request or incident, with district notification
      commitments (§ 49073.1 requires describing exactly this).

## 2. Before marketing to schools or districts

- [ ] **Notice to Schools** — discloses AI use, names Anthropic as
      subprocessor, states student data is never used to train models
      (ours or anyone's). Doubles as the answer key for district
      questionnaires standardizing on the CDE model AI policy (July 2026).
- [ ] **Teacher console verifications** (~30–60 min, teacher-only):
  - [ ] Neon: point-in-time-restore window minimized + backup expiry noted
        (PITR silently extends real retention beyond DELETEs)
  - [ ] Render: log rotation confirmed short (IPs) + at-rest posture via
        SOC 2 report
  - [ ] Anthropic: retention table checked for the exact Haiku/Sonnet
        models in use; DPA conclusion recorded in writing
- [ ] **Lock down the room journal endpoint** — `GET /api/rooms/:code/journal`
      is public and its entries carry student names + hide/kick events;
      the room code is projected on a wall and 4-letter-enumerable.
      Require teacher auth or strip `player` fields. (~30-60 min)
- [ ] **Fake-response fallback must not swallow budget errors** —
      `generateFakeResponses` catches `AiBudgetError` and injects
      "[Mock AI response #1]…" into live bluffing games; rethrow to the
      phase-error pause and make the fallback text plausible. (~1h)
- [ ] **PIN lockout refinements** — let the `SITE_PASSWORD` basic-auth
      path through during a PIN lockout (a second credential shouldn't
      be defeated by spamming the first); surface "someone is guessing
      the teacher PIN" on the host screen. (~1h)
- [ ] **Deletion-request intake** — monitored email address + the
      documented SOP from § 1 is enough to start.

## 3. As adoption grows

- [ ] Sign the NDPA with an originating California district; execute Exhibit E
- [ ] Write the privacy policy against the Common Sense and 1EdTech rubrics;
      pursue their reviews
- [ ] Education-privacy attorney reviews the full document set before
      district agreements at scale

## Watch list (standing)

- **AB 1159** — HIGHEST priority. Passed Senate policy committee 7-0
  (June 2026). Would make the no-training posture statutory and add a
  limited private right of action. Revisit this document if enacted.
- **CDE model AI policy** — due July 1, 2026 (effectively now); expect
  district AI questionnaires to standardize around it.
- **COPPA school exception** — still guidance, not rule text; monitor the
  FTC's COPPA FAQs.
- **CAADCA remand** — irrelevant under CCPA thresholds; re-check before any
  growth event.
- **AB 1043** (Jan 1 2027, age-assurance via app stores) — only if a native
  or store-distributed app ships.
- **SB 243** (companion chatbots, in effect) — only if a conversational AI
  character students chat with ships (relevant to the parked AI Dungeon
  Master idea: class-voted narration is fine; a chattable character is not,
  without reviewing SB 243 first).
