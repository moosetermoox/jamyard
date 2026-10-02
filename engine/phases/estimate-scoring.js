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
 * How close one guess is, 0 to 1 (2026-10-01, owner: "points based on how
 * close you are", e.g. the area of Yemen). For two positive numbers it is
 * the smaller over the larger, so twice the answer and half the answer
 * both earn half: fair at any scale and the same for over and under. With
 * zero or negative numbers in play it falls back to the gap over the
 * answer's size.
 */
export function closeness(guess, answer) {
  if (typeof guess !== 'number' || typeof answer !== 'number' || !Number.isFinite(guess) || !Number.isFinite(answer)) return 0;
  if (guess === answer) return 1;
  if (guess > 0 && answer > 0) return Math.min(guess, answer) / Math.max(guess, answer);
  const span = Math.max(Math.abs(answer), 1);
  return Math.max(0, 1 - Math.abs(guess - answer) / span);
}

/**
 * The distance mode: every guess earns points × its closeness, rounded.
 * @returns {Object<string, number>} playerId → score
 */
export function scoreByDistance(guesses, answer, points) {
  if (answer == null || typeof answer !== 'number') return {};
  const scores = {};
  for (const [id, g] of Object.entries(guesses || {})) {
    if (typeof g !== 'number' || !Number.isFinite(g)) continue;
    scores[id] = Math.round(points * closeness(g, answer));
  }
  return scores;
}

/**
 * The quiz's speed bonus on a guess's points (engine/speed-scoring.js):
 * an instant guess keeps all of them, a guess at the buzzer keeps half,
 * linear between. The time is the student's LAST guess (changing your
 * mind costs a little speed). No timer, no bonus to give: scores unchanged.
 */
export function withSpeedBonus(scores, guessedAt, startedAt, timerSeconds) {
  if (!timerSeconds || timerSeconds <= 0 || !startedAt) return { ...scores };
  const out = {};
  for (const [id, pts] of Object.entries(scores || {})) {
    const at = guessedAt && guessedAt[id];
    const elapsed = at ? Math.max(0, (at - startedAt) / 1000) : timerSeconds;
    const factor = 1 - Math.min(1, elapsed / timerSeconds) / 2;
    out[id] = Math.round(pts * factor);
  }
  return out;
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
