import { describe, it, expect } from 'vitest';
import { combineAppendOnly } from '../../engine/phases/append-only.js';

describe('combineAppendOnly', () => {
  it('appends the typed line under the inherited text', () => {
    expect(combineAppendOnly('corn grows in rows', 'it needs full sun'))
      .toBe('corn grows in rows\nit needs full sun');
  });

  it('returns the inherited text unchanged when nothing was typed', () => {
    expect(combineAppendOnly('the whole list', '')).toBe('the whole list');
    expect(combineAppendOnly('the whole list', '   ')).toBe('the whole list');
    expect(combineAppendOnly('the whole list', undefined)).toBe('the whole list');
  });

  it('returns just the typed text when there was nothing inherited (chain origin)', () => {
    expect(combineAppendOnly(undefined, 'first line')).toBe('first line');
    expect(combineAppendOnly('', 'first line')).toBe('first line');
  });

  it('trims stray whitespace from both parts', () => {
    expect(combineAppendOnly('  a  ', '  b  ')).toBe('a\nb');
  });

  it('never lets the typed part alter the inherited part', () => {
    const inherited = 'line one\nline two';
    const out = combineAppendOnly(inherited, 'line three');
    expect(out.startsWith(inherited)).toBe(true);
  });
});
