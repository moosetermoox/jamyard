/**
 * Drawing input — server-side stroke validation for collect phases with
 * inputType:"drawing".
 *
 * A drawing travels as { strokes: [{ points: [[x,y],...], color, width }] }
 * with coordinates normalized 0..1 so any canvas size can render it (the
 * student's phone, the projector, a moderation thumbnail). The content
 * filter can't read a drawing, so the safety story is attribution +
 * moderation thumbnails + teacher preview — this module's job is purely
 * structural: clamp what can be clamped (a weird touchscreen shouldn't
 * eat a student's drawing), reject only the empty or hopeless, and keep
 * payloads bounded (strokes live in phaseData and room snapshots).
 */

export const DRAWING_LIMITS = Object.freeze({
  maxStrokes: 400,
  maxPointsPerStroke: 400,
  maxPointsTotal: 6000,
  maxWidth: 24
});

const DEFAULT_COLOR = '#111111';
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function clamp01(n) {
  return Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000;
}

/**
 * Validate + normalize a submitted drawing.
 *
 * @param {any} raw  expected { strokes: [...] }
 * @returns {{ ok: true, strokes: Array } | { ok: false, reason: string, message: string }}
 */
export function validateDrawing(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.strokes)) {
    return { ok: false, reason: 'malformed', message: 'That drawing didn\'t come through, try again.' };
  }

  const strokes = [];
  let totalPoints = 0;

  for (const s of raw.strokes) {
    if (strokes.length >= DRAWING_LIMITS.maxStrokes) break;
    if (totalPoints >= DRAWING_LIMITS.maxPointsTotal) break;
    if (!s || typeof s !== 'object' || !Array.isArray(s.points)) continue;

    const points = [];
    for (const p of s.points) {
      if (points.length >= DRAWING_LIMITS.maxPointsPerStroke) break;
      if (totalPoints + points.length >= DRAWING_LIMITS.maxPointsTotal) break;
      if (!Array.isArray(p) || p.length < 2) continue;
      const x = Number(p[0]);
      const y = Number(p[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      points.push([clamp01(x), clamp01(y)]);
    }
    if (points.length === 0) continue;
    totalPoints += points.length;

    const color = typeof s.color === 'string' && HEX_COLOR.test(s.color) ? s.color.toLowerCase() : DEFAULT_COLOR;
    const width = Math.min(DRAWING_LIMITS.maxWidth, Math.max(1, Math.round(Number(s.width) || 4)));
    strokes.push({ points, color, width });
  }

  if (strokes.length === 0) {
    return { ok: false, reason: 'empty', message: 'Draw something first, the canvas is blank.' };
  }
  return { ok: true, strokes };
}

/**
 * Is this stored response value a drawing? (Responses are stored as
 * { strokes } — distinct from multi-field objects and the pass sentinel.)
 */
export function isDrawingResponse(r) {
  return !!(r && typeof r === 'object' && Array.isArray(r.strokes));
}

/**
 * A lighter copy of a drawing for a ballot thumbnail (2026-09-20, the vote
 * over drawings): a whole class's drawings ride to every student at once,
 * so each stroke keeps at most `maxPoints` evenly spaced points (its first
 * and last always), and a busy drawing is thinned further so the whole
 * thumbnail stays under `maxTotal` points; a 120 px canvas cannot tell.
 * The full strokes stay on the collect step for the projector. Pure.
 *
 * @param {Array<{points: Array<[number, number]>}>} strokes
 * @param {number} [maxPoints=24] points kept per stroke
 * @param {number} [maxTotal=600] points kept per drawing
 * @returns {Array} strokes of the same shape
 */
export function thumbnailStrokes(strokes, maxPoints = 24, maxTotal = 600) {
  if (!Array.isArray(strokes) || strokes.length === 0) return [];
  const perStroke = Math.max(2, Math.min(Math.floor(maxPoints), Math.floor(maxTotal / strokes.length)));
  return strokes.map(s => {
    const points = Array.isArray(s && s.points) ? s.points : [];
    if (points.length <= perStroke) return { ...s, points: points.slice() };
    const step = (points.length - 1) / (perStroke - 1);
    const thin = [];
    for (let i = 0; i < perStroke; i++) thin.push(points[Math.round(i * step)]);
    return { ...s, points: thin };
  });
}
