/**
 * Anonymity promises (2026-10-02, review oct2 part I).
 *
 * An outside reviewer's Create-page "Anonymous Question Box" told students
 * "Nobody will know who asked what", and the teacher console listed every
 * question with its author's name. A step that promised that must keep its
 * answers unnamed for the teacher too (`unattributed`, the collect field
 * Anonymous Feedback uses).
 *
 * `promisesAnonymity(text)` reads one piece of student-facing text.
 * `markPromisedUnattributed(config)` returns a config whose answer steps are
 * unattributed when the student-facing text promised it: a collect whose own
 * prompt promises it, or every collect when an announce, lobby, or intro
 * line does. A step that already says `unattributed: false` was reviewed and
 * is left alone; an activity with `anonymous: true` already hides every
 * name, so it is left alone too. Pure, never mutates its input.
 */

// Phrases that promise the teacher will not see who said what. "Nobody will
// know" alone is Closer's promise about passing, not about authorship, so the
// first pattern needs "who" after it. "Anonymously with one classmate" is a
// promise about a classmate (Feedback Academy), never the teacher.
const PROMISE_PATTERNS = [
  /\bno ?one (will|would|is going to|gets to) (ever )?know who\b/i,
  /\bnobody (will|would|is going to|gets to) (ever )?know who\b/i,
  /\bnot who (said|wrote|asked|answered|sent|picked)\b/i,
  /\bno names?\b(?! (are|is) hidden)/i,
  /\bwithout (your|their|any) names?\b/i,
  /\banonymous(ly)?\b(?! (with|to) (one|a|your) (classmate|partner))/i
];

export function promisesAnonymity(text) {
  if (typeof text !== 'string' || !text) return false;
  return PROMISE_PATTERNS.some(re => re.test(text));
}

// The student-facing words on a step (never `description`, which is the
// teacher's).
const STUDENT_TEXT_KEYS = ['prompt', 'message', 'instruction', 'content', 'template'];

function studentText(phase) {
  if (!phase || typeof phase !== 'object') return '';
  const parts = [];
  for (const key of STUDENT_TEXT_KEYS) {
    if (key === 'instruction' && phase.type === 'ai-process') continue;
    if (key === 'template' && phase.type !== 'announce') continue;
    if (typeof phase[key] === 'string') parts.push(phase[key]);
  }
  if (Array.isArray(phase.fields)) {
    for (const f of phase.fields) if (f && typeof f.label === 'string') parts.push(f.label);
  }
  return parts.join('\n');
}

// Every collect step with the steps it sits in (top level and foreach rounds).
function eachPhase(phases, fn) {
  for (const [id, phase] of Object.entries(phases || {})) {
    fn(id, phase);
    if (phase && phase.type === 'foreach' && phase.subPhases) eachPhase(phase.subPhases, fn);
  }
}

/** Which collect steps a promise covers (ids), read off the config. */
export function promisedCollectIds(config) {
  if (!config || !config.phases || config.anonymous === true) return [];
  let wholeActivity = false;
  eachPhase(config.phases, (id, phase) => {
    if (!phase || phase.type === 'collect') return;
    if (phase.type === 'announce' || phase.type === 'lobby') {
      if (promisesAnonymity(studentText(phase))) wholeActivity = true;
    }
  });
  const ids = [];
  eachPhase(config.phases, (id, phase) => {
    if (!phase || phase.type !== 'collect') return;
    if (phase.unattributed === false) return;
    if (wholeActivity || promisesAnonymity(studentText(phase))) ids.push(id);
  });
  return ids;
}

export function markPromisedUnattributed(config) {
  const ids = new Set(promisedCollectIds(config));
  if (!ids.size) return config;
  const mark = (phases) => {
    const out = {};
    for (const [id, phase] of Object.entries(phases)) {
      let next = phase;
      if (phase && phase.type === 'collect' && ids.has(id) && phase.unattributed !== true) {
        next = { ...phase, unattributed: true };
      }
      if (next && next.type === 'foreach' && next.subPhases) {
        next = { ...next, subPhases: mark(next.subPhases) };
      }
      out[id] = next;
    }
    return out;
  };
  return { ...config, phases: mark(config.phases) };
}
