/**
 * Which way a rotation hop turns the circle. A pass-along chain (Story
 * Builder, Idea Chain, One More Thing, Folded Pass) moves every item one
 * seat each hop, so with fewer students than hops an item comes back to the
 * student who started it early: two students in Story Builder got their own
 * story back at the second pass under "A new story lands in your hands" (a
 * reviewer, 2026-10-02).
 *
 * The deal stays a turn of the circle (every receiver gets exactly one
 * item); this picks the turn that hands nobody a chain they started, then
 * nobody the piece they just wrote, and otherwise keeps the usual turn.
 *
 * Pure: ids in, a number out.
 */

/**
 * @param {string[]} senders   the circle, in seat order
 * @param {Object<string, string|null>} originOf  sender id -> who started the item they hold
 * @param {number} preferred   the usual turn (1)
 * @returns {number} the turn to use, 0..N-1 (0 = everyone keeps their own item, a last resort)
 */
export function pickRotationShift(senders, originOf, preferred = 1) {
  const N = senders.length;
  if (N <= 1) return preferred;
  const cost = (k) => {
    let c = 0;
    for (let i = 0; i < N; i++) {
      const receiver = senders[i];
      const sender = senders[((i - k) % N + N) % N];
      if (originOf[sender] && originOf[sender] === receiver) c += 2; // their own chain, home early
      else if (sender === receiver) c += 1;                          // the piece they just wrote
    }
    return c;
  };
  const start = ((preferred % N) + N) % N;
  // The usual turn first, then the others in order, then no turn at all
  const order = [];
  for (let j = 0; j < N; j++) {
    const k = (start + j) % N;
    if (k !== 0) order.push(k);
  }
  order.push(0);
  let best = order[0];
  let bestCost = cost(best);
  for (const k of order.slice(1)) {
    if (bestCost === 0) break;
    const c = cost(k);
    if (c < bestCost) { best = k; bestCost = c; }
  }
  return best;
}
