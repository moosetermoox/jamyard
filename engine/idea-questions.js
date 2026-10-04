/**
 * Follow-up questions on the Create page (2026-10-04, owner: "sometimes the
 * user would benefit from follow-up questions"). The AI reads a typed idea
 * and may ask one or two short questions before anything is built; this is
 * the server's backstop under that prompt.
 *
 * A question earns its place only when the answer changes the activity's
 * steps or its content. Everything below has a default, a control, or a
 * source already, so a question about it is dropped whatever the model
 * wrote: timing and rounds (the builder's defaults, the timing note), grade,
 * age and subject (the teacher's class profile), group size, names and
 * anonymity (the Student names row), language (read from the idea), and a
 * request to restate or confirm the idea.
 */

export const MAX_IDEA_QUESTIONS = 2;
// The chip's length (AIService.shapeCustomizeQuestion cuts at 40)
export const MAX_CHOICE_LENGTH = 40;

const BANNED = [
  /\b(minutes?|seconds?|how long|timers?|time limits?|duration)\b/i,
  /\bhow many rounds?\b|\brounds? (do|should|would)\b/i,
  /\b(grade|grades|grade level|age|ages|how old|years old)\b/i,
  /\b(subject|class size|how many students|how big|group size|size of (the )?groups?)\b/i,
  /\b(names?|anonymous|anonymity)\b/i,
  /\b(language|english|spanish)\b/i,
  /\b(describe|explain|clarify|more detail|tell me more|elaborate)\b/i,
  // A count is the builder's default or the idea's own list length
  /\bhow many\b/i,
  // ONE question, prompt, topic, or claim: the builder writes it and the
  // teacher edits it on the make page. A list ("Which questions...") stays.
  /\b(question|prompt|topic|claim)\b(?!s)(?! (list|bank|set))/i,
  // Tone and style change the wording, never the steps (the make page asks those)
  /\b(tone|style|funny|serious|silly|mood)\b/i,
  /^(is|does) (this|that) (right|correct|sound right)\b/i
];

/** True when a question asks about something the builder already settles. */
export function isBannedIdeaQuestion(text) {
  const q = String(text || '').trim();
  if (!q) return true;
  return BANNED.some(re => re.test(q));
}

/**
 * The usable questions from the model's list, in order: text present, not
 * banned, not a repeat, at most MAX_IDEA_QUESTIONS. Shape (kind, choices,
 * label) is left to the caller.
 * @param {any} list
 * @returns {object[]}
 */
export function pickIdeaQuestions(list) {
  const out = [];
  const seen = new Set();
  for (const q of Array.isArray(list) ? list : []) {
    if (!q || typeof q.question !== 'string') continue;
    const text = q.question.trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key) || isBannedIdeaQuestion(text)) continue;
    // A choice that will not fit a chip would be cut mid-word: the question goes
    if (q.kind === 'choice' && Array.isArray(q.choices) &&
        q.choices.some(c => typeof c === 'string' && c.trim().length > MAX_CHOICE_LENGTH)) continue;
    seen.add(key);
    out.push(q);
    if (out.length >= MAX_IDEA_QUESTIONS) break;
  }
  return out;
}
