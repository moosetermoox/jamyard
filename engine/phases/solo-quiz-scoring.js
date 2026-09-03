/**
 * Self-paced quiz (solo-quiz): the pure rules. Each student walks through
 * the question list on their own device; the server records every answer
 * and this module grades and summarizes. Speed never counts.
 *
 * Shapes:
 *   question  { question: string, choices: string[], correct: string }
 *   progress  { [playerId]: { index: number, answers: Array<{choice, correct}> } }
 */

/** Same match rule the graded multiple-choice step uses: trim + case-fold. */
export function isCorrectAnswer(choice, correct) {
  if (choice == null || correct == null) return false;
  return String(choice).trim().toLowerCase() === String(correct).trim().toLowerCase();
}

/**
 * Clean the question list a config carries: drop anything unplayable so a
 * half-typed question never strands a student on a screen with no
 * choices. Mirrors engine/quiz-questions.js bounds loosely (that module
 * gates AI output; this one gates config).
 */
export function playableQuestions(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const q of raw) {
    if (!q || typeof q !== 'object') continue;
    const question = String(q.question ?? q.text ?? '').trim();
    const choices = (Array.isArray(q.choices) ? q.choices : []).map(c => String(c).trim()).filter(Boolean);
    const correct = String(q.correct ?? '').trim();
    if (!question || choices.length < 2 || !correct) continue;
    if (!choices.some(c => isCorrectAnswer(c, correct))) continue;
    out.push({ question, choices, correct });
  }
  return out;
}

/**
 * Per-student status counts for the projector: who has started, who has
 * finished, plus a per-question correct rate (anonymous by construction).
 */
export function summarizeProgress(progress, questions) {
  let started = 0;
  let finished = 0;
  const perQuestion = questions.map(() => ({ answered: 0, correct: 0 }));
  for (const p of Object.values(progress || {})) {
    if (!p || !Array.isArray(p.answers)) continue;
    if (p.answers.length > 0) started += 1;
    if (p.answers.length >= questions.length && questions.length > 0) finished += 1;
    p.answers.forEach((a, i) => {
      if (!perQuestion[i] || !a) return;
      perQuestion[i].answered += 1;
      if (a.correct) perQuestion[i].correct += 1;
    });
  }
  return { started, finished, perQuestion };
}

/**
 * Grade everyone. Points per correct answer; a student mid-quiz at close
 * keeps what they earned so far. Returns the score map leaderboards read
 * plus a per-student results list and the per-question rates.
 * @param {object} progress
 * @param {Array} questions
 * @param {number} pointsPerQuestion
 * @param {(id: string) => string|null} nameOf
 */
export function scoreSoloQuiz(progress, questions, pointsPerQuestion, nameOf = () => null) {
  const points = Number.isInteger(pointsPerQuestion) && pointsPerQuestion > 0 ? pointsPerQuestion : 1;
  const scores = {};
  const results = [];
  for (const [playerId, p] of Object.entries(progress || {})) {
    const answers = (p && Array.isArray(p.answers)) ? p.answers : [];
    const correct = answers.filter(a => a && a.correct).length;
    scores[playerId] = correct * points;
    results.push({
      playerId,
      name: nameOf(playerId) || null,
      answered: answers.length,
      correct,
      total: questions.length,
      finished: answers.length >= questions.length && questions.length > 0
    });
  }
  results.sort((a, b) => b.correct - a.correct || a.answered - b.answered);
  const { started, finished, perQuestion } = summarizeProgress(progress, questions);
  const rated = perQuestion.map((q, i) => ({
    index: i,
    question: questions[i].question,
    answered: q.answered,
    correct: q.correct,
    pct: q.answered > 0 ? Math.round((q.correct / q.answered) * 100) : 0
  }));
  const averagePct = results.length > 0 && questions.length > 0
    ? Math.round((results.reduce((s, r) => s + r.correct, 0) / (results.length * questions.length)) * 100)
    : 0;
  return { scores, results, perQuestion: rated, started, finished, averagePct };
}
