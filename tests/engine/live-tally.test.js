/**
 * Live Poll tally (engine/phases/live-tally.js): chart rows for a
 * multiple-choice step that shows results as answers land.
 */
import { describe, it, expect } from 'vitest';
import { buildLiveTally } from '../../engine/phases/live-tally.js';

const choices = ['Got it', 'Mostly', 'Lost'];

describe('buildLiveTally', () => {
  it('starts every choice at zero, in display order', () => {
    const { rows, answered } = buildLiveTally([], choices);
    expect(answered).toBe(0);
    expect(rows.map(r => r.label)).toEqual(choices);
    expect(rows.every(r => r.count === 0 && r.pct === 0)).toBe(true);
  });

  it('counts answers and rounds percentages of those who answered', () => {
    const players = [
      { response: 'Got it' },
      { response: 'Got it' },
      { response: 'Lost' },
      { response: undefined },
      { response: '' }
    ];
    const { rows, answered } = buildLiveTally(players, choices);
    expect(answered).toBe(3);
    expect(rows).toEqual([
      { label: 'Got it', count: 2, pct: 67 },
      { label: 'Mostly', count: 0, pct: 0 },
      { label: 'Lost', count: 1, pct: 33 }
    ]);
  });

  it('leaves hidden responses out, like the close does', () => {
    const players = [{ response: 'Lost', responseHidden: true }, { response: 'Got it' }];
    const { rows, answered } = buildLiveTally(players, choices);
    expect(answered).toBe(1);
    expect(rows.find(r => r.label === 'Lost').count).toBe(0);
  });

  it('keeps an unexpected answer visible rather than dropping it', () => {
    const { rows } = buildLiveTally([{ response: 'Other' }], choices);
    expect(rows.map(r => r.label)).toEqual([...choices, 'Other']);
  });

  it('ignores drawings and field objects (not choices)', () => {
    const { answered } = buildLiveTally([{ response: { strokes: [] } }, { response: { q1: 'x' } }], choices);
    expect(answered).toBe(0);
  });
});
