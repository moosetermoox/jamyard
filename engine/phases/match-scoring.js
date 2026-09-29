/**
 * Pure scoring for the match phase — players pair items from two lists
 * (vocab ↔ definitions, quotes ↔ authors). The left column is fixed; a
 * submission is the right-item texts in left-item order. Kept pure (no
 * I/O) so the scoring rules are unit-testable; server.closeMatching and
 * the phase handler are the only callers.
 */

/**
 * Clean a teacher-typed (or AI-emitted) pairs array: trim, coerce to
 * strings, drop rows missing either side (leftover empty editor rows).
 *
 * @param {Array<{left?: any, right?: any}>} rawPairs
 * @returns {Array<{left: string, right: string}>}
 */
export function normalizePairs(rawPairs) {
  if (!Array.isArray(rawPairs)) return [];
  const pairs = [];
  for (const p of rawPairs) {
    if (!p || typeof p !== 'object') continue;
    const left = String(p.left ?? '').trim();
    const right = String(p.right ?? '').trim();
    if (!left || !right) continue;
    pairs.push({ left, right });
  }
  return pairs;
}

/**
 * Score every submission: one hit per position where the submitted right
 * text equals the correct pair's right text (trimmed, exact).
 *
 * Every submitter appears in `scores` even at zero — leaderboards sum
 * score maps by key, so a missing key reads as "didn't play".
 *
 * @param {Array<{left: string, right: string}>} pairs
 * @param {Record<string, string[]>} submissions  playerId → right texts in left order
 * @param {number} [pointsPerMatch]
 * @returns {{ scores: Record<string, number>, correctCounts: Record<string, number> }}
 */
export function scoreMatching(pairs, submissions, pointsPerMatch = 10) {
  const scores = {};
  const correctCounts = {};
  for (const [playerId, matching] of Object.entries(submissions || {})) {
    let correct = 0;
    if (Array.isArray(matching)) {
      for (let i = 0; i < pairs.length; i++) {
        if (String(matching[i] ?? '').trim() === pairs[i].right) correct++;
      }
    }
    correctCounts[playerId] = correct;
    scores[playerId] = correct * pointsPerMatch;
  }
  return { scores, correctCounts };
}

/**
 * Per-pair class accuracy — the discussion moment on close ("everyone got
 * cat, half the room missed bird").
 *
 * @param {Array<{left: string, right: string}>} pairs
 * @param {Record<string, string[]>} submissions
 * @returns {Array<{left: string, right: string, correct: number, total: number, pct: number}>}
 */
export function matchStats(pairs, submissions) {
  const entries = Object.values(submissions || {}).filter(Array.isArray);
  return pairs.map((pair, i) => {
    const correct = entries.filter(m => String(m[i] ?? '').trim() === pair.right).length;
    const total = entries.length;
    return {
      left: pair.left,
      right: pair.right,
      correct,
      total,
      pct: total > 0 ? Math.round((correct / total) * 100) : 0
    };
  });
}

/**
 * Human-readable results for `{{phase.resultsList}}` templates.
 *
 * @param {ReturnType<typeof matchStats>} stats
 * @returns {string}
 */
export function buildResultsList(stats) {
  return (stats || [])
    .map(s => `${s.left} → ${s.right} (${s.pct}% of the class got it)`)
    .join('\n');
}

/**
 * The right column's shared deal: shuffled, and no item beside its match
 * (review eighteen: two of six pairs started matched, the old deal only
 * refused a fully solved board). Fixed points are rotated among
 * themselves; a lone one swaps with its neighbor. Duplicate right texts
 * can make it impossible, then it is best effort.
 */
export function dealRightColumn(correctOrder, shuffle) {
  const out = shuffle(correctOrder);
  const n = out.length;
  if (n < 2) return out;
  const fixed = [];
  for (let i = 0; i < n; i++) if (out[i] === correctOrder[i]) fixed.push(i);
  if (fixed.length >= 2) {
    const vals = fixed.map(i => out[i]);
    fixed.forEach((pos, k) => { out[pos] = vals[(k + 1) % vals.length]; });
  } else if (fixed.length === 1) {
    const i = fixed[0];
    const j = (i + 1) % n;
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}
