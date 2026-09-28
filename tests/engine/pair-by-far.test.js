/**
 * pairBy mode "far" (2026-09-28, a reviewer's fist to five): "opposite"
 * only means the answers differ, so a 4 sat with a 5. "far" pairs the
 * ends of the pick-one step's choice order together: the lowest with the
 * highest, then inward.
 */
import { describe, it, expect } from 'vitest';
import { buildGroups, buildFarGroups } from '../../engine/phases/pairing.js';
import { validate } from '../../engine/game-loader.js';

const SCALE = ['0', '1', '2', '3', '4', '5'];

describe('buildFarGroups', () => {
  it('pairs the lowest with the highest, then inward', () => {
    const answerOf = { a: '0', b: '5', c: '2', d: '4', e: '1', f: '5' };
    const { groups, leftover } = buildFarGroups(['a', 'b', 'c', 'd', 'e', 'f'], answerOf, SCALE, 'triple');
    expect(leftover).toBeNull();
    const pairOf = (id) => groups.find(g => g.includes(id));
    const fives = ['b', 'f'];
    expect(fives.some(id => pairOf('a').includes(id))).toBe(true); // 0 with a 5
    expect(fives.some(id => pairOf('e').includes(id))).toBe(true); // 1 with the other 5
    expect(pairOf('c')).toContain('d'); // 2 with 4
  });
  it('never pairs a 4 with a 5 when a low answer is available', () => {
    const answerOf = { a: '4', b: '5', c: '0', d: '1' };
    const { groups } = buildFarGroups(['a', 'b', 'c', 'd'], answerOf, SCALE, 'triple');
    for (const g of groups) {
      const ranks = g.map(id => Number(answerOf[id]));
      expect(Math.max(...ranks) - Math.min(...ranks)).toBeGreaterThanOrEqual(3);
    }
  });
  it('makes the middle three a triple on an odd class, and benches the middle one on sit-out', () => {
    const answerOf = { a: '0', b: '1', c: '2', d: '4', e: '5' };
    const t = buildFarGroups(['a', 'b', 'c', 'd', 'e'], answerOf, SCALE, 'triple');
    expect(t.groups.map(g => g.length).sort()).toEqual([2, 3]);
    expect(t.leftover).toBeNull();
    const s = buildFarGroups(['a', 'b', 'c', 'd', 'e'], answerOf, SCALE, 'sit-out');
    expect(s.groups.length).toBe(2);
    expect(s.leftover).toBe('c');
  });
  it('sorts students with no answer last so they pair with each other', () => {
    const answerOf = { a: '0', b: '5' };
    const { groups } = buildFarGroups(['x', 'a', 'y', 'b'], answerOf, SCALE, 'triple');
    const pairOf = (id) => groups.find(g => g.includes(id));
    expect(pairOf('a')).toContain('b');
    expect(pairOf('x')).toContain('y');
  });
  it('is reached through buildGroups with answerMode far and an order; without an order it falls back to opposite', () => {
    const answerOf = { a: '0', b: '5', c: '4', d: '1' };
    const far = buildGroups(['a', 'c', 'b', 'd'], { answerOf, answerMode: 'far', answerOrder: SCALE, oddHandling: 'triple' });
    expect(far.groups.find(g => g.includes('a'))).toContain('b');
    const fallback = buildGroups(['a', 'c', 'b', 'd'], { answerOf, answerMode: 'far', oddHandling: 'triple' });
    expect(fallback.groups.length).toBe(2);
  });
});

describe('validator', () => {
  it('accepts pairBy mode far', () => {
    const config = {
      name: 'Fist to five', description: 'test',
      phases: {
        lobby: { type: 'lobby', next: 'pick' },
        pick: { type: 'collect-choice', prompt: 'Fist to five: how sure are you?', choices: SCALE, next: 'help' },
        help: { type: 'collect', prompt: 'Explain it to your partner.', assign: 'pairwise', oddHandling: 'triple', pairBy: { from: 'pick', mode: 'far' }, next: 'end' },
        end: { type: 'end', message: 'Bye' }
      }
    };
    const r = validate(config, 'far-test', { returnResults: true });
    expect(r.errors).toEqual([]);
    config.phases.help.pairBy.mode = 'near';
    const bad = validate(config, 'far-test', { returnResults: true });
    expect(bad.errors.map(e => e.message || e).join(' ')).toMatch(/"far"/);
  });
});
