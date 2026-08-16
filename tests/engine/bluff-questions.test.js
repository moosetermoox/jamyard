/**
 * cleanBluffQuestions — the drop-don't-fail gate between AI output and
 * the trivia-bluff recipe's prepared-mode `questions` param.
 */

import { describe, it, expect } from 'vitest';
import { cleanBluffQuestions, BLUFF_LIMITS } from '../../engine/bluff-questions.js';

describe('cleanBluffQuestions', () => {
  const GOOD = { question: 'The mayor of Rabbit Hash, Kentucky is a ___.', truth: 'dog', houseLie: 'chicken' };

  it('keeps well-formed facts as-is', () => {
    expect(cleanBluffQuestions([GOOD])).toEqual([GOOD]);
  });

  it('drops facts without a ___ blank', () => {
    const out = cleanBluffQuestions([
      GOOD,
      { question: 'No blank here at all.', truth: 'x', houseLie: 'y' }
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].truth).toBe('dog');
  });

  it('drops facts without a truth', () => {
    expect(cleanBluffQuestions([{ question: 'A ___ fact.', truth: '   ', houseLie: 'y' }])).toEqual([]);
  });

  it('always includes the houseLie key, defaulting to empty', () => {
    const out = cleanBluffQuestions([{ question: 'A ___ fact.', truth: 'real' }]);
    expect(out).toEqual([{ question: 'A ___ fact.', truth: 'real', houseLie: '' }]);
  });

  it('clears a decoy that matches the truth (case-insensitive) instead of dropping the fact', () => {
    const out = cleanBluffQuestions([{ question: 'A ___ fact.', truth: 'Dog', houseLie: 'dog' }]);
    expect(out).toEqual([{ question: 'A ___ fact.', truth: 'Dog', houseLie: '' }]);
  });

  it('trims and caps lengths', () => {
    const out = cleanBluffQuestions([{
      question: '  ' + 'q'.repeat(500) + ' ___ ',
      truth: '  ' + 't'.repeat(200),
      houseLie: 'h'.repeat(200)
    }]);
    // The blank must survive the cap for the fact to be kept at all.
    expect(out).toEqual([]);
    const kept = cleanBluffQuestions([{
      question: '___ ' + 'q'.repeat(500),
      truth: 't'.repeat(200),
      houseLie: 'h'.repeat(200)
    }]);
    expect(kept).toHaveLength(1);
    expect(kept[0].question.length).toBe(BLUFF_LIMITS.maxQuestionLength);
    expect(kept[0].truth.length).toBe(BLUFF_LIMITS.maxAnswerLength);
    expect(kept[0].houseLie.length).toBe(BLUFF_LIMITS.maxAnswerLength);
  });

  it('caps the count at the limit and at maxCount', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ question: `Fact ${i} is ___.`, truth: 'x' }));
    expect(cleanBluffQuestions(many)).toHaveLength(BLUFF_LIMITS.maxQuestions);
    expect(cleanBluffQuestions(many, 3)).toHaveLength(3);
    expect(cleanBluffQuestions(many, 0)).toHaveLength(BLUFF_LIMITS.maxQuestions); // bogus cap ignored
  });

  it('survives garbage input', () => {
    expect(cleanBluffQuestions(null)).toEqual([]);
    expect(cleanBluffQuestions('nope')).toEqual([]);
    expect(cleanBluffQuestions([null, 42, 'str', {}])).toEqual([]);
  });
});
