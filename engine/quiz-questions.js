/**
 * Quiz question cleaning — the drop-don't-fail gate between AI-written
 * quiz questions and the quiz-show recipe's params.
 *
 * Same posture as the storyboard quiz brick (step-suggestions'
 * appendQuizChain): a bad question drops individually, the rest
 * survive. Bounds mirror recipes/quiz-show.json: questions cap 20,
 * choices 2-6, correct must EXACTLY match one choice (no trim-fudging
 * at match time; both sides are trimmed the same way first).
 *
 * Accepts both key spellings ("question" per the recipe param shape,
 * "text" per the storyboard brick shape) so either producer works.
 */

export const QUIZ_LIMITS = {
  maxQuestions: 20,
  minChoices: 2,
  maxChoices: 6,
  maxQuestionLength: 300,
  maxChoiceLength: 200
};

/**
 * @param {*} raw            Whatever the AI returned for "questions".
 * @param {number} [maxCount] Optional cap below QUIZ_LIMITS.maxQuestions.
 * @returns {Array<{question: string, choices: string[], correct: string}>}
 */
export function cleanQuizQuestions(raw, maxCount) {
  if (!Array.isArray(raw)) return [];
  const cap = Math.min(
    QUIZ_LIMITS.maxQuestions,
    Number.isInteger(maxCount) && maxCount > 0 ? maxCount : QUIZ_LIMITS.maxQuestions
  );

  const cleaned = [];
  for (const item of raw) {
    if (cleaned.length >= cap) break;
    if (!item || typeof item !== 'object') continue;

    const question = String(item.question ?? item.text ?? '')
      .trim().slice(0, QUIZ_LIMITS.maxQuestionLength);
    const choices = (Array.isArray(item.choices) ? item.choices : [])
      .map((c) => String(c).trim().slice(0, QUIZ_LIMITS.maxChoiceLength))
      .filter((c) => c.length > 0)
      .slice(0, QUIZ_LIMITS.maxChoices);
    const correct = String(item.correct ?? '').trim().slice(0, QUIZ_LIMITS.maxChoiceLength);

    if (!question) continue;
    if (choices.length < QUIZ_LIMITS.minChoices) continue;
    if (!choices.includes(correct)) continue;

    cleaned.push({ question, choices, correct });
  }
  return cleaned;
}

/**
 * AI-written choices come back with the right answer in a pattern (a
 * reviewer's water cycle quiz: first, second, third, 2026-09-28). Shuffle
 * each question's choices once, where the AI's words land, so the stored
 * order is no tell. `correct` is words, never an index, so it still
 * matches. A teacher's own order is never touched: only AI paths call this.
 *
 * @param {Array} questions  [{question, choices, correct}]
 * @param {() => number} [rand]
 * @returns {Array} new question objects, choices shuffled
 */
export function shuffleQuizChoices(questions, rand = Math.random) {
  if (!Array.isArray(questions)) return questions;
  return questions.map((q) => {
    if (!q || typeof q !== 'object' || !Array.isArray(q.choices)) return q;
    const choices = q.choices.slice();
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }
    return { ...q, choices };
  });
}

/**
 * The same over a recipe's params as the matcher wrote them: every param
 * that is a list of quiz questions (objects with `choices` and a string
 * `correct`) gets its choices shuffled. Other params pass through.
 */
export function shuffleQuizParams(params, rand = Math.random) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return params;
  const out = { ...params };
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value) && value.length > 0 &&
        value.every((q) => q && typeof q === 'object' && Array.isArray(q.choices) && typeof q.correct === 'string')) {
      out[key] = shuffleQuizChoices(value, rand);
    }
  }
  return out;
}
