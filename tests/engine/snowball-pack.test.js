/**
 * Connection Pack — Phase 3 (Snowball / merge phase type).
 * Spec: docs/connection-pack-spec.md §3.
 *
 * Covers:
 *   - buildMergeGroups: pair grouping with named seeds, odd-class triple,
 *     quad formation by joining adjacent prior groups, leftover handling,
 *     and the no-members error for bad quad seeds.
 *   - agreesNeeded: both / any / timer.
 *   - Validator rules: groupSize 4 requires an upstream merge on all paths,
 *     seed ordering, agreeMode timer warning.
 *   - merged output is grammar-typed (raw {{X.merged}} warns; .list is fine).
 *   - The shipped snowball recipe.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildMergeGroups, agreesNeeded } from '../../engine/phase-handlers/merge.js';
import { validate } from '../../engine/game-loader.js';
import { compileRecipe } from '../../engine/recipe-compiler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ELIGIBLE = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
  { id: 'p3', name: 'Cleo' },
  { id: 'p4', name: 'Dana' },
  { id: 'p5', name: 'Eve' }
];

const SOLO_RESPONSES = [
  { playerId: 'p1', name: 'Alice', text: 'Be kind' },
  { playerId: 'p2', name: 'Bob', text: 'Be on time' },
  { playerId: 'p3', name: 'Cleo', text: 'Listen first' },
  { playerId: 'p4', name: 'Dana', text: 'Help each other' }
  // p5 never answered — no seed for them
];

describe('agreesNeeded', () => {
  it('both = every member; any = 1; timer = never auto-submits', () => {
    expect(agreesNeeded('both', 2)).toBe(2);
    expect(agreesNeeded('both', 3)).toBe(3);
    expect(agreesNeeded('any', 3)).toBe(1);
    expect(agreesNeeded('timer', 2)).toBe(Infinity);
  });
});

describe('buildMergeGroups — groupSize 2', () => {
  const ids = ELIGIBLE.map(p => p.id);

  it('pairs everyone (odd class forms a triple — nobody benched)', () => {
    const { groups } = buildMergeGroups(SOLO_RESPONSES, ELIGIBLE, 2, ids);
    const sizes = groups.map(g => g.members.length).sort();
    expect(sizes).toEqual([2, 3]);
    expect(groups.flatMap(g => g.members).sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('seeds carry each member\'s own answer with their name', () => {
    const { groups } = buildMergeGroups(SOLO_RESPONSES, ELIGIBLE, 2, ['p1', 'p2', 'p3', 'p4']);
    const aliceGroup = groups.find(g => g.members.includes('p1'));
    const aliceSeed = aliceGroup.seeds.find(s => s.author === 'Alice');
    expect(aliceSeed.text).toBe('Be kind');
  });

  it('a member with no solo answer simply contributes no seed', () => {
    const { groups } = buildMergeGroups(SOLO_RESPONSES, ELIGIBLE, 2, ids);
    const eveGroup = groups.find(g => g.members.includes('p5'));
    expect(eveGroup.seeds.some(s => s.author === 'Eve')).toBe(false);
  });
});

describe('buildMergeGroups — groupSize 3 (trios for consulting protocols)', () => {
  const idsFor = n => Array.from({ length: n }, (_, i) => `p${i + 1}`);
  const eligFor = n => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }));

  it('6 players → two trios, everyone placed once', () => {
    const { groups } = buildMergeGroups([], eligFor(6), 3, idsFor(6));
    expect(groups.map(g => g.members.length)).toEqual([3, 3]);
    expect(groups.flatMap(g => g.members).sort()).toEqual(idsFor(6).sort());
  });

  it('8 players → two trios + one pair (n%3===2)', () => {
    const { groups } = buildMergeGroups([], eligFor(8), 3, idsFor(8));
    expect(groups.map(g => g.members.length).sort()).toEqual([2, 3, 3]);
  });

  it('7 players → a four joins the last trio, never a singleton (n%3===1)', () => {
    const { groups } = buildMergeGroups([], eligFor(7), 3, idsFor(7));
    expect(groups.map(g => g.members.length).sort()).toEqual([3, 4]);
    expect(groups.every(g => g.members.length >= 2)).toBe(true);
  });

  it('seeds still carry each member\'s own answer', () => {
    const { groups } = buildMergeGroups(SOLO_RESPONSES, ELIGIBLE.slice(0, 3), 3, ['p1', 'p2', 'p3']);
    expect(groups.length).toBe(1);
    expect(groups[0].seeds.map(s => s.author).sort()).toEqual(['Alice', 'Bob', 'Cleo']);
  });
});

describe('buildMergeGroups — groupSize 4 (quads from prior merge)', () => {
  const PRIOR_MERGED = [
    { groupId: 'g1', text: 'Norm A', members: ['p1', 'p2'] },
    { groupId: 'g2', text: 'Norm B', members: ['p3', 'p4'] },
    { groupId: 'g3', text: 'Norm C', members: ['p5', 'p6'] },
    { groupId: 'g4', text: 'Norm D', members: ['p7', 'p8'] }
  ];
  const EIGHT = Array.from({ length: 8 }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }));

  it('joins adjacent prior groups into quads', () => {
    const { groups } = buildMergeGroups(PRIOR_MERGED, EIGHT, 4, []);
    expect(groups).toHaveLength(2);
    expect(groups[0].members.sort()).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(groups[0].seeds.map(s => s.text)).toEqual(['Norm A', 'Norm B']);
  });

  it('a leftover prior group joins the last quad instead of refining alone', () => {
    const { groups } = buildMergeGroups(PRIOR_MERGED.slice(0, 3), EIGHT.slice(0, 6), 4, []);
    expect(groups).toHaveLength(1);
    expect(groups[0].members.sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    expect(groups[0].seeds).toHaveLength(3);
  });

  it('drops members no longer eligible', () => {
    const { groups } = buildMergeGroups(PRIOR_MERGED.slice(0, 2), EIGHT.slice(0, 3), 4, []);
    expect(groups[0].members.sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('throws when seeds have no members (not a merge output)', () => {
    expect(() => buildMergeGroups(SOLO_RESPONSES, ELIGIBLE, 4, []))
      .toThrow(/earlier merge step/);
  });
});

// ---------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------

function baseConfig(phases) {
  return { name: 'Test', phases };
}

function snowballPhases(overrides = {}) {
  return {
    lobby: { type: 'lobby', next: 'solo' },
    solo: { type: 'collect', prompt: 'One big question?', next: 'pairs' },
    pairs: { type: 'merge', seedFrom: 'solo.responses', next: 'share' },
    share: { type: 'reveal', template: '{{pairs.merged.list}}', next: 'end' },
    end: { type: 'end' },
    ...overrides
  };
}

describe('validator: merge phase', () => {
  it('accepts the snowball shape (pair merge) with no errors or warnings', () => {
    const { errors, warnings } = validate(baseConfig(snowballPhases()), 'test', { returnResults: true });
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('requires seedFrom', () => {
    const phases = snowballPhases();
    delete phases.pairs.seedFrom;
    const { errors } = validate(baseConfig(phases), 'test', { returnResults: true });
    expect(errors.some(e => e.includes('missing required field "seedFrom"'))).toBe(true);
  });

  it('seedFrom must reference an existing phase', () => {
    const phases = snowballPhases();
    phases.pairs.seedFrom = 'ghost.responses';
    const { errors } = validate(baseConfig(phases), 'test', { returnResults: true });
    expect(errors.some(e => e.includes('"ghost" does not exist'))).toBe(true);
  });

  it('accepts a 1-2-4 chain (quad merge seeded from the pair merge)', () => {
    const phases = snowballPhases({
      pairs: { type: 'merge', seedFrom: 'solo.responses', next: 'quads' },
      quads: { type: 'merge', seedFrom: 'pairs.merged', groupSize: 4, next: 'share' },
      share: { type: 'reveal', template: '{{quads.merged.list}}', next: 'end' }
    });
    const { errors, warnings } = validate(baseConfig(phases), 'test', { returnResults: true });
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('groupSize 4 seeded from a collect is an error (quads need a prior merge)', () => {
    const phases = snowballPhases();
    phases.pairs.groupSize = 4; // seedFrom is solo (a collect)
    const { errors } = validate(baseConfig(phases), 'test', { returnResults: true });
    expect(errors.some(e => e.includes('must point to an earlier merge step'))).toBe(true);
  });

  it('rejects a quad merge reachable without its pair merge (all-paths rule)', () => {
    const phases = {
      lobby: { type: 'lobby', next: 'solo' },
      solo: { type: 'collect', prompt: 'Q?', next: 'gate' },
      gate: { type: 'preview', content: 'Ready?', approveNext: 'pairs', rejectNext: 'quads' },
      pairs: { type: 'merge', seedFrom: 'solo.responses', next: 'quads' },
      quads: { type: 'merge', seedFrom: 'pairs.merged', groupSize: 4, next: 'end' },
      end: { type: 'end' }
    };
    const { errors } = validate(baseConfig(phases), 'test', { returnResults: true });
    expect(errors.some(e => e.includes('can be reached without going through "pairs"'))).toBe(true);
  });

  it('warns on agreeMode "timer" with no timer', () => {
    const phases = snowballPhases();
    phases.pairs.agreeMode = 'timer';
    const { warnings } = validate(baseConfig(phases), 'test', { returnResults: true });
    expect(warnings.some(w => w.includes('agreeMode "timer" but has no timer'))).toBe(true);
  });

  it('raw {{X.merged}} in a template warns (typed output needs .list)', () => {
    const phases = snowballPhases();
    phases.share.template = '{{pairs.merged}}';
    const { warnings } = validate(baseConfig(phases), 'test', { returnResults: true });
    expect(warnings.some(w => w.includes('"merged" is a list'))).toBe(true);
  });

  it('merge is allowed in a connection-family game', () => {
    const config = { ...baseConfig(snowballPhases()), family: 'connection' };
    const { errors } = validate(config, 'test', { returnResults: true });
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// Shipped snowball recipe
// ---------------------------------------------------------------------

describe('snowball recipe', () => {
  it('compiles into a valid connection game with the merge phase wired', async () => {
    const recipe = JSON.parse(
      await readFile(join(__dirname, '..', '..', 'recipes', 'snowball.json'), 'utf-8')
    );
    const { config, diagnostics } = compileRecipe(recipe, { prompt: 'What should our class norms be?' });
    expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(config.family).toBe('connection');
    expect(config.phases.pairs.type).toBe('merge');
    expect(config.phases.pairs.seedFrom).toBe('solo.responses');
    expect(config.phases.solo.timer).toBe(90); // ${soloTimer} preserved as integer
    expect(config.phases.share.template).toContain('{{pairs.merged.list}}');

    const { errors, warnings } = validate(config, 'snowball', { returnResults: true });
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });
});
