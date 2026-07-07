/**
 * Drawing input — stroke validation for collect phases with
 * inputType:"drawing".
 *
 * A drawing is { strokes: [{ points: [[x,y],...], color, width }] } with
 * coordinates normalized 0..1 (renders on any canvas size). The server
 * clamps rather than rejects wherever it can — a slightly-out-of-bounds
 * stroke from a weird touchscreen shouldn't eat a student's drawing —
 * and rejects only empty or structurally hopeless submissions.
 */

import { describe, it, expect } from 'vitest';
import {
  validateDrawing,
  isDrawingResponse,
  DRAWING_LIMITS
} from '../../engine/drawing.js';

function stroke(points, color = '#111111', width = 4) {
  return { points, color, width };
}

describe('validateDrawing — happy path', () => {
  it('accepts a simple drawing and returns cleaned strokes', () => {
    const result = validateDrawing({
      strokes: [stroke([[0.1, 0.1], [0.5, 0.5], [0.9, 0.2]])]
    });
    expect(result.ok).toBe(true);
    expect(result.strokes).toHaveLength(1);
    expect(result.strokes[0].points).toHaveLength(3);
    expect(result.strokes[0].color).toBe('#111111');
    expect(result.strokes[0].width).toBe(4);
  });

  it('clamps out-of-bounds coordinates into 0..1 and rounds to 4 decimals', () => {
    const result = validateDrawing({
      strokes: [stroke([[-0.5, 1.7], [0.123456789, 0.5]])]
    });
    expect(result.ok).toBe(true);
    expect(result.strokes[0].points[0]).toEqual([0, 1]);
    expect(result.strokes[0].points[1][0]).toBe(0.1235);
  });

  it('clamps width and falls back to a default color on junk', () => {
    const result = validateDrawing({
      strokes: [stroke([[0, 0], [1, 1]], 'javascript:alert(1)', 900)]
    });
    expect(result.ok).toBe(true);
    expect(result.strokes[0].color).toBe('#111111');
    expect(result.strokes[0].width).toBeLessThanOrEqual(DRAWING_LIMITS.maxWidth);
  });

  it('keeps single-point strokes (dots)', () => {
    const result = validateDrawing({ strokes: [stroke([[0.5, 0.5]])] });
    expect(result.ok).toBe(true);
    expect(result.strokes[0].points).toHaveLength(1);
  });
});

describe('validateDrawing — caps (trim, not reject)', () => {
  it('trims stroke count to the cap', () => {
    const many = Array.from({ length: DRAWING_LIMITS.maxStrokes + 50 }, () =>
      stroke([[0.1, 0.1], [0.2, 0.2]]));
    const result = validateDrawing({ strokes: many });
    expect(result.ok).toBe(true);
    expect(result.strokes).toHaveLength(DRAWING_LIMITS.maxStrokes);
  });

  it('trims points within a stroke to the per-stroke cap', () => {
    const long = stroke(Array.from({ length: DRAWING_LIMITS.maxPointsPerStroke + 100 },
      (_, i) => [i / 1000, 0.5]));
    const result = validateDrawing({ strokes: [long] });
    expect(result.ok).toBe(true);
    expect(result.strokes[0].points).toHaveLength(DRAWING_LIMITS.maxPointsPerStroke);
  });

  it('stops adding strokes once the total point budget is spent', () => {
    const perStroke = DRAWING_LIMITS.maxPointsPerStroke;
    const needed = Math.ceil(DRAWING_LIMITS.maxPointsTotal / perStroke) + 3;
    const strokes = Array.from({ length: needed }, () =>
      stroke(Array.from({ length: perStroke }, (_, i) => [i / perStroke, 0.5])));
    const result = validateDrawing({ strokes });
    const totalPoints = result.strokes.reduce((n, s) => n + s.points.length, 0);
    expect(totalPoints).toBeLessThanOrEqual(DRAWING_LIMITS.maxPointsTotal);
  });
});

describe('validateDrawing — rejection', () => {
  it('rejects an empty drawing', () => {
    expect(validateDrawing({ strokes: [] }).ok).toBe(false);
    expect(validateDrawing({ strokes: [] }).reason).toBe('empty');
  });

  it('rejects non-drawing payloads', () => {
    expect(validateDrawing('hello').ok).toBe(false);
    expect(validateDrawing(null).ok).toBe(false);
    expect(validateDrawing({ strokes: 'nope' }).ok).toBe(false);
    expect(validateDrawing(42).ok).toBe(false);
  });

  it('rejects a drawing whose strokes are all garbage', () => {
    const result = validateDrawing({
      strokes: [{ points: 'zzz' }, { nope: true }, null]
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('empty');
  });

  it('drops garbage points inside an otherwise fine stroke', () => {
    const result = validateDrawing({
      strokes: [stroke([[0.1, 0.1], 'junk', [0.2, 'NaN'], [0.3, 0.3]])]
    });
    expect(result.ok).toBe(true);
    expect(result.strokes[0].points).toEqual([[0.1, 0.1], [0.3, 0.3]]);
  });
});

describe('isDrawingResponse', () => {
  it('recognizes stored drawing responses', () => {
    expect(isDrawingResponse({ strokes: [] })).toBe(true);
    expect(isDrawingResponse({ strokes: [stroke([[0, 0]])] })).toBe(true);
  });

  it('rejects text, multi-field objects, and passes', () => {
    expect(isDrawingResponse('hello')).toBe(false);
    expect(isDrawingResponse({ truth1: 'a', lie: 'b' })).toBe(false);
    expect(isDrawingResponse({ _pass: true })).toBe(false);
    expect(isDrawingResponse(null)).toBe(false);
  });
});
