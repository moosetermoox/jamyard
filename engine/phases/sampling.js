/**
 * Pure sampling helper for phases that iterate/reveal per-item lists.
 *
 * With 25 students, a foreach over every response is ~13 minutes of identical
 * rounds and a reveal-one gallery is a slideshow nobody watches to the end —
 * the single most common pacing failure in the library (2026-08 coherence
 * review). `limit` lets a phase cap how many items actually run.
 *
 * Sampling is uniform-random without replacement and preserves the source
 * array's relative order, so it composes with foreach's own shuffle (shuffled
 * in → shuffled sample out) and keeps deliberate orderings intact when
 * shuffle is off.
 */

/**
 * Return a uniform random sample of `limit` items, in source order.
 * Invalid limits (missing, non-integer, < 1) and limits >= length return the
 * source array unchanged (same reference — callers treat that as "no cap").
 *
 * @param {Array} items
 * @param {number} limit
 * @param {() => number} [rng] injectable for tests; defaults to Math.random
 */
export function sampleItems(items, limit, rng = Math.random) {
  if (!Array.isArray(items)) return items;
  if (!Number.isInteger(limit) || limit < 1 || limit >= items.length) return items;

  const remaining = items.map((_, i) => i);
  const picked = [];
  for (let n = 0; n < limit; n++) {
    const at = Math.floor(rng() * remaining.length);
    picked.push(remaining[at]);
    remaining.splice(at, 1);
  }
  picked.sort((a, b) => a - b);
  return picked.map(i => items[i]);
}
