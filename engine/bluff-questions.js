/**
 * Bluff fact cleaning — the drop-don't-fail gate between AI-written
 * fill-in-the-blank facts and the trivia-bluff recipe's `questions`
 * param (prepared mode).
 *
 * Same posture as engine/quiz-questions.js: a bad fact drops
 * individually, the rest survive. Bounds mirror recipes/trivia-bluff.json:
 * facts cap 10, the question must contain a blank shown as ___, the
 * truth is required, the decoy (houseLie) is optional but must differ
 * from the truth. Every kept fact always carries the houseLie key
 * (possibly '') because the recipe template reads ${item.houseLie}.
 */

export const BLUFF_LIMITS = {
  maxQuestions: 10,
  maxQuestionLength: 300,
  maxAnswerLength: 100
};

/**
 * @param {*} raw            Whatever the AI returned for "questions".
 * @param {number} [maxCount] Optional cap below BLUFF_LIMITS.maxQuestions.
 * @returns {Array<{question: string, truth: string, houseLie: string}>}
 */
export function cleanBluffQuestions(raw, maxCount) {
  if (!Array.isArray(raw)) return [];
  const cap = Math.min(
    BLUFF_LIMITS.maxQuestions,
    Number.isInteger(maxCount) && maxCount > 0 ? maxCount : BLUFF_LIMITS.maxQuestions
  );

  const cleaned = [];
  for (const item of raw) {
    if (cleaned.length >= cap) break;
    if (!item || typeof item !== 'object') continue;

    const question = String(item.question ?? '')
      .trim().slice(0, BLUFF_LIMITS.maxQuestionLength);
    const truth = String(item.truth ?? '').trim().slice(0, BLUFF_LIMITS.maxAnswerLength);
    let houseLie = String(item.houseLie ?? '').trim().slice(0, BLUFF_LIMITS.maxAnswerLength);

    if (!question || !question.includes('___')) continue;
    if (!truth) continue;
    // A decoy that matches the truth would mark a wrong choice correct
    // at vote time (choices dedupe case-insensitively) — drop the decoy,
    // keep the fact.
    if (houseLie.toLowerCase() === truth.toLowerCase()) houseLie = '';

    cleaned.push({ question, truth, houseLie });
  }
  return cleaned;
}
