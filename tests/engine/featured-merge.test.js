import { describe, it, expect } from 'vitest';
import { applyFeaturedOverrides } from '../../engine/featured-merge.js';

describe('applyFeaturedOverrides', () => {
  const games = () => ([
    { id: 'a', featured: true },
    { id: 'b', featured: false },
    { id: 'c' }
  ]);

  it('leaves games untouched with no overrides', () => {
    const out = applyFeaturedOverrides(games(), {});
    expect(out.map(g => g.featured)).toEqual([true, false, false]);
    expect(out.every(g => g.featuredDefault === g.featured)).toBe(true);
  });

  it('an override wins over the repo flag, both directions', () => {
    const out = applyFeaturedOverrides(games(), { a: false, b: true });
    expect(out.find(g => g.id === 'a').featured).toBe(false);
    expect(out.find(g => g.id === 'b').featured).toBe(true);
  });

  it('keeps the repo default visible for drift display', () => {
    const out = applyFeaturedOverrides(games(), { a: false });
    const a = out.find(g => g.id === 'a');
    expect(a.featuredDefault).toBe(true);
    expect(a.featured).toBe(false);
  });

  it('ignores overrides for unknown game ids', () => {
    const out = applyFeaturedOverrides(games(), { ghost: true });
    expect(out).toHaveLength(3);
  });

  it('normalizes a missing featured flag to false', () => {
    const out = applyFeaturedOverrides(games(), {});
    const c = out.find(g => g.id === 'c');
    expect(c.featured).toBe(false);
    expect(c.featuredDefault).toBe(false);
  });

  it('handles null/undefined overrides map', () => {
    expect(applyFeaturedOverrides(games(), null)).toHaveLength(3);
    expect(applyFeaturedOverrides(games(), undefined)).toHaveLength(3);
  });

  it('does not mutate the input objects', () => {
    const input = games();
    applyFeaturedOverrides(input, { a: false });
    expect(input[0].featured).toBe(true);
    expect(input[0].featuredDefault).toBeUndefined();
  });
});
