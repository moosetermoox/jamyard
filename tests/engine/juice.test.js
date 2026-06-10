/**
 * Juice (screens/shared/juice.js) — sounds, confetti, avatars for game feel.
 * Plain browser script that attaches Juice to globalThis, so a side-effect
 * import makes the pure parts testable here (audio/canvas parts no-op
 * without a DOM — they must never throw).
 */

import { describe, it, expect } from 'vitest';
import '../../screens/shared/juice.js';

const Juice = globalThis.Juice;

describe('Juice.avatarFor', () => {
  it('is deterministic for the same name', () => {
    expect(Juice.avatarFor('Maya')).toBe(Juice.avatarFor('Maya'));
    expect(Juice.avatarFor('jordan')).toBe(Juice.avatarFor('jordan'));
  });

  it('returns an emoji from the avatar bank', () => {
    for (const name of ['Maya', 'Jordan', 'Sam', 'Priya', 'Diego', '']) {
      expect(Juice.AVATARS).toContain(Juice.avatarFor(name));
    }
  });

  it('spreads different names across different avatars', () => {
    const names = ['Maya', 'Jordan', 'Sam', 'Priya', 'Diego', 'Lena', 'Omar',
      'Tess', 'Kai', 'Noor', 'Ravi', 'Zoe', 'Ben', 'Aria', 'Finn', 'Isla'];
    const seen = new Set(names.map((n) => Juice.avatarFor(n)));
    // 16 names over a 24+ avatar bank should not all collide
    expect(seen.size).toBeGreaterThan(6);
  });
});

describe('Juice sound cues', () => {
  // Every cue name the host/player screens fire must exist in the table —
  // a typo'd cue should fail here, not silently no-op in the classroom.
  const USED_CUES = ['pop', 'blip', 'reveal', 'tada', 'fanfare', 'womp', 'tick'];

  it('defines every cue used by the screens', () => {
    for (const cue of USED_CUES) {
      expect(Juice.SOUNDS[cue], `missing sound cue "${cue}"`).toBeTruthy();
    }
  });

  it('every cue has playable notes (positive freq and duration)', () => {
    for (const [name, spec] of Object.entries(Juice.SOUNDS)) {
      expect(Array.isArray(spec.notes), name).toBe(true);
      expect(spec.notes.length, name).toBeGreaterThan(0);
      for (const note of spec.notes) {
        expect(note.f, name).toBeGreaterThan(0);
        expect(note.d, name).toBeGreaterThan(0);
        expect(note.at, name).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('sound() and confetti() never throw without a DOM/AudioContext', () => {
    expect(() => Juice.sound('fanfare')).not.toThrow();
    expect(() => Juice.sound('nonexistent-cue')).not.toThrow();
    expect(() => Juice.confetti()).not.toThrow();
  });
});

describe('Juice mute state', () => {
  it('toggleMuted flips and returns the new state', () => {
    const before = Juice.muted();
    expect(Juice.toggleMuted()).toBe(!before);
    expect(Juice.muted()).toBe(!before);
    Juice.toggleMuted(); // restore
    expect(Juice.muted()).toBe(before);
  });
});

describe('Juice confetti colors', () => {
  it('falls back to a default palette without a DOM', () => {
    const colors = Juice.confettiColors();
    expect(Array.isArray(colors)).toBe(true);
    expect(colors.length).toBeGreaterThanOrEqual(3);
    for (const c of colors) expect(typeof c).toBe('string');
  });
});
