/**
 * An AI step over the class's answers when no answers came in (review
 * eighteen: a summary step with nothing to read put the model's own
 * "I'm ready to help! But I don't see the student responses... paste the
 * list" on the projector, twice). The step never calls the model with
 * nothing, and a reply that asks for its input is never shown.
 */

export const NO_ANSWERS_LINE = 'No answers came in for this one.';

/** One answer that carries something to read (a pass or a blank does not). */
function hasContent(item) {
  if (item == null) return false;
  if (typeof item === 'string') return item.trim() !== '';
  if (typeof item === 'number' || typeof item === 'boolean') return true;
  if (typeof item !== 'object') return false;
  if (item.passed === true || item.pass === true) return false;
  if (typeof item.text === 'string') return item.text.trim() !== '';
  if (item.fields && typeof item.fields === 'object') {
    return Object.values(item.fields).some(v => typeof v === 'string' ? v.trim() !== '' : v != null);
  }
  if (Array.isArray(item.strokes) || item.drawing) return true;
  // An unknown shape (an AI step's object, a vote row) counts as content
  return true;
}

/**
 * True when the step reads the class's answers (it names an `input`) and
 * that input resolved to nothing to read.
 */
export function inputIsEmpty(phase, input) {
  if (!phase || !phase.input) return false;
  if (input == null) return true;
  if (Array.isArray(input)) return !input.some(hasContent);
  if (typeof input === 'string') return input.trim() === '';
  return false;
}

const ASKS_FOR_INPUT = [
  /\bI (?:don['’]t|do not|can['’]t|cannot) see (?:any |the )?(?:student )?(?:responses|answers|list)\b/i,
  /\b(?:please )?paste (?:the|your|in the) (?:list|responses|answers)\b/i,
  /\bno (?:student )?(?:responses|answers) (?:were |have been )?(?:provided|included|shared|given)\b/i,
  /\b(?:could|can) you (?:please )?(?:share|provide|paste) (?:the|your) (?:student )?(?:responses|answers|list)\b/i
];

/** A model reply that asks for the answers instead of working on them. */
export function asksForInput(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  return ASKS_FOR_INPUT.some(re => re.test(text));
}
