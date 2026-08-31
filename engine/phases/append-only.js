/**
 * Pure combiner for append-only rotation collects (`collect.appendOnly`).
 *
 * Accumulating chains (one-more-thing's +1 routine) used to prefill the
 * inherited list INTO the editable box — which let any student delete or
 * rewrite a classmate's work before it returned to its author. With
 * appendOnly, the client renders the inherited text read-only and the server
 * rebuilds the stored response from the authoritative assigned text plus
 * whatever the student typed, so the inherited part structurally cannot be
 * altered.
 */

/**
 * @param {string|undefined} assigned the inherited text (server-authoritative)
 * @param {string|undefined} typed what the student added (already filtered)
 * @returns {string} inherited text with the addition on a new line
 */
export function combineAppendOnly(assigned, typed) {
  const base = typeof assigned === 'string' ? assigned.trim() : '';
  const add = typeof typed === 'string' ? typed.trim() : '';
  if (!base) return add;
  if (!add) return base;
  return base + '\n' + add;
}

/**
 * The fold (`collect.showTail`): mask an inherited text down to its last N
 * words for DISPLAY, exquisite-corpse style. The full text stays server-side
 * (combineAppendOnly always works from the authoritative copy), so the final
 * assembly is whole; only what the student sees is folded away. Whitespace
 * inside the visible tail is preserved; a leading ellipsis marks that
 * something is hidden.
 *
 * @param {string} text the full inherited text
 * @param {number} n how many trailing words stay visible
 * @returns {string} the visible tail, or the text unchanged when nothing
 *   needs hiding (short text, or an invalid n)
 */
export function tailOfWords(text, n) {
  if (typeof text !== 'string' || text === '') return text;
  const count = Number(n);
  if (!Number.isInteger(count) || count < 1) return text;
  const starts = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(text)) !== null) starts.push(m.index);
  if (starts.length <= count) return text;
  return '… ' + text.slice(starts[starts.length - count]);
}
