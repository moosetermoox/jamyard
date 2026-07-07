/**
 * Sort phase — drag/tap items into named buckets (metaphor vs simile).
 *
 * Two modes, decided by the items themselves: every item carries a correct
 * bucket → graded (points per correct placement); no item does → consensus
 * poll (distribution only, no scores). A submission is the bucket names in
 * item order.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeSortItems,
  isGradedSort,
  scoreSorting,
  sortStats,
  buildSortResultsList
} from '../../engine/phases/sort-scoring.js';

const BUCKETS = ['Metaphor', 'Simile'];
const ITEMS = [
  { text: 'Her smile was the sun', bucket: 'Metaphor' },
  { text: 'Brave as a lion', bucket: 'Simile' },
  { text: 'Time is a thief', bucket: 'Metaphor' }
];

describe('normalizeSortItems', () => {
  it('trims text and drops blank rows', () => {
    const items = normalizeSortItems([
      { text: ' Her smile was the sun ', bucket: ' Metaphor ' },
      { text: '', bucket: 'Simile' },
      null,
      { text: 'Brave as a lion' }
    ]);
    expect(items).toEqual([
      { text: 'Her smile was the sun', bucket: 'Metaphor' },
      { text: 'Brave as a lion', bucket: null }
    ]);
  });

  it('returns [] for non-array input', () => {
    expect(normalizeSortItems(null)).toEqual([]);
    expect(normalizeSortItems('a,b')).toEqual([]);
  });
});

describe('isGradedSort', () => {
  it('graded when every item has a correct bucket', () => {
    expect(isGradedSort(ITEMS)).toBe(true);
  });

  it('consensus when no item has one', () => {
    expect(isGradedSort([{ text: 'a', bucket: null }, { text: 'b', bucket: null }])).toBe(false);
  });
});

describe('scoreSorting', () => {
  it('a perfect submission earns points for every item', () => {
    const { scores, correctCounts } = scoreSorting(
      ITEMS, { p1: ['Metaphor', 'Simile', 'Metaphor'] }, 10
    );
    expect(scores).toEqual({ p1: 30 });
    expect(correctCounts).toEqual({ p1: 3 });
  });

  it('scores per position, zero entries kept for leaderboards', () => {
    const { scores } = scoreSorting(
      ITEMS, {
        p1: ['Metaphor', 'Metaphor', 'Metaphor'], // 2 right
        p2: ['Simile', 'Metaphor', 'Simile']      // 0 right
      }, 10
    );
    expect(scores).toEqual({ p1: 20, p2: 0 });
  });

  it('consensus mode (no correct buckets) yields no scores', () => {
    const poll = [{ text: 'Pineapple on pizza', bucket: null }];
    const { scores } = scoreSorting(poll, { p1: ['Yes'] }, 10);
    expect(scores).toEqual({});
  });

  it('tolerates short and malformed submissions', () => {
    const { scores } = scoreSorting(ITEMS, { short: ['Metaphor'], junk: 'nope' }, 10);
    expect(scores.short).toBe(10);
    expect(scores.junk).toBe(0);
  });

  it('defaults to 10 points per item', () => {
    const { scores } = scoreSorting(ITEMS, { p1: ['Metaphor', 'Simile', 'Metaphor'] });
    expect(scores.p1).toBe(30);
  });
});

describe('sortStats', () => {
  it('reports the class distribution per item, plus accuracy when graded', () => {
    const stats = sortStats(ITEMS, BUCKETS, {
      p1: ['Metaphor', 'Simile', 'Metaphor'],
      p2: ['Metaphor', 'Metaphor', 'Simile']
    });
    expect(stats[0]).toEqual({
      text: 'Her smile was the sun',
      correct: 'Metaphor',
      counts: { Metaphor: 2, Simile: 0 },
      correctCount: 2,
      total: 2,
      pct: 100
    });
    expect(stats[1].counts).toEqual({ Metaphor: 1, Simile: 1 });
    expect(stats[1].pct).toBe(50);
  });

  it('consensus mode has null correct and null pct', () => {
    const poll = [{ text: 'Pineapple on pizza', bucket: null }];
    const stats = sortStats(poll, ['Yes', 'No'], { p1: ['Yes'], p2: ['No'] });
    expect(stats[0].correct).toBe(null);
    expect(stats[0].pct).toBe(null);
    expect(stats[0].counts).toEqual({ Yes: 1, No: 1 });
  });

  it('ignores votes for buckets that do not exist', () => {
    const stats = sortStats(ITEMS.slice(0, 1), BUCKETS, { p1: ['Nonsense'] });
    expect(stats[0].counts).toEqual({ Metaphor: 0, Simile: 0 });
  });

  it('zero submitters → no division by zero', () => {
    const stats = sortStats(ITEMS, BUCKETS, {});
    expect(stats[0].pct).toBe(0);
    expect(stats[0].total).toBe(0);
  });
});

describe('buildSortResultsList', () => {
  it('renders graded lines with accuracy', () => {
    const list = buildSortResultsList([
      { text: 'Time is a thief', correct: 'Metaphor', counts: { Metaphor: 3, Simile: 1 }, pct: 75, total: 4 }
    ]);
    expect(list).toBe('Time is a thief → Metaphor (75% of the class got it)');
  });

  it('renders consensus lines with the winning bucket', () => {
    const list = buildSortResultsList([
      { text: 'Pineapple on pizza', correct: null, counts: { Yes: 3, No: 1 }, pct: null, total: 4 }
    ]);
    expect(list).toBe('Pineapple on pizza → Yes (3 of 4)');
  });

  it('empty stats → empty string', () => {
    expect(buildSortResultsList([])).toBe('');
  });
});
