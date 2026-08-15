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
