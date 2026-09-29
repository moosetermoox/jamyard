/**
 * Review eighteen, Vocab Match: two of six pairs started already matched
 * (the deal only refused a fully solved board), and a student who joined
 * mid-round sat on "Waiting for others to match..." for the whole step.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dealRightColumn } from '../../engine/phases/match-scoring.js';
import { admitLateSolo } from '../../engine/phases/late-seating.js';

const rights = ['a', 'b', 'c', 'd', 'e', 'f'];

describe('dealRightColumn', () => {
  it('never leaves an item beside its match', () => {
    const identity = arr => arr.slice();
    const out = dealRightColumn(rights, identity);
    expect(out.slice().sort()).toEqual(rights);
    out.forEach((r, i) => expect(r).not.toBe(rights[i]));
  });

  it('fixes a single fixed point too', () => {
    const oneFixed = () => ['a', 'c', 'b', 'e', 'f', 'd'];
    const out = dealRightColumn(rights, oneFixed);
    out.forEach((r, i) => expect(r).not.toBe(rights[i]));
    expect(out.slice().sort()).toEqual(rights);
  });

  it('holds for random shuffles and two pairs', () => {
    const shuffle = arr => arr.slice().sort(() => Math.random() - 0.5);
    for (let n = 2; n <= 8; n++) {
      const list = rights.concat(['g', 'h']).slice(0, n);
      for (let k = 0; k < 50; k++) {
        const out = dealRightColumn(list, shuffle);
        out.forEach((r, i) => expect(r).not.toBe(list[i]));
      }
    }
  });
});

describe('admitLateSolo', () => {
  const fresh = () => ({ kind: 'match', eligibleIds: new Set(['p1']), completed: new Set(), closed: false });

  it('seats a late joiner on an open whole-class step', () => {
    const s = fresh();
    expect(admitLateSolo(s, 'match', 'p2', undefined)).toBe(true);
    expect(s.eligibleIds.has('p2')).toBe(true);
  });

  it('never on a closed step, another kind, or a step for some students', () => {
    const closed = { ...fresh(), closed: true };
    expect(admitLateSolo(closed, 'match', 'p2')).toBe(false);
    expect(admitLateSolo(fresh(), 'sort', 'p2')).toBe(false);
    expect(admitLateSolo(fresh(), 'match', 'p2', 'finalists')).toBe(false);
  });

  it('match and sort both have the hook', () => {
    for (const f of ['match', 'sort']) {
      const src = readFileSync(new URL(`../../engine/phase-handlers/${f}.js`, import.meta.url), 'utf8');
      expect(src).toMatch(/onLateJoin\(ctx, playerId\)/);
    }
  });
});
