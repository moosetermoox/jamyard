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

- [x] **P0: Teacher-gate the flow-control socket events** — DONE
      2026-07-19: audit found 14 ungated flow events (the review's 5 plus
      retry/skip-phase, reveal-next, close-ranking/matching/rating/wager,
      wager-resolve, end-game); all now check `isTeacherSocket`. Player
      gameplay events (submits, taps, turn describer actions) stay open by
      design. Verified: console-sim intruder invariants (can't start,
      can't close/advance) + full chaos suite + preview/reveal-one
      playthrough.
- [x] **P0: XSS output encoding** (found by the 2026-07-19 document review,
      code-confirmed) — DONE 2026-07-19: student text reached `innerHTML`
      unescaped on the host preview/reveal responses lists, relay shared
      result (host + player), and turn scoreboard; teacher/AI config
      reached it via rate-scale labels and editor previews; AI output via
      the designer's "beyond the framework" panel. All sinks now escape
      (host escaper upgraded to cover quotes; player/designer gained
      escapers); `applyTemplate`/reveal/announce were already
      `textContent`. Enforced forever by
      `tests/screens/xss-sinks.test.js` — a statement-level scanner that
      fails the suite on any new unescaped HTML interpolation across all
      seven screen files (audited-numeric allowlist only).
- [x] **P0: Stop logging student content** — DONE 2026-07-19:
      `engine/content-log.js` (`contentLog` no-ops unless
      `DEBUG_CONTENT=1`); AI instructions/inputs/outputs and vote-winner
      text now debug-gated; join/submit/disconnect/eliminate/winner logs
      switched from names to socket ids and counts. Production stdout
      carries no student names or content.
- [x] **PII-scrub student free text at the outbound AI boundary** — DONE
      2026-07-19, to the second reviewer's design: `engine/pii-scrub.js`
      removes KNOWN roster names (case-insensitive, word-boundary; no
      unreliable arbitrary-name detection) and redacts email/phone/URL
      patterns; applied to COPIES inside `AIService` real paths (process +
      fake-response examples; instructions too, since resolved
      `{{tokens}}` embed student text) — the classroom's own data is
      never mutated. Boundary-tested with a stubbed API call asserting
      nothing name/email/phone-shaped leaves. Defensible claim for the
      privacy notice: *structured roster names are removed and known
      contact patterns redacted from outbound AI payloads; student-typed
      text may still contain identifying information.* Deliberately NOT
      in content-filter.js (display gating and subprocessor minimization
      are different concerns). Still open from this family: a teacher
      AI-off toggle + a "don't enter personal information" input hint.

**Posture change 2026-07-26 (fold into the documents):** the site is now
PUBLIC by design — visitors can host the featured activities and build
their own. `SITE_PASSWORD` is no longer a teacher-surface gate; it is the
owner's password (feedback inbox, owner mode, built-in edits, teacher
console). Student-data flows are unchanged. New data collection: the 💬
**site feedback** channel — anonymous BY DESIGN (category + message only,
no name/email fields exist; content-filtered; rate-limited; stored in
Neon `feedback`). Feedback is adult/visitor input, not student data, but
the privacy policy should still name it and its retention (kept until
the owner deletes it; the widget instructs "don't include names or
personal info").

All documents — draftable by Claude, published by the teacher.
Two of the three blocking facts landed 2026-08-30: operating name is
**Max Cady** (person, not an LLC), privacy-contact email is
**mccady@gmail.com** (rendered obfuscated as "mccady at gmail dot com"
on /privacy — owner doesn't want scrapers; keep the obfuscation in any
public-facing document, use the real address in district paperwork).
Still needed: confirmation of the named security coordinator
(presumably also Max Cady; confirm before drafting the infosec program).
The privacy policy's retention table must name everything a room
snapshot contains: responses, drawings, player names, reconnect tokens,
teacher PIN.

Activity report (added 2026-08-31): the teacher can download a printable
report of an activity (student names + work) from the PIN-gated teacher
console while the room is open. By design it is generated on demand and
NEVER stored server-side — no new retention surface for Jamyard. Once
downloaded it is a school record on the teacher's device (FERPA
school-official territory, same as a stack of exit tickets). The privacy
policy should say this in one line when it gets its rubric pass.

- [ ] **Privacy policy with embedded retention policy** — verbatim: what is
      kept, why, exactly when destroyed. Mandatory under the amended COPPA
      rule ("we don't plan to keep it" does not count). Substance is already
      true in code; write it down and put it on the site.
      **Draft shipped 2026-08-08**: `/privacy` (screens/privacy/) is live
      with the plain-language summary + full retention table (snapshot
      contents named: responses, drawings, player names, reconnect tokens,
      teacher PIN), AI data-flow section with the defensible pii-scrub
      claim, feedback-channel retention, linked from home + library.
      **Placeholders filled 2026-08-30** (operator name + obfuscated
      privacy contact email; yellow marker style removed). Still needed
      before it counts as the formal policy: rubric pass (§ 3).
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
- [x] **Lock down the room journal endpoint** — DONE 2026-07-19:
      `GET /api/rooms/:code/journal` now requires the room's teacher PIN
      (`?pin=`) or the site password via basic auth (403 otherwise);
      live-verified (no PIN → 403, wrong PIN → 403, teacher PIN → 200).
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
