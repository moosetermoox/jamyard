/**
 * Pure scoring for the sort phase — students place items into named
 * buckets (metaphor vs simile, fact vs opinion). Graded when every item
 * declares a correct bucket; a consensus poll when none do. A submission
 * is the chosen bucket names in item order. Kept pure (no I/O) so the
 * mode rules and distribution math are unit-testable; server.closeSorting
 * and the phase handler are the only callers.
 */

/**
 * Clean a teacher-typed (or AI-emitted) items array: trim, coerce to
 * strings, drop rows without text. A missing/blank correct bucket
 * normalizes to null (consensus item).
 *
 * @param {Array<{text?: any, bucket?: any}>} rawItems
 * @returns {Array<{text: string, bucket: string|null}>}
 */
export function normalizeSortItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  const items = [];
  for (const it of rawItems) {
    if (!it || typeof it !== 'object') continue;
    const text = String(it.text ?? '').trim();
    if (!text) continue;
    const bucket = String(it.bucket ?? '').trim();
    items.push({ text, bucket: bucket || null });
  }
  return items;
}

/**
 * Graded when EVERY item carries a correct bucket (the validator rejects
 * mixed configs, so any-vs-every only differs on malformed input).
 *
 * @param {Array<{bucket: string|null}>} items
 * @returns {boolean}
 */
export function isGradedSort(items) {
  return items.length > 0 && items.every(it => !!it.bucket);
}

/**
 * Score every submission: one hit per position where the chosen bucket
 * equals the item's correct bucket. Consensus mode returns empty maps.
 * Every submitter appears in `scores` even at zero (leaderboards sum by
 * key — a missing key reads as "didn't play").
 *
 * @param {Array<{text: string, bucket: string|null}>} items
 * @param {Record<string, string[]>} submissions  playerId → buckets in item order
 * @param {number} [pointsPerItem]
 * @returns {{ scores: Record<string, number>, correctCounts: Record<string, number> }}
 */
export function scoreSorting(items, submissions, pointsPerItem = 10) {
  if (!isGradedSort(items)) return { scores: {}, correctCounts: {} };
  const scores = {};
  const correctCounts = {};
  for (const [playerId, sorting] of Object.entries(submissions || {})) {
    let correct = 0;
    if (Array.isArray(sorting)) {
      for (let i = 0; i < items.length; i++) {
        if (String(sorting[i] ?? '').trim() === items[i].bucket) correct++;
      }
    }
    correctCounts[playerId] = correct;
    scores[playerId] = correct * pointsPerItem;
  }
  return { scores, correctCounts };
}

/**
 * Per-item class distribution — the discussion moment on close. Graded
 * items also get accuracy (`correctCount`/`pct`); consensus items carry
 * pct: null.
 *
 * @param {Array<{text: string, bucket: string|null}>} items
 * @param {string[]} buckets
 * @param {Record<string, string[]>} submissions
 * @returns {Array<{text: string, correct: string|null, counts: Record<string, number>, correctCount: number, total: number, pct: number|null}>}
 */
export function sortStats(items, buckets, submissions) {
  const entries = Object.values(submissions || {}).filter(Array.isArray);
  return items.map((item, i) => {
    const counts = {};
    for (const b of buckets) counts[b] = 0;
    for (const sorting of entries) {
      const chosen = String(sorting[i] ?? '').trim();
      if (counts[chosen] !== undefined) counts[chosen]++;
    }
    const total = entries.length;
    const correctCount = item.bucket ? entries.filter(s => String(s[i] ?? '').trim() === item.bucket).length : 0;
    return {
      text: item.text,
      correct: item.bucket,
      counts,
      correctCount,
      total,
      pct: item.bucket ? (total > 0 ? Math.round((correctCount / total) * 100) : 0) : null
    };
  });
}

/**
 * Human-readable results for `{{phase.resultsList}}` templates. Graded
 * lines show accuracy; consensus lines show the winning bucket.
 *
 * @param {ReturnType<typeof sortStats>} stats
 * @returns {string}
 */
export function buildSortResultsList(stats) {
  return (stats || [])
    .map(s => {
      if (s.correct) return `${s.text} → ${s.correct} (${s.pct}% of the class got it)`;
      const top = Object.entries(s.counts).sort((a, b) => b[1] - a[1])[0];
      return top ? `${s.text} → ${top[0]} (${top[1]} of ${s.total})` : `${s.text} → (no votes)`;
    })
    .join('\n');
}
