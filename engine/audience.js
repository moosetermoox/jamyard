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
 *   teacher              "Only your teacher sees this."
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
  [AUDIENCE.AI]: 'The AI reads these and sums them up for the class.',
  [AUDIENCE.TEACHER]: 'Only your teacher sees this.'
});

export const NAMES_HIDDEN_LABEL = 'Names are hidden.';
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
    nextHint
  };
}
