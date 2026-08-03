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
 * @param {Record<string, string>} authorsByText lowercased fake text → authorId
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
    const author = authorsByText[chosen];
    if (author && author !== r.playerId) {
      scores[author] = (scores[author] || 0) + pointsPerFool;
    }
  }
  return scores;
}

/** Sum two {playerId: points} maps without mutating either. */
export function mergeScores(a, b) {
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b || {})) {
    out[k] = (out[k] || 0) + v;
  }
  return out;
}
