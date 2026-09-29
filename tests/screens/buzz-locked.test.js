// The projector's "Maya buzzed in!" was paper text on a paper board: the
// boards rule reset the locked card's background after it was painted
// (found filming the funder montage, 2026-09-28).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('the buzzed-in card on the projector', () => {
  it('keeps its paint after the boards rule', () => {
    const css = readFileSync('screens/host/styles.css', 'utf8');
    const boards = css.indexOf('/* ── Boards: content sits on paper ── */');
    const fix = css.indexOf('.buzz-status.buzz-status-locked {');
    expect(boards).toBeGreaterThan(-1);
    expect(fix).toBeGreaterThan(boards);
  });
});
