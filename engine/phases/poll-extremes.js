/**
 * The most and the least picked choice of a closed pick-one step
 * (2026-09-30, the mechanics inventory): "{{poll.least}} goes first" is
 * a minority turn with no new step, "{{poll.most}} wins the class" the
 * majority. Ties keep the choice listed first in the step's order.
 */

/**
 * @param {Record<string, number>} tally  choice -> count
 * @param {string[]} [order]  the step's choices, first wins a tie
 * @returns {{ most: string, least: string, mostCount: number, leastCount: number }}
 */
export function pollExtremes(tally, order) {
  const counts = tally && typeof tally === 'object' ? tally : {};
  const keys = [];
  for (const c of order || []) {
    const k = String(c == null ? '' : c).trim();
    if (k && k in counts && !keys.includes(k)) keys.push(k);
  }
  for (const k of Object.keys(counts)) if (!keys.includes(k)) keys.push(k);
  if (keys.length === 0) return { most: '', least: '', mostCount: 0, leastCount: 0 };
  let most = keys[0];
  let least = keys[0];
  for (const k of keys) {
    if ((counts[k] || 0) > (counts[most] || 0)) most = k;
    if ((counts[k] || 0) < (counts[least] || 0)) least = k;
  }
  return { most, least, mostCount: counts[most] || 0, leastCount: counts[least] || 0 };
}
