/**
 * Pure pairing logic for collect phases with assign:"pairwise".
 * Spec: docs/connection-pack-spec.md §2.4.
 *
 * Used by engine/phase-handlers/collect.js; kept pure (no I/O, caller
 * supplies pre-shuffled ids and any avoid-set) so the matching rules are
 * unit-testable: odd-class triples, rotation that avoids repeat partners,
 * and graceful fallback when a repeat is unavoidable.
 */

/**
 * Canonical unordered key for a partner relationship.
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
export function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * All unordered partner keys for a group (pairs give 1, triples give 3).
 * @param {string[]} memberIds
 * @returns {string[]}
 */
export function groupPairKeys(memberIds) {
  const keys = [];
  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      keys.push(pairKey(memberIds[i], memberIds[j]));
    }
  }
  return keys;
}

/**
 * Build the avoid-set from a prior pairwise phase's stored pairs:
 * every partner relationship that already happened.
 *
 * @param {Array<{playerIds?: string[]}>} priorPairs
 * @returns {Set<string>}
 */
export function buildAvoidSet(priorPairs) {
  const avoid = new Set();
  for (const pair of priorPairs || []) {
    for (const key of groupPairKeys(pair.playerIds || [])) avoid.add(key);
  }
  return avoid;
}

/**
 * Group a list of player ids into pairs (and possibly one triple).
 *
 * Matching is greedy: take the first unmatched player, pick the best
 * remaining candidate by a two-term score; if every candidate scores 0,
 * fall back to the first one (a repeat beats sitting out — spec: greedy
 * is fine, perfect round-robin unnecessary).
 *
 * Score terms, answer preference outranking repeat-avoidance:
 *   +2  answer preference satisfied (only when answerOf/answerMode set:
 *       "opposite" wants differing answers, "same" wants matching ones;
 *       a player with no recorded answer never satisfies the preference)
 *   +1  not a repeat partner (avoid-set miss)
 * Without answerOf this reduces to the original first-non-repeat greedy.
 * The preference is best-effort by construction: a lopsided answer split
 * leaves leftover students pairing with each other, never benched.
 *
 * Odd counts:
 *   - oddHandling "triple": when exactly 3 players remain they form one
 *     group of three. (A lone player — class of 1 — becomes a group of
 *     one rather than being dropped.)
 *   - oddHandling "sit-out" (default): the final leftover player is
 *     returned in `leftover` and excluded from groups (legacy behavior).
 *
 * @param {string[]} ids                 Player ids, pre-shuffled by caller
 * @param {{ oddHandling?: 'sit-out'|'triple', avoid?: Set<string>,
 *           answerOf?: Object<string,string>, answerMode?: 'opposite'|'same' }} [opts]
 * @returns {{ groups: string[][], leftover: string|null }}
 */
export function buildGroups(ids, opts = {}) {
  const oddHandling = opts.oddHandling === 'triple' ? 'triple' : 'sit-out';
  const avoid = opts.avoid || new Set();
  const answerOf = opts.answerOf || null;
  const answerMode = opts.answerMode === 'same' ? 'same' : 'opposite';
  const remaining = [...ids];
  const groups = [];
  let leftover = null;

  const norm = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : null);
  const prefers = (x, y) => {
    if (!answerOf) return false;
    const ax = norm(answerOf[x]);
    const ay = norm(answerOf[y]);
    if (ax == null || ay == null) return false;
    return answerMode === 'same' ? ax === ay : ax !== ay;
  };

  while (remaining.length > 0) {
    if (remaining.length === 1) {
      if (oddHandling === 'triple') {
        // Only happens when the whole class is 1 player — keep them in.
        groups.push([remaining.shift()]);
      } else {
        leftover = remaining.shift();
      }
      break;
    }
    if (remaining.length === 3 && oddHandling === 'triple') {
      groups.push([remaining[0], remaining[1], remaining[2]]);
      remaining.length = 0;
      break;
    }

    const a = remaining.shift();
    let partnerIdx = 0;
    let bestScore = -1;
    for (let i = 0; i < remaining.length; i++) {
      const b = remaining[i];
      const score = (prefers(a, b) ? 2 : 0) + (avoid.has(pairKey(a, b)) ? 0 : 1);
      if (score > bestScore) { bestScore = score; partnerIdx = i; }
    }
    const b = remaining.splice(partnerIdx, 1)[0];
    groups.push([a, b]);
  }

  return { groups, leftover };
}
