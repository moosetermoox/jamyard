// meadow.js is a plain browser script that attaches to globalThis — the
// side-effect import pattern shared with game-visibility.js and juice.js.
// These tests cover the pure geometry/pacing helpers; the DOM half is
// exercised live by scripts/simulate-holding.js + a browser check.
import { describe, it, expect } from 'vitest';
import '../../screens/shared/meadow.js';

const { toneFor, spotFor, stepToward, canNudge, bumpIndex } = globalThis.Meadow;

describe('Meadow.toneFor', () => {
  it('cycles through the nine painted tones', () => {
    expect(toneFor(0)).toBe(0);
    expect(toneFor(8)).toBe(8);
    expect(toneFor(9)).toBe(0);
    expect(toneFor(22)).toBe(4);
  });
});

describe('Meadow.spotFor', () => {
  const W = 600, H = 200;

  it('is deterministic: the same index always lands on the same spot', () => {
    for (const i of [0, 3, 11, 25]) {
      expect(spotFor(i, W, H)).toEqual(spotFor(i, W, H));
    }
  });

  it('keeps every block inside the field, margins included', () => {
    for (let i = 0; i < 40; i++) {
      const p = spotFor(i, W, H);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(W);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(H);
    }
  });

  it('scatters early blocks apart instead of stacking them', () => {
    for (let a = 0; a < 12; a++) {
      for (let b = a + 1; b < 12; b++) {
        const pa = spotFor(a, W, H), pb = spotFor(b, W, H);
        const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        expect(d).toBeGreaterThan(10);
      }
    }
  });

  it('works in a narrow field without escaping it', () => {
    for (let i = 0; i < 30; i++) {
      const p = spotFor(i, 280, 120);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(280);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(120);
    }
  });
});

describe('Meadow.stepToward', () => {
  it('reaches a close target exactly', () => {
    expect(stepToward({ x: 10, y: 10 }, { x: 40, y: 10 }, 90)).toEqual({ x: 40, y: 10 });
  });

  it('clamps a far target to the max step along the same line', () => {
    const next = stepToward({ x: 0, y: 0 }, { x: 300, y: 0 }, 90);
    expect(next.x).toBeCloseTo(90);
    expect(next.y).toBeCloseTo(0);
  });

  it('preserves direction when clamping diagonals', () => {
    const next = stepToward({ x: 0, y: 0 }, { x: 300, y: 300 }, 90);
    expect(Math.hypot(next.x, next.y)).toBeCloseTo(90);
    expect(next.x).toBeCloseTo(next.y);
  });

  it('stays put when already at the target (no NaN)', () => {
    expect(stepToward({ x: 5, y: 5 }, { x: 5, y: 5 }, 90)).toEqual({ x: 5, y: 5 });
  });
});

describe('Meadow.canNudge', () => {
  it('blocks a second nudge inside the cooldown', () => {
    expect(canNudge(1000, 1500, 3000)).toBe(false);
  });
  it('allows a nudge once the cooldown has passed', () => {
    expect(canNudge(1000, 4000, 3000)).toBe(true);
  });
  it('always allows the first nudge', () => {
    expect(canNudge(0, 100, 3000)).toBe(true);
  });
});

describe('Meadow.bumpIndex', () => {
  const others = [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 104, y: 102 }];

  it('finds the nearest block inside the bump radius', () => {
    expect(bumpIndex({ x: 105, y: 103 }, others, 26)).toBe(2);
  });

  it('returns -1 when nothing is close enough', () => {
    expect(bumpIndex({ x: 150, y: 160 }, others, 26)).toBe(-1);
  });

  it('handles an empty meadow', () => {
    expect(bumpIndex({ x: 0, y: 0 }, [], 26)).toBe(-1);
  });
});
