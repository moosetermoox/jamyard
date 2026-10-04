/**
 * A student's own words never reach the projector with their name on them
 * without a teacher gate (2026-09-26: a reviewer's "My parents are getting
 * divorced and I can't sleep" went straight up in Guess Who: Rose, Bud,
 * Thorn, with the class asked to guess who wrote it).
 *
 * The storyboard compiler puts a preview step before guessing rounds now;
 * this repairs the copies saved before it did, on read (server.js
 * repairSavedConfig), and the validator can ask the same question.
 *
 * The shape it guards: a For Each over `<collect>.responses` that names or
 * guesses the author (candidateSource "players", or a round that shows
 * {{_current.playerName}}), reached straight from that collect. A preview
 * step is put between them: approve = the rounds, reject = answer again.
 */

export const GATE_TEMPLATE = 'Read the answers below before the rounds start. One a student would rather keep private? Press Hide beside it on your Teacher view. Try again asks everyone to answer again.';

// A round's text that puts the author's name up: the item carries both
// `playerName` (stamped at enter) and `name` (the response's own), and a
// template may read either (Doodle Bluff's rounds read `_current.name`;
// the sweep of 2026-10-03 found only the first was looked for).
export const AUTHOR_NAME_TOKEN = /\{\{\s*_current\.(playerName|name)\s*[.|}]/;

function mentionsAuthor(value, seen = new Set()) {
  if (typeof value === 'string') return AUTHOR_NAME_TOKEN.test(value);
  if (Array.isArray(value)) return value.some(v => mentionsAuthor(v, seen));
  if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    return Object.values(value).some(v => mentionsAuthor(v, seen));
  }
  return false;
}

export function namesAuthor(foreach) {
  if (!foreach || typeof foreach !== 'object') return false;
  if (foreach.candidateSource === 'players') return true;
  const subs = foreach.subPhases && typeof foreach.subPhases === 'object' ? Object.values(foreach.subPhases) : [];
  // every string the round shows, whichever field holds it
  return subs.some(sub => sub && typeof sub === 'object' && mentionsAuthor(sub));
}

function sourceCollectOf(phases, foreach) {
  const m = typeof foreach.data === 'string' && foreach.data.match(/^([A-Za-z0-9_-]+)\.responses$/);
  if (!m) return null;
  const src = phases[m[1]];
  return src && src.type === 'collect' ? m[1] : null;
}

/**
 * The [collectId, foreachId] pairs that need a gate (none when every one
 * has it). `secretOnly`: just the rounds where the author is the secret
 * the class guesses (candidateSource "players"), the shape the read
 * repair fixes without asking; the validator asks about the wider shape
 * (any round that names the author) as advice.
 */
export function ungatedRounds(config, opts = {}) {
  const phases = config && config.phases;
  if (!phases || typeof phases !== 'object') return [];
  const out = [];
  for (const [id, phase] of Object.entries(phases)) {
    if (!phase || phase.type !== 'foreach' || !namesAuthor(phase)) continue;
    if (opts.secretOnly && phase.candidateSource !== 'players') continue;
    const src = sourceCollectOf(phases, phase);
    if (src && reachesThroughAnnounces(phases, src, id)) out.push([src, id]);
  }
  return out;
}

/**
 * True when the collect reaches the rounds with nothing but announces in
 * between (the live Guess Who row goes collect, a "Now we guess" card,
 * then the rounds: an eleventh review found it still ungated, 2026-09-27).
 * A preview, a step that changes the answers, or a fork on the way counts
 * as something between them.
 */
function reachesThroughAnnounces(phases, fromId, toId) {
  let at = phases[fromId] && phases[fromId].next;
  const seen = new Set([fromId]);
  while (typeof at === 'string' && !seen.has(at)) {
    if (at === toId) return true;
    const p = phases[at];
    if (!p || p.type !== 'announce') return false;
    seen.add(at);
    at = p.next;
  }
  return false;
}

/**
 * The payoff of a guess-who round is the teacher's to pace, and it says
 * who guessed right (2026-10-02: a reviewer's Rose, Bud, Thorn flashed
 * "It was X" for five seconds and never named who had it). For every
 * round whose author is the secret (candidateSource "players"): the step
 * that names the author loses its timer, and gets the guess step's
 * {{<guess>.rightLine}} under it when it has none. In place; used by the
 * read repair and safe to run twice.
 * @returns {string[]} "<foreach>.<sub>" for every step changed
 */
export function paceGuessWhoReveals(config) {
  const phases = config && config.phases;
  if (!phases || typeof phases !== 'object') return [];
  const changed = [];
  for (const [feId, fe] of Object.entries(phases)) {
    if (!fe || fe.type !== 'foreach' || fe.candidateSource !== 'players') continue;
    const subs = fe.subPhases && typeof fe.subPhases === 'object' ? fe.subPhases : null;
    if (!subs) continue;
    const keys = Object.keys(subs);
    const guessKey = keys.find(k => subs[k] && subs[k].type === 'collect-choice' && subs[k].choices === '_candidates');
    if (!guessKey) continue;
    for (const k of keys.slice(keys.indexOf(guessKey) + 1)) {
      const sub = subs[k];
      if (!sub || (sub.type !== 'announce' && sub.type !== 'reveal')) continue;
      const field = sub.type === 'announce' ? 'message' : 'template';
      if (typeof sub[field] !== 'string' || !sub[field].includes('_current.playerName')) continue;
      let touched = false;
      if (sub.timer) { delete sub.timer; touched = true; }
      if (!/\.rightLine\}\}/.test(sub[field])) {
        sub[field] = sub[field] + '\n\n{{' + guessKey + '.rightLine}}';
        touched = true;
      }
      if (touched) changed.push(feId + '.' + k);
    }
  }
  return changed;
}

/**
 * Put a preview step between each ungated collect and its rounds, in
 * place (the key order keeps the collect, the gate, then the rest).
 * @returns {string[]} the ids of the gates added
 */
export function ensureReviewGate(config, opts = {}) {
  const pairs = ungatedRounds(config, opts);
  if (pairs.length === 0) return [];
  const phases = config.phases;
  const added = [];
  const rebuilt = {};
  const gateFor = new Map(pairs);
  for (const [id, phase] of Object.entries(phases)) {
    rebuilt[id] = phase;
    if (!gateFor.has(id)) continue;
    const foreachId = gateFor.get(id);
    let gateId = foreachId + '-check';
    while (phases[gateId] || rebuilt[gateId]) gateId += '-2';
    // The gate goes right after the collect; approve continues to whatever
    // came next (an announce on the way, or the rounds themselves)
    const afterGate = phase.next;
    phase.next = gateId;
    rebuilt[gateId] = { type: 'preview', template: GATE_TEMPLATE, approveNext: afterGate, rejectNext: id };
    added.push(gateId);
  }
  config.phases = rebuilt;
  return added;
}
