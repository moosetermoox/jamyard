/**
 * The shared meadow (owner ask 2026-08-30: "everyone's in the same space
 * together"). Server-side pure pieces: every submitted player gets a
 * canonical index (submission order, assigned once per phase), nudges are
 * cooldown-gated per player, and coordinates are normalized fractions so
 * different screen sizes agree about the field. Payloads carry index +
 * fractions ONLY — never a name or player id (counts-only doctrine).
 */

import { describe, it, expect } from 'vitest';
import {
  ensureMeadowState,
  meadowIndexFor,
  allowNudge,
  clampFrac,
  MEADOW_NUDGE_COOLDOWN_MS
} from '../../engine/meadow-sync.js';

describe('ensureMeadowState', () => {
  it('creates fresh state for a new phase instance', () => {
    const s = ensureMeadowState(null, 3);
    expect(s.phaseInstanceId).toBe(3);
    expect(s.order).toEqual({});
  });

  it('keeps state within the same phase instance', () => {
    const s1 = ensureMeadowState(null, 3);
    s1.order.p1 = 0;
    const s2 = ensureMeadowState(s1, 3);
    expect(s2).toBe(s1);
    expect(s2.order.p1).toBe(0);
  });

  it('resets when the phase moves on (stale blocks never leak forward)', () => {
    const s1 = ensureMeadowState(null, 3);
    s1.order.p1 = 0;
    const s2 = ensureMeadowState(s1, 4);
    expect(s2).not.toBe(s1);
    expect(s2.order).toEqual({});
  });
});

describe('meadowIndexFor', () => {
  it('assigns indexes in submission order', () => {
    const s = ensureMeadowState(null, 1);
    expect(meadowIndexFor(s, 'maya')).toBe(0);
    expect(meadowIndexFor(s, 'sam')).toBe(1);
    expect(meadowIndexFor(s, 'jo')).toBe(2);
  });

  it('is stable: resubmitting keeps your block', () => {
    const s = ensureMeadowState(null, 1);
    meadowIndexFor(s, 'maya');
    meadowIndexFor(s, 'sam');
    expect(meadowIndexFor(s, 'maya')).toBe(0);
  });
});

describe('allowNudge', () => {
  it('allows the first nudge and stamps the clock', () => {
    const s = ensureMeadowState(null, 1);
    expect(allowNudge(s, 'p1', 1000)).toBe(true);
    expect(allowNudge(s, 'p1', 1000 + MEADOW_NUDGE_COOLDOWN_MS - 1)).toBe(false);
    expect(allowNudge(s, 'p1', 1000 + MEADOW_NUDGE_COOLDOWN_MS)).toBe(true);
  });

  it('cooldowns are per player, not per room', () => {
    const s = ensureMeadowState(null, 1);
    expect(allowNudge(s, 'p1', 1000)).toBe(true);
    expect(allowNudge(s, 'p2', 1001)).toBe(true);
  });
});

describe('clampFrac', () => {
  it('keeps fractions inside the field with a margin', () => {
    expect(clampFrac(0.5)).toBe(0.5);
    expect(clampFrac(-2)).toBeGreaterThan(0);
    expect(clampFrac(9)).toBeLessThan(1);
  });

  it('rejects junk as the field center', () => {
    expect(clampFrac('nope')).toBe(0.5);
    expect(clampFrac(NaN)).toBe(0.5);
    expect(clampFrac(undefined)).toBe(0.5);
  });
});
