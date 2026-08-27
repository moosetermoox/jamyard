/**
 * pairBy — answer-keyed pairing (2026-08-26 interop review, wave 2).
 *
 * A pairwise collect with `pairBy: {from: "<collect-choice step>", mode:
 * "opposite" | "same"}` prefers partners by what they answered in that
 * step. Preference is best-effort: preferred-answer partner beats a
 * repeat-avoidance miss, and when the answer split is lopsided leftover
 * students still pair with each other (nobody sits out because of the
 * preference; the final odd player follows oddHandling as always).
 *
 * Covers:
 *   - buildGroups answerOf/answerMode tiers (engine/phases/pairing.js)
 *   - validator cross-field rules for pairBy (engine/game-loader.js)
 */

import { describe, it, expect } from 'vitest';
import { pairKey, buildAvoidSet, buildGroups } from '../../engine/phases/pairing.js';
import { validate } from '../../engine/game-loader.js';

// ---------------------------------------------------------------------
// Pairing tiers
// ---------------------------------------------------------------------

describe('buildGroups with answerOf (pairBy core)', () => {
  const CATS_DOGS = { a: 'Cats', b: 'Cats', c: 'Cats', d: 'Dogs', e: 'Dogs', f: 'Dogs' };

  it('opposite mode: an even split pairs everyone cross-answer', () => {
    for (let trial = 0; trial < 20; trial++) {
      const { groups, leftover } = buildGroups(['a', 'b', 'c', 'd', 'e', 'f'], {
        answerOf: CATS_DOGS, answerMode: 'opposite'
      });
      expect(leftover).toBeNull();
      expect(groups).toHaveLength(3);
      for (const [x, y] of groups) {
        expect(CATS_DOGS[x]).not.toBe(CATS_DOGS[y]);
      }
    }
  });

  it('opposite mode: a lopsided split pairs the minority cross-answer, leftovers same-answer, nobody benched', () => {
    // 5 Cats, 1 Dog: 1 cross pair + 2 Cats-Cats pairs.
    const answers = { a: 'Cats', b: 'Cats', c: 'Cats', d: 'Cats', e: 'Cats', f: 'Dogs' };
    const { groups, leftover } = buildGroups(['a', 'b', 'c', 'd', 'e', 'f'], {
      answerOf: answers, answerMode: 'opposite'
    });
    expect(leftover).toBeNull();
    expect(groups).toHaveLength(3);
    const crossPairs = groups.filter(([x, y]) => answers[x] !== answers[y]);
    expect(crossPairs).toHaveLength(1);
  });

  it('same mode: even buckets pair entirely within answer buckets', () => {
    // 4 Cats / 2 Dogs — both buckets even, so perfect same-pairing exists.
    const answers = { a: 'Cats', b: 'Cats', c: 'Dogs', d: 'Dogs', e: 'Cats', f: 'Cats' };
    const { groups } = buildGroups(['a', 'b', 'c', 'd', 'e', 'f'], {
      answerOf: answers, answerMode: 'same'
    });
    expect(groups).toHaveLength(3);
    for (const [x, y] of groups) {
      expect(answers[x]).toBe(answers[y]);
    }
  });

  it('answer comparison is case-insensitive and trimmed', () => {
    const answers = { a: ' cats ', b: 'CATS', c: 'Dogs', d: 'dogs' };
    const { groups } = buildGroups(['a', 'b', 'c', 'd'], {
      answerOf: answers, answerMode: 'same'
    });
    for (const [x, y] of groups) {
      expect(answers[x].trim().toLowerCase()).toBe(answers[y].trim().toLowerCase());
    }
  });

  it('a player with no recorded answer still gets a partner', () => {
    const answers = { a: 'Cats', b: 'Dogs' }; // c never answered
    const { groups, leftover } = buildGroups(['a', 'b', 'c'], {
      answerOf: answers, answerMode: 'opposite', oddHandling: 'triple'
    });
    expect(leftover).toBeNull();
    expect(groups.flat().sort()).toEqual(['a', 'b', 'c']);
  });

  it('answer preference outranks repeat-avoidance', () => {
    // a-c is the only cross pair, but they were partners before.
    // Opposite mode should still choose it over a fresh same-answer partner.
    const answers = { a: 'Cats', b: 'Cats', c: 'Dogs', d: 'Cats' };
    const avoid = buildAvoidSet([{ playerIds: ['a', 'c'] }]);
    for (let trial = 0; trial < 20; trial++) {
      const { groups } = buildGroups(['a', 'b', 'c', 'd'], {
        answerOf: answers, answerMode: 'opposite', avoid
      });
      const cWith = groups.find(g => g.includes('c')).find(id => id !== 'c');
      expect(answers[cWith]).toBe('Cats');
    }
  });

  it('within the same answer tier, repeat-avoidance still applies', () => {
    // All same answer: preference is moot, so a fresh partner beats a repeat.
    const answers = { a: 'Cats', b: 'Cats', c: 'Cats', d: 'Cats' };
    const avoid = buildAvoidSet([{ playerIds: ['a', 'b'] }, { playerIds: ['c', 'd'] }]);
    for (let trial = 0; trial < 20; trial++) {
      const { groups } = buildGroups(['a', 'b', 'c', 'd'], {
        answerOf: answers, answerMode: 'same', avoid
      });
      for (const g of groups) {
        expect(avoid.has(pairKey(g[0], g[1]))).toBe(false);
      }
    }
  });

  it('without answerOf, behavior is unchanged (first non-repeat partner wins)', () => {
    const avoid = buildAvoidSet([{ playerIds: ['a', 'b'] }]);
    const { groups } = buildGroups(['a', 'b', 'c'], { avoid });
    // a skips b (repeat), takes c; b sits out (default sit-out).
    expect(groups).toEqual([['a', 'c']]);
  });

  it('odd count with sit-out still benches the final leftover', () => {
    const answers = { a: 'Cats', b: 'Dogs', c: 'Cats', d: 'Dogs', e: 'Cats' };
    const { groups, leftover } = buildGroups(['a', 'b', 'c', 'd', 'e'], {
      answerOf: answers, answerMode: 'opposite'
    });
    expect(groups).toHaveLength(2);
    expect(leftover).not.toBeNull();
  });
});

// ---------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------

function pairByConfig(shareExtra = {}, wyqType = 'collect-choice') {
  return {
    name: 'Test',
    phases: {
      lobby: { type: 'lobby', next: 'wyq' },
      wyq: wyqType === 'collect-choice'
        ? { type: 'collect-choice', prompt: 'Cats or dogs?', choices: ['Cats', 'Dogs'], next: 'share' }
        : { type: wyqType, prompt: 'Say something', next: 'share' },
      share: {
        type: 'collect', prompt: 'Tell your partner why', assign: 'pairwise',
        pairBy: { from: 'wyq', mode: 'opposite' },
        ...shareExtra,
        next: 'end'
      },
      end: { type: 'end' }
    }
  };
}

describe('validator: pairBy', () => {
  it('accepts a well-formed pairBy over a collect-choice step', () => {
    expect(() => validate(pairByConfig(), 'test')).not.toThrow();
  });

  it('accepts mode "same" and defaults a missing mode', () => {
    const cfg = pairByConfig();
    cfg.phases.share.pairBy = { from: 'wyq', mode: 'same' };
    expect(() => validate(cfg, 'test')).not.toThrow();
    cfg.phases.share.pairBy = { from: 'wyq' };
    expect(() => validate(cfg, 'test')).not.toThrow();
  });

  it('rejects pairBy without assign:"pairwise"', () => {
    const cfg = pairByConfig();
    delete cfg.phases.share.assign;
    expect(() => validate(cfg, 'test')).toThrow(/assign is not "pairwise"/);
  });

  it('rejects a pairBy.from that does not exist', () => {
    const cfg = pairByConfig();
    cfg.phases.share.pairBy = { from: 'ghost', mode: 'opposite' };
    expect(() => validate(cfg, 'test')).toThrow(/does not exist/);
  });

  it('rejects a pairBy.from that is not a Multiple Choice step', () => {
    const cfg = pairByConfig({}, 'collect');
    expect(() => validate(cfg, 'test')).toThrow(/must point to a Multiple Choice/);
  });

  it('rejects an invalid mode', () => {
    const cfg = pairByConfig();
    cfg.phases.share.pairBy = { from: 'wyq', mode: 'sideways' };
    expect(() => validate(cfg, 'test')).toThrow(/mode/);
  });

  it('rejects a pairBy missing "from"', () => {
    const cfg = pairByConfig();
    cfg.phases.share.pairBy = { mode: 'opposite' };
    expect(() => validate(cfg, 'test')).toThrow(/pairBy/);
  });

  it('rejects pairBy combined with reusePairsFrom (reuse dictates the groups)', () => {
    const cfg = pairByConfig();
    cfg.phases.share2 = {
      type: 'collect', prompt: 'Again', assign: 'pairwise',
      reusePairsFrom: 'share', pairBy: { from: 'wyq', mode: 'opposite' },
      next: 'end'
    };
    cfg.phases.share.next = 'share2';
    expect(() => validate(cfg, 'test')).toThrow(/reusePairsFrom/);
  });

  it('pairBy is banned inside foreach sub-phases (top-level only)', () => {
    const cfg = {
      name: 'Test',
      phases: {
        lobby: { type: 'lobby', next: 'ask' },
        ask: { type: 'collect', prompt: 'Write', next: 'rounds' },
        rounds: {
          type: 'foreach', data: 'ask.responses',
          subPhases: {
            share: { type: 'collect', prompt: 'Round', assign: 'pairwise', pairBy: { from: 'ask', mode: 'opposite' } }
          },
          next: 'end'
        },
        end: { type: 'end' }
      }
    };
    expect(() => validate(cfg, 'test')).toThrow(/top-level step/);
  });
});
