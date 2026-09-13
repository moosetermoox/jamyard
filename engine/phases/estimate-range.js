/**
 * The range behind an estimate step: what the student screen turns into a
 * tappable scale (a short integer range) or a slider, and what the server
 * clamps a guess into.
 *
 * Explicit `min`/`max` on the step win. When the step carries neither, the
 * question's own wording is read: "On a scale of 1 to 10", "from 1 to 5",
 * "between 0 and 100", "a 1-10 scale", "out of 10". The AI storyboard is
 * told to set min and max for scale questions, but an activity built
 * before that (the owner's "Guess the Class", 2026-09-12) and any AI
 * output that forgets still gets the scale instead of a bare number box.
 */

const NUM = '(-?\\d+(?:\\.\\d+)?)';
const SEP = '\\s*(?:to|through|thru|-|\u2013)\\s*';

const PATTERNS = [
  // "scale of 1 to 10", "scale from 1 to 5", "range of 0 to 100"
  new RegExp('\\b(?:scale|range)\\s+(?:of|from)\\s+' + NUM + SEP + NUM, 'i'),
  // "a 1-10 scale", "a 1 to 5 scale"
  new RegExp('\\b' + NUM + SEP + NUM + '\\s+scale\\b', 'i'),
  // "from 1 to 10", "between 1 and 100"
  new RegExp('\\b(?:from|between)\\s+' + NUM + '\\s+(?:to|and|through|thru)\\s+' + NUM, 'i')
];

// "out of 10", "out of 5": the scale starts at 1
const OUT_OF = new RegExp('\\bout of\\s+' + NUM + '\\b', 'i');

const MAX_SPAN = 100000;

function pair(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (max <= min || max - min > MAX_SPAN) return null;
  return { min, max };
}

/**
 * @param {string} prompt
 * @returns {{min: number, max: number} | null}
 */
export function inferRange(prompt) {
  const text = String(prompt || '');
  if (!text) return null;
  for (const re of PATTERNS) {
    const m = re.exec(text);
    if (m) {
      const found = pair(parseFloat(m[1]), parseFloat(m[2]));
      if (found) return found;
    }
  }
  const out = OUT_OF.exec(text);
  if (out) {
    const found = pair(1, parseFloat(out[1]));
    if (found) return found;
  }
  return null;
}

/**
 * The range the step runs with: explicit fields first, the wording for
 * whatever they leave open.
 * @param {{prompt?: string, min?: number, max?: number}} phase
 * @returns {{min: number|null, max: number|null}}
 */
export function effectiveRange(phase) {
  const p = phase || {};
  const explicitMin = typeof p.min === 'number' && Number.isFinite(p.min) ? p.min : null;
  const explicitMax = typeof p.max === 'number' && Number.isFinite(p.max) ? p.max : null;
  if (explicitMin !== null && explicitMax !== null) return { min: explicitMin, max: explicitMax };
  const inferred = inferRange(p.prompt) || { min: null, max: null };
  const min = explicitMin !== null ? explicitMin : inferred.min;
  const max = explicitMax !== null ? explicitMax : inferred.max;
  if (min !== null && max !== null && max <= min) return { min: explicitMin, max: explicitMax };
  return { min, max };
}

/** Clamp a guess into the range (either side may be open). */
export function clampGuess(value, range) {
  let v = value;
  if (range && typeof range.min === 'number') v = Math.max(range.min, v);
  if (range && typeof range.max === 'number') v = Math.min(range.max, v);
  return v;
}
