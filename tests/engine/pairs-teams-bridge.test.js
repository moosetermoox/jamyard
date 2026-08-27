/**
 * Pairs/teams bridges (2026-08-26 interop review, wave 3).
 *
 * Three grouping systems existed with no bridges: pairwise-collect
 * `pairs`, team-split `teams`, and merge's internal groups. Two bridges
 * close the highest-value gaps:
 *
 *   A. collect `reusePairsFrom` also accepts a team-split step, so
 *      teacher-arranged pairs (method "teacher", groupSize 2) feed the
 *      whole pair pipeline (pair reveals, matchups) through a pairwise
 *      collect.
 *   B. merge gains `groupsFrom` (pairwise collect OR team-split), so
 *      "same partners now write together" is expressible.
 *
 * Covers the shared normalizer (groupsFromSource), merge group building
 * with prebuilt groups, and validator rules on both bridges.
 */

import { describe, it, expect } from 'vitest';
import { groupsFromSource } from '../../engine/phases/pairing.js';
import { buildMergeGroups } from '../../engine/phase-handlers/merge.js';
import { validate } from '../../engine/game-loader.js';

// ---------------------------------------------------------------------
// groupsFromSource — one normalizer for both producers
// ---------------------------------------------------------------------

describe('groupsFromSource', () => {
  it('reads a pairwise collect\'s pairs', () => {
    const groups = groupsFromSource({
      pairs: [
        { promptText: 'Q1', playerIds: ['a', 'b'] },
        { promptText: 'Q2', playerIds: ['c', 'd', 'e'] }
      ]
    });
    expect(groups).toEqual([['a', 'b'], ['c', 'd', 'e']]);
  });

  it('reads a team-split\'s teams in team order', () => {
    const groups = groupsFromSource({
      teams: {
        'Group 1': [{ playerId: 'a', name: 'Alice' }, { playerId: 'b', name: 'Bob' }],
        'Group 2': [{ playerId: 'c', name: 'Cara' }, { playerId: 'd', name: 'Dan' }]
      },
      playerTeam: { a: 'Group 1', b: 'Group 1', c: 'Group 2', d: 'Group 2' }
    });
    expect(groups).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('returns null when the source has neither shape', () => {
    expect(groupsFromSource(null)).toBeNull();
    expect(groupsFromSource({})).toBeNull();
    expect(groupsFromSource({ responses: [] })).toBeNull();
  });
});

// ---------------------------------------------------------------------
// buildMergeGroups with prebuilt groups
// ---------------------------------------------------------------------

describe('buildMergeGroups with prebuilt idGroups', () => {
  const eligible = [
    { id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' },
    { id: 'c', name: 'Cara' }, { id: 'd', name: 'Dan' }
  ];
  const seeds = [
    { playerId: 'a', text: 'seed A' },
    { playerId: 'b', text: 'seed B' },
    { playerId: 'c', text: 'seed C' }
    // d never submitted
  ];

  it('keeps the given groups and maps each member\'s own seed', () => {
    const { groups } = buildMergeGroups(seeds, eligible, 2, ['a', 'b', 'c', 'd'], {
      idGroups: [['a', 'c'], ['b', 'd']]
    });
    expect(groups.map(g => g.members)).toEqual([['a', 'c'], ['b', 'd']]);
    expect(groups[0].seeds.map(s => s.text)).toEqual(['seed A', 'seed C']);
    expect(groups[1].seeds.map(s => s.text)).toEqual(['seed B']); // d has no seed
    expect(groups[0].seeds[0].author).toBe('Alice');
  });

  it('drops members no longer eligible and empty groups', () => {
    const { groups } = buildMergeGroups(seeds, eligible.slice(0, 2), 2, ['a', 'b'], {
      idGroups: [['a', 'b'], ['c', 'd']]
    });
    expect(groups.map(g => g.members)).toEqual([['a', 'b']]);
  });
});

// ---------------------------------------------------------------------
// Validator — bridge rules
// ---------------------------------------------------------------------

function bridgeConfig(mutate) {
  const cfg = {
    name: 'Test',
    phases: {
      lobby: { type: 'lobby', next: 'teams' },
      teams: { type: 'team-split', method: 'random', groupSize: 2, next: 'share' },
      share: {
        type: 'collect', prompt: 'Answer together-adjacent', assign: 'pairwise',
        reusePairsFrom: 'teams', next: 'write'
      },
      write: {
        type: 'merge', seedFrom: 'share.responses', groupsFrom: 'share',
        agreeMode: 'any', next: 'end'
      },
      end: { type: 'end' }
    }
  };
  if (mutate) mutate(cfg);
  return cfg;
}

describe('validator: reusePairsFrom accepts team-split', () => {
  it('accepts a team-split as the reuse source', () => {
    expect(() => validate(bridgeConfig(), 'test')).not.toThrow();
  });

  it('still rejects a non-grouping source', () => {
    const cfg = bridgeConfig(c => {
      c.phases.teams = { type: 'announce', message: 'hi', next: 'share' };
    });
    expect(() => validate(cfg, 'test')).toThrow(/must point to/);
  });
});

describe('validator: merge groupsFrom', () => {
  it('accepts a pairwise collect and a team-split', () => {
    expect(() => validate(bridgeConfig(), 'test')).not.toThrow();
    const cfg = bridgeConfig(c => { c.phases.write.groupsFrom = 'teams'; });
    expect(() => validate(cfg, 'test')).not.toThrow();
  });

  it('rejects a groupsFrom that does not exist', () => {
    const cfg = bridgeConfig(c => { c.phases.write.groupsFrom = 'ghost'; });
    expect(() => validate(cfg, 'test')).toThrow(/does not exist/);
  });

  it('rejects a source that produces no groups', () => {
    const cfg = bridgeConfig(c => { c.phases.write.groupsFrom = 'lobby'; });
    expect(() => validate(cfg, 'test')).toThrow(/must point to/);
  });

  it('rejects a plain collect (no pairwise) as source', () => {
    const cfg = bridgeConfig(c => {
      c.phases.solo = { type: 'collect', prompt: 'Solo', next: 'write' };
      c.phases.share.next = 'solo';
      c.phases.write.groupsFrom = 'solo';
    });
    expect(() => validate(cfg, 'test')).toThrow(/must point to/);
  });

  it('rejects groupsFrom combined with an explicit groupSize', () => {
    const cfg = bridgeConfig(c => { c.phases.write.groupSize = 4; });
    expect(() => validate(cfg, 'test')).toThrow(/groupSize/);
  });
});
