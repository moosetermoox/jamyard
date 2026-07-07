/**
 * Match phase — pair two lists (vocab ↔ definitions), auto-scored.
 *
 * Students see the left column fixed and drag the right column into
 * alignment; a submission is the right-item texts in left-item order.
 * Every correct pair earns points. Stats show which pairs the class
 * nailed or missed (the discussion moment on close).
 */

import { describe, it, expect } from 'vitest';
import {
  normalizePairs,
  scoreMatching,
  matchStats,
  buildResultsList
} from '../../engine/phases/match-scoring.js';

const PAIRS = [
  { left: 'cat', right: 'chat' },
  { left: 'dog', right: 'chien' },
  { left: 'bird', right: 'oiseau' }
];

describe('normalizePairs', () => {
  it('trims text and drops incomplete rows (leftover empty editor rows)', () => {
    const pairs = normalizePairs([
      { left: ' cat ', right: ' chat ' },
      { left: '', right: 'orphan' },
      { left: 'dog', right: '' },
      null,
      { left: 'bird', right: 'oiseau' }
    ]);
    expect(pairs).toEqual([
      { left: 'cat', right: 'chat' },
      { left: 'bird', right: 'oiseau' }
    ]);
  });

  it('coerces non-string values to strings (AI generators emit numbers)', () => {
    const pairs = normalizePairs([{ left: 7, right: 'seven' }]);
    expect(pairs).toEqual([{ left: '7', right: 'seven' }]);
  });

  it('returns [] for non-array input', () => {
    expect(normalizePairs(null)).toEqual([]);
    expect(normalizePairs('cat:chat')).toEqual([]);
  });
});

describe('scoreMatching', () => {
  it('a perfect submission earns points for every pair', () => {
    const { scores, correctCounts } = scoreMatching(
      PAIRS, { p1: ['chat', 'chien', 'oiseau'] }, 10
    );
    expect(scores).toEqual({ p1: 30 });
    expect(correctCounts).toEqual({ p1: 3 });
  });

  it('only aligned positions score (partial credit per pair)', () => {
    const { scores, correctCounts } = scoreMatching(
      PAIRS, { p1: ['chat', 'oiseau', 'chien'] }, 10
    );
    expect(scores).toEqual({ p1: 10 });
    expect(correctCounts).toEqual({ p1: 1 });
  });

  it('every submitter gets a score entry, even at zero (leaderboards need the key)', () => {
    const { scores } = scoreMatching(
      PAIRS, { p1: ['oiseau', 'chat', 'chien'] }, 10
    );
    expect(scores).toEqual({ p1: 0 });
  });

  it('comparison trims whitespace but is otherwise exact', () => {
    const { scores } = scoreMatching(
      PAIRS, { p1: [' chat ', 'chien', 'oiseau'] }, 10
    );
    expect(scores.p1).toBe(30);
  });

  it('tolerates short, long, and malformed submissions', () => {
    const { scores } = scoreMatching(PAIRS, {
      short: ['chat'],
      long: ['chat', 'chien', 'oiseau', 'extra'],
      junk: 'not-an-array'
    }, 10);
    expect(scores.short).toBe(10);
    expect(scores.long).toBe(30);
    expect(scores.junk).toBe(0);
  });

  it('no submissions → empty maps', () => {
    const { scores, correctCounts } = scoreMatching(PAIRS, {}, 10);
    expect(scores).toEqual({});
    expect(correctCounts).toEqual({});
  });

  it('defaults to 10 points per match', () => {
    const { scores } = scoreMatching(PAIRS, { p1: ['chat', 'chien', 'oiseau'] });
    expect(scores.p1).toBe(30);
  });
});

describe('matchStats', () => {
  it('reports per-pair accuracy across the class', () => {
    const stats = matchStats(PAIRS, {
      p1: ['chat', 'chien', 'oiseau'],  // all right
      p2: ['chat', 'oiseau', 'chien'],  // only cat right
      p3: ['chien', 'chat', 'oiseau']   // only bird right
    });
    expect(stats).toEqual([
      { left: 'cat', right: 'chat', correct: 2, total: 3, pct: 67 },
      { left: 'dog', right: 'chien', correct: 1, total: 3, pct: 33 },
      { left: 'bird', right: 'oiseau', correct: 2, total: 3, pct: 67 }
    ]);
  });

  it('zero submitters → 0% everywhere, no division by zero', () => {
    const stats = matchStats(PAIRS, {});
    expect(stats.every(s => s.pct === 0 && s.total === 0)).toBe(true);
  });
});

describe('buildResultsList', () => {
  it('renders a human-readable line per pair for templates', () => {
    const list = buildResultsList([
      { left: 'cat', right: 'chat', correct: 2, total: 3, pct: 67 }
    ]);
    expect(list).toBe('cat → chat (67% of the class got it)');
  });

  it('empty stats → empty string', () => {
    expect(buildResultsList([])).toBe('');
  });
});
