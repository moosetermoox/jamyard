/**
 * The words an activity shows its class, as a flat list with paths, so a
 * pass can read or rewrite every one of them without knowing the phase
 * types (2026-09-26, a reviewer's Spanish activity kept the recipe's
 * English vote question and reveal heading: the recipe's own prose is
 * copied through untouched when the AI fills only the params).
 *
 * Pure: a config in, a list of {path, text} out; applyTexts writes a
 * map of path -> text back onto a deep copy. Paths are arrays of keys.
 * Which fields count is the same set the make page swaps words in
 * (SWAP_KEYS in engine/make-print.js): every teacher-facing text field,
 * never an id or a ref. Objects inside those fields (a field's label, a
 * pair's left and right, a quiz question's words and choices, an item's
 * text) are walked by the same keys.
 */

export const TEXT_KEYS = new Set([
  'prompt', 'message', 'instruction', 'content', 'heading', 'title', 'label', 'text',
  'chainHeading', 'chainGrewHeading', 'template', 'itemTemplate', 'question', 'choices',
  'items', 'discussionPrompt', 'explanation', 'candidates', 'gallery', 'questions',
  'fields', 'pairs', 'left', 'right', 'sides', 'roles', 'name', 'description', 'correctAnswer'
]);

// Keys never walked into: ids, refs, and the provenance stamp
const SKIP_KEYS = new Set(['recipe', 'next', 'id', 'from', 'rotateFrom', 'pairsFrom', 'chainFrom', 'teamsFrom', 'rolesFrom', 'groupsFrom', 'reusePairsFrom', 'rotatePairsFrom', 'input', 'image', 'video', 'drawing', 'drawingFrom', 'sampleAnswers', 'approveNext', 'rejectNext', 'nextByWinner', 'loopBack']);

function isWordy(s) {
  return typeof s === 'string' && s.trim() !== '';
}

function walk(value, path, keyed, out) {
  if (typeof value === 'string') {
    if (keyed && isWordy(value)) out.push({ path, text: value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, path.concat(i), keyed, out));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [k, v] of Object.entries(value)) {
    if (SKIP_KEYS.has(k)) continue;
    // Inside a text field an object's own text keys count (a field's
    // label, a pair's left); outside one only TEXT_KEYS open the door
    if (TEXT_KEYS.has(k)) walk(v, path.concat(k), true, out);
    else if (v && typeof v === 'object') walk(v, path.concat(k), false, out);
  }
}

/**
 * Every student-facing or teacher-facing string in the activity.
 * @param {object} config
 * @returns {Array<{path: Array<string|number>, text: string}>}
 */
export function collectTexts(config) {
  const out = [];
  if (!config || typeof config !== 'object') return out;
  if (isWordy(config.name)) out.push({ path: ['name'], text: config.name });
  if (isWordy(config.description)) out.push({ path: ['description'], text: config.description });
  walk(config.phases || {}, ['phases'], false, out);
  return out;
}

/** A path as one string key ("phases.vote.question"). */
export function pathKey(path) {
  return path.map(String).join('.');
}

/**
 * A deep copy of the config with the texts at the given path keys
 * replaced. Unknown keys and non-string replacements are ignored.
 * @param {object} config
 * @param {Object<string, string>} byKey  pathKey -> new text
 */
export function applyTexts(config, byKey) {
  const copy = JSON.parse(JSON.stringify(config));
  for (const { path } of collectTexts(copy)) {
    const next = byKey[pathKey(path)];
    if (typeof next !== 'string' || next.trim() === '') continue;
    let node = copy;
    for (let i = 0; i < path.length - 1; i++) node = node[path[i]];
    node[path[path.length - 1]] = next;
  }
  return copy;
}
