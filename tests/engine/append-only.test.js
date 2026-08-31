import { describe, it, expect } from 'vitest';
import { combineAppendOnly, tailOfWords } from '../../engine/phases/append-only.js';
import { validate } from '../../engine/game-loader.js';

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

describe('tailOfWords (showTail fold)', () => {
  it('keeps only the last N words, marking the hidden part', () => {
    expect(tailOfWords('the quick brown fox jumps', 2)).toBe('… fox jumps');
  });

  it('returns short text unchanged, no ellipsis when nothing is hidden', () => {
    expect(tailOfWords('two words', 2)).toBe('two words');
    expect(tailOfWords('two words', 5)).toBe('two words');
  });

  it('preserves whitespace shape inside the visible tail', () => {
    expect(tailOfWords('a b c\nd  e', 3)).toBe('… c\nd  e');
  });

  it('tolerates junk without crashing', () => {
    expect(tailOfWords('', 3)).toBe('');
    expect(tailOfWords(null, 3)).toBe(null);
    expect(tailOfWords('keep it all', 0)).toBe('keep it all');
    expect(tailOfWords('keep it all', undefined)).toBe('keep it all');
  });
});

describe('validator: showTail fold', () => {
  function foldConfig(passOverrides = {}) {
    return {
      name: 'Test',
      phases: {
        lobby: { type: 'lobby', next: 'start' },
        start: { type: 'collect', prompt: 'Write an opening line.', next: 'pass' },
        pass: {
          type: 'collect',
          prompt: 'Continue the story from the last words you can see.',
          rotateFrom: 'start', prefillFromAssigned: true, appendOnly: true, showTail: 4,
          next: 'share', ...passOverrides
        },
        share: {
          type: 'reveal', scope: 'own', chainFrom: ['start', 'pass'],
          chainDisplay: 'final', next: 'end'
        },
        end: { type: 'end' }
      }
    };
  }

  it('accepts showTail on an add-only chain step', () => {
    const { errors, warnings } = validate(foldConfig(), 'test', { returnResults: true });
    expect(errors).toEqual([]);
    expect(warnings.filter(w => w.includes('showTail'))).toEqual([]);
  });

  it('rejects showTail without appendOnly (the hidden text would be lost)', () => {
    const { errors } = validate(foldConfig({ appendOnly: undefined }), 'test', { returnResults: true });
    expect(errors.some(e => e.includes('showTail') && e.includes('appendOnly'))).toBe(true);
  });

  it('warns when the prompt shows the full assigned text anyway', () => {
    const { warnings } = validate(
      foldConfig({ prompt: 'Here is everything: {{start.assigned}}. Continue.' }),
      'test', { returnResults: true }
    );
    expect(warnings.some(w => w.includes('defeats the fold'))).toBe(true);
  });
});
