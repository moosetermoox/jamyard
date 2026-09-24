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
    // A pick-one step's own plain choices (Live Poll's four) are the
    // teacher's to change on the page (2026-09-24); a quiz's first
    // question's choices belong to its panel
    choicesEditable: phase.type === 'collect-choice' && Array.isArray(phase.choices) && phase.choices.length > 0 && phase.choices.every((c) => isPlainText(c)),
    timer: typeof phase.timer === 'number' ? phase.timer : null,
    // A recipe-born copy recompiles from its stamp; its timer belongs to
    // the recipe (a knob when the recipe offers one), not to this page.
    timerEditable: typeof phase.timer === 'number' && !config.recipe,
    audience,
    // Every match step's pairs (Vocab Match), for the page's pairs panel
    pairs: pairsFor(config),
    // A talk-only activity's questions, tier by tier (Closer)
    talk: talkQuestionsFor(config)
  };
}

/**
 * The questions of a talk-only activity, tier by tier (Closer), read off
 * its announce steps in order so the make page can show them (owner,
 * 2026-09-13: "an expandable section where they just see the questions
 * that are asked at each tier"). A step whose first line is not a
 * question opens a tier and names it; the steps after it whose first
 * line ends in a question mark are its questions. Fewer than two
 * questions in the whole activity = nothing (a welcome message is not a
 * tier). Read only: the steps stay the designer's.
 * @param {object} config
 * @returns {Array<{name: string, questions: string[]}>}
 */
export function talkQuestionsFor(config) {
  const phases = (config && config.phases) || {};
  const tiers = [];
  let current = null;
  let count = 0;
  for (const phase of Object.values(phases)) {
    if (!phase || phase.type !== 'announce' || typeof phase.message !== 'string') continue;
    const first = clean(phase.message.split(/\n/)[0]);
    if (!first) continue;
    if (/\?$/.test(first)) {
      if (!current) { current = { name: '', questions: [] }; tiers.push(current); }
      current.questions.push(first);
      count++;
    } else {
      current = { name: first.replace(/[.:]\s*$/, ''), questions: [] };
      tiers.push(current);
    }
  }
  return count >= 2 ? tiers.filter((t) => t.questions.length > 0) : [];
}

/**
 * The pairs of every top-level match step (Vocab Match's two rounds), so
 * the make page can show and edit them the way the quiz shows its
 * questions (owner, 2026-09-13). Plain-text pairs only; a step whose
 * pairs carry {{tokens}} is left to the designer.
 * @param {object} config
 * @returns {Array<{id: string, label: string, pairs: Array<{left: string, right: string}>}>}
 */
export function pairsFor(config) {
  const phases = (config && config.phases) || {};
  const out = [];
  let n = 0;
  for (const [id, phase] of Object.entries(phases)) {
    if (!phase || phase.type !== 'match' || !Array.isArray(phase.pairs)) continue;
    n++;
    const pairs = phase.pairs
      .map((p) => Array.isArray(p) ? { left: p[0], right: p[1] } : p)
      .filter((p) => p && isPlainText(String(p.left || '')) && isPlainText(String(p.right || '')))
      .map((p) => ({ left: clean(p.left), right: clean(p.right) }));
    if (pairs.length !== phase.pairs.length) continue;
    out.push({ id, label: isPlainText(phase.name) ? clean(phase.name) : 'Round ' + n, pairs });
  }
  return out;
}

/**
 * One more round: a clone of the LAST match step (its timer, points,
 * prompt) with the given pairs, chained right after it. A leaderboard
 * summing `<id>.scores` gains the new round. Mutates `config`.
 * @param {object} config
 * @param {Array<{left: string, right: string}>} pairs
 * @returns {string|null} the new step's id
 */
export function addRound(config, pairs) {
  const phases = config.phases || {};
  const matchIds = Object.keys(phases).filter((id) => phases[id] && phases[id].type === 'match' && Array.isArray(phases[id].pairs));
  if (matchIds.length === 0) return null;
  // The last round: the match step whose next is not another match step
  // (the last in key order when rounds branch)
  const lastId = matchIds.slice().reverse().find((id) => !matchIds.includes(phases[id].next)) || matchIds[matchIds.length - 1];
  const last = phases[lastId];
  let n = matchIds.length + 1;
  let newId = 'round' + n;
  while (phases[newId]) { n++; newId = 'round' + n; }
  const clone = JSON.parse(JSON.stringify(last));
  delete clone.name;
  clone.pairs = pairs;
  clone.next = last.next;
  last.next = newId;
  phases[newId] = clone;
  for (const phase of Object.values(phases)) {
    if (!phase || !Array.isArray(phase.from)) continue;
    const i = phase.from.indexOf(lastId + '.scores');
    if (i !== -1 && !phase.from.includes(newId + '.scores')) phase.from.splice(i + 1, 0, newId + '.scores');
  }
  return newId;
}

/**
 * The teacher's edits, applied to a deep copy of the config.
 * @param {object} config
 * @param {{prompt?: string, fields?: Object<string, string>|string[], timer?: number, pairs?: Object<string, Array<{left: string, right: string}>>|Array<Array<{left: string, right: string}>>, choices?: string[]}} edits
 * @returns {{config: object, changed: boolean}}
 */
export function applyEdits(config, edits) {
  const copy = JSON.parse(JSON.stringify(config));
  const step = firstStudentStep(copy);
  let changed = false;
  edits = { ...(edits || {}) };

  // By position (a class example knows no keys, 2026-09-24): pairs as an
  // array go to the match steps in order, fields as an array to the first
  // student step's fields by index
  if (Array.isArray(edits.pairs)) {
    const matchIds = Object.keys(copy.phases || {}).filter((id) => copy.phases[id] && copy.phases[id].type === 'match');
    const byId = {};
    edits.pairs.forEach((list, i) => { if (matchIds[i] && Array.isArray(list)) byId[matchIds[i]] = list; });
    edits.pairs = byId;
  }
  if (Array.isArray(edits.fields)) {
    const byKey = {};
    if (step && Array.isArray(step.phase.fields)) {
      edits.fields.forEach((label, i) => { if (step.phase.fields[i] && typeof label === 'string') byKey[step.phase.fields[i].key] = label; });
    }
    edits.fields = byKey;
  }

  // The pairs of any match step, by step id: every pair needs both halves,
  // and a step keeps its old pairs when the edit would leave it with none
  if (edits.pairs && typeof edits.pairs === 'object' && !Array.isArray(edits.pairs)) {
    for (const [id, list] of Object.entries(edits.pairs)) {
      const phase = copy.phases && copy.phases[id];
      if (!phase || phase.type !== 'match' || !Array.isArray(phase.pairs) || !Array.isArray(list)) continue;
      const next = list
        .filter((p) => p && typeof p.left === 'string' && typeof p.right === 'string')
        .map((p) => ({ left: clean(p.left), right: clean(p.right) }))
        .filter((p) => p.left && p.right);
      if (next.length === 0) continue;
      if (JSON.stringify(next) !== JSON.stringify(pairsFor({ phases: { [id]: phase } })[0]?.pairs || null)) {
        phase.pairs = next;
        changed = true;
      }
    }
  }

  // New rounds (Vocab Match's "+ round"): each is a clone of the last
  // match step with the new pairs, chained right after it; a leaderboard
  // that sums the rounds picks the new one up
  if (Array.isArray(edits.newRounds)) {
    for (const round of edits.newRounds) {
      const pairs = (Array.isArray(round && round.pairs) ? round.pairs : [])
        .filter((p) => p && typeof p.left === 'string' && typeof p.right === 'string')
        .map((p) => ({ left: clean(p.left), right: clean(p.right) }))
        .filter((p) => p.left && p.right);
      if (pairs.length === 0) continue;
      if (addRound(copy, pairs)) changed = true;
    }
  }

  if (!step) return { config: copy, changed };
  const phase = step.phase;

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
  // The choices of a pick-one step (Live Poll's four), plain strings only
  // (the class examples fill them, 2026-09-24); two or more, else kept
  if (Array.isArray(edits.choices) && phase.type === 'collect-choice' && Array.isArray(phase.choices) && phase.choices.every((c) => typeof c === 'string')) {
    const next = edits.choices.filter((c) => typeof c === 'string').map(clean).filter(Boolean);
    if (next.length >= 2 && JSON.stringify(next) !== JSON.stringify(phase.choices.map(clean))) { phase.choices = next; changed = true; }
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
