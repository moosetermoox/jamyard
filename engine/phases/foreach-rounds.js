/**
 * Per-round copies of a For Each round's step data (2026-10-02).
 *
 * A foreach injects its sub-phases as virtual steps, `_fe:<foreach>:<sub>`,
 * and every round runs under the same ids, so `phaseData` holds only the
 * last round. The engine also stores each round's data under
 * `_fe:<foreach>:<sub>@<round>` (round numbers from 1) and the activity
 * report reads them back in order. Live room state only (phaseData), never
 * saved with a config.
 */

const VIRTUAL = /^_fe:([^:]+):([^@]+)$/;

/** The virtual step id for a foreach's sub-phase. */
export function foreachSubId(foreachId, subName) {
  return `_fe:${foreachId}:${subName}`;
}

/**
 * The round number (1-based) a virtual step's data belongs to, or null
 * for any other id (a top-level step, the `_advance` marker, a foreach
 * that is not running).
 * @param {string} phaseId
 * @param {Record<string, {currentIndex?: number}>} foreachState
 * @returns {number|null}
 */
export function foreachRoundOf(phaseId, foreachState) {
  const m = VIRTUAL.exec(String(phaseId || ''));
  if (!m || m[2] === '_advance') return null;
  const state = foreachState && foreachState[m[1]];
  if (!state || !Number.isInteger(state.currentIndex) || state.currentIndex < 0) return null;
  return state.currentIndex + 1;
}

/**
 * Every stored round for a foreach, in order: [{round, item, steps: {sub: data}}].
 * @param {object} phaseData   the engine's phaseData
 * @param {string} foreachId
 * @param {string[]} subNames  the foreach's sub-phase names, in run order
 * @param {object} [state]     the engine's foreachState[foreachId] (for the items)
 */
export function foreachRounds(phaseData, foreachId, subNames, state) {
  const byRound = new Map();
  const data = phaseData || {};
  for (const sub of subNames || []) {
    const prefix = foreachSubId(foreachId, sub) + '@';
    for (const key of Object.keys(data)) {
      if (!key.startsWith(prefix)) continue;
      const round = Number(key.slice(prefix.length));
      if (!Number.isInteger(round) || round < 1) continue;
      if (!byRound.has(round)) byRound.set(round, {});
      byRound.get(round)[sub] = data[key];
    }
  }
  const items = state && Array.isArray(state.items) ? state.items : [];
  return [...byRound.keys()].sort((a, b) => a - b).map((round) => ({
    round,
    item: items[round - 1] || null,
    steps: byRound.get(round)
  }));
}
