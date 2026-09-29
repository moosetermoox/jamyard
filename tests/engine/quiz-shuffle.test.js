// AI-written quiz choices are shuffled where they land (review eighteen:
// the right answers came back first, second, third in the preview).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { shuffleQuizChoices, shuffleQuizParams } from '../../engine/quiz-questions.js';

// A fixed "random" that always picks index 0: a full reversal-style deal
const zero = () => 0;

describe('shuffleQuizChoices', () => {
  it('moves the choices and keeps the answer by its words', () => {
    const q = [{ question: 'Q', choices: ['A', 'B', 'C', 'D'], correct: 'A' }];
    const out = shuffleQuizChoices(q, zero);
    expect(out[0].choices).not.toEqual(['A', 'B', 'C', 'D']);
    expect(out[0].choices.slice().sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(out[0].correct).toBe('A');
    expect(q[0].choices).toEqual(['A', 'B', 'C', 'D']); // input untouched
  });
});

describe('shuffleQuizParams', () => {
  it('shuffles a questions param and leaves the rest', () => {
    const params = { title: 'Water', questions: [{ question: 'Q', choices: ['A', 'B', 'C'], correct: 'A' }], rounds: 3 };
    const out = shuffleQuizParams(params, zero);
    expect(out.title).toBe('Water');
    expect(out.rounds).toBe(3);
    expect(out.questions[0].choices).not.toEqual(['A', 'B', 'C']);
  });
  it('leaves a list that is not quiz questions alone', () => {
    const params = { items: ['a', 'b', 'c'], pairs: [{ left: 'x', right: 'y' }] };
    expect(shuffleQuizParams(params, zero)).toEqual(params);
  });
});

describe('the AI paths call it', () => {
  const ai = readFileSync('services/ai-service.js', 'utf8');
  it('the quiz writer shuffles its questions', () => {
    expect(ai).toMatch(/shuffleQuizChoices\(cleanQuizQuestions\(/);
  });
  it('the recipe matcher shuffles its params', () => {
    expect(ai).toMatch(/shuffleQuizParams\(/);
  });
});
