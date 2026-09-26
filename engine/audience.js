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
  AI: 'ai',
  TEACHER: 'teacher'
});

export const AUDIENCE_LABELS = Object.freeze({
  [AUDIENCE.CLASSMATE]: 'One classmate will read this.',
  [AUDIENCE.CLASS]: 'Shown to the class.',
  [AUDIENCE.CLASS_AFTER_REVIEW]: 'Shown to the class after your teacher reviews it.',
  [AUDIENCE.CLASSMATE_THEN_CLASS]: 'One classmate will read this, then the class sees it.',
  [AUDIENCE.CLASSMATE_THEN_CLASS_AFTER_REVIEW]: 'One classmate will read this, then the class sees it after your teacher reviews it.',
  [AUDIENCE.AI]: 'These get summed up for the class.',
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
    if (consumer.rotateFrom === phaseId || consumer.rotatePairsFrom === phaseId ||
        consumer.reusePairsFrom === phaseId ||
        (consumer.pairBy && consumer.pairBy.from === phaseId)) return AUDIENCE.CLASSMATE;
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

  const path = pathFrom(phases, phaseId);
  const pathIndex = new Map(path.map((id, i) => [id, i]));
  let classmate = false;     // one classmate reads it (rotation, pair, return-to-author)
  let groupSize = null;      // the reading group's size when it is a pair or a merge group
  let cls = false;           // it goes in front of everyone
  let ai = false;            // the AI reads it
  let classIndex = Infinity; // where on the path the first class-facing reader sits
  let nextHint = null;

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
    } else if (key === AUDIENCE.CLASS) {
      cls = true;
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
  } else if (cls) {
    key = gateBefore ? AUDIENCE.CLASS_AFTER_REVIEW : AUDIENCE.CLASS;
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
