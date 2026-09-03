/**
 * Anonymous mode config flag — `anonymous: true` at the top of a game
 * config means the room never collects student names (the server assigns
 * play names at join). The validator must accept the boolean and reject
 * anything else, so a hand-edited "anonymous": "yes" fails loudly instead
 * of silently collecting names.
 */

import { describe, it, expect } from 'vitest';
import { validate } from '../../engine/game-loader.js';

function minimalConfig(extra = {}) {
  return {
    name: 'Test Activity',
    phases: {
      lobby: { type: 'lobby', next: 'end' },
      end: { type: 'end', message: 'Done!' }
    },
    ...extra
  };
}

describe('config.anonymous validation', () => {
  it('accepts anonymous: true', () => {
    expect(() => validate(minimalConfig({ anonymous: true }), 'test')).not.toThrow();
  });

  it('accepts anonymous: false', () => {
    expect(() => validate(minimalConfig({ anonymous: false }), 'test')).not.toThrow();
  });

  it('accepts a config without the field (collect names is the default)', () => {
    expect(() => validate(minimalConfig(), 'test')).not.toThrow();
  });

  it('rejects a non-boolean anonymous value', () => {
    expect(() => validate(minimalConfig({ anonymous: 'yes' }), 'test'))
      .toThrow(/anonymous/);
  });
});

describe('config.language validation', () => {
  it('accepts a supported code and "auto"', () => {
    expect(() => validate(minimalConfig({ language: 'es' }), 'test')).not.toThrow();
    expect(() => validate(minimalConfig({ language: 'auto' }), 'test')).not.toThrow();
    expect(() => validate(minimalConfig(), 'test')).not.toThrow();
  });

  it('rejects an unsupported or non-string language so a typo never silently means English', () => {
    expect(() => validate(minimalConfig({ language: 'klingon' }), 'test')).toThrow(/language/);
    expect(() => validate(minimalConfig({ language: 7 }), 'test')).toThrow(/language/);
  });
});
