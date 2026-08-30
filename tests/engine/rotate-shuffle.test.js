/**
 * Tests for the shuffled deal on rotating collects (`rotateShuffle`).
 *
 * Plain rotateFrom is a fixed shift over join order: with the default
 * offset every student always receives the item of whoever joined just
 * before them. rotateShuffle deals the pool in a random circle instead:
 * each player still gets exactly one classmate's item, never their own,
 * but who-got-whose is unpredictable. This is the primitive behind
 * "everyone submits X, each student gets a RANDOM classmate's X"
 * (creative-writing mashups, prompt swaps).
 *
 * Covers:
 *   - shuffleDeal: permutation, no self-assignment, single-cycle circle,
 *     deterministic under an injected rand, degenerate sizes
 *   - Validator/schema: rotateShuffle is an accepted collect field
 *   - Resolver grammar: PER_PLAYER_TOKEN matches .mine AND .assigned
 *     (announce/reveal gate per-recipient rendering on it)
 */

import { describe, it, expect } from 'vitest';
import { shuffleDeal } from '../../engine/phases/deal.js';
import { validate } from '../../engine/game-loader.js';
import { PER_PLAYER_TOKEN } from '../../engine/resolver-grammar.js';

describe('shuffleDeal', () => {
  const ids = ['p1', 'p2', 'p3', 'p4', 'p5'];

  it('maps every player to a sender, and every player sends exactly once', () => {
    const senderOf = shuffleDeal(ids);
    expect(Object.keys(senderOf).sort()).toEqual([...ids].sort());
    expect(Object.values(senderOf).sort()).toEqual([...ids].sort());
  });

  it('never assigns a player their own item (N >= 2)', () => {
    for (let trial = 0; trial < 50; trial++) {
      for (const n of [2, 3, 4, 5, 9]) {
        const someIds = Array.from({ length: n }, (_, i) => 'p' + i);
        const senderOf = shuffleDeal(someIds);
        for (const [receiver, sender] of Object.entries(senderOf)) {
          expect(sender).not.toBe(receiver);
        }
      }
    }
  });

  it('forms one circle: following sender links visits everyone', () => {
    const senderOf = shuffleDeal(ids);
    const seen = new Set();
    let cur = ids[0];
    while (!seen.has(cur)) {
      seen.add(cur);
      cur = senderOf[cur];
    }
    expect(seen.size).toBe(ids.length);
  });

  it('is deterministic when rand is injected', () => {
    const fixed = () => 0.42;
    expect(shuffleDeal(ids, fixed)).toEqual(shuffleDeal(ids, fixed));
  });

  it('actually varies with rand (not a disguised fixed shift)', () => {
    const outcomes = new Set();
    for (let i = 0; i < 40; i++) {
      outcomes.add(JSON.stringify(shuffleDeal(ids)));
    }
    expect(outcomes.size).toBeGreaterThan(1);
  });

  it('single player receives their own item (nothing else to deal)', () => {
    expect(shuffleDeal(['solo'])).toEqual({ solo: 'solo' });
  });

  it('empty list yields an empty map', () => {
    expect(shuffleDeal([])).toEqual({});
  });
});

describe('rotateShuffle — validator/schema', () => {
  const game = (rotated) => ({
    name: 'Shuffle Test',
    phases: {
      lobby: { type: 'lobby', next: 'pool' },
      pool: { type: 'collect', prompt: 'Describe a character.', next: 'deal' },
      deal: rotated,
      end: { type: 'end' }
    }
  });

  it('accepts rotateShuffle:true beside rotateFrom', () => {
    const cfg = game({
      type: 'collect',
      prompt: 'You got: {{pool.assigned}}. Write about them.',
      rotateFrom: 'pool',
      rotateShuffle: true,
      next: 'end'
    });
    expect(() => validate(cfg, 'shuffle-ok')).not.toThrow();
  });

  it('accepts rotateShuffle without rotateFrom (ignored at runtime, like rotateOffset)', () => {
    const cfg = game({
      type: 'collect',
      prompt: 'x',
      rotateShuffle: true,
      next: 'end'
    });
    expect(() => validate(cfg, 'shuffle-no-rotate')).not.toThrow();
  });
});

describe('PER_PLAYER_TOKEN — per-recipient template gate', () => {
  it('matches {{x.mine}}', () => {
    expect(PER_PLAYER_TOKEN.test('Your answer: {{quiz.mine}}')).toBe(true);
  });

  it('matches {{x.assigned}} (dealt items render per-recipient too)', () => {
    expect(PER_PLAYER_TOKEN.test('You were dealt: {{pool.assigned}}')).toBe(true);
  });

  it('does not match class-wide renderer suffixes', () => {
    expect(PER_PLAYER_TOKEN.test('All of them: {{pool.list}}')).toBe(false);
    expect(PER_PLAYER_TOKEN.test('{{pool.count}} answers in')).toBe(false);
  });
});
