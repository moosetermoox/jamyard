/**
 * Reads a storyboard out of a reply that is still arriving.
 *
 * The Create page streams the AI's storyboard so the teacher watches the
 * steps land instead of a spinner (2026-09-20). The reply is one JSON
 * object, unusable until its last brace, so this module finds the parts
 * that are already whole: the name once its closing quote has arrived,
 * and every step object in the "steps" array that has closed. It never
 * throws on a half-written reply; a step that will not parse ends the
 * scan and is simply not reported yet.
 *
 * Pure: text in, values out. The storyboard's meaning (bricks, words) is
 * still decided by the full parse at the end, exactly as before.
 */

const STEPS_OPEN = /"steps"\s*:\s*\[/;
const NAME = /"name"\s*:\s*"((?:[^"\\]|\\.)*)"/;
const CANT_BUILD = /"cantBuild"\s*:\s*true/;

/**
 * Every step object that has fully arrived, in order.
 * @param {string} text the reply so far (may include a ```json fence)
 * @returns {object[]}
 */
export function completeSteps(text) {
  if (typeof text !== 'string') return [];
  const open = STEPS_OPEN.exec(text);
  if (!open) return [];
  const steps = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;
  for (let i = open.index + open[0].length; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
      continue;
    }
    if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          steps.push(JSON.parse(text.slice(start, i + 1)));
        } catch {
          return steps;
        }
        start = -1;
      }
      continue;
    }
    if (c === ']' && depth === 0) break;
  }
  return steps;
}

/**
 * The activity name, once its closing quote has arrived.
 * @param {string} text
 * @returns {string|null}
 */
export function partialName(text) {
  if (typeof text !== 'string') return null;
  const m = NAME.exec(text);
  if (!m) return null;
  try {
    return JSON.parse('"' + m[1] + '"');
  } catch {
    return null;
  }
}

/**
 * True once the reply has declared itself an honest refusal.
 * @param {string} text
 * @returns {boolean}
 */
export function isCantBuild(text) {
  return typeof text === 'string' && CANT_BUILD.test(text);
}
