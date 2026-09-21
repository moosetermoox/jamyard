/**
 * The vote over drawings (2026-09-20, storyboard probe follow-up): "draw a
 * monster and vote for the scariest" had no honest path because a ballot
 * showed only text. Now a drawing step's responses carry their strokes to
 * the ballot as thin thumbnails (a whole class's drawings ride to every
 * voter), the student ballot draws them, and the crown shows the winning
 * drawing with its full strokes on the projector. Room proof:
 * scripts/simulate-drawing-vote.js.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { thumbnailStrokes, DRAWING_LIMITS } from '../../engine/drawing.js';
import { findWinnerEntries } from '../../engine/phases/winner-handler.js';

// Points as the validator stores them: four decimals (engine/drawing.js).
const r4 = x => Math.round(x * 10000) / 10000;
const stroke = (n, extra) => ({ color: '#000', width: 4, points: Array.from({ length: n }, (_, i) => [r4(i / n), r4(i / n)]), ...(extra || {}) });

describe('thumbnailStrokes', () => {
  it('keeps at most the asked points per stroke, first and last always', () => {
    const [thin] = thumbnailStrokes([stroke(400)], 24);
    expect(thin.points).toHaveLength(24);
    expect(thin.points[0]).toEqual([0, 0]);
    expect(thin.points[23]).toEqual([399 / 400, 399 / 400]);
    expect(thin.color).toBe('#000');
    expect(thin.width).toBe(4);
  });

  it('leaves short strokes whole and copies them', () => {
    const src = [stroke(5)];
    const out = thumbnailStrokes(src, 24);
    expect(out[0].points).toEqual(src[0].points);
    expect(out[0].points).not.toBe(src[0].points);
  });

  it('shrinks a maximal drawing to a ballot-sized payload', () => {
    // 100 strokes of 60 points, a busy drawing inside the limits
    const big = Array.from({ length: Math.min(100, DRAWING_LIMITS.maxStrokes) }, () => stroke(60));
    const thin = thumbnailStrokes(big);
    const bytes = JSON.stringify(thin).length;
    expect(bytes).toBeLessThan(JSON.stringify(big).length);
    // the per-drawing budget: 600 points over 100 strokes is 6 each
    expect(thin.every(s => s.points.length <= 6)).toBe(true);
    expect(thin.reduce((n, s) => n + s.points.length, 0)).toBeLessThanOrEqual(600);
    // 30 such drawings on one ballot stay under half a megabyte
    expect(bytes * 30).toBeLessThan(500000);
  });

  it('tolerates junk', () => {
    expect(thumbnailStrokes(null)).toEqual([]);
    expect(thumbnailStrokes([{ color: '#000' }])[0].points).toEqual([]);
  });
});

describe('findWinnerEntries with drawings', () => {
  const records = [
    { playerId: 'a', name: 'Ada', text: '[drawing]', drawing: [stroke(3)] },
    { playerId: 'b', name: 'Bo', text: 'a joke' },
    { playerId: 'c', name: 'Cy', text: '[drawing]' }
  ];

  it('carries a drawing entry with its strokes and no placeholder text', () => {
    const out = findWinnerEntries(['a'], records);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('');
    expect(out[0].name).toBe('Ada');
    expect(out[0].drawing).toEqual([stroke(3)]);
  });

  it('still returns text entries and still skips a bare placeholder', () => {
    expect(findWinnerEntries(['b'], records)[0].text).toBe('a joke');
    expect(findWinnerEntries(['c'], records)).toEqual([]);
  });
});

describe('the screens draw the ballot and the crown', () => {
  it('the student ballot renders a candidate drawing as a canvas, for pick-one and head-to-head', () => {
    const js = readFileSync(new URL('../../screens/player/player.js', import.meta.url), 'utf8');
    expect(js).toContain('function fillVoteButton');
    expect(js).toContain("thumb.className = 'vote-thumb'");
    expect(js).toContain('fillVoteButton(btnA, matchup.optionA)');
    expect(js).toContain('fillVoteButton(btnB, matchup.optionB)');
  });

  it('the projector draws the winning entry when it carries strokes', () => {
    const js = readFileSync(new URL('../../screens/host/host.js', import.meta.url), 'utf8');
    expect(js).toContain("art.className = 'winner-drawing'");
    expect(js).toContain('Array.isArray(entries[e].drawing)');
  });

  it('the vote handler thins drawings before they ride to a ballot', () => {
    const js = readFileSync(new URL('../../engine/phase-handlers/vote.js', import.meta.url), 'utf8');
    expect(js).toContain('thumbnailStrokes(c.drawing)');
  });
});
