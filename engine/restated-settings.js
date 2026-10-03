/**
 * Restated settings: a sentence in a recipe or activity that states a number
 * one of its own settings controls ("90 seconds", "three scales", "a group
 * of four"). The recipe layer and the make page let a teacher change the
 * setting; the sentence keeps the old number (docs/ARCHITECTURE-REVIEW-2026-10.md,
 * cause 1: about 15 of 101 reviewer bugs).
 *
 * Pure: a parsed config in, a list of offenses out. The test in
 * tests/style/restated-settings.test.js sweeps recipes/ and games/ with it.
 *
 * What counts as a setting, for a string in a file:
 *  - a recipe parameter's default (a number, or a list's length), anywhere in
 *    the recipe except that parameter's own label, helper, or placeholder (a
 *    helper may say "45 is a good default");
 *  - a list the make page edits in place (scales, choices, fields, pairs,
 *    questions...) anywhere in a recipe, by its length;
 *  - the string's own step: its numeric fields and list lengths (a plain
 *    activity's every number; a recipe's only where bound to a parameter);
 *  - any timer in the file, when the sentence carries a time unit
 *    ("two minutes", "20 seconds").
 *
 * What never counts: the number one ("one thing"), "a minute" and "or two"
 * (idioms), ordinals ("Round 2", "Fact 4", "4) ..."), ranges ("10-25 words",
 * "1–5"), percentages, and anything inside {{...}} or ${...}.
 */

export const PROSE_KEYS = new Set([
  'message', 'prompt', 'instruction', 'content', 'template', 'hostTemplate', 'playerTemplate',
  'title', 'heading', 'discussionPrompt', 'label', 'question', 'chainHeading', 'chainGrewHeading',
  'explanation', 'gallery', 'waitingMessage', 'description', 'placeholder', 'itemTemplate',
  'chainTemplate', 'tagline', 'helper', 'text', 'summary', 'doneMessage'
]);

export const NUMERIC_KEYS = new Set([
  'timer', 'maxLength', 'loopCount', 'rounds', 'groupSize', 'teamCount', 'limit', 'perChoice', 'target',
  'timePerTurn', 'turnTimer', 'poolLimit', 'turns', 'max', 'percent', 'untilRemaining', 'count', 'piles',
  'showTail', 'pointsPerQuestion', 'pointsPerMatch', 'pointsPerItem', 'pointsCorrect', 'voteTimer',
  'resultsLimit', 'maxPicks', 'passAt', 'rotateEvery', 'perSeat', 'first', 'tokens', 'foolPoints', 'speedBonus'
]);

export const LIST_KEYS = new Set([
  'scales', 'choices', 'items', 'questions', 'roles', 'fields', 'pairs', 'buckets', 'sides', 'options',
  'phrases', 'tasks', 'statements'
]);

export const TIMER_KEYS = new Set(['timer', 'timePerTurn', 'turnTimer', 'voteTimer']);

const WORDS = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90, hundred: 100
};
const WORD_RE = 'two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|ninety|hundred';
const ORDINAL_BEFORE = /\b(round|tier|rule|step|question|part|fact|chapter|day|level|stage|phase|#|no\.?|number|page|grade)\s*$/i;
const TIME_RE = new RegExp(
  `\\b(?:a|one) minute and a half\\b|\\bhalf a minute\\b|\\b(a|an|one|${WORD_RE}|\\d+)\\s+(seconds?|secs?|minutes?|mins?)\\b`, 'gi'
);

/**
 * The numbers a sentence states, as a reader would count them.
 * @param {string} text
 * @returns {Array<{n: number, unit: 's'|null, at: string}>} `unit` is 's' for
 *   a time phrase (minutes converted to seconds); `at` is the phrase found
 */
export function numbersIn(text) {
  let t = String(text)
    .replace(/\{\{[^}]*\}\}/g, ' ')
    .replace(/\$\{[^}]*\}/g, ' ')
    .replace(/\d+\s*%/g, ' ')
    .replace(/\b\d+\s*[-–]\s*\d+\b/g, ' ');
  const found = [];
  for (const m of t.matchAll(TIME_RE)) {
    const phrase = m[0];
    if (/and a half/i.test(phrase)) { found.push({ n: 90, unit: 's', at: phrase }); continue; }
    if (/^half/i.test(phrase)) { found.push({ n: 30, unit: 's', at: phrase }); continue; }
    const k = m[1].toLowerCase();
    if (k === 'a' || k === 'an') continue; // "a minute", "a second": idioms for "briefly"
    const base = k === 'one' ? 1 : (WORDS[k] ?? Number(k));
    found.push({ n: /^min/i.test(m[2]) ? base * 60 : base, unit: 's', at: phrase });
  }
  t = t.replace(TIME_RE, ' ');
  const re = new RegExp(`\\b(\\d+)\\b|\\b(${WORD_RE})\\b`, 'gi');
  for (const m of t.matchAll(re)) {
    const before = t.slice(Math.max(0, m.index - 12), m.index);
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 2);
    if (ORDINAL_BEFORE.test(before)) continue;
    if (/\bor\s+$/i.test(before)) continue; // "a sentence or two"
    if (/^\)/.test(after) && /(^|\s)$/.test(before)) continue; // "4) Avoid..."
    const n = m[1] ? Number(m[1]) : WORDS[m[2].toLowerCase()];
    if (!(n > 1)) continue;
    const at = t.slice(Math.max(0, m.index - 10), m.index + m[0].length + 14).replace(/\s+/g, ' ').trim();
    found.push({ n, unit: null, at });
  }
  return found;
}

function paramRef(v) {
  const m = typeof v === 'string' ? v.match(/^\$\{(\w+)\}$/) : null;
  return m ? m[1] : null;
}

/**
 * The settings a step carries: numeric fields and list lengths.
 * In a recipe template a fixed number is the author's and moves with the
 * prose, so only parameter-bound fields count there (a fixed timer still
 * counts for time phrases, `timeOnly`).
 */
export function stepSettings(step, params = {}, { recipe = false } = {}) {
  const out = [];
  for (const [k, v] of Object.entries(step)) {
    if (NUMERIC_KEYS.has(k)) {
      const ref = paramRef(v);
      if (typeof v === 'number') {
        if (!recipe) out.push({ key: k, n: v, time: TIMER_KEYS.has(k) });
        else if (TIMER_KEYS.has(k)) out.push({ key: k, n: v, time: true, timeOnly: true });
      } else if (ref && params[ref] && typeof params[ref].default === 'number') {
        out.push({ key: `${k}=\${${ref}}`, n: params[ref].default, time: TIMER_KEYS.has(k), param: ref });
      }
    }
    if (LIST_KEYS.has(k)) {
      const ref = paramRef(v);
      if (Array.isArray(v)) out.push({ key: `${k}.length`, n: v.length, list: true });
      else if (ref && params[ref] && Array.isArray(params[ref].default)) {
        out.push({ key: `${k}.length=\${${ref}}`, n: params[ref].default.length, list: true, param: ref });
      } else if (v && typeof v === 'object' && typeof v.$map === 'string' && params[v.$map] && Array.isArray(params[v.$map].default)) {
        out.push({ key: `${k}.length=$map ${v.$map}`, n: params[v.$map].default.length, list: true, param: v.$map });
      }
    }
  }
  return out;
}

function collectSteps(node, params, opts, out) {
  if (Array.isArray(node)) { for (const x of node) collectSteps(x, params, opts, out); return; }
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') out.push(...stepSettings(node, params, opts));
  for (const v of Object.values(node)) collectSteps(v, params, opts, out);
}

/**
 * Scan one recipe or activity config.
 * @param {object} json the parsed file (a recipe has `parameters` + `template`)
 * @returns {Array<{path: string, found: string, n: number, hits: string[]}>}
 *   one per number stated that a setting controls; `hits` names the settings
 */
export function scanConfig(json) {
  const recipe = !!json.parameters;
  const params = json.parameters || {};
  const paramValues = [];
  for (const [k, p] of Object.entries(params)) {
    if (typeof p.default === 'number') paramValues.push({ param: k, n: p.default });
    if (Array.isArray(p.default)) paramValues.push({ param: k, n: p.default.length });
  }
  const all = [];
  collectSteps(json.template || json, params, { recipe }, all);
  // Recipe-wide: the lists the make page adds to and drops from. A step's
  // `fields` are its shape (the rope's two sides); only their labels change.
  const lists = recipe ? all.filter(s => s.list && !s.key.startsWith('fields.')) : [];
  const timers = all.filter(s => s.time);
  const offenses = [];

  function walk(node, path, step) {
    if (Array.isArray(node)) { node.forEach((x, i) => walk(x, `${path}[${i}]`, step)); return; }
    if (!node || typeof node !== 'object') return;
    if (typeof node.type === 'string') step = stepSettings(node, params, { recipe });
    const own = path.match(/^\.parameters\.(\w+)$/);
    const ownParam = own ? own[1] : null;
    for (const [k, v] of Object.entries(node)) {
      if (typeof v !== 'string') { walk(v, `${path}.${k}`, step); continue; }
      if (!PROSE_KEYS.has(k)) continue;
      for (const f of numbersIn(v)) {
        const hits = new Set();
        for (const s of paramValues) if (s.n === f.n && s.param !== ownParam) hits.add(`param ${s.param}`);
        for (const s of lists) if (s.n === f.n && s.param !== ownParam) hits.add(`list ${s.key}`);
        for (const s of step || []) if (s.n === f.n && !s.timeOnly && s.param !== ownParam) hits.add(`step ${s.key}`);
        if (f.unit) for (const s of timers) if (s.n === f.n && s.param !== ownParam) hits.add(`timer ${s.key}`);
        if (hits.size) offenses.push({ path: `${path}.${k}`, found: f.at, n: f.n, hits: [...hits] });
      }
    }
  }
  walk(json, '', null);
  return offenses;
}
