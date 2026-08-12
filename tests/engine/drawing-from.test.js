/**
 * drawingFrom — validator coverage.
 *
 * `drawingFrom` shows a read-only drawing on every screen while a phase runs
 * (announce, collect, collect-choice). Its headline use is `_current.drawing`
 * inside a foreach over drawing responses (Doodle Bluff), so the validator
 * must accept it there and warn when `_current` is used outside a foreach,
 * where it can never resolve.
 */

import { describe, it, expect } from 'vitest';
import { validate } from '../../engine/game-loader.js';

const baseGame = (phases) => ({ name: 'Test', phases });

describe('drawingFrom — validator', () => {
  it('accepts drawingFrom on foreach sub-phases (announce, collect, collect-choice)', () => {
    const cfg = baseGame({
      lobby: { type: 'lobby', next: 'draw' },
      draw: { type: 'collect', prompt: 'Draw!', inputType: 'drawing', next: 'rounds' },
      rounds: {
        type: 'foreach',
        data: 'draw.responses',
        subPhases: {
          show: { type: 'announce', message: 'Look at this one', drawingFrom: '_current.drawing' },
          titles: { type: 'collect', prompt: 'Title it', drawingFrom: '_current.drawing' },
          guess: {
            type: 'collect-choice',
            prompt: 'Real title?',
            choicePool: [{ from: 'titles.responses', field: 'text' }],
            drawingFrom: '_current.drawing'
          }
        },
        next: 'end'
      },
      end: { type: 'end' }
    });
    expect(() => validate(cfg, 'drawingfrom-foreach-ok')).not.toThrow();
  });

  it('accepts a top-level drawingFrom pointing at phase data', () => {
    const cfg = baseGame({
      lobby: { type: 'lobby', next: 'draw' },
      draw: { type: 'collect', prompt: 'Draw!', inputType: 'drawing', next: 'caption' },
      caption: { type: 'collect', prompt: 'Caption the winner', drawingFrom: 'draw.responses.0.drawing', next: 'end' },
      end: { type: 'end' }
    });
    expect(() => validate(cfg, 'drawingfrom-toplevel-ok')).not.toThrow();
  });

  it('warns when drawingFrom uses _current outside a foreach', () => {
    const cfg = baseGame({
      lobby: { type: 'lobby', next: 'oops' },
      oops: { type: 'announce', message: 'hi', drawingFrom: '_current.drawing', next: 'end' },
      end: { type: 'end' }
    });
    const result = validate(cfg, 'drawingfrom-out-of-context', { returnResults: true });
    expect(result.warnings.some(w => /drawingFrom/.test(w) && /_current/.test(w))).toBe(true);
  });

  it('rejects drawingFrom on phase types that do not support it', () => {
    const cfg = baseGame({
      lobby: { type: 'lobby', next: 'end' },
      end: { type: 'end', drawingFrom: 'draw.responses.0.drawing' }
    });
    expect(() => validate(cfg, 'drawingfrom-wrong-type')).toThrow(/unknown field "drawingFrom"/);
  });
});
