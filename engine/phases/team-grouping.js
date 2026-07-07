/**
 * Pure sizing/capacity/auto-fill rules for team-split's upgrade: "groups
 * of 4" (groupSize) as an alternative to "4 teams" (teamCount), plus the
 * per-team capacities and straggler auto-fill that the teacher-assign and
 * student-choice modes need. Kept pure (no I/O) so the classroom-shaped
 * edge cases (odd classes, singletons, overflow) are unit-testable.
 */

/**
 * How many groups does "groups of N" make for a class of n?
 *
 * Rounds to the count whose sizes land closest to the request (22 kids in
 * "groups of 4" → six groups of 4,4,4,4,3,3 — not five of 5,5,4,4,4),
 * then clamps so no group is ever a singleton: an odd pair-class forms a
 * triple, matching the pairing primitive's oddHandling semantics.
 *
 * @param {number} n          class size
 * @param {number} groupSize  requested size
 * @returns {number}          group count ≥ 1
 */
export function groupCountFor(n, groupSize) {
  if (n <= 0) return 1;
  let count = Math.max(1, Math.round(n / groupSize));
  // No singletons: if the smallest group would be 1, use fewer groups.
  if (count > 1 && Math.floor(n / count) < 2) {
    count = Math.max(1, Math.floor(n / 2));
  }
  return count;
}

/**
 * Even-split sizes for n players across `count` teams — the first
 * (n mod count) teams get the extra player. Doubles as the per-team
 * capacity list for choice mode.
 *
 * @param {number} n
 * @param {number} count
 * @returns {number[]}
 */
export function teamCapacities(n, count) {
  const base = Math.floor(n / count);
  const extra = n % count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * "Team 1..N" when the teacher asked for a number of teams, "Group 1..N"
 * when they asked for a group size — matches how teachers say it.
 *
 * @param {number} count
 * @param {boolean} sizedGroups  true when sizing came from groupSize
 * @returns {string[]}
 */
export function defaultTeamNames(count, sizedGroups) {
  const word = sizedGroups ? 'Group' : 'Team';
  return Array.from({ length: count }, (_, i) => `${word} ${i + 1}`);
}

/**
 * Place unassigned players into teams: most remaining capacity first,
 * fewest members as the tie-break, overflow past capacity rather than
 * leaving anyone out. Returns ONLY the new assignments.
 *
 * @param {Record<string, string>} assigned    playerId → teamName (existing)
 * @param {string[]} unassignedIds
 * @param {string[]} teamNames
 * @param {number[]|null} capacities           aligned with teamNames; null = no caps
 * @returns {Record<string, string>}           playerId → teamName (new only)
 */
export function autoFill(assigned, unassignedIds, teamNames, capacities) {
  const counts = {};
  for (const name of teamNames) counts[name] = 0;
  for (const team of Object.values(assigned || {})) {
    if (counts[team] !== undefined) counts[team]++;
  }

  const result = {};
  for (const playerId of unassignedIds || []) {
    let best = teamNames[0];
    let bestScore = -Infinity;
    for (let i = 0; i < teamNames.length; i++) {
      const name = teamNames[i];
      const remaining = capacities ? capacities[i] - counts[name] : -counts[name];
      // Prefer the most remaining capacity; overflow (negative remaining)
      // still picks the least-overfull team.
      if (remaining > bestScore) {
        bestScore = remaining;
        best = name;
      }
    }
    counts[best]++;
    result[playerId] = best;
  }
  return result;
}
