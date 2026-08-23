/**
 * Anonymous play names — the generator behind per-activity anonymous mode
 * (config.anonymous: true). Students never type a name; the server hands
 * each one a "Color Animal" play name instead. Names must fit the
 * PlayerRegistry cap (20 chars) and avoid the room's existing names.
 */

import { describe, it, expect } from 'vitest';
import { pickAnonymousName, ANON_COLORS, ANON_ANIMALS } from '../../engine/anonymous-names.js';

describe('pickAnonymousName', () => {
  it('returns a "Color Animal" name drawn from the shipped lists', () => {
    const name = pickAnonymousName([]);
    const [color, animal] = name.split(' ');
    expect(ANON_COLORS).toContain(color);
    expect(ANON_ANIMALS).toContain(animal);
  });

  it('every possible combo fits the 20-char registry cap and the 2-char floor', () => {
    for (const color of ANON_COLORS) {
      for (const animal of ANON_ANIMALS) {
        const combo = `${color} ${animal}`;
        expect(combo.length).toBeLessThanOrEqual(20);
        expect(combo.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('avoids names already in the room', () => {
    const taken = [];
    for (let i = 0; i < 40; i++) {
      const name = pickAnonymousName(taken);
      expect(taken).not.toContain(name);
      taken.push(name);
    }
  });

  it('has room for a full class plus spectators', () => {
    expect(ANON_COLORS.length * ANON_ANIMALS.length).toBeGreaterThanOrEqual(100);
  });

  it('falls back to numbered Player names when every combo is taken', () => {
    const everyCombo = [];
    for (const color of ANON_COLORS) {
      for (const animal of ANON_ANIMALS) {
        everyCombo.push(`${color} ${animal}`);
      }
    }
    const first = pickAnonymousName(everyCombo);
    expect(first).toBe('Player 2');
    const second = pickAnonymousName([...everyCombo, 'Player 2']);
    expect(second).toBe('Player 3');
  });
});
