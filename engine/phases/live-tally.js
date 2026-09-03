/**
 * Live tally for a multiple-choice step with `liveResults: true` (the
 * Live Poll): the projector's bar chart updates as answers land instead
 * of waiting for the close. Counts only, never names; hidden responses
 * are left out just as they are at close.
 *
 * Pure: players + the choice list in, chart rows out. The rows are the
 * exact shape screens/shared/chart-render.js buildChart draws.
 */

/**
 * @param {Array<{response?: *, responseHidden?: boolean}>} players eligible players
 * @param {string[]} choices the step's choices, in display order
 * @returns {{ rows: Array<{label: string, count: number, pct: number}>, answered: number }}
 */
export function buildLiveTally(players, choices) {
  const counts = new Map();
  const order = [];
  for (const c of choices || []) {
    const label = String(c);
    if (!counts.has(label)) { counts.set(label, 0); order.push(label); }
  }
  let answered = 0;
  for (const p of players || []) {
    if (!p || p.responseHidden) continue;
    const r = p.response;
    if (r == null || r === '' || typeof r === 'object') continue;
    const label = String(r);
    answered += 1;
    if (!counts.has(label)) { counts.set(label, 0); order.push(label); }
    counts.set(label, counts.get(label) + 1);
  }
  const rows = order.map(label => {
    const count = counts.get(label);
    return { label, count, pct: answered > 0 ? Math.round((count / answered) * 100) : 0 };
  });
  return { rows, answered };
}
