/**
 * A graded open answer (2026-09-30, the mechanics inventory part four):
 * a collect step with a right answer (and other accepted spellings) is
 * scored at close by a normalized match: lowercased, trimmed, inner
 * spaces collapsed, punctuation at the ends dropped, so "Paris", "paris "
 * and "Paris." all count. Pure; the server's close calls it.
 */

export const DEFAULT_POINTS_CORRECT = 100;

export function normalizeAnswer(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s.,;:!?"'\u2019\u201c\u201d()\[\]]+|[\s.,;:!?"'\u2019\u201c\u201d()\[\]]+$/g, '');
}

/**
 * @param {Array<{playerId: string, text?: string}>} responses
 * @param {string[]} answers  the right answer first, then other accepted ones
 * @param {number} [points]
 * @returns {{ scores: Record<string, number>, correctCount: number, answeredCount: number, rightByPlayer: Record<string, boolean> }}
 */
export function gradeFreeText(responses, answers, points) {
  const pts = Number.isInteger(points) && points >= 1 ? points : DEFAULT_POINTS_CORRECT;
  const accepted = new Set((answers || []).map(normalizeAnswer).filter(Boolean));
  const scores = {};
  const rightByPlayer = {};
  let correctCount = 0;
  let answeredCount = 0;
  for (const r of Array.isArray(responses) ? responses : []) {
    if (!r || !r.playerId) continue;
    answeredCount++;
    const right = accepted.size > 0 && accepted.has(normalizeAnswer(r.text));
    rightByPlayer[r.playerId] = right;
    scores[r.playerId] = right ? pts : 0;
    if (right) correctCount++;
  }
  return { scores, correctCount, answeredCount, rightByPlayer };
}
