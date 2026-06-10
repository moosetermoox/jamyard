/**
 * Estimate scoring — pure closeness math for the estimate phase.
 *
 * Scoring is rank-based (who was closer), not absolute-error-based, so it
 * is scale-free: the same modes behave identically for "guess 7" and
 * "guess 7 million".
 *
 *   closest    — the closest guess(es) take all the points; ties share
 *   graduated  — points fall off linearly by closeness rank; ties share
 *                the better rank (closest = full points, farthest ≈ points/n)
 */

/**
 * @param {Object<string, number>} guesses  playerId → guessed value
 * @param {number|null} answer              the true value (null = no scoring)
 * @param {number} points                   points for the closest guess
 * @param {'closest'|'graduated'} mode
 * @returns {Object<string, number>}        playerId → score
 */
export function scoreEstimates(guesses, answer, points, mode) {
  if (answer == null || typeof answer !== 'number') return {};
  const entries = Object.entries(guesses)
    .filter(([, g]) => typeof g === 'number' && Number.isFinite(g));
  if (entries.length === 0) return {};

  const distances = entries.map(([id, g]) => [id, Math.abs(g - answer)]);

  if (mode === 'graduated') {
    const n = distances.length;
    const scores = {};
    for (const [id, d] of distances) {
      const strictlyCloser = distances.filter(([, d2]) => d2 < d).length;
      scores[id] = Math.round(points * (n - strictlyCloser) / n);
    }
    return scores;
  }

  // 'closest' (default): winner(s) take all
  const min = Math.min(...distances.map(([, d]) => d));
  const scores = {};
  for (const [id, d] of distances) scores[id] = d === min ? points : 0;
  return scores;
}

/**
 * Class statistics for the reveal moment.
 * @param {Object<string, number>} guesses
 * @param {number|null} answer
 */
export function estimateStats(guesses, answer) {
  const values = Object.values(guesses)
    .filter((g) => typeof g === 'number' && Number.isFinite(g))
    .sort((a, b) => a - b);
  const count = values.length;

  if (count === 0) {
    return { count: 0, average: null, median: null, closest: null, answer: answer ?? null };
  }

  const average = values.reduce((s, v) => s + v, 0) / count;
  const mid = Math.floor(count / 2);
  const median = count % 2 === 1 ? values[mid] : (values[mid - 1] + values[mid]) / 2;

  let closest = null;
  if (answer != null && typeof answer === 'number') {
    closest = values.reduce((best, v) =>
      Math.abs(v - answer) < Math.abs(best - answer) ? v : best, values[0]);
  }

  return { count, average, median, closest, answer: answer ?? null };
}
