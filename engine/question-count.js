/**
 * question-count.js — the number of quiz questions an idea asked for,
 * against the number the built activity holds.
 *
 * A reviewer asked the Create page for 25 questions and quietly got 8
 * (2026-10-02). The count is read by the server from the idea's own words,
 * never claimed by the AI, and the result card says it plainly when the
 * two differ, the way the timing note says minutes.
 *
 * Pure: no AI, no I/O.
 */

import { QUIZ_LIMITS } from './quiz-questions.js';

/** The most questions one quiz holds: the quiz-show and solo-quiz recipes
 * and the plan's quiz brick (step-suggestions.js); the plan's self-paced
 * solo-quiz brick takes more. */
export const MAX_QUIZ_QUESTIONS = QUIZ_LIMITS.maxQuestions;
export const MAX_SOLO_QUIZ_QUESTIONS = 30;
const BRICK_CAPS = { quiz: MAX_QUIZ_QUESTIONS, 'solo-quiz': MAX_SOLO_QUIZ_QUESTIONS };

/**
 * The cap that applies to what was built: a plan with a self-paced quiz
 * takes the larger one.
 * @param {{params?: object, steps?: Array<object>}} built
 */
export function questionCapFor(built) {
  const steps = built && Array.isArray(built.steps) ? built.steps : [];
  return steps.some(s => s && s.brick === 'solo-quiz') ? MAX_SOLO_QUIZ_QUESTIONS : MAX_QUIZ_QUESTIONS;
}

const NUMBER_WORDS = {
  three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50
};
const NUM = '(\\d{1,3}|' + Object.keys(NUMBER_WORDS).join('|') + ')';
// "25 questions", "25 multiple-choice questions", "a 25-question quiz",
// "twenty-five trivia questions"
const PATTERN = new RegExp(
  '\\b' + NUM + '(?:[ -](one|two|three|four|five|six|seven|eight|nine))?' +
  '[ -](?:(?:multiple[ -]choice|quiz|trivia|review|true[ -](?:or[ -])?false|short|easy|hard|practice|vocab(?:ulary)?)[ -])*' +
  'questions?\\b', 'i');
const ONES = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };

/**
 * @param {string} text  the idea as typed
 * @returns {number|null} the questions asked for, or null when none named
 */
export function askedQuestionCount(text) {
  const m = PATTERN.exec(String(text || ''));
  if (!m) return null;
  const head = m[1].toLowerCase();
  let n = /^\d+$/.test(head) ? parseInt(head, 10) : NUMBER_WORDS[head];
  if (m[2] && n >= 20 && n % 10 === 0) n += ONES[m[2].toLowerCase()] || 0;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * How many questions a recipe match or a plan holds: a `questions` param
 * (quiz-show, solo-quiz) or every quiz / solo-quiz step's questions.
 * @param {{params?: object, steps?: Array<object>}} built
 * @returns {number|null} null when there is no quiz in it
 */
export function builtQuestionCount(built) {
  if (!built || typeof built !== 'object') return null;
  if (built.params && Array.isArray(built.params.questions)) return built.params.questions.length;
  if (Array.isArray(built.steps)) {
    let total = 0;
    let any = false;
    for (const step of built.steps) {
      if (step && (step.brick === 'quiz' || step.brick === 'solo-quiz') && Array.isArray(step.questions)) {
        total += step.questions.length;
        any = true;
      }
    }
    return any ? total : null;
  }
  return null;
}

/**
 * Cut every quiz in a plan down to the cap, so the plan builds (the quiz
 * brick refuses a longer list). Mutates and returns the plan.
 * @param {{steps?: Array<object>}} plan
 */
export function capPlanQuestions(plan) {
  if (!plan || !Array.isArray(plan.steps)) return plan;
  for (const step of plan.steps) {
    const cap = step && BRICK_CAPS[step.brick];
    if (cap && Array.isArray(step.questions) && step.questions.length > cap) {
      step.questions = step.questions.slice(0, cap);
    }
  }
  return plan;
}

/**
 * The line the result card shows when the count differs, or null.
 * @param {number|null} asked
 * @param {number|null} made
 * @param {number} [cap]  the most one quiz holds here
 */
export function questionCountNote(asked, made, cap = MAX_QUIZ_QUESTIONS) {
  if (!Number.isInteger(asked) || !Number.isInteger(made) || made === asked) return null;
  if (made > asked) return null; // more than asked is visible in the list, and never by accident
  const capped = asked > cap;
  let note = 'You asked for ' + asked + ' questions and this has ' + made + '.';
  if (capped && made === cap) {
    note += ' A quiz holds up to ' + cap + ' questions. Make a second quiz for the rest.';
  } else {
    note += capped ? ' A quiz holds up to ' + cap + ' questions.' : '';
    note += ' Check the questions and add your own before you host it, or paste your full list into the idea and try again.';
  }
  return note;
}
