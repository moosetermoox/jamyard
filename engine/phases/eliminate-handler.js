/**
 * Handles the "eliminate" phase type.
 *
 * Supports two methods:
 * - "hook": calls a named hook function that returns playerIds to eliminate
 * - "bottom-percent": eliminates the bottom X% by score, including ties at cutoff
 */
export function runEliminate({ method, input, hooks, players }) {
  let toEliminate;

  if (method === 'hook') {
    toEliminate = runHookMethod(input, hooks);
  } else if (method === 'bottom-percent') {
    toEliminate = runBottomPercent(input);
  } else if (method === 'most-votes') {
    toEliminate = runMostVotes(input);
  } else {
    throw new Error(`Unknown eliminate method: "${method}"`);
  }

  for (const id of toEliminate) {
    players.eliminate(id);
  }

  return {
    eliminated: toEliminate,
    remaining: players.getRemaining().length
  };
}

function runHookMethod({ hookFn, data, context }, hooks) {
  const fn = hooks[hookFn];
  if (!fn) {
    throw new Error(`Hook "${hookFn}" not found`);
  }
  return fn({ ...context, input: data });
}

/**
 * The top-scoring player(s) go out (2026-09-30): a vote over the students
 * ("candidates": "players") decides who leaves the round. Ties at the
 * cutoff all go, unless that would empty the room or nobody got a vote.
 * @param {{ scores: Record<string, number>, count?: number }} input
 * @returns {string[]}
 */
export function runMostVotes({ scores, count }) {
  const entries = Object.entries(scores || {}).filter(([, s]) => typeof s === 'number');
  if (entries.length === 0) return [];
  entries.sort((a, b) => b[1] - a[1]);
  const n = Number.isInteger(count) && count >= 1 ? Math.min(count, entries.length) : 1;
  const cutoff = entries[n - 1][1];
  if (cutoff <= 0) return [];
  const out = entries.filter(([, s]) => s >= cutoff).map(([id]) => id);
  if (out.length === entries.length) return [];
  return out;
}

function runBottomPercent({ scores, percent }) {
  const entries = Object.entries(scores);
  if (entries.length === 0) return [];

  // Sort ascending by score (lowest first)
  entries.sort((a, b) => a[1] - b[1]);

  const countToEliminate = Math.round(entries.length * percent / 100);
  if (countToEliminate === 0) return [];

  // Find the score at the cutoff boundary
  const cutoffScore = entries[countToEliminate - 1][1];

  // Eliminate all players at or below the cutoff score (handles ties)
  const out = entries
    .filter(([, score]) => score <= cutoffScore)
    .map(([id]) => id);
  // Everyone tied at the cutoff (a round where nobody got a vote, say)
  // would empty the room: nobody goes, the round just repeats.
  if (out.length === entries.length) return [];
  return out;
}

/**
 * An elimination loop ends early once few enough players remain
 * (eliminate.untilRemaining), so the number of rounds follows the size
 * of the class instead of a fixed count: 30 students take more rounds
 * to whittle down than 8. loopCount stays as the ceiling.
 * @param {{ untilRemaining?: number, remaining: number }} opts
 * @returns {boolean}
 */
export function shouldStopLooping({ untilRemaining, remaining }) {
  if (!Number.isInteger(untilRemaining) || untilRemaining < 1) return false;
  return remaining <= untilRemaining;
}
