/**
 * resolveDisplayDrawing — the `drawingFrom` field's runtime half.
 *
 * A phase with `drawingFrom: "<ref>"` shows a read-only drawing on every
 * screen while the phase runs (the Drawful moment: title THIS drawing).
 * The ref usually points inside a foreach (`_current.drawing`), so the
 * resolver runs at phase enter, when the iteration item is live.
 */

import { describe, it, expect } from 'vitest';
import { resolveDisplayDrawing } from '../../engine/phases/display-drawing.js';

const STROKES = [{ color: '#000', width: 4, points: [[0.1, 0.1], [0.5, 0.5]] }];

function fakeEngine(valueByRef) {
  return { resolve: (ref) => valueByRef[ref] };
}

describe('resolveDisplayDrawing', () => {
  it('returns null when the phase has no drawingFrom', () => {
    expect(resolveDisplayDrawing({ id: 'p' }, fakeEngine({}))).toBeNull();
  });

  it('returns the strokes array when the ref resolves to one', () => {
    const engine = fakeEngine({ '_current.drawing': STROKES });
    expect(resolveDisplayDrawing({ id: 'p', drawingFrom: '_current.drawing' }, engine)).toEqual(STROKES);
  });

  it('unwraps a whole response object ({drawing: strokes})', () => {
    const engine = fakeEngine({ '_current': { playerId: 'a', text: '[drawing]', drawing: STROKES } });
    expect(resolveDisplayDrawing({ id: 'p', drawingFrom: '_current' }, engine)).toEqual(STROKES);
  });

  it('unwraps a raw submission shape ({strokes: [...]})', () => {
    const engine = fakeEngine({ 'x.thing': { strokes: STROKES } });
    expect(resolveDisplayDrawing({ id: 'p', drawingFrom: 'x.thing' }, engine)).toEqual(STROKES);
  });

  it('returns null (no throw) when the ref resolves to text or nothing', () => {
    const engine = fakeEngine({ 'a.b': 'just words', 'c.d': undefined });
    expect(resolveDisplayDrawing({ id: 'p', drawingFrom: 'a.b' }, engine)).toBeNull();
    expect(resolveDisplayDrawing({ id: 'p', drawingFrom: 'c.d' }, engine)).toBeNull();
  });

  it('returns null for an empty strokes array (nothing to show)', () => {
    const engine = fakeEngine({ 'a.b': [] });
    expect(resolveDisplayDrawing({ id: 'p', drawingFrom: 'a.b' }, engine)).toBeNull();
  });
});
