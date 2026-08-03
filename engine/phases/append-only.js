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
