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

const key = (text) => String(text == null ? '' : text).trim().toLocaleLowerCase();

/**
 * The ids stamped for this round's item. `allItems` is every item the
 * foreach walks over (sampled or not): anyone who was HANDED the same
 * phrase as this item's author also knows the answer (a teacher list
 * shorter than the class repeats, a slow classmate's phrase gets
 * backfilled with a duplicate), so they sit out too.
 */
export function foreachSitOut(item, feConfig, allItems) {
  if (!item || (feConfig && feConfig.selfExclude === false)) {
    return { authorId: null, sourceId: null, sameItemIds: [], ids: [] };
  }
  const authorId = item.playerId || null;
  const sourceId = item.assignedFromId || null;
  const sameItemIds = [];
  if (item.assigned != null && key(item.assigned) !== '' && Array.isArray(allItems)) {
    const mine = key(item.assigned);
    for (const other of allItems) {
      if (!other || !other.playerId || other.playerId === authorId) continue;
      if (key(other.assigned) === mine && !sameItemIds.includes(other.playerId)) sameItemIds.push(other.playerId);
    }
  }
  const ids = [];
  if (authorId) ids.push(authorId);
  if (sourceId && !ids.includes(sourceId)) ids.push(sourceId);
  for (const id of sameItemIds) if (!ids.includes(id)) ids.push(id);
  return { authorId, sourceId, sameItemIds, ids };
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
  if (playerId === phase._foreachAuthorId) return 'This one is yours! Waiting for the others...';
  if (phase._foreachSourceId && playerId === phase._foreachSourceId) {
    return 'You wrote this one! Waiting for the others...';
  }
  return 'You were handed the same phrase, so you know this one! Waiting for the others...';
}
