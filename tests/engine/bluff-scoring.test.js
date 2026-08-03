import { describe, it, expect } from 'vitest';
import { foolPoints, mergeScores } from '../../engine/phases/bluff-scoring.js';

describe('foolPoints', () => {
  const authorsByText = {
    'a fake about turnips': 'alice',
    'a fake about knights': 'bob'
  };

  it('awards the author points per classmate fooled', () => {
    const responses = [
      { playerId: 'carol', choice: 'A fake about turnips' },
      { playerId: 'dave', choice: 'a fake about turnips ' },
      { playerId: 'erin', choice: 'a fake about knights' }
    ];
    const s = foolPoints({ responses, authorsByText, correctAnswer: 'the real one', pointsPerFool: 50 });
    expect(s).toEqual({ alice: 100, bob: 50 });
  });

  it('votes for the truth award nobody', () => {
    const responses = [{ playerId: 'carol', choice: 'The REAL one' }];
    const s = foolPoints({ responses, authorsByText, correctAnswer: 'the real one', pointsPerFool: 50 });
    expect(s).toEqual({});
  });

  it('votes for unauthored options (house lie) award nobody', () => {
    const responses = [{ playerId: 'carol', choice: 'the house lie' }];
    const s = foolPoints({ responses, authorsByText, correctAnswer: 'the real one', pointsPerFool: 50 });
    expect(s).toEqual({});
  });

  it('never lets an author score off their own vote', () => {
    const responses = [{ playerId: 'alice', choice: 'a fake about turnips' }];
    const s = foolPoints({ responses, authorsByText, correctAnswer: null, pointsPerFool: 50 });
    expect(s).toEqual({});
  });

  it('handles missing correctAnswer (all fake votes count)', () => {
    const responses = [{ playerId: 'carol', choice: 'a fake about knights' }];
    const s = foolPoints({ responses, authorsByText, correctAnswer: null, pointsPerFool: 25 });
    expect(s).toEqual({ bob: 25 });
  });

  it('ignores empty/malformed responses', () => {
    const s = foolPoints({
      responses: [null, {}, { playerId: 'x', choice: null }],
      authorsByText, correctAnswer: null, pointsPerFool: 50
    });
    expect(s).toEqual({});
  });
});

describe('mergeScores', () => {
  it('sums overlapping players and keeps disjoint ones', () => {
    expect(mergeScores({ a: 100, b: 50 }, { b: 25, c: 75 }))
      .toEqual({ a: 100, b: 75, c: 75 });
  });
  it('tolerates empty maps', () => {
    expect(mergeScores({}, { a: 1 })).toEqual({ a: 1 });
    expect(mergeScores({ a: 1 }, {})).toEqual({ a: 1 });
  });
});
