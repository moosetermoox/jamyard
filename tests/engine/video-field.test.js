/**
 * Phase video field — validator tests.
 *
 * `video` is allowed on announce/reveal/collect/collect-choice and
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

const URL = 'https://youtu.be/dQw4w9WgXcQ';

describe('video field — accepted on supported phase types', () => {
  it('announce accepts video', () => {
    const result = validate(
      wrap('a', { type: 'announce', message: 'hi', video: URL, next: 'end' }),
      't', { returnResults: true }
    );
    expect(result.errors).toEqual([]);
  });

  it('reveal accepts video', () => {
    const result = validate(
      wrap('r', { type: 'reveal', template: 'hi', video: URL, next: 'end' }),
      't', { returnResults: true }
    );
    expect(result.errors).toEqual([]);
  });

  it('collect accepts video', () => {
    const result = validate(
      wrap('c', { type: 'collect', prompt: 'q', video: URL, next: 'end' }),
      't', { returnResults: true }
    );
    expect(result.errors).toEqual([]);
  });

  it('collect-choice accepts video', () => {
    const result = validate(
      wrap('cc', { type: 'collect-choice', prompt: 'q', choices: ['A', 'B'], video: URL, next: 'end' }),
      't', { returnResults: true }
    );
    expect(result.errors).toEqual([]);
  });
});

describe('video field — rejected on unsupported phase types', () => {
  it('vote rejects video (unknown field)', () => {
    const result = validate(
      wrap('v', { type: 'vote', mode: 'pick-one', candidates: 'c.responses', video: URL, next: 'end' }),
      't', { returnResults: true }
    );
    expect(result.errors.some(e => /unknown field "video"/i.test(e))).toBe(true);
  });

  it('rank rejects video (unknown field)', () => {
    const result = validate(
      wrap('rk', { type: 'rank', prompt: 'p', candidates: 'c.responses', video: URL, next: 'end' }),
      't', { returnResults: true }
    );
    expect(result.errors.some(e => /unknown field "video"/i.test(e))).toBe(true);
  });
});
