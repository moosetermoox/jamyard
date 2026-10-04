/**
 * A buzzer round's own question list (2026-10-04, owner: a Jeopardy idea
 * built a buzzer with nowhere to put the teacher's questions).
 *
 * The buzz step's optional `questions` is a list of {question, answer}; a
 * plain string is a question, and "question | answer" splits on the bar (the
 * editor's one-line-each box). With a list, the projector and every student
 * screen show the current question's words and "Question 2 of 5", the answer
 * goes to the teacher consoles only (`buzzTeacherView`, never in a payload
 * the class receives), and Next stops at the last question. Without one the
 * buzzer runs as it always has: the teacher asks out loud.
 */

export const MAX_BUZZ_QUESTIONS = 50;
const QUESTION_CAP = 300;
const ANSWER_CAP = 200;

/**
 * @param {any} list
 * @returns {{question: string, answer: string}[]}
 */
export function normalizeBuzzQuestions(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    let question = '';
    let answer = '';
    if (typeof item === 'string') {
      const bar = item.indexOf('|');
      question = bar >= 0 ? item.slice(0, bar) : item;
      answer = bar >= 0 ? item.slice(bar + 1) : '';
    } else if (item && typeof item === 'object') {
      question = typeof item.question === 'string' ? item.question : '';
      answer = typeof item.answer === 'string' ? item.answer : (typeof item.answer === 'number' ? String(item.answer) : '');
    }
    question = question.trim().slice(0, QUESTION_CAP);
    if (!question) continue;
    out.push({ question, answer: answer.trim().slice(0, ANSWER_CAP) });
    if (out.length >= MAX_BUZZ_QUESTIONS) break;
  }
  return out;
}

function current(state) {
  const list = state && Array.isArray(state.questions) ? state.questions : [];
  if (!list.length) return null;
  const i = Math.min(Math.max((state.question || 1) - 1, 0), list.length - 1);
  return { item: list[i], number: i + 1, total: list.length };
}

/** What the projector and the students see: the words and the count, never the answer. */
export function buzzQuestionView(state) {
  const c = current(state);
  return c ? { questionText: c.item.question, total: c.total } : { questionText: '', total: null };
}

/** What the teacher consoles see: the question, its number, and its answer. Null without a list. */
export function buzzTeacherView(state) {
  const c = current(state);
  return c ? { number: c.number, total: c.total, text: c.item.question, answer: c.item.answer } : null;
}

/** True when the round is on its last listed question (Next has nowhere to go). */
export function isLastBuzzQuestion(state) {
  const c = current(state);
  return !!c && c.number >= c.total;
}
