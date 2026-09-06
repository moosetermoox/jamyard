/**
 * sit-out.js — who sits a foreach round out, and what they are told.
 *
 * A round built from one student's work has people who already know the
 * answer: the AUTHOR of the item (the drawer in Doodle Bluff, whose
 * drawing is up) and, when that item was made from something handed over
 * by rotation, the SOURCE (the classmate who wrote the phrase that was
 * drawn). Neither should write a fake for it or vote on it. The foreach
 * iteration setup (server.js) stamps both ids onto each collect /
 * collect-choice sub-phase; every place that decides who is asked, who
 * counts toward "N of M", and who is a real submitter at close reads
 * them through here, so the four stay in lockstep.
 *
 * Fields on the sub-phase config (all optional, set only inside foreach):
 *   _foreachAuthorId   the item's author (kept as-is for older callers)
 *   _foreachSourceId   the author of what the item was made from
 *   _foreachSitOutIds  both, deduped: the one list the filters use
 */

/** The ids stamped for this round's item. */
export function foreachSitOut(item, feConfig) {
  if (!item || (feConfig && feConfig.selfExclude === false)) {
    return { authorId: null, sourceId: null, ids: [] };
  }
  const authorId = item.playerId || null;
  const sourceId = item.assignedFromId || null;
  const ids = [];
  if (authorId) ids.push(authorId);
  if (sourceId && sourceId !== authorId) ids.push(sourceId);
  return { authorId, sourceId, ids };
}

/** @returns {Set<string>} player ids that sit this phase out */
export function sitOutIds(phase) {
  const ids = new Set();
  if (!phase) return ids;
  if (Array.isArray(phase._foreachSitOutIds)) {
    for (const id of phase._foreachSitOutIds) if (id) ids.add(id);
  } else if (phase._foreachAuthorId) {
    ids.add(phase._foreachAuthorId);
  }
  return ids;
}

export function sitsOut(phase, playerId) {
  return !!playerId && sitOutIds(phase).has(playerId);
}

/** Eligible players minus the ones sitting out. */
export function withoutSitOut(players, phase) {
  const out = sitOutIds(phase);
  if (out.size === 0) return players;
  return players.filter((p) => !out.has(p.id));
}

/**
 * The holding-screen line for a student sitting out, or null when they
 * are not. The drawer and the phrase author get different words.
 */
export function sitOutMessage(phase, playerId) {
  if (!sitsOut(phase, playerId)) return null;
  if (phase._foreachSourceId && playerId === phase._foreachSourceId && playerId !== phase._foreachAuthorId) {
    return 'You wrote this one! Waiting for the others...';
  }
  return 'This one is yours! Waiting for the others...';
}
