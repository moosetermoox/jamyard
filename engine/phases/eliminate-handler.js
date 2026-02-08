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
  return entries
    .filter(([, score]) => score <= cutoffScore)
    .map(([id]) => id);
}
