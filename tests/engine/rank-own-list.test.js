/**
 * Rank with a teacher-typed item list (not generated from game data).
 * The engine accepted literal arrays already; these tests pin the
 * validator rules + the literal-vs-ref disambiguation that make the
 * editor's "My own list" mode safe.
 */

import { describe, it, expect } from 'vitest';
import { validate } from '../../engine/game-loader.js';

function rankConfig(candidates) {
  return {
    name: 'Rank Test',
    phases: {
      lobby: { type: 'lobby', next: 'order' },
      order: { type: 'rank', prompt: 'Rank these!', candidates, next: 'end' },
      end: { type: 'end' }
    }
  };
}

describe('rank with a literal item list', () => {
  it('accepts a fixed array of items', () => {
    const { errors } = validate(rankConfig(['Pizza', 'Tacos', 'Sushi']), 'test', { returnResults: true });
    expect(errors).toEqual([]);
  });

  it('rejects a list with fewer than 2 real items', () => {
    const one = validate(rankConfig(['Pizza']), 'test', { returnResults: true });
    expect(one.errors.some(e => e.includes('at least 2 items to rank'))).toBe(true);

    const blanks = validate(rankConfig(['Pizza', '   ', '']), 'test', { returnResults: true });
    expect(blanks.errors.some(e => e.includes('at least 2 items to rank'))).toBe(true);
  });

  it('a comma-separated literal with periods is NOT mistaken for a data ref', () => {
    // "Dr. Who" used to parse as a reference to a phase named "Dr"
    const { errors } = validate(rankConfig('Dr. Who, Mr. Bean, Ms. Marvel'), 'test', { returnResults: true });
    expect(errors).toEqual([]);
  });

  it('a real (single-token) data ref is still existence-checked', () => {
    const { errors } = validate(rankConfig('ghost.responses'), 'test', { returnResults: true });
    expect(errors.some(e => e.includes('"ghost" does not exist'))).toBe(true);
  });
});
