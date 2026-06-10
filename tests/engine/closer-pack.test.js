/**
 * Connection Pack — Phase 2 (Closer).
 * Spec: docs/connection-pack-spec.md §2.
 *
 * Covers:
 *   - Pairing module (engine/phases/pairing.js): greedy matching,
 *     odd-class triples, rotation avoid-set, repeat fallback.
 *   - Recipe compiler indexed placeholders (${name[0]}).
 *   - Validator rules: pairsFrom now optional with pairwise,
 *     rotatePairsFrom/reusePairsFrom referential rules, the triple +
 *     matchupsFromPairs warning, and the >12 pair-round period guard.
 *   - The shipped closer recipe + prompt bank.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  pairKey,
  groupPairKeys,
  buildAvoidSet,
  buildGroups
} from '../../engine/phases/pairing.js';
import { compileRecipe } from '../../engine/recipe-compiler.js';
import { validate } from '../../engine/game-loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------
// Pairing module
// ---------------------------------------------------------------------

describe('pairKey / groupPairKeys / buildAvoidSet', () => {
  it('pairKey is order-independent', () => {
    expect(pairKey('a', 'b')).toBe(pairKey('b', 'a'));
  });

  it('groupPairKeys: a pair gives 1 key, a triple gives 3', () => {
    expect(groupPairKeys(['a', 'b'])).toHaveLength(1);
    expect(groupPairKeys(['a', 'b', 'c'])).toHaveLength(3);
  });

  it('buildAvoidSet collects every partner relationship from prior pairs', () => {
    const avoid = buildAvoidSet([
      { playerIds: ['a', 'b'] },
      { playerIds: ['c', 'd', 'e'] }
    ]);
    expect(avoid.has(pairKey('a', 'b'))).toBe(true);
    expect(avoid.has(pairKey('c', 'e'))).toBe(true);
    expect(avoid.has(pairKey('a', 'c'))).toBe(false);
  });
});

describe('buildGroups', () => {
  it('pairs an even count into groups of 2', () => {
    const { groups, leftover } = buildGroups(['a', 'b', 'c', 'd']);
    expect(groups).toHaveLength(2);
    expect(groups.every(g => g.length === 2)).toBe(true);
    expect(leftover).toBeNull();
  });

  it('sit-out (default): odd count benches the last player', () => {
    const { groups, leftover } = buildGroups(['a', 'b', 'c', 'd', 'e']);
    expect(groups).toHaveLength(2);
    expect(leftover).not.toBeNull();
  });

  it('triple: odd count forms one group of three, nobody benched', () => {
    const { groups, leftover } = buildGroups(['a', 'b', 'c', 'd', 'e'], { oddHandling: 'triple' });
    expect(leftover).toBeNull();
    const sizes = groups.map(g => g.length).sort();
    expect(sizes).toEqual([2, 3]);
    expect(groups.flat().sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('triple: a class of exactly 3 forms one triple', () => {
    const { groups, leftover } = buildGroups(['a', 'b', 'c'], { oddHandling: 'triple' });
    expect(groups).toEqual([['a', 'b', 'c']]);
    expect(leftover).toBeNull();
  });

  it('triple: a class of 1 keeps the lone player in a group of one', () => {
    const { groups, leftover } = buildGroups(['a'], { oddHandling: 'triple' });
    expect(groups).toEqual([['a']]);
    expect(leftover).toBeNull();
  });

  it('avoids repeat partners when an avoid-set is given', () => {
    // 4 players, previously a-b and c-d. New pairing must be a-c/b-d or a-d/b-c.
    const avoid = buildAvoidSet([{ playerIds: ['a', 'b'] }, { playerIds: ['c', 'd'] }]);
    for (let trial = 0; trial < 20; trial++) {
      const { groups } = buildGroups(['a', 'b', 'c', 'd'], { avoid });
      for (const g of groups) {
        expect(avoid.has(pairKey(g[0], g[1]))).toBe(false);
      }
    }
  });

  it('falls back to a repeat partner when no alternative exists (2 players)', () => {
    const avoid = buildAvoidSet([{ playerIds: ['a', 'b'] }]);
    const { groups, leftover } = buildGroups(['a', 'b'], { avoid });
    expect(groups).toEqual([['a', 'b']]); // repeat beats sitting out
    expect(leftover).toBeNull();
  });
});

// ---------------------------------------------------------------------
// Compiler — indexed placeholders
// ---------------------------------------------------------------------

describe('recipe compiler: ${name[i]} indexing', () => {
  const recipe = {
    id: 'idx-test',
    name: 'Idx',
    description: 'test',
    parameters: {
      prompts: {
        type: 'array',
        item: { type: 'templateString' },
        minItems: 2, maxItems: 3,
        default: ['First?', 'Second?']
      }
    },
    template: {
      name: 'Idx',
      phases: {
        lobby: { type: 'lobby', next: 'q1' },
        q1: { type: 'collect', prompt: '${prompts[0]}', next: 'q2' },
        q2: { type: 'collect', prompt: 'Round 2: ${prompts[1]}', next: 'end' },
        end: { type: 'end' }
      }
    }
  };

  it('whole-value index returns the element', () => {
    const { config, diagnostics } = compileRecipe(recipe, {});
    expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(config.phases.q1.prompt).toBe('First?');
  });

  it('interpolated index embeds the element', () => {
    const { config } = compileRecipe(recipe, {});
    expect(config.phases.q2.prompt).toBe('Round 2: Second?');
  });

  it('out-of-range index is a compile error (recipe-author bug)', () => {
    const bad = JSON.parse(JSON.stringify(recipe));
    bad.template.phases.q2.prompt = '${prompts[9]}';
    const { config, diagnostics } = compileRecipe(bad, {});
    expect(config).toBeNull();
    expect(diagnostics.some(d => d.message.includes('only has'))).toBe(true);
  });

  it('indexing a non-array param is a compile error', () => {
    const bad = {
      ...recipe,
      parameters: { prompts: { type: 'string', default: 'not an array' } }
    };
    const { config, diagnostics } = compileRecipe(bad, {});
    expect(config).toBeNull();
    expect(diagnostics.some(d => d.message.includes('is not an array'))).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Validator — pairing rules
// ---------------------------------------------------------------------

function baseConfig(phases) {
  return { name: 'Test', phases };
}

describe('validator: rotatePairsFrom / reusePairsFrom', () => {
  function chain(extra = {}) {
    return baseConfig({
      lobby: { type: 'lobby', next: 'q1' },
      q1: { type: 'collect', prompt: 'A?', assign: 'pairwise', oddHandling: 'triple', next: 'q2' },
      q2: { type: 'collect', prompt: 'B?', assign: 'pairwise', reusePairsFrom: 'q1', next: 'end' },
      end: { type: 'end' },
      ...extra
    });
  }

  it('accepts a reuse chain', () => {
    const { errors } = validate(chain(), 'test', { returnResults: true });
    expect(errors).toEqual([]);
  });

  it('accepts a rotate chain', () => {
    const cfg = chain();
    cfg.phases.q2 = { type: 'collect', prompt: 'B?', assign: 'pairwise', rotatePairsFrom: 'q1', next: 'end' };
    const { errors } = validate(cfg, 'test', { returnResults: true });
    expect(errors).toEqual([]);
  });

  it('rejects both rotatePairsFrom and reusePairsFrom on one step', () => {
    const cfg = chain();
    cfg.phases.q2.rotatePairsFrom = 'q1';
    const { errors } = validate(cfg, 'test', { returnResults: true });
    expect(errors.some(e => e.includes('sets both "rotatePairsFrom" and "reusePairsFrom"'))).toBe(true);
  });

  it('rejects a pairing field without assign:"pairwise"', () => {
    const cfg = chain();
    delete cfg.phases.q2.assign;
    const { errors } = validate(cfg, 'test', { returnResults: true });
    expect(errors.some(e => e.includes('but assign is not "pairwise"'))).toBe(true);
  });

  it('rejects a pairing field pointing at a non-pairwise step', () => {
    const cfg = chain();
    cfg.phases.q2.reusePairsFrom = 'lobby';
    const { errors } = validate(cfg, 'test', { returnResults: true });
    expect(errors.some(e => e.includes('reusePairsFrom "lobby" must point to'))).toBe(true);
  });

  it('rejects a pairing field pointing at a missing step', () => {
    const cfg = chain();
    cfg.phases.q2.reusePairsFrom = 'ghost';
    const { errors } = validate(cfg, 'test', { returnResults: true });
    expect(errors.some(e => e.includes('reusePairsFrom "ghost" which does not exist'))).toBe(true);
  });

  it('warns when matchupsFromPairs reads a triple-capable source', () => {
    const cfg = baseConfig({
      lobby: { type: 'lobby', next: 'seed' },
      seed: { type: 'collect', prompt: 'Write one.', next: 'answers' },
      answers: { type: 'collect', prompt: 'Q', assign: 'pairwise', pairsFrom: 'seed', oddHandling: 'triple', next: 'pick' },
      pick: { type: 'vote', mode: 'head-to-head', matchupsFromPairs: 'answers', next: 'end' },
      end: { type: 'end' }
    });
    const { warnings } = validate(cfg, 'test', { returnResults: true });
    expect(warnings.some(w => w.includes('oddHandling:"triple"'))).toBe(true);
  });

  it('warns above 12 pair-prompt rounds (period guard)', () => {
    const phases = { lobby: { type: 'lobby', next: 'p0' } };
    for (let i = 0; i < 13; i++) {
      phases[`p${i}`] = {
        type: 'collect', prompt: `Q${i}?`, assign: 'pairwise',
        ...(i > 0 ? { reusePairsFrom: 'p0' } : {}),
        next: i < 12 ? `p${i + 1}` : 'end'
      };
    }
    phases.end = { type: 'end' };
    const { warnings } = validate(baseConfig(phases), 'test', { returnResults: true });
    expect(warnings.some(w => w.includes('pair-prompt rounds'))).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Shipped closer recipe + prompt bank
// ---------------------------------------------------------------------

describe('closer recipe + prompt bank', () => {
  it('prompt bank ships ~30 original prompts per tier', async () => {
    const bank = JSON.parse(
      await readFile(join(__dirname, '..', '..', 'recipes', 'prompt-banks', 'closer.json'), 'utf-8')
    );
    for (const tier of ['tier1', 'tier2', 'tier3']) {
      expect(bank[tier].length).toBeGreaterThanOrEqual(28);
      // every prompt is a non-trivial string
      expect(bank[tier].every(p => typeof p === 'string' && p.length > 10)).toBe(true);
    }
  });

  it('closer compiles with zero typing (all defaults) into a valid connection game', async () => {
    const recipe = JSON.parse(
      await readFile(join(__dirname, '..', '..', 'recipes', 'closer.json'), 'utf-8')
    );
    const { config, diagnostics } = compileRecipe(recipe, {});
    expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(config.family).toBe('connection');

    const { errors, warnings } = validate(config, 'closer', { returnResults: true });
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);

    // Structure: 9 pair rounds, each with a pair-scoped reveal; tiers rotate
    const pairRounds = Object.values(config.phases).filter(p => p.assign === 'pairwise');
    expect(pairRounds).toHaveLength(9);
    expect(pairRounds.every(p => p.passAllowed && p.simultaneousReveal)).toBe(true);
    expect(config.phases.t2q1.rotatePairsFrom).toBe('t1q1');
    expect(config.phases.t3q1.rotatePairsFrom).toBe('t2q1');
    expect(config.phases.t1q2.reusePairsFrom).toBe('t1q1');
    // default prompts landed in the right phases
    expect(config.phases.t1q1.prompt).toContain('Window seat');
    expect(config.phases.t3q3.prompt).toContain('remember in ten years');
  });
});
