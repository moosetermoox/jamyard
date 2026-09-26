/**
 * A student who refreshes mid-step gets the seconds left on the step's
 * clock (2026-09-26): the collect handler records the deadline on enter
 * and reads it back on reconnect. The pad's own-strokes API (what the
 * draft saves and restores) is pinned here too.
 */
import { describe, it, expect } from 'vitest';
import { secondsLeft } from '../../engine/phase-handlers/collect.js';
import '../../screens/shared/drawing.js';

describe('secondsLeft', () => {
  it('is null with no clock (rolling start, no timer, no phase state)', () => {
    expect(secondsLeft(null)).toBeNull();
    expect(secondsLeft({})).toBeNull();
    expect(secondsLeft({ phaseState: {} })).toBeNull();
  });
  it('rounds up to whole seconds left', () => {
    const now = 1_000_000;
    expect(secondsLeft({ phaseState: { timerEndsAt: now + 90_000 } }, now)).toBe(90);
    expect(secondsLeft({ phaseState: { timerEndsAt: now + 41_200 } }, now)).toBe(42);
  });
  it('is null once the deadline has passed (the projector is closing the step)', () => {
    const now = 1_000_000;
    expect(secondsLeft({ phaseState: { timerEndsAt: now } }, now)).toBeNull();
    expect(secondsLeft({ phaseState: { timerEndsAt: now - 5000 } }, now)).toBeNull();
  });
});

describe('the drawing pad keeps own strokes apart from inherited ones', () => {
  function fakeCanvas() {
    const ctx = new Proxy({}, { get: () => () => {} , set: () => true });
    return { width: 100, height: 100, style: {}, getContext: () => ctx, addEventListener() {}, setPointerCapture() {} };
  }
  const stroke = (x) => ({ points: [[x, 0.1], [x, 0.9]], color: '#111111', width: 4 });

  it('getOwnStrokes leaves out what setStrokes preloaded', () => {
    const pad = globalThis.Draw.attachPad(fakeCanvas());
    pad.setStrokes([stroke(0.1), stroke(0.2)]);
    pad.addStrokes([stroke(0.5)]);
    expect(pad.getStrokes()).toHaveLength(3);
    expect(pad.getOwnStrokes()).toEqual([stroke(0.5)]);
  });
  it('addStrokes restores a draft the student can still undo and clear', () => {
    const pad = globalThis.Draw.attachPad(fakeCanvas());
    pad.setStrokes([stroke(0.1)]);
    pad.addStrokes([stroke(0.5), stroke(0.6)]);
    expect(pad.hasOwnStrokes()).toBe(true);
    pad.undo();
    expect(pad.getOwnStrokes()).toEqual([stroke(0.5)]);
    pad.clear();
    expect(pad.getOwnStrokes()).toEqual([]);
    expect(pad.getStrokes()).toEqual([stroke(0.1)]);
  });
  it('addStrokes ignores nothing-shaped input', () => {
    const pad = globalThis.Draw.attachPad(fakeCanvas());
    pad.addStrokes(null);
    pad.addStrokes([]);
    expect(pad.isEmpty()).toBe(true);
  });
});
