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

// Render any response value as display text. Single-text / choice responses are
// strings; multi-field responses are objects keyed by field name.
export function responseToText(r) {
  if (r && typeof r === 'object' && !Array.isArray(r)) {
    return Object.values(r).join(' | ');
  }
  return r == null ? '' : String(r);
}

// Has this player submitted something (regardless of hidden state)?
export function hasSubmitted(p) {
  return p && p.response !== undefined && p.response !== null && p.response !== '';
}

// Should this player's submission flow downstream (to AI input / reveal)?
// True only if submitted AND not hidden by the host.
export function isVisibleSubmission(p) {
  return hasSubmitted(p) && !p.responseHidden;
}

// Build the host's live moderation list from a set of eligible players.
// Returns one row per submitter: { playerId, name, text, hidden }.
export function buildSubmissionList(players) {
  return players.filter(hasSubmitted).map(p => ({
    playerId: p.id,
    name: p.name,
    text: responseToText(p.response),
    hidden: !!p.responseHidden
  }));
}
