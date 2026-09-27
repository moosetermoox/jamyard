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

function namesAuthor(foreach) {
  if (!foreach || typeof foreach !== 'object') return false;
  if (foreach.candidateSource === 'players') return true;
  const subs = foreach.subPhases && typeof foreach.subPhases === 'object' ? Object.values(foreach.subPhases) : [];
  return subs.some(sub => sub && typeof sub === 'object' &&
    ['message', 'prompt', 'template', 'content'].some(k => typeof sub[k] === 'string' && sub[k].includes('_current.playerName')));
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
    if (src && phases[src].next === id) out.push([src, id]);
  }
  return out;
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
    phase.next = gateId;
    rebuilt[gateId] = { type: 'preview', template: GATE_TEMPLATE, approveNext: foreachId, rejectNext: id };
    added.push(gateId);
  }
  config.phases = rebuilt;
  return added;
}
