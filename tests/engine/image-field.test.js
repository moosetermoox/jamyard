/**
 * Phase image field — validator tests.
 *
 * `image` is allowed on announce/reveal/collect/collect-choice and
 * rejected (as UNKNOWN_FIELD) elsewhere via the schema-driven allow-list.
 */

import { describe, it, expect } from 'vitest';
import { validate } from '../../engine/game-loader.js';

function wrap(phaseId, phase) {
  return {
    name: 'X',
    phases: {
      lobby: { type: 'lobby', next: phaseId },
      [phaseId]: phase,
      end: { type: 'end' }
    }
  };
}

describe('image field — accepted on supported phase types', () => {
  it('announce accepts image', () => {
    const result = validate(
      wrap('a', { type: 'announce', message: 'hi', image: 'assets/foo.jpg', next: 'end' }),
      't', { returnResults: true }
    );
    expect(result.errors).toEqual([]);
  });

  it('reveal accepts image', () => {
    const result = validate(
      wrap('r', { type: 'reveal', template: 'hi', image: 'assets/foo.jpg', next: 'end' }),
      't', { returnResults: true }
    );
    expect(result.errors).toEqual([]);
  });

  it('collect accepts image', () => {
    const result = validate(
      wrap('c', { type: 'collect', prompt: 'q', image: 'assets/foo.jpg', next: 'end' }),
      't', { returnResults: true }
    );
    expect(result.errors).toEqual([]);
  });

  it('collect-choice accepts image', () => {
    const result = validate(
      wrap('cc', { type: 'collect-choice', prompt: 'q', choices: ['A', 'B'], image: 'assets/foo.jpg', next: 'end' }),
      't', { returnResults: true }
    );
    expect(result.errors).toEqual([]);
  });
});

describe('image field — rejected on unsupported phase types', () => {
  it('vote rejects image (unknown field)', () => {
    const result = validate(
      wrap('v', { type: 'vote', mode: 'pick-one', candidates: 'c.responses', image: 'assets/foo.jpg', next: 'end' }),
      't', { returnResults: true }
    );
    // 'image' is not in vote's allow-list, so validator should complain.
    // (We don't assert empty errors here — the candidates ref also points
    // at a missing phase; we just want the image unknown-field error.)
    expect(result.errors.some(e => /unknown field "image"/i.test(e))).toBe(true);
  });

  it('rank rejects image (unknown field)', () => {
    const result = validate(
      wrap('rk', { type: 'rank', prompt: 'p', candidates: 'c.responses', image: 'assets/foo.jpg', next: 'end' }),
      't', { returnResults: true }
    );
    expect(result.errors.some(e => /unknown field "image"/i.test(e))).toBe(true);
  });
});
