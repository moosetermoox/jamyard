/**
 * make-print.js — what the Make it yours page draws as "what your class
 * will see", and how the teacher's edits go back into a copy.
 *
 * The print is the FIRST step students answer (the same step the home
 * carousel and the yard's hooks talk about): its prompt, instruction,
 * fields, choices, timer, and the audience line the student screen will
 * carry, computed by the modules the host uses at game time. Not a pixel
 * copy of the projector, the same words.
 *
 * Edits are the two things the page lets a teacher touch: the words of
 * that step (prompt, field labels) and its timer. Everything else is the
 * template's, or the AI's through the reword path. Pure functions.
 */

import { buildActivityMap } from './activity-map.js';
import { audienceLine } from './phases/audience-line.js';
import { resolveLanguage } from './i18n/index.js';

// Steps where students do something on their devices (home-glimpse's set).
const INPUT_TYPES = new Set([
  'collect', 'collect-choice', 'rate', 'estimate', 'vote', 'rank', 'sort',
  'match', 'buzz', 'one-voice', 'relay', 'merge', 'turn', 'wager',
  'solo-quiz', 'checklist'
]);

const NAME_MAX = 48;

function clean(text) {
  // An em dash in teacher text becomes a comma (students read it as an AI tell)
  return String(text || '').replace(/—/g, ', ').replace(/\s+/g, ' ').trim();
}

function isPlainText(value) {
  return typeof value === 'string' && value.trim().length > 0 && !value.includes('{{');
}

/**
 * The first step students answer, walking the activity's map (so branches
 * and rounds are read the way the yard reads them).
 * @param {object} config
 * @returns {{id: string, phase: object}|null}
 */
export function firstStudentStep(config) {
  const phases = (config && config.phases) || {};
  let stops = [];
  try { stops = buildActivityMap(config).stops || []; } catch (err) { stops = []; }
  for (const stop of stops) {
    if (stop.kind !== 'step' || !INPUT_TYPES.has(stop.type)) continue;
    const id = Array.isArray(stop.ids) ? stop.ids[0] : null;
    if (id && phases[id]) return { id, phase: phases[id] };
  }
  // No map (or none of its stops qualify): first input phase in key order
  for (const [id, phase] of Object.entries(phases)) {
    if (phase && INPUT_TYPES.has(phase.type)) return { id, phase };
  }
  return null;
}

/**
 * Everything the page needs to draw the print and know what is editable.
 * @param {object} config
 * @returns {object|null}
 */
export function printFor(config) {
  const step = firstStudentStep(config);
  if (!step) return null;
  const phase = step.phase;
  const lang = resolveLanguage(config);
  let audience = null;
  try { audience = audienceLine(config, step.id, lang).audience; } catch (err) { audience = null; }
  const fields = Array.isArray(phase.fields)
    ? phase.fields.map((f) => ({ key: f.key, label: String(f.label || ''), editable: isPlainText(f.label) }))
    : [];
  let choices = Array.isArray(phase.choices) ? phase.choices.map((c) => (typeof c === 'string' ? c : String(c && c.text || ''))) : [];
  let promptText = typeof phase.prompt === 'string' ? phase.prompt : '';
  let promptEditable = isPlainText(phase.prompt);
  // A self-paced quiz has no prompt of its own: show its first question
  if (phase.type === 'solo-quiz' && Array.isArray(phase.questions) && phase.questions[0] && typeof phase.questions[0].question === 'string') {
    promptText = phase.questions[0].question;
    promptEditable = false;
    if (Array.isArray(phase.questions[0].choices)) choices = phase.questions[0].choices.map(String);
  }
  return {
    name: config.name || '',
    phaseId: step.id,
    type: phase.type,
    inputType: phase.inputType || (phase.type === 'collect-choice' ? 'choice' : 'text'),
    // `display` is what the page draws: a {{token}} (a fact the AI writes
    // at game time, a classmate's answer) reads as a blank, never raw
    prompt: { text: promptText, display: promptText.replace(/\{\{[^}]*\}\}/g, '…').replace(/[ \t]+/g, ' ').trim(), editable: promptEditable },
    instruction: typeof phase.instruction === 'string' ? phase.instruction : null,
    fields,
    choices,
    timer: typeof phase.timer === 'number' ? phase.timer : null,
    // A recipe-born copy recompiles from its stamp; its timer belongs to
    // the recipe (a knob when the recipe offers one), not to this page.
    timerEditable: typeof phase.timer === 'number' && !config.recipe,
    audience
  };
}

/**
 * The teacher's edits, applied to a deep copy of the config.
 * @param {object} config
 * @param {{prompt?: string, fields?: Object<string, string>, timer?: number}} edits
 * @returns {{config: object, changed: boolean}}
 */
export function applyEdits(config, edits) {
  const copy = JSON.parse(JSON.stringify(config));
  const step = firstStudentStep(copy);
  let changed = false;
  if (!step) return { config: copy, changed };
  const phase = step.phase;
  edits = edits || {};

  if (typeof edits.prompt === 'string' && isPlainText(phase.prompt)) {
    const next = clean(edits.prompt);
    if (next && next !== clean(phase.prompt)) { phase.prompt = next; changed = true; }
  }
  if (edits.fields && typeof edits.fields === 'object' && Array.isArray(phase.fields)) {
    for (const field of phase.fields) {
      const next = clean(edits.fields[field.key]);
      if (next && isPlainText(field.label) && next !== clean(field.label)) { field.label = next; changed = true; }
    }
  }
  if (typeof edits.timer === 'number' && Number.isFinite(edits.timer) && typeof phase.timer === 'number' && !copy.recipe) {
    const next = Math.max(10, Math.min(3600, Math.round(edits.timer)));
    if (next !== phase.timer) { phase.timer = next; changed = true; }
  }
  return { config: copy, changed };
}

/**
 * A copy's name: the template plus the new question, cut short, or the
 * usual "(my version)" when the words did not change.
 * @param {string} baseName
 * @param {string} prompt  the new prompt, or '' when unchanged
 */
export function nameFor(baseName, prompt) {
  const text = clean(prompt);
  if (!text) return baseName + ' (my version)';
  if (text.length <= NAME_MAX) return baseName + ': ' + text;
  let cut = text.slice(0, NAME_MAX);
  const space = cut.lastIndexOf(' ');
  if (space > 20) cut = cut.slice(0, space);
  return baseName + ': ' + cut.trim() + '…';
}
