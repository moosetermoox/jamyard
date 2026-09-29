/**
 * Audience (outside review #2, 2026-09-07): who will see a student's
 * answer, computed from the phase graph so a teacher never configures it
 * and the label can never drift from what the activity actually does.
 *
 * The student screen shows one short line beside the answer box:
 *   classmate            "One classmate will read this."
 *   class                "Shown to the class."
 *   class-after-review   "Shown to the class after your teacher reviews it."
 *   ai                   "The AI reads these and sums them up for the class."
 *   teacher              "Only your teacher sees your answers."
 * plus "Names are hidden." in anonymous rooms, and a next-step hint on the
 * waiting screen when the following step hands the answer to a classmate.
 *
 * How: every other phase is deep-walked for references to the step
 * ("notes.responses", "{{notes.assigned}}", rotateFrom: "notes", ...) and
 * classified by what that consumer is. A classmate reading it wins over
 * the class seeing it, the class over the AI, and no consumer at all
 * means only the teacher's console ever shows it. "After review" means a
 * preview gate sits on the path from this step to the first class-facing
 * consumer.
 *
 * Pure and dependency-free; the collect handlers translate the label.
 */

export const AUDIENCE = Object.freeze({
  CLASSMATE: 'classmate',
  CLASS: 'class',
  CLASS_AFTER_REVIEW: 'class-after-review',
  // A classmate reads it first, then it goes up in front of everyone
  // (Someone's Got You: the reply lands on the recipient's screen, then
  // the wall).
  CLASSMATE_THEN_CLASS: 'classmate+class',
  CLASSMATE_THEN_CLASS_AFTER_REVIEW: 'classmate+class-after-review',
  // Guess who: the words go up AND the class picks the author (2026-09-26,
  // "Shown to the class" in small print did not say that)
  GUESSED: 'guessed',
  GUESSED_AFTER_REVIEW: 'guessed-after-review',
  AI: 'ai',
  // The step's own totals go up as answers land (a rating's averages, a
  // live poll's bars): no one's answer by name, but never "only your
  // teacher" (Class Critique said so, a reviewer 2026-09-28)
  TALLY: 'tally',
  // A scored round inside For Each (Two Truths' lie vote): nobody sees the
  // pick, the class sees the points on the leaderboard (a reviewer read
  // "Only your teacher sees your answers" and then watched the board name
  // who caught each lie, 2026-09-29)
  SCORED: 'scored',
  TEACHER: 'teacher'
});

export const AUDIENCE_LABELS = Object.freeze({
  [AUDIENCE.CLASSMATE]: 'One classmate will read this.',
  [AUDIENCE.CLASS]: 'Shown to the class.',
  [AUDIENCE.CLASS_AFTER_REVIEW]: 'Shown to the class after your teacher reviews it.',
  [AUDIENCE.CLASSMATE_THEN_CLASS]: 'One classmate will read this, then the class sees it.',
  [AUDIENCE.CLASSMATE_THEN_CLASS_AFTER_REVIEW]: 'One classmate will read this, then the class sees it after your teacher reviews it.',
  [AUDIENCE.GUESSED]: 'Your class will see this and try to guess who wrote it.',
  [AUDIENCE.GUESSED_AFTER_REVIEW]: 'Your class will see this and try to guess who wrote it, after your teacher reviews it.',
  [AUDIENCE.AI]: 'These get summed up for the class.',
  [AUDIENCE.TALLY]: 'The class sees the totals, not who gave which answer.',
  [AUDIENCE.SCORED]: 'Your points go on the class leaderboard.',
  [AUDIENCE.TEACHER]: 'Only your teacher sees your answers.'
});

export const NAMES_HIDDEN_LABEL = 'Names are hidden.';

// The classmate line when the reader is a GROUP, not one person (a
// reviewer's three-student Snowball made a trio and the screen still said
// "One classmate", 2026-09-23). Pairs that come out uneven (an odd class)
// put someone in a triple, and a group of three or four is never one
// classmate. Keyed by the classmate audience keys; "uneven" for pairs the
// count does not split, "few" for groups of three or more.
export const GROUP_LABELS = Object.freeze({
  uneven: Object.freeze({
    [AUDIENCE.CLASSMATE]: 'One or two classmates will read this.',
    [AUDIENCE.CLASSMATE_THEN_CLASS]: 'One or two classmates will read this, then the class sees it.',
    [AUDIENCE.CLASSMATE_THEN_CLASS_AFTER_REVIEW]: 'One or two classmates will read this, then the class sees it after your teacher reviews it.'
  }),
  few: Object.freeze({
    [AUDIENCE.CLASSMATE]: 'A few classmates will read this.',
    [AUDIENCE.CLASSMATE_THEN_CLASS]: 'A few classmates will read this, then the class sees it.',
    [AUDIENCE.CLASSMATE_THEN_CLASS_AFTER_REVIEW]: 'A few classmates will read this, then the class sees it after your teacher reviews it.'
  })
});

/**
 * The label for an audience, given how big the reading group is and how
 * many students are in the room. A rotation or a return-to-author chain
 * (groupSize null) is always exactly one classmate; a pairing splits a
 * class evenly or leaves a triple; a merge of three or four is a few.
 * @param {{key: string, label: string, groupSize: number|null}} a
 * @param {number|null|undefined} playerCount students in the room now
 * @returns {string}
 */
export function labelForGroup(a, playerCount) {
  if (!a || !a.groupSize || !GROUP_LABELS.few[a.key]) return a ? a.label : '';
  if (a.groupSize >= 3) return GROUP_LABELS.few[a.key];
  const n = Number(playerCount);
  if (Number.isInteger(n) && n > 1 && n % a.groupSize !== 0) return GROUP_LABELS.uneven[a.key];
  return a.label;
}
export const NEXT_CLASSMATE_HINT = "Next, you'll get a classmate's idea.";

const AI_TYPES = new Set(['ai-process', 'ai-eliminate']);
const CLASSMATE_TYPES = new Set(['collect', 'merge']);
// Anything that puts material on the projector or in front of everyone.
const CLASS_TYPES = new Set([
  'reveal', 'reveal-one', 'announce', 'winner', 'leaderboard', 'vote', 'rank',
  'rate', 'collect-choice', 'foreach', 'estimate', 'match', 'sort', 'checklist',
  'turn', 'relay', 'eliminate', 'wager', 'buzz', 'one-voice', 'team-split',
  'team-roles', 'end'
]);

// Does this string reference the step? Bare "notes", "notes.responses",
// "{{notes.assigned}}", or a template with "{{notes." inside it.
function stringRefs(value, phaseId) {
  if (typeof value !== 'string') return false;
  const bare = value.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '').trim();
  if (bare === phaseId || bare.startsWith(phaseId + '.')) return true;
  const re = new RegExp('\\{\\{\\s*' + phaseId.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + '\\s*[.}]');
  return re.test(value);
}

// Deep-walk a phase's fields (routing fields excluded) for a reference.
function phaseRefs(phase, phaseId) {
  const skip = new Set(['id', 'type', 'next', 'approveNext', 'rejectNext', 'loopBack', 'nextByWinner']);
  const seen = new Set();
  function walk(value) {
    if (typeof value === 'string') return stringRefs(value, phaseId);
    if (Array.isArray(value)) return value.some(walk);
    if (value && typeof value === 'object') {
      if (seen.has(value)) return false;
      seen.add(value);
      return Object.entries(value).some(([k, v]) => !skip.has(k) && walk(v));
    }
    return false;
  }
  return Object.entries(phase).some(([k, v]) => !skip.has(k) && walk(v));
}

// The path forward from a step along primary transitions, in order.
function pathFrom(phases, startId) {
  const order = [];
  const seen = new Set();
  let current = phases[startId] && (phases[startId].next || phases[startId].approveNext);
  while (typeof current === 'string' && phases[current] && !seen.has(current)) {
    order.push(current);
    seen.add(current);
    const p = phases[current];
    current = p.next || p.approveNext;
  }
  return order;
}

function classify(consumer, phaseId) {
  const t = consumer.type;
  if (t === 'reveal') {
    if (consumer.scope === 'own' && Array.isArray(consumer.chainFrom)) {
      // A chain returning to its author: later hops are read by ONE
      // classmate (the origin's author); the origin itself just comes home.
      return consumer.chainFrom[0] === phaseId ? null : AUDIENCE.CLASSMATE;
    }
    if (consumer.scope === 'pair') return AUDIENCE.CLASSMATE;
    return AUDIENCE.CLASS;
  }
  if (t === 'collect') {
    // Pairing by a pick-one's answers only decides who sits with whom:
    // nobody reads the pick (fist to five's poll said "One classmate will
    // read this", a reviewer 2026-09-27). Anything else here that quotes
    // the step still counts.
    if (consumer.pairBy && consumer.pairBy.from === phaseId) {
      const { pairBy, ...rest } = consumer;
      if (!phaseRefs(rest, phaseId)) return null;
      consumer = rest;
    }
    if (consumer.rotateFrom === phaseId || consumer.rotatePairsFrom === phaseId ||
        consumer.reusePairsFrom === phaseId) return AUDIENCE.CLASSMATE;
    if (consumer.dealItems === phaseId) return AUDIENCE.CLASSMATE;
    // A prompt quoting the partner's piece ({{X.partner}}): one classmate reads it
    if (typeof consumer.prompt === 'string' &&
        new RegExp('\\{\\{\\s*' + phaseId.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + '\\.partner\\s*\\}\\}').test(consumer.prompt)) {
      return AUDIENCE.CLASSMATE;
    }
    // A prompt quoting the whole pile ("{{ask.responses}}") shows it to all
    return AUDIENCE.CLASS;
  }
  if (t === 'merge') return AUDIENCE.CLASSMATE;
  if (AI_TYPES.has(t)) return AUDIENCE.AI;
  if (t === 'preview') return null; // a gate, not a reader
  // Rounds that put each answer up and ask the class WHO wrote it
  if (t === 'foreach' && consumer.candidateSource === 'players' &&
      typeof consumer.data === 'string' && consumer.data.split('.')[0] === phaseId) return AUDIENCE.GUESSED;
  if (CLASS_TYPES.has(t)) return AUDIENCE.CLASS;
  return null;
}

/**
 * @param {object} config  a validated game config
 * @param {string} phaseId a top-level collect / collect-choice step id
 * @returns {{key: string, label: string, namesHidden: boolean, nextHint: string|null}|null}
 *          null when the step is not a top-level phase (a round inside
 *          For Each), where the graph says nothing reliable.
 */
export function audienceFor(config, phaseId) {
  const phases = config && config.phases;
  if (!phases || typeof phases !== 'object' || !phases[phaseId]) return null;

  // A round inside For Each runs under a virtual id ("_fe:rounds:vote")
  // that no step references, so the graph scan below found nothing and
  // said "only your teacher" (2026-09-29). The round's own foreach knows.
  const round = foreachRound(phases, phaseId);
  if (round) return roundAudience(config, phases, round);

  const path = pathFrom(phases, phaseId);
  const pathIndex = new Map(path.map((id, i) => [id, i]));
  let classmate = false;     // one classmate reads it (rotation, pair, return-to-author)
  let groupSize = null;      // the reading group's size when it is a pair or a merge group
  let cls = false;           // it goes in front of everyone
  let guessed = false;       // and the class is asked who wrote it
  let ai = false;            // the AI reads it
  let classIndex = Infinity; // where on the path the first class-facing reader sits
  let nextHint = null;
  let classOnlyTotals = true; // every class-facing reader shows totals, never one answer

  for (const [id, consumer] of Object.entries(phases)) {
    if (id === phaseId || !consumer || typeof consumer !== 'object') continue;
    if (!phaseRefs(consumer, phaseId)) continue;
    const key = classify(consumer, phaseId);
    if (!key) continue;
    if (key === AUDIENCE.CLASSMATE) {
      classmate = true;
      const size = readingGroupSize(consumer);
      if (size && (!groupSize || size > groupSize)) groupSize = size;
      if (consumer.type === 'collect' && path[0] === id) nextHint = NEXT_CLASSMATE_HINT;
    } else if (key === AUDIENCE.CLASS || key === AUDIENCE.GUESSED) {
      cls = true;
      if (key === AUDIENCE.GUESSED) guessed = true;
      if (!readsOnlyTotals(consumer, phaseId)) classOnlyTotals = false;
      const at = pathIndex.has(id) ? pathIndex.get(id) : Infinity;
      if (at < classIndex) classIndex = at;
    } else if (key === AUDIENCE.AI) {
      ai = true;
    }
  }

  const gateBefore = cls && path.some((id, i) => i < classIndex && phases[id].type === 'preview');
  let key;
  if (classmate && cls) {
    key = gateBefore ? AUDIENCE.CLASSMATE_THEN_CLASS_AFTER_REVIEW : AUDIENCE.CLASSMATE_THEN_CLASS;
  } else if (classmate) {
    key = AUDIENCE.CLASSMATE;
  } else if (cls && guessed) {
    key = gateBefore ? AUDIENCE.GUESSED_AFTER_REVIEW : AUDIENCE.GUESSED;
  } else if (cls && showsOwnTotals(phases[phaseId]) && classOnlyTotals && !gateBefore) {
    // Live Poll: the bars are up while the step runs and the results screen
    // shows the same bars, so nobody's answer ever goes up by name. The
    // console used to say "Only you can see these until the reveal" beside
    // a projector already drawing them (2026-09-29).
    key = AUDIENCE.TALLY;
  } else if (cls) {
    key = gateBefore ? AUDIENCE.CLASS_AFTER_REVIEW : AUDIENCE.CLASS;
  } else if (showsOwnTotals(phases[phaseId])) {
    key = AUDIENCE.TALLY;
  } else if (ai) {
    key = AUDIENCE.AI;
  } else {
    key = AUDIENCE.TEACHER;
  }
  return {
    key,
    label: AUDIENCE_LABELS[key],
    namesHidden: config.anonymous === true,
    nextHint,
    // null = exactly one classmate (a rotation, a chain coming home);
    // 2 = a pairing (a triple when the class is odd); 3 or 4 = a merge group
    groupSize
  };
}

// Outputs of a step that are totals, never one student's answer
const TOTAL_OUTPUTS = new Set([
  'barChart', 'tally', 'beforeAfter', 'movedLine', 'results', 'resultsList',
  'average', 'averages', 'count', 'counts', 'chart', 'distribution', 'summary'
]);

// Does this consumer read the step only through its totals? A bare
// reference ("ask") or one to the answers ("ask.responses", "ask.byPlayer")
// puts single answers in front of the class.
function readsOnlyTotals(consumer, phaseId) {
  const skip = new Set(['id', 'type', 'next', 'approveNext', 'rejectNext', 'loopBack', 'nextByWinner']);
  const escaped = phaseId.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  const inTemplate = new RegExp('\\{\\{\\s*' + escaped + '(?:\\.([A-Za-z0-9_]+))?\\s*[.}|]', 'g');
  let onlyTotals = true;
  const seen = new Set();
  function check(first) { if (!first || !TOTAL_OUTPUTS.has(first)) onlyTotals = false; }
  function walk(value) {
    if (typeof value === 'string') {
      const bare = value.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '').trim();
      if (bare === phaseId) check(null);
      else if (bare.startsWith(phaseId + '.')) check(bare.slice(phaseId.length + 1).split(/[.\s|}]/)[0]);
      let m;
      inTemplate.lastIndex = 0;
      while ((m = inTemplate.exec(value))) check(m[1] || null);
      return;
    }
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (value && typeof value === 'object' && !seen.has(value)) {
      seen.add(value);
      for (const [k, v] of Object.entries(value)) if (!skip.has(k)) walk(v);
    }
  }
  for (const [k, v] of Object.entries(consumer)) if (!skip.has(k)) walk(v);
  return onlyTotals;
}

// "_fe:<foreach>:<name>" -> the round's foreach and name, when both exist
function foreachRound(phases, phaseId) {
  const m = /^_fe:(.+):([^:]+)$/.exec(String(phaseId));
  if (!m) return null;
  const foreach = phases[m[1]];
  if (!foreach || foreach.type !== 'foreach' || !foreach.subPhases || !foreach.subPhases[m[2]]) return null;
  return { feId: m[1], name: m[2], foreach, step: foreach.subPhases[m[2]] };
}

// The audience of a round inside For Each. A scored round (the foreach's
// scoring.subPhase) whose scores a later step shows puts points on the
// board; a round a sibling step quotes goes in front of the class; a round
// with live totals shows those; anything else stays with the teacher.
function roundAudience(config, phases, { feId, name, foreach, step }) {
  const scored = !!(foreach.scoring && foreach.scoring.subPhase === name);
  let key;
  if (scored && Object.entries(phases).some(([id, p]) => id !== feId && p && typeof p === 'object' &&
      CLASS_TYPES.has(p.type) && phaseRefs(p, feId))) {
    key = AUDIENCE.SCORED;
  } else if (Object.entries(foreach.subPhases).some(([sib, p]) => sib !== name && p && typeof p === 'object' &&
      CLASS_TYPES.has(p.type) && phaseRefs(p, name))) {
    key = AUDIENCE.CLASS;
  } else if (showsOwnTotals(step)) {
    key = AUDIENCE.TALLY;
  } else {
    key = AUDIENCE.TEACHER;
  }
  return { key, label: AUDIENCE_LABELS[key], namesHidden: config.anonymous === true, nextHint: null, groupSize: null };
}

// A step whose own results go on the projector while it runs
function showsOwnTotals(step) {
  if (!step) return false;
  if (step.type === 'rate') return step.visibility !== 'host-only';
  if (step.type === 'collect-choice') return step.liveResults === true;
  return false;
}

// How many students read together at this consumer: a merge's group, a
// pairwise collect's pair. A rotation or a dealt list is one reader.
function readingGroupSize(consumer) {
  if (consumer.type === 'merge') {
    if (consumer.groupsFrom) return 2;
    const n = Number(consumer.groupSize);
    return Number.isInteger(n) && n >= 2 ? n : 2;
  }
  if (consumer.type === 'collect') {
    if (consumer.assign === 'pairwise' || consumer.rotatePairsFrom || consumer.reusePairsFrom ||
        (consumer.pairBy && typeof consumer.pairBy === 'object')) return 2;
    return null;
  }
  if (consumer.type === 'reveal' && consumer.scope === 'pair') return 2;
  return null;
}
