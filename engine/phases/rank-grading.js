/**
 * A graded rank step (2026-09-30, the mechanics inventory): the teacher
 * names the right order (a timeline, the steps of a process, smallest to
 * largest), the list is shown shuffled, and every student scores points
 * for each item they put in its right slot. Pure; the server's rank
 * close calls it.
 */

export const DEFAULT_POINTS_PER_ITEM = 10;

function norm(s) {
  return String(s == null ? '' : s).trim().toLowerCase();
}

/**
 * @param {Record<string, string[]>} submissions  playerId -> the student's order
 * @param {string[]} correctOrder  the right order
 * @param {string[]} [classOrder]  the aggregated class order, for placedRight
 * @param {number} [pointsPerItem]
 * @returns {{ scores: Record<string, number>, correctList: string, placedRight: number, itemCount: number, rightByPlayer: Record<string, number> }}
 */
export function gradeRankings(submissions, correctOrder, classOrder, pointsPerItem) {
  const points = Number.isInteger(pointsPerItem) && pointsPerItem >= 1 ? pointsPerItem : DEFAULT_POINTS_PER_ITEM;
  const right = (correctOrder || []).map(norm);
  const scores = {};
  const rightByPlayer = {};
  for (const [playerId, order] of Object.entries(submissions || {})) {
    const mine = Array.isArray(order) ? order.map(norm) : [];
    let hits = 0;
    for (let i = 0; i < right.length; i++) if (mine[i] !== undefined && mine[i] === right[i]) hits++;
    rightByPlayer[playerId] = hits;
    scores[playerId] = hits * points;
  }
  const cls = (classOrder || []).map(norm);
  let placedRight = 0;
  for (let i = 0; i < right.length; i++) if (cls[i] !== undefined && cls[i] === right[i]) placedRight++;
  const correctList = (correctOrder || []).map((item, i) => (i + 1) + '. ' + String(item)).join('\n');
  return { scores, correctList, placedRight, itemCount: right.length, rightByPlayer };
}
