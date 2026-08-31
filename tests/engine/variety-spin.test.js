/**
 * Variety spin — the fix for "the AI makes the same questions every time"
 * (owner report, Trivia Bluff live mode, 2026-08-30). A generate task's
 * instruction is byte-identical every session, and identical instructions
 * make the model converge on its favorite answers (the 2026-08-16 lesson,
 * now hit across sessions instead of across rounds). The spin appends a
 * per-call random seed plus the anti-first-instinct maneuver so each
 * session pulls different content.
 */

import { describe, it, expect } from 'vitest';
import { varietySpin, SPIN_WORDS } from '../../engine/phases/variety-spin.js';

describe('varietySpin', () => {
  it('is deterministic given the rand source', () => {
    expect(varietySpin(() => 0.42)).toBe(varietySpin(() => 0.42));
  });

  it('different rand values produce different spins', () => {
    expect(varietySpin(() => 0.1)).not.toBe(varietySpin(() => 0.9));
  });

  it('carries a spin number and the brainstorm-count maneuver', () => {
    const spin = varietySpin(() => 0.5);
    expect(spin).toMatch(/#\d{4}/);
    expect(spin).toMatch(/brainstorm \d/i);
  });

  it('brainstorm depth stays small enough for a fast model', () => {
    for (const v of [0, 0.25, 0.5, 0.75, 0.999]) {
      const m = varietySpin(() => v).match(/brainstorm (\d+)/i);
      const n = parseInt(m[1], 10);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(9);
    }
  });

  it('has no em dashes (rides into AI-visible text)', () => {
    expect(varietySpin(() => 0.5)).not.toContain('—');
  });

  it('carries an inspiration word from the bank', () => {
    const spin = varietySpin(() => 0.5);
    const m = spin.match(/Inspiration word: "([a-z]+)"/);
    expect(m).toBeTruthy();
    expect(SPIN_WORDS).toContain(m[1]);
  });

  it('word bank is large enough that repeats across sessions feel rare', () => {
    expect(SPIN_WORDS.length).toBeGreaterThanOrEqual(50);
    expect(new Set(SPIN_WORDS).size).toBe(SPIN_WORDS.length);
  });
});
