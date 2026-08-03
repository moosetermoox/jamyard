import { describe, it, expect } from 'vitest';
import { sampleItems } from '../../engine/phases/sampling.js';

describe('sampleItems', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('returns the array untouched when limit is missing', () => {
    expect(sampleItems(items, undefined)).toBe(items);
    expect(sampleItems(items, null)).toBe(items);
  });

  it('returns the array untouched when limit >= length', () => {
    expect(sampleItems(items, 6)).toBe(items);
    expect(sampleItems(items, 99)).toBe(items);
  });

  it('ignores invalid limits (zero, negative, non-numeric)', () => {
    expect(sampleItems(items, 0)).toBe(items);
    expect(sampleItems(items, -3)).toBe(items);
    expect(sampleItems(items, 'lots')).toBe(items);
    expect(sampleItems(items, 2.5)).toBe(items);
  });

  it('returns exactly limit items, all drawn from the source', () => {
    const out = sampleItems(items, 3);
    expect(out).toHaveLength(3);
    for (const it of out) expect(items).toContain(it);
    expect(new Set(out).size).toBe(3);
  });

  it('preserves the original relative order of survivors', () => {
    for (let run = 0; run < 20; run++) {
      const out = sampleItems(items, 4);
      const indices = out.map(x => items.indexOf(x));
      const sorted = [...indices].sort((x, y) => x - y);
      expect(indices).toEqual(sorted);
    }
  });

  it('is deterministic with an injected rng', () => {
    let calls = 0;
    const rng = () => { calls++; return 0; }; // always picks index 0 of remaining
    const out = sampleItems(items, 3, rng);
    expect(out).toEqual(['a', 'b', 'c']);
    expect(calls).toBeGreaterThan(0);
  });

  it('does not mutate the source array', () => {
    const copy = [...items];
    sampleItems(items, 2);
    expect(items).toEqual(copy);
  });

  it('handles empty arrays', () => {
    const empty = [];
    expect(sampleItems(empty, 3)).toBe(empty);
  });
});
