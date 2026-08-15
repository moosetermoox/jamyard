/**
 * cleanQuizQuestions — the drop-don't-fail gate between AI output and
 * quiz-show recipe params. A bad question drops alone; the rest survive.
 */

import { describe, it, expect } from 'vitest';
import { cleanQuizQuestions, QUIZ_LIMITS } from '../../engine/quiz-questions.js';

const GOOD = { question: 'Capital of Australia?', choices: ['Canberra', 'Sydney'], correct: 'Canberra' };

describe('cleanQuizQuestions', () => {
  it('passes well-formed questions through, trimmed', () => {
    const out = cleanQuizQuestions([
      { question: '  Capital of Australia?  ', choices: [' Canberra ', 'Sydney'], correct: ' Canberra ' }
    ]);
    expect(out).toEqual([GOOD]);
  });

  it('accepts the storyboard brick spelling ("text")', () => {
    const out = cleanQuizQuestions([{ text: 'Capital of Australia?', choices: ['Canberra', 'Sydney'], correct: 'Canberra' }]);
    expect(out).toEqual([GOOD]);
  });

  it('drops bad questions individually, keeps the rest', () => {
    const out = cleanQuizQuestions([
      { question: '', choices: ['a', 'b'], correct: 'a' },            // no question
      { question: 'One choice?', choices: ['only'], correct: 'only' }, // < 2 choices
      { question: 'No match?', choices: ['a', 'b'], correct: 'c' },    // correct not a choice
      'not an object',
      GOOD
    ]);
    expect(out).toEqual([GOOD]);
  });

  it('caps choices at the max and still requires correct to survive the cap', () => {
    const choices = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const kept = cleanQuizQuestions([{ question: 'q?', choices, correct: 'a' }]);
    expect(kept[0].choices).toHaveLength(QUIZ_LIMITS.maxChoices);
    // "correct" was choice #7 — it falls off the cap, so the question drops.
    const dropped = cleanQuizQuestions([{ question: 'q?', choices, correct: 'g' }]);
    expect(dropped).toEqual([]);
  });

  it('respects maxCount and the hard cap', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      question: `q${i}?`, choices: ['a', 'b'], correct: 'a'
    }));
    expect(cleanQuizQuestions(many, 3)).toHaveLength(3);
    expect(cleanQuizQuestions(many)).toHaveLength(QUIZ_LIMITS.maxQuestions);
    expect(cleanQuizQuestions(many, 0)).toHaveLength(QUIZ_LIMITS.maxQuestions); // bogus cap ignored
  });

  it('returns [] for non-arrays', () => {
    expect(cleanQuizQuestions(null)).toEqual([]);
    expect(cleanQuizQuestions('nope')).toEqual([]);
  });
});
