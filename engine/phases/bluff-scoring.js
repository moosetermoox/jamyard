/**
 * Pure scoring for the bluffing family's second half: "fooling others scores
 * too." collect-choice's `correctAnswer` grading pays truth-SPOTTERS;
 * `foolPoints` pays the AUTHOR of a fake for every classmate who fell for it
 * (Fibbage/Balderdash's actual payoff — definition-bluff and trivia-bluff
 * promised this in their descriptions for months without any code behind it).
 *
 * Text matching uses the same trim+lowercase key as collect-choice's pool
 * dedupe, so a vote always maps back to the fake it was cast for.
 */

/**
 * @param {Array<{playerId: string, choice?: string, text?: string}>} responses votes
 * @param {Record<string, string|string[]>} authorsByText lowercased fake text → authorId,
 *   or every author of that text (two students who wrote the same fake share
 *   one ballot option, and each of them fooled whoever picked it)
 * @param {string|null} correctAnswer votes for this never award anyone
 * @param {number} pointsPerFool points the author earns per fooled classmate
 * @returns {Record<string, number>} authorId → points
 */
export function foolPoints({ responses, authorsByText, correctAnswer, pointsPerFool = 50 }) {
  const norm = (s) => String(s).trim().toLowerCase();
  const correct = correctAnswer != null ? norm(correctAnswer) : null;
  const scores = {};
  for (const r of responses || []) {
    if (!r || !r.playerId) continue;
    const raw = r.choice != null ? r.choice : r.text;
    if (raw == null) continue;
    const chosen = norm(raw);
    if (!chosen || chosen === correct) continue;
    const found = authorsByText[chosen];
    const authors = Array.isArray(found) ? found : (found ? [found] : []);
    for (const author of authors) {
      if (author && author !== r.playerId) {
        scores[author] = (scores[author] || 0) + pointsPerFool;
      }
    }
  }
  return scores;
}

/**
 * The fakes' authors keyed by the ballot's text key (trim + lowercase, the
 * collect-choice pool dedupe). Every author of a text is kept: before
 * 2026-10-02 the last writer of a duplicate fake took all its points.
 * @param {Array<{playerId?: string, text?: unknown}>} fakes
 * @returns {Record<string, string[]>}
 */
export function authorsByTextOf(fakes) {
  const out = {};
  for (const f of fakes || []) {
    if (!f || !f.playerId || f.text == null) continue;
    const key = String(f.text).trim().toLowerCase();
    if (!key) continue;
    if (!out[key]) out[key] = [];
    if (!out[key].includes(f.playerId)) out[key].push(f.playerId);
  }
  return out;
}

/** Sum two {playerId: points} maps without mutating either. */
export function mergeScores(a, b) {
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b || {})) {
    out[k] = (out[k] || 0) + v;
  }
  return out;
}
