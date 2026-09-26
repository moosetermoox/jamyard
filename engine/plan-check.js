/**
 * Can this plan run? The Create page's recipe match compiles the AI's
 * params and shows the result as a plan; nothing checked that the result
 * was an activity (2026-09-26, a reviewer's Spanish idea matched Trivia
 * Bluff with "prepared" facts and none written: a welcome screen, a
 * scoreboard over nothing, a wrap-up, and an intro pointing at a step that
 * did not exist). This is the gate: the game validator's errors, then at
 * least one step students act in.
 *
 * Pure: a config in, a reason out (null when it can run).
 */
import { validate } from './game-loader.js';

// The step types a student acts in (the same set the yard's glimpse and
// the make page's print read)
export const INPUT_TYPES = new Set([
  'collect', 'collect-choice', 'rate', 'estimate', 'vote', 'rank', 'sort', 'match',
  'buzz', 'one-voice', 'relay', 'merge', 'turn', 'wager', 'solo-quiz', 'checklist'
]);

function hasInputStep(phases) {
  for (const p of Object.values(phases || {})) {
    if (!p || typeof p !== 'object') continue;
    if (INPUT_TYPES.has(p.type)) return true;
    if (p.type === 'foreach' && hasInputStep(p.phases || p.subPhases)) return true;
  }
  return false;
}

/**
 * @param {object} config  a compiled activity
 * @returns {string|null}  why it cannot run, in a teacher's words, or null
 */
export function planProblem(config) {
  if (!config || typeof config !== 'object' || !config.phases) return 'The plan came back empty.';
  if (!hasInputStep(config.phases)) return 'The plan has no step where students answer, vote, or play.';
  let result;
  try {
    result = validate(config, config.id || 'plan', { returnResults: true });
  } catch (err) {
    return 'The plan did not check out: ' + (err && err.message ? err.message : String(err));
  }
  const errors = (result && Array.isArray(result.errors) ? result.errors : [])
    .concat(result && Array.isArray(result.diagnostics) ? result.diagnostics.filter((d) => d && d.severity === 'error').map((d) => d.message) : []);
  if (errors.length) return 'The plan did not check out: ' + String(errors[0]);
  return null;
}
