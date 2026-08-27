/**
 * Interop wave 4 closers (2026-08-26 review items #4 + checklist bridge).
 *
 *   A. pairsFrom author exclusion: when a pairwise collect draws its
 *      per-pair prompts from an earlier step's responses, a pair should
 *      never be handed the item one of its OWN members wrote (when any
 *      alternative exists). Pure logic: assignPromptsToGroups.
 *   B. checklist accepts pairs: `teamsFrom` may name a pairwise collect;
 *      pairs become dashboard groups labeled by member names.
 */

import { describe, it, expect } from 'vitest';
import { assignPromptsToGroups } from '../../engine/phases/pairing.js';
import { pairsAsTeams } from '../../engine/phases/checklist-state.js';
import { validate } from '../../engine/game-loader.js';

// ---------------------------------------------------------------------
// assignPromptsToGroups
// ---------------------------------------------------------------------

describe('assignPromptsToGroups', () => {
  const items = [
    { text: 'Q by a', authorId: 'a' },
    { text: 'Q by c', authorId: 'c' },
    { text: 'Q by e', authorId: 'e' }
  ];

  it('never hands a group its own member\'s item when an alternative exists', () => {
    const groups = [['a', 'b'], ['c', 'd'], ['e', 'f']];
    const prompts = assignPromptsToGroups(items, groups);
    expect(prompts).toHaveLength(3);
    expect(prompts[0]).not.toBe('Q by a');
    expect(prompts[1]).not.toBe('Q by c');
    expect(prompts[2]).not.toBe('Q by e');
  });

  it('gives distinct items while there are enough to go around', () => {
    const groups = [['a', 'b'], ['c', 'd'], ['e', 'f']];
    const prompts = assignPromptsToGroups(items, groups);
    expect(new Set(prompts).size).toBe(3);
  });

  it('reuses items when there are more groups than items', () => {
    const two = items.slice(0, 2);
    const groups = [['g', 'h'], ['i', 'j'], ['k', 'l'], ['m', 'n']];
    const prompts = assignPromptsToGroups(two, groups);
    expect(prompts).toHaveLength(4);
    for (const p of prompts) expect(['Q by a', 'Q by c']).toContain(p);
  });

  it('falls back to a member-authored item when nothing else exists', () => {
    const one = [{ text: 'Only question', authorId: 'a' }];
    const prompts = assignPromptsToGroups(one, [['a', 'b']]);
    expect(prompts).toEqual(['Only question']);
  });

  it('items with no author work everywhere', () => {
    const anon = [{ text: 'From AI', authorId: null }];
    expect(assignPromptsToGroups(anon, [['a', 'b'], ['c', 'd']])).toEqual(['From AI', 'From AI']);
  });
});

// ---------------------------------------------------------------------
// pairsAsTeams
// ---------------------------------------------------------------------

describe('pairsAsTeams', () => {
  const nameOf = (id) => ({ a: 'Maya', b: 'Sam', c: 'Lee', d: 'Ana' }[id]);

  it('turns pairs into name-labeled teams', () => {
    const result = pairsAsTeams(
      [{ playerIds: ['a', 'b'] }, { playerIds: ['c', 'd'] }],
      nameOf
    );
    expect(Object.keys(result.teams)).toEqual(['Maya & Sam', 'Lee & Ana']);
    expect(result.teams['Maya & Sam'].map(m => m.playerId)).toEqual(['a', 'b']);
  });

  it('handles triples and unknown names', () => {
    const result = pairsAsTeams([{ playerIds: ['a', 'b', 'x'] }], nameOf);
    expect(Object.keys(result.teams)).toEqual(['Maya & Sam & Someone']);
  });

  it('uniquifies colliding labels', () => {
    const twins = (id) => 'Alex';
    const result = pairsAsTeams(
      [{ playerIds: ['a', 'b'] }, { playerIds: ['c', 'd'] }],
      twins
    );
    expect(Object.keys(result.teams)).toEqual(['Alex & Alex', 'Alex & Alex (2)']);
  });

  it('returns null for empty or missing pairs', () => {
    expect(pairsAsTeams([], nameOf)).toBeNull();
    expect(pairsAsTeams(null, nameOf)).toBeNull();
  });
});

// ---------------------------------------------------------------------
// Validator — checklist teamsFrom accepts a pairwise collect
// ---------------------------------------------------------------------

function checklistConfig(mutate) {
  const cfg = {
    name: 'Test',
    phases: {
      lobby: { type: 'lobby', next: 'share' },
      share: {
        type: 'collect', prompt: 'Say hi to your partner', assign: 'pairwise',
        oddHandling: 'triple', next: 'tasks'
      },
      tasks: {
        type: 'checklist', items: ['Do the thing', 'Check the thing'],
        teamsFrom: 'share', next: 'end'
      },
      end: { type: 'end' }
    }
  };
  if (mutate) mutate(cfg);
  return cfg;
}

describe('validator: checklist teamsFrom accepts pairs', () => {
  it('accepts a pairwise collect as the group source', () => {
    expect(() => validate(checklistConfig(), 'test')).not.toThrow();
  });

  it('still rejects a non-grouping source', () => {
    const cfg = checklistConfig(c => {
      c.phases.share = { type: 'collect', prompt: 'Solo', next: 'tasks' };
    });
    expect(() => validate(cfg, 'test')).toThrow(/Split into Teams|paired/);
  });

  it('warns when the pairwise source can bench a player (sit-out)', () => {
    const cfg = checklistConfig(c => { delete c.phases.share.oddHandling; });
    const { errors, warnings } = validate(cfg, 'test', { returnResults: true });
    expect(errors).toEqual([]);
    expect(warnings.some(w => w.includes('sit-out') || w.includes('sits out') || w.includes('no checklist'))).toBe(true);
  });
});
