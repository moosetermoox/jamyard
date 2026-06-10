/**
 * Estimate phase — numeric guessing with closeness scoring.
 *
 * "How many liters of water does a cow drink a day?" Students submit a
 * number; on close the answer is revealed with the class distribution.
 * Scoring is scale-free (rank by distance, not absolute error) so the
 * same modes work for "guess 7" and "guess 7 million".
 */

import { describe, it, expect } from 'vitest';
import { scoreEstimates, estimateStats } from '../../engine/phases/estimate-scoring.js';

const GUESSES = { a: 90, b: 110, c: 150, d: 40 };

describe('scoreEstimates — closest mode', () => {
  it('the closest guess takes all the points', () => {
    const scores = scoreEstimates(GUESSES, 100, 10, 'closest');
    expect(scores).toEqual({ a: 10, b: 10, c: 0, d: 0 }); // 90 and 110 tie at distance 10
  });

  it('a single closest player wins alone', () => {
    const scores = scoreEstimates({ a: 99, b: 110, c: 150 }, 100, 10, 'closest');
    expect(scores).toEqual({ a: 10, b: 0, c: 0 });
  });
});

describe('scoreEstimates — graduated mode', () => {
  it('points fall off by closeness rank; ties share the better rank', () => {
    const scores = scoreEstimates(GUESSES, 100, 10, 'graduated');
    // distances: a=10, b=10, c=50, d=60 → a,b share rank 0; c rank 2; d rank 3
    expect(scores.a).toBe(10);
    expect(scores.b).toBe(10);
    expect(scores.c).toBeLessThan(scores.a);
    expect(scores.d).toBeLessThan(scores.c);
    expect(scores.d).toBeGreaterThanOrEqual(0);
  });

  it('is scale-free (same ranks for tiny and huge answers)', () => {
    const small = scoreEstimates({ a: 6, b: 9 }, 7, 10, 'graduated');
    const huge = scoreEstimates({ a: 6e6, b: 9e6 }, 7e6, 10, 'graduated');
    expect(small.a).toBe(huge.a);
    expect(small.b).toBe(huge.b);
  });
});

describe('scoreEstimates — edge cases', () => {
  it('no answer → no scores', () => {
    expect(scoreEstimates(GUESSES, null, 10, 'closest')).toEqual({});
  });

  it('no guesses → empty', () => {
    expect(scoreEstimates({}, 100, 10, 'closest')).toEqual({});
  });
});

describe('estimateStats', () => {
  it('reports average, median, and the closest guess', () => {
    const stats = estimateStats(GUESSES, 100);
    expect(stats.average).toBe(97.5);
    expect(stats.median).toBe(100); // (90+110)/2
    expect(stats.count).toBe(4);
    expect([90, 110]).toContain(stats.closest);
    expect(stats.answer).toBe(100);
  });

  it('works without an answer (poll-the-room mode)', () => {
    const stats = estimateStats({ a: 1, b: 3 }, null);
    expect(stats.average).toBe(2);
    expect(stats.median).toBe(2);
    expect(stats.answer).toBe(null);
    expect(stats.closest).toBe(null);
  });

  it('handles a single guess', () => {
    const stats = estimateStats({ a: 5 }, 7);
    expect(stats.median).toBe(5);
    expect(stats.closest).toBe(5);
  });
});
