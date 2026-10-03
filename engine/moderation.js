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
  // Several picks on one answer (maxPicks, 2026-09-30)
  if (Array.isArray(r)) return r.map(String).join(' | ');
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
// `unattributed` (a collect that promised students the teacher sees a
// summary, not who said what): the rows carry no name. The playerId stays
// so Hide still works; the console never prints it.
export function buildSubmissionList(players, { unattributed = false } = {}) {
  return players
    .filter(p => hasSubmitted(p) && !isPassResponse(p.response))
    .map(p => ({
      playerId: p.id,
      name: unattributed ? '' : p.name,
      ...(unattributed ? { unattributed: true } : {}),
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

// The steps a Hide after the close reaches (tests/engine/hide-reaches.test.js
// sweeps every handler that copies another step's rows at enter against
// this list): the closed collect's rows, a preview's list, a one-by-one
// reveal's queue, an open vote's ballot, an open multiple-choice step's
// shared ballot, and the rounds a For Each has not reached yet.
export const HIDE_REACHES = Object.freeze(['collect', 'preview', 'reveal-one', 'vote', 'collect-choice', 'foreach']);

/**
 * A Hide (or Unhide) after the step closed: the rows are already stored,
 * so the flag on the player is not enough. Moves the player's row out of
 * (or back into) the last closed collect's responses, an open preview's
 * list, a one-by-one reveal's unrevealed queue, an open vote's ballot,
 * an open multiple-choice step's shared ballot, and the rounds a For Each
 * has not reached. Rows that leave are kept under hidden* so an Unhide
 * can bring them back.
 * @returns {{ collect: boolean, preview: boolean, revealOne: boolean, vote: boolean, ballot: boolean, foreach: boolean }} what changed
 */
export function hideStoredResponse(room, playerId, hidden) {
  const out = { collect: false, preview: false, revealOne: false, vote: false, ballot: false, foreach: false };
  const engine = room && room.engine;
  if (!engine || !playerId) return out;
  // A collect stores its answers twice: `responses` (the list every
  // reveal, vote, and gallery reads) and `byPlayer` (the map a rotation
  // and a return-to-author chain read, engine/phases/chain-reveal.js).
  // A Hide moves the row out of both, or the hidden line still reaches
  // the classmate it was written for (Someone's Got You, 2026-09-26).
  const moveByPlayer = (data) => {
    if (!data || !data.byPlayer || typeof data.byPlayer !== 'object') return false;
    data.hiddenByPlayer = data.hiddenByPlayer && typeof data.hiddenByPlayer === 'object' ? data.hiddenByPlayer : {};
    if (hidden) {
      if (!Object.prototype.hasOwnProperty.call(data.byPlayer, playerId)) return false;
      data.hiddenByPlayer[playerId] = data.byPlayer[playerId];
      delete data.byPlayer[playerId];
      return true;
    }
    if (!Object.prototype.hasOwnProperty.call(data.hiddenByPlayer, playerId)) return false;
    data.byPlayer[playerId] = data.hiddenByPlayer[playerId];
    delete data.hiddenByPlayer[playerId];
    return true;
  };
  const move = (data) => {
    if (!data) return false;
    const mapMoved = moveByPlayer(data);
    if (!Array.isArray(data.responses)) return mapMoved;
    data.hiddenResponses = Array.isArray(data.hiddenResponses) ? data.hiddenResponses : [];
    if (hidden) {
      const keep = data.responses.filter(r => !(r && r.playerId === playerId));
      if (keep.length === data.responses.length) return mapMoved;
      data.hiddenResponses.push(...data.responses.filter(r => r && r.playerId === playerId));
      data.responses = keep;
      return true;
    }
    const back = data.hiddenResponses.filter(r => r && r.playerId === playerId);
    if (back.length === 0) return mapMoved;
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
  // An open vote over the class's answers (pick-one or yes-or-no): the
  // hidden entry leaves the ballot and its votes go with it; the caller
  // re-sends the ballot to whoever has not voted (a head-to-head's
  // matchups are fixed pairs, so that mode keeps its list)
  if (rs && rs.kind === 'vote' && !rs.tallied && rs.mode !== 'head-to-head' && Array.isArray(rs.candidates)) {
    out.vote = moveCandidate(rs, playerId, hidden);
  }
  // An open multiple-choice step whose ballot is built from the answers
  // (a bluff round): the hidden answer's words leave the shared ballot
  if (cur && cur.type === 'collect-choice' && rs && Array.isArray(rs.ballot)) {
    out.ballot = moveBallotEntry(rs, hiddenTextsOf(room, playerId), hidden);
  }
  // Rounds a For Each has not reached yet: the hidden student's item
  // gets no round (the one up now cannot be unsaid)
  for (const state of Object.values(engine.foreachState || {})) {
    if (moveForeachItem(state, playerId, hidden)) out.foreach = true;
  }
  return out;
}

// The ballot entry (or entries) the hidden student wrote, by author
function moveCandidate(rs, playerId, hidden) {
  rs.hiddenCandidates = Array.isArray(rs.hiddenCandidates) ? rs.hiddenCandidates : [];
  const idOf = c => (c && typeof c === 'object' && c.playerId ? c.playerId : c);
  if (hidden) {
    const gone = rs.candidates.filter(c => c && typeof c === 'object' && c.playerId === playerId);
    if (gone.length === 0) return false;
    const goneIds = new Set(gone.map(idOf));
    rs.hiddenCandidates.push(...gone);
    rs.candidates = rs.candidates.filter(c => !goneIds.has(idOf(c)));
    rs.candidateIds = rs.candidates.map(idOf);
    if (Array.isArray(rs.votes)) rs.votes = rs.votes.filter(v => !goneIds.has(v.choice));
    return true;
  }
  const back = rs.hiddenCandidates.filter(c => c && c.playerId === playerId);
  if (back.length === 0) return false;
  rs.hiddenCandidates = rs.hiddenCandidates.filter(c => !(c && c.playerId === playerId));
  rs.candidates = rs.candidates.concat(back);
  rs.candidateIds = rs.candidates.map(idOf);
  return true;
}

// The words a student wrote in the last closed collect, hidden or not
// (the row has just moved, so both lists are read)
function hiddenTextsOf(room, playerId) {
  const engine = room.engine;
  const data = room.lastClosedCollectId && engine.phaseData[room.lastClosedCollectId];
  if (!data) return [];
  const rows = [...(data.responses || []), ...(data.hiddenResponses || [])];
  return rows.filter(r => r && r.playerId === playerId && typeof r.text === 'string')
    .map(r => r.text.trim().toLowerCase()).filter(Boolean);
}

// A shared ballot is plain words: an entry leaves when it reads as one of
// the hidden student's answers, and comes back on an Unhide
function moveBallotEntry(rs, texts, hidden) {
  rs.hiddenBallot = Array.isArray(rs.hiddenBallot) ? rs.hiddenBallot : [];
  if (texts.length === 0) return false;
  const match = new Set(texts);
  if (hidden) {
    const gone = rs.ballot.filter(c => typeof c === 'string' && match.has(c.trim().toLowerCase()));
    if (gone.length === 0) return false;
    rs.hiddenBallot.push(...gone);
    rs.ballot = rs.ballot.filter(c => !gone.includes(c));
    return true;
  }
  const back = rs.hiddenBallot.filter(c => match.has(c.trim().toLowerCase()));
  if (back.length === 0) return false;
  rs.hiddenBallot = rs.hiddenBallot.filter(c => !back.includes(c));
  rs.ballot = rs.ballot.concat(back);
  return true;
}

// A For Each's items after the one up now: the hidden student's own item
// (or, in a human-vs-ai pairing, the pair built on it) leaves the rounds
function moveForeachItem(state, playerId, hidden) {
  if (!state || !Array.isArray(state.items)) return false;
  state.hiddenItems = Array.isArray(state.hiddenItems) ? state.hiddenItems : [];
  const owns = it => !!it && ((it.playerId === playerId) || (it.human && it.human.playerId === playerId));
  const reached = Number.isInteger(state.currentIndex) ? state.currentIndex : 0;
  if (hidden) {
    const keep = state.items.filter((it, i) => i <= reached || !owns(it));
    if (keep.length === state.items.length) return false;
    state.hiddenItems.push(...state.items.filter((it, i) => i > reached && owns(it)));
    state.items = keep;
    return true;
  }
  const back = state.hiddenItems.filter(owns);
  if (back.length === 0) return false;
  state.hiddenItems = state.hiddenItems.filter(it => !owns(it));
  state.items = state.items.concat(back);
  return true;
}

// The projector's "N of M submitted" counter, read fresh off the eligible
// players (2026-10-02: a removed student who had answered stayed in it).
export function submissionCountPayload(eligible, phaseInstanceId) {
  const list = Array.isArray(eligible) ? eligible : [];
  return { count: list.filter(p => p.response).length, total: list.length, phaseInstanceId };
}
