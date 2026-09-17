/**
 * Pure rules for collective choices (2026-09-16, owner: "students in teams
 * pick a first and second choice for one of four categories, each group
 * decides on its top choices, and then choices are assigned"):
 *
 *   - aggregateRankings(rankings, candidates)
 *       the rank step's own rule (average position, ties by list order),
 *       pulled out of server.closeRanking so a GROUP's order can be built
 *       from its members' rankings the same way the class order is
 *   - groupOrders(submissions, playerGroup, groups, candidates)
 *       one ordered list per group from its members' rankings; a group
 *       whose members ranked nothing has no entry (the draft treats it as
 *       "no preference")
 *   - draftChoices(prefs, items, {perChoice, rand})
 *       the hand-out: round by round, first choices first. Round k gives
 *       every unit still without a choice its k-th pick when that choice
 *       has a spot left; the units go in a fresh shuffled order each
 *       round, so no group is always served first. Spots per choice:
 *       perChoice, or the balanced ceil(units / items) so the choices fill
 *       as evenly as they can. A unit whose every pick is full (or that
 *       ranked nothing) gets the least-taken choice.
 *   - buildAssignOutput(draft, units, choices)
 *       the stored phase output: byPlayer means {{stepId.mine}} resolves
 *       to "your (group's) choice" in later announces and prompts.
 *
 * Kept pure (no I/O) so fairness rules are unit-testable.
 */

/**
 * Average-position aggregate of a set of rankings over `candidates`.
 * An item nobody placed sits last (average = list length); the score is
 * the same "higher is better" number the rank step has always stored.
 *
 * @param {Array<string[]>} rankings   one ordered list per ranker
 * @param {string[]} candidates
 * @returns {Array<{item: string, avgRank: number, score: number}>} sorted, best first
 */
export function aggregateRankings(rankings, candidates) {
  const sums = {};
  const counts = {};
  for (const item of candidates) { sums[item] = 0; counts[item] = 0; }
  for (const ranking of rankings || []) {
    if (!Array.isArray(ranking)) continue;
    for (let i = 0; i < ranking.length; i++) {
      const item = typeof ranking[i] === 'string' ? ranking[i] : JSON.stringify(ranking[i]);
      if (sums[item] !== undefined) {
        sums[item] += i + 1;
        counts[item]++;
      }
    }
  }
  const n = candidates.length;
  const out = candidates.map(item => ({
    item,
    avgRank: counts[item] > 0 ? sums[item] / counts[item] : n,
    score: counts[item] > 0 ? Math.round((n - sums[item] / counts[item] + 1) * 100) / 100 : 0
  }));
  // Stable sort: equal averages keep candidate order, so a tie is
  // deterministic and never depends on submission order.
  return out.map((r, i) => [r, i]).sort((a, b) => a[0].avgRank - b[0].avgRank || a[1] - b[1]).map(p => p[0]);
}

/**
 * One ordered list per group, from its members' individual rankings.
 *
 * @param {Record<string, string[]>} submissions   playerId -> ranking
 * @param {Record<string, string>} playerGroup     playerId -> group key
 * @param {Record<string, {label: string}>} groups group key -> {label}
 * @param {string[]} candidates
 * @returns {{ byGroup: Record<string, string[]>, groupRankings: Record<string, Array<{item, avgRank, score}>> }}
 *   keyed by group LABEL; groups with no ranking submitted are left out
 */
export function groupOrders(submissions, playerGroup, groups, candidates) {
  const perGroup = {};
  for (const [pid, ranking] of Object.entries(submissions || {})) {
    const key = playerGroup[pid];
    if (key == null || !groups[key]) continue;
    (perGroup[key] = perGroup[key] || []).push(ranking);
  }
  const byGroup = {};
  const groupRankings = {};
  for (const [key, rankings] of Object.entries(perGroup)) {
    const label = groups[key].label || key;
    const agg = aggregateRankings(rankings, candidates);
    groupRankings[label] = agg;
    byGroup[label] = agg.map(r => r.item);
  }
  return { byGroup, groupRankings };
}

function shuffled(arr, rand) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Spots per choice: the teacher's number, else the balanced spread.
 * @param {number} unitCount
 * @param {number} itemCount
 * @param {number|null|undefined} perChoice
 */
export function spotsPerChoice(unitCount, itemCount, perChoice) {
  if (Number.isInteger(perChoice) && perChoice >= 1) return perChoice;
  if (itemCount <= 0) return 0;
  return Math.max(1, Math.ceil(unitCount / itemCount));
}

/**
 * The hand-out.
 *
 * @param {Record<string, string[]>} prefs   unit key -> that unit's order (may be empty)
 * @param {string[]} items                   the choices
 * @param {{perChoice?: number, rand?: () => number}} [opts]
 * @returns {{ assignments: Record<string, string>, choiceRank: Record<string, number|null>,
 *             byChoice: Record<string, string[]>, spots: number }}
 *   choiceRank is 1 for a first choice, 2 for a second, ..., null when
 *   the unit got a choice it never ranked
 */
export function draftChoices(prefs, items, opts = {}) {
  const rand = typeof opts.rand === 'function' ? opts.rand : Math.random;
  const units = Object.keys(prefs || {});
  const choices = (items || []).filter(it => typeof it === 'string' && it.trim());
  const spots = spotsPerChoice(units.length, choices.length, opts.perChoice);
  const counts = {};
  const byChoice = {};
  for (const c of choices) { counts[c] = 0; byChoice[c] = []; }
  const assignments = {};
  const choiceRank = {};

  const give = (unit, choice, rank) => {
    assignments[unit] = choice;
    choiceRank[unit] = rank;
    counts[choice]++;
    byChoice[choice].push(unit);
  };

  if (choices.length > 0) {
    // Round k: everyone still waiting gets their k-th pick if it has room.
    for (let k = 0; k < choices.length; k++) {
      const waiting = shuffled(units.filter(u => assignments[u] === undefined), rand);
      for (const unit of waiting) {
        const list = Array.isArray(prefs[unit]) ? prefs[unit] : [];
        const pick = list[k];
        if (typeof pick !== 'string' || counts[pick] === undefined) continue;
        if (counts[pick] >= spots) continue;
        give(unit, pick, k + 1);
      }
    }
    // Anyone left (every pick full, or nothing ranked): the least-taken
    // choice, first-listed on a tie. Over the cap when the teacher's
    // number cannot cover everyone, never left out.
    for (const unit of shuffled(units.filter(u => assignments[u] === undefined), rand)) {
      let best = choices[0];
      for (const c of choices) if (counts[c] < counts[best]) best = c;
      const list = Array.isArray(prefs[unit]) ? prefs[unit] : [];
      const at = list.indexOf(best);
      give(unit, best, at === -1 ? null : at + 1);
    }
  }
  return { assignments, choiceRank, byChoice, spots };
}

/**
 * The stored phase output.
 *
 * @param {{assignments, choiceRank, byChoice, spots}} draft
 * @param {Record<string, {label: string, memberIds: string[], memberNames?: string[]}>} units  unit key -> members
 * @param {string[]} choices
 * @param {{perGroup: boolean}} [opts]
 */
export function buildAssignOutput(draft, units, choices, opts = {}) {
  const perGroup = opts.perGroup !== false;
  const assignments = {};
  const choiceRank = {};
  const byPlayer = {};
  const byChoice = {};
  const board = [];
  for (const c of choices) byChoice[c] = [];
  for (const [key, unit] of Object.entries(units)) {
    const label = unit.label || key;
    const choice = draft.assignments[key];
    if (choice === undefined) continue;
    assignments[label] = choice;
    choiceRank[label] = draft.choiceRank[key] === undefined ? null : draft.choiceRank[key];
    byChoice[choice] = byChoice[choice] || [];
    byChoice[choice].push(label);
    for (const pid of unit.memberIds || []) byPlayer[pid] = choice;
    board.push({
      label,
      choice,
      choiceRank: choiceRank[label],
      members: Array.isArray(unit.memberNames) ? unit.memberNames.slice() : [],
      memberIds: (unit.memberIds || []).slice()
    });
  }
  const assignedList = board.map(b => `${b.label}: ${b.choice}`).join('\n');
  return {
    assignments,
    byPlayer,
    byChoice,
    choiceRank,
    assignedList,
    choices: choices.slice(),
    spots: draft.spots,
    perGroup,
    board
  };
}
