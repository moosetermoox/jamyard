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
 * @returns {{ rows: Array<{label: string, count: number, pct: number}>, answered: number, held: boolean }}
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
    if (r == null || r === '') continue;
    // Several picks (maxPicks, 2026-09-30): one answer, every pick counted
    const picks = Array.isArray(r) ? r.filter(x => typeof x === 'string' && x.trim()) : (typeof r === 'object' ? [] : [r]);
    if (picks.length === 0) continue;
    answered += 1;
    for (const pick of picks) {
      const label = String(pick);
      if (!counts.has(label)) { counts.set(label, 0); order.push(label); }
      counts.set(label, counts.get(label) + 1);
    }
  }
  // Held back until a few have answered (a reviewer, 2026-10-02: the first
  // vote went up as 100%, so the room saw what that one student picked).
  // Below the floor every bar reads zero; the close shows the real chart.
  const held = answered < LIVE_TALLY_MIN_ANSWERS;
  const rows = order.map(label => {
    const count = held ? 0 : counts.get(label);
    return { label, count, pct: !held && answered > 0 ? Math.round((count / answered) * 100) : 0 };
  });
  return { rows, answered, held };
}

/**
 * The fewest answers the live chart shows. One or two answers on a growing
 * chart name what those students picked to everyone watching them tap.
 */
export const LIVE_TALLY_MIN_ANSWERS = 3;
