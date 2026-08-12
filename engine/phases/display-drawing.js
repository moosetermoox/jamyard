/**
 * Resolve a phase's `drawingFrom` ref into a strokes array, or null.
 *
 * `drawingFrom` shows a read-only drawing on every screen while the phase
 * runs. The headline use is `_current.drawing` inside a foreach over drawing
 * responses (Doodle Bluff: the class titles and votes on one drawing per
 * round), which is why resolution happens at phase enter, when the foreach
 * iteration item is live, instead of at config load.
 *
 * Accepts the three shapes a drawing travels in:
 *   - a bare strokes array (collect stores `response.drawing` this way)
 *   - a response object with `.drawing`
 *   - a raw submission with `.strokes`
 */
export function resolveDisplayDrawing(phase, engine) {
  if (!phase.drawingFrom) return null;
  const value = engine.resolve(phase.drawingFrom);
  let strokes = null;
  if (Array.isArray(value)) strokes = value;
  else if (value && typeof value === 'object') {
    if (Array.isArray(value.drawing)) strokes = value.drawing;
    else if (Array.isArray(value.strokes)) strokes = value.strokes;
  }
  if (!strokes || strokes.length === 0) {
    if (value !== undefined && value !== null) {
      console.warn(`[${phase.id || phase.type}] drawingFrom "${phase.drawingFrom}" did not resolve to a drawing`);
    }
    return null;
  }
  return strokes;
}
