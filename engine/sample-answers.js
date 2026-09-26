/**
 * Sample answers (outside review #2, 2026-09-07): hand-authored practice
 * responses a template carries so "Add sample answers" in Try it out shows
 * a COHERENT result (a goal and the encouragement that answers it) instead
 * of the keyword bot's "Cold pizza, no contest." No AI call: fixed data on
 * the config, dealt by seat.
 *
 * Shape, top-level `sampleAnswers` on a config:
 *
 *   {
 *     "notes": ["I want to speak up once in science.", ...],
 *     "boost": { "respondsTo": "notes", "lines": ["Your questions help...", ...] },
 *     "ticket": [["One thing I learned", "One question I have"], ...]
 *   }
 *
 * - A key is a collect step id. A plain array deals line i to seat i.
 * - `respondsTo` names an earlier step whose text the student sees in the
 *   prompt (a rotation, an append chain); `lines[j]` answers that step's
 *   line j, so the picker can match by what is on screen. Both arrays
 *   must be the same length.
 * - A line is a string, or an array of strings for a multi-field step
 *   (one per field, in order).
 *
 * Author-written, never student content: safe to save with the config.
 * The picker itself lives in screens/shared/bot-brain.js (browser side);
 * this module validates.
 */

function isLine(v) {
  if (typeof v === 'string') return v.trim() !== '';
  return Array.isArray(v) && v.length > 0 && v.every(s => typeof s === 'string');
}

function isLineList(v) {
  return Array.isArray(v) && v.length > 0 && v.every(isLine);
}

/**
 * @param {object} config
 * @param {string} gameId
 * @returns {string[]} error messages (empty when valid or absent)
 */
// The lines a respondsTo set answers: a plain list, or the lines of a set
// that itself responds to an earlier step (a chain of rounds, 2026-09-26)
export function sourceLines(samples, stepId) {
  const src = samples && samples[stepId];
  if (Array.isArray(src)) return src;
  if (src && typeof src === 'object' && Array.isArray(src.lines)) return src.lines;
  return null;
}

export function validateSampleAnswers(config, gameId) {
  const errors = [];
  const samples = config && config.sampleAnswers;
  if (samples === undefined) return errors;
  const where = `Game "${gameId}": "sampleAnswers"`;
  if (!samples || typeof samples !== 'object' || Array.isArray(samples)) {
    errors.push(`${where} must be an object keyed by step id`);
    return errors;
  }
  const phases = (config.phases && typeof config.phases === 'object') ? config.phases : {};
  for (const [stepId, entry] of Object.entries(samples)) {
    const phase = phases[stepId];
    if (!phase) {
      errors.push(`${where}.${stepId} names a step that does not exist`);
      continue;
    }
    if (phase.type !== 'collect') {
      errors.push(`${where}.${stepId} must name a collect step (it is ${phase.type})`);
      continue;
    }
    if (Array.isArray(entry)) {
      if (!isLineList(entry)) {
        errors.push(`${where}.${stepId} must be a non-empty list of lines (strings, or arrays of strings for multi-field steps)`);
      }
      continue;
    }
    if (!entry || typeof entry !== 'object') {
      errors.push(`${where}.${stepId} must be a list of lines or {respondsTo, lines}`);
      continue;
    }
    if (typeof entry.respondsTo !== 'string' || !entry.respondsTo) {
      errors.push(`${where}.${stepId}.respondsTo must name an earlier step`);
    } else if (!sourceLines(samples, entry.respondsTo)) {
      errors.push(`${where}.${stepId}.respondsTo names "${entry.respondsTo}", which has no list of sample answers to respond to`);
    }
    const src = sourceLines(samples, entry.respondsTo);
    if (!isLineList(entry.lines)) {
      errors.push(`${where}.${stepId}.lines must be a non-empty list of lines`);
    } else if (src && src.length !== entry.lines.length) {
      errors.push(`${where}.${stepId}.lines must have one line per "${entry.respondsTo}" sample (${src.length} there, ${entry.lines.length} here)`);
    }
  }
  return errors;
}
