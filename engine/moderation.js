// Host moderation helpers (SAFETY-DESIGN.md, "Moderation Controls").
//
// Pure functions shared by the submit-response / close-submissions / moderate-*
// socket handlers so the server stays thin and the logic is unit-testable.
//
// Two host actions are supported:
//   - Hide a response  → flag player.responseHidden; excluded from AI + reveal,
//     reversible (unhide).
//   - Kick a player    → handled in the registry (remove) + a per-room blocklist;
//     not represented here.

// Sentinel stored as a player's `response` when they use the Pass button on a
// collect phase with passAllowed. Shaped as an object so it can never collide
// with real student text, and truthy so all "has this player answered?" counts
// treat a pass exactly like a submission (a pass closes the phase the same way).
export const PASS_RESPONSE = Object.freeze({ _pass: true });

// Is this response value a pass?
export function isPassResponse(r) {
  return !!(r && typeof r === 'object' && r._pass === true);
}

// Render any response value as display text. Single-text / choice responses are
// strings; multi-field responses are objects keyed by field name.
export function responseToText(r) {
  if (isPassResponse(r)) return '';
  if (r && typeof r === 'object' && !Array.isArray(r)) {
    return Object.values(r).join(' | ');
  }
  return r == null ? '' : String(r);
}

// Has this player submitted something (regardless of hidden state)?
// Passes count — they close the phase like a submission.
export function hasSubmitted(p) {
  return p && p.response !== undefined && p.response !== null && p.response !== '';
}

// Should this player's submission flow downstream (to AI input / reveal)?
// True only if submitted AND not hidden by the host AND not a pass. Passes
// never flow into responses/byPlayer, so AI input, list renderers, and
// rotation chains never see them.
export function isVisibleSubmission(p) {
  return hasSubmitted(p) && !p.responseHidden && !isPassResponse(p.response);
}

// Player ids who passed this phase (used by pair-scoped reveal to render the
// neutral "chose to listen" card). Internal phase data — never broadcast
// with names attached.
export function collectPassedIds(players) {
  return players.filter(p => isPassResponse(p.response)).map(p => p.id);
}

// Build the host's live moderation list from a set of eligible players.
// Returns one row per submitter: { playerId, name, text, hidden }.
// Passes are excluded entirely: there is nothing to moderate, and the
// moderation panel lives on the projected host screen — listing a pass there
// would make it publicly attributable.
export function buildSubmissionList(players) {
  return players
    .filter(p => hasSubmitted(p) && !isPassResponse(p.response))
    .map(p => ({
      playerId: p.id,
      name: p.name,
      text: responseToText(p.response),
      hidden: !!p.responseHidden
    }));
}
