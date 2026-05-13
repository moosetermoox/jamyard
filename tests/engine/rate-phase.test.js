/**
 * Rate phase — aggregation + validator tests.
 *
 * Aggregation lives in engine/phase-handlers/rate.js so it's directly
 * unit-testable; the full socket flow is covered by the demo game
 * simulator. Validation lives inline in engine/game-loader.js.
 */

import { describe, it, expect } from 'vitest';
import { aggregateRatings } from '../../engine/phase-handlers/rate.js';
import { validate } from '../../engine/game-loader.js';

const SCALES = [
  { id: 'orig', label: 'Originality', min: 1, max: 5, labels: null },
  { id: 'feas', label: 'Feasibility', min: 1, max: 5, labels: null }
];

describe('rate — aggregateRatings', () => {
  it('returns 0 averages and empty distributions when no submissions', () => {
    const { averages, distributions, byScale } = aggregateRatings(SCALES, {});
    expect(averages).toEqual({ orig: 0, feas: 0 });
    expect(byScale.orig).toEqual([]);
    expect(distributions.orig[1]).toBe(0);
    expect(distributions.orig[5]).toBe(0);
  });

  it('averages straightforward integer ratings', () => {
    const subs = {
      p1: { orig: 5, feas: 3 },
      p2: { orig: 3, feas: 3 },
      p3: { orig: 4, feas: 1 }
    };
    const { averages, distributions, byScale } = aggregateRatings(SCALES, subs);
    expect(averages.orig).toBe(4); // (5+3+4)/3
    expect(averages.feas).toBeCloseTo(2.33, 2);
    expect(byScale.orig.sort()).toEqual([3, 4, 5]);
    expect(distributions.orig).toEqual({ 1: 0, 2: 0, 3: 1, 4: 1, 5: 1 });
    expect(distributions.feas[3]).toBe(2);
    expect(distributions.feas[1]).toBe(1);
  });

  it('rounds averages to 2 decimal places', () => {
    const subs = { p1: { orig: 1 }, p2: { orig: 2 }, p3: { orig: 4 } };
    const { averages } = aggregateRatings(SCALES, subs);
    expect(averages.orig).toBe(2.33); // 7/3 = 2.333... → 2.33
  });

  it('clamps out-of-range values defensively', () => {
    const subs = { p1: { orig: 99 }, p2: { orig: -5 } };
    const { averages, byScale } = aggregateRatings(SCALES, subs);
    expect(averages.orig).toBe(3); // (5 + 1) / 2
    expect(byScale.orig.sort()).toEqual([1, 5]);
  });

  it('ignores ratings for unknown scale ids', () => {
    const subs = { p1: { orig: 4, bogusScale: 5 } };
    const { averages } = aggregateRatings(SCALES, subs);
    expect(averages.orig).toBe(4);
    expect(averages.bogusScale).toBeUndefined();
  });

  it('skips null/undefined values', () => {
    const subs = {
      p1: { orig: 4, feas: null },
      p2: { orig: 2 } // feas omitted
    };
    const { averages, byScale } = aggregateRatings(SCALES, subs);
    expect(averages.orig).toBe(3);
    expect(averages.feas).toBe(0);
    expect(byScale.feas).toEqual([]);
  });

  it('handles a single rater', () => {
    const subs = { p1: { orig: 5, feas: 5 } };
    const { averages } = aggregateRatings(SCALES, subs);
    expect(averages.orig).toBe(5);
    expect(averages.feas).toBe(5);
  });

  it('rounds half-integer ratings before bucketing into distribution', () => {
    const subs = { p1: { orig: 4.6 }, p2: { orig: 3.4 } };
    const { distributions, byScale } = aggregateRatings(SCALES, subs);
    expect(byScale.orig.sort()).toEqual([3, 5]);
    expect(distributions.orig[5]).toBe(1);
    expect(distributions.orig[3]).toBe(1);
  });
});

describe('rate — validator', () => {
  function makeConfig(scales) {
    return {
      name: 'X',
      phases: {
        lobby: { type: 'lobby', next: 'r' },
        r: { type: 'rate', scales, next: 'end' },
        end: { type: 'end' }
      }
    };
  }

  it('accepts a well-formed rate phase', () => {
    const result = validate(makeConfig([
      { id: 'orig', label: 'Originality', min: 1, max: 5 }
    ]), 't', { returnResults: true });
    expect(result.errors).toEqual([]);
  });

  it('rejects missing scales array', () => {
    const config = {
      name: 'X',
      phases: {
        lobby: { type: 'lobby', next: 'r' },
        r: { type: 'rate', next: 'end' },
        end: { type: 'end' }
      }
    };
    const result = validate(config, 't', { returnResults: true });
    expect(result.errors.some(e => /needs at least one scale|required field "scales"/i.test(e))).toBe(true);
  });

  it('rejects empty scales array', () => {
    const result = validate(makeConfig([]), 't', { returnResults: true });
    expect(result.errors.some(e => /at least one scale/i.test(e))).toBe(true);
  });

  it('rejects scale with no id', () => {
    const result = validate(makeConfig([{ label: 'Originality', min: 1, max: 5 }]), 't', { returnResults: true });
    expect(result.errors.some(e => /\.id is required/i.test(e))).toBe(true);
  });

  it('rejects scale with no label', () => {
    const result = validate(makeConfig([{ id: 'orig', min: 1, max: 5 }]), 't', { returnResults: true });
    expect(result.errors.some(e => /\.label is required/i.test(e))).toBe(true);
  });

  it('rejects min >= max', () => {
    const result = validate(makeConfig([
      { id: 'orig', label: 'Originality', min: 5, max: 5 }
    ]), 't', { returnResults: true });
    expect(result.errors.some(e => /min .* must be less than max/i.test(e))).toBe(true);
  });

  it('rejects duplicate scale ids', () => {
    const result = validate(makeConfig([
      { id: 'orig', label: 'A', min: 1, max: 5 },
      { id: 'orig', label: 'B', min: 1, max: 5 }
    ]), 't', { returnResults: true });
    expect(result.errors.some(e => /appears more than once/i.test(e))).toBe(true);
  });

  it('warns on overly large ranges', () => {
    const result = validate(makeConfig([
      { id: 'orig', label: 'Originality', min: 1, max: 100 }
    ]), 't', { returnResults: true });
    expect(result.warnings.some(w => /hard to use on a phone/i.test(w))).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
