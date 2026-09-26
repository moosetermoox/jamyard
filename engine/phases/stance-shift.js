/**
 * A vote taken twice (Both Sides of the Rope: where do you stand, then
 * where do you stand NOW). Pure rules behind a collect-choice step's
 * `chartOrder: "choices"` and `compareTo: "<earlier step>"` (2026-09-26,
 * a reviewer could not read the before/after: each list sorted by count so
 * the order changed between them, options with no votes vanished, and
 * nothing said how many moved).
 *
 *  - orderedTally: the tally in the step's own choice order, zeros kept.
 *  - formatPairedChart: one chart with both counts per row, in the same
 *    text form the screens parse (shared/chart-render.js PAIR_LINE).
 *  - countMoved: how many students picked differently the second time
 *    (only those who voted both times; a late joiner is not "moved").
 *  - movedLine: the sentence under the chart, in the activity's language.
 */
import { translate } from '../i18n/index.js';

const MAX_BAR = 20;

function bar(n, max) {
  const len = max > 0 ? Math.round((n / max) * MAX_BAR) : 0;
  return '█'.repeat(len) + '░'.repeat(MAX_BAR - len);
}

/** The tally as [label, count] pairs: `order` first (zeros kept), then any other label by count. */
export function orderedTally(tally, order) {
  const t = tally && typeof tally === 'object' ? tally : {};
  const seen = new Set();
  const rows = [];
  for (const label of Array.isArray(order) ? order : []) {
    const key = String(label);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push([key, Number(t[key]) || 0]);
  }
  const rest = Object.entries(t)
    .filter(([label]) => !seen.has(String(label)))
    .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))
    .map(([label, n]) => [String(label), Number(n) || 0]);
  return rows.concat(rest);
}

/**
 * "Label  ████░░  2 → ██████  4" per row, one shared scale, in `order`
 * (then anything else either vote saw). Empty when neither vote has a count.
 */
export function formatPairedChart(before, after, order) {
  const labels = orderedTally({ ...(before || {}), ...(after || {}) }, order).map(([label]) => label);
  const b = before && typeof before === 'object' ? before : {};
  const a = after && typeof after === 'object' ? after : {};
  const rows = labels.map(label => [label, Number(b[label]) || 0, Number(a[label]) || 0]);
  const max = Math.max(0, ...rows.map(([, x, y]) => Math.max(x, y)));
  if (rows.length === 0 || max === 0) return '';
  const width = Math.max(...rows.map(([label]) => label.length));
  return rows
    .map(([label, x, y]) => `${label.padEnd(width)}  ${bar(x, max)}  ${x} → ${bar(y, max)}  ${y}`)
    .join('\n');
}

/** {moved, total}: over the players who voted both times. */
export function countMoved(beforeByPlayer, afterByPlayer) {
  const b = beforeByPlayer && typeof beforeByPlayer === 'object' ? beforeByPlayer : {};
  const a = afterByPlayer && typeof afterByPlayer === 'object' ? afterByPlayer : {};
  let moved = 0;
  let total = 0;
  for (const [id, choice] of Object.entries(a)) {
    if (!(id in b)) continue;
    total++;
    if (String(b[id]) !== String(choice)) moved++;
  }
  return { moved, total };
}

/** The sentence for the projector: "3 of 5 students changed their minds." */
export function movedLine(lang, moved, total) {
  if (!total) return '';
  if (moved === 0) return translate(lang, 'Nobody changed their mind.');
  return translate(lang, '{moved} of {total} students changed their minds.')
    .replace('{moved}', String(moved))
    .replace('{total}', String(total));
}
