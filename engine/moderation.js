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

// Is this response value a drawing ({ strokes: [...] })? Kept here (in
// addition to engine/drawing.js) so this module stays dependency-free.
export function isDrawingResponseValue(r) {
  return !!(r && typeof r === 'object' && Array.isArray(r.strokes));
}

// Render any response value as display text. Single-text / choice responses are
// strings; multi-field responses are objects keyed by field name; drawings get
// a placeholder (thumbnails render from the strokes carried alongside).
export function responseToText(r) {
  if (isPassResponse(r)) return '';
  if (isDrawingResponseValue(r)) return '✏️ [drawing]';
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
      // Strokes ride along so the moderation panel / teacher console can
      // render a thumbnail — a text placeholder is unmoderatable.
      ...(isDrawingResponseValue(p.response) ? { drawing: p.response.strokes } : {}),
      // Moderation-ladder "the AI wasn't sure" mark. This list reaches
      // TEACHER surfaces only (console snapshot + submissions-update) —
      // a flag must never render on the projected host screen.
      ...(p.responseFlagged ? { flagged: true } : {}),
      hidden: !!p.responseHidden
    }));
}

/**
 * A Hide (or Unhide) after the step closed: the rows are already stored,
 * so the flag on the player is not enough. Moves the player's row out of
 * (or back into) the last closed collect's responses, an open preview's
 * list, and a one-by-one reveal's unrevealed queue. Rows that leave are
 * kept under hiddenResponses so an Unhide can bring them back.
 * @returns {{ collect: boolean, preview: boolean, revealOne: boolean }} what changed
 */
export function hideStoredResponse(room, playerId, hidden) {
  const out = { collect: false, preview: false, revealOne: false };
  const engine = room && room.engine;
  if (!engine || !playerId) return out;
  const move = (data) => {
    if (!data || !Array.isArray(data.responses)) return false;
    data.hiddenResponses = Array.isArray(data.hiddenResponses) ? data.hiddenResponses : [];
    if (hidden) {
      const keep = data.responses.filter(r => !(r && r.playerId === playerId));
      if (keep.length === data.responses.length) return false;
      data.hiddenResponses.push(...data.responses.filter(r => r && r.playerId === playerId));
      data.responses = keep;
      return true;
    }
    const back = data.hiddenResponses.filter(r => r && r.playerId === playerId);
    if (back.length === 0) return false;
    data.hiddenResponses = data.hiddenResponses.filter(r => !(r && r.playerId === playerId));
    data.responses = data.responses.concat(back);
    return true;
  };
  if (room.lastClosedCollectId && engine.phaseData[room.lastClosedCollectId]) {
    out.collect = move(engine.phaseData[room.lastClosedCollectId]);
  }
  const cur = typeof engine.getCurrentPhase === 'function' ? engine.getCurrentPhase() : null;
  if (cur && cur.type === 'preview' && engine.phaseData[cur.id]) {
    out.preview = move(engine.phaseData[cur.id]);
  }
  const rs = room.phaseState;
  if (hidden && rs && rs.kind === 'reveal-one' && Array.isArray(rs.items)) {
    const revealed = rs.revealed || 0;
    const keep = rs.items.filter((it, i) => i < revealed || !(it && it.playerId === playerId));
    if (keep.length !== rs.items.length) {
      rs.items = keep;
      const data = engine.phaseData[rs.phaseId] || {};
      engine.storePhaseData(rs.phaseId, { ...data, items: keep, revealed });
      out.revealOne = true;
    }
  }
  return out;
}
