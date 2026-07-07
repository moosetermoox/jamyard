/**
 * Team grouping — pure sizing/capacity/auto-fill rules for the team-split
 * upgrade: teachers can say "groups of 4" (groupSize) instead of "4 teams"
 * (teamCount), and the choice/teacher assignment modes need per-team
 * capacities and straggler auto-fill.
 */

import { describe, it, expect } from 'vitest';
import {
  groupCountFor,
  teamCapacities,
  defaultTeamNames,
  autoFill
} from '../../engine/phases/team-grouping.js';

describe('groupCountFor — how many groups does "groups of N" make?', () => {
  it('divides evenly when it can', () => {
    expect(groupCountFor(8, 4)).toBe(2);
    expect(groupCountFor(20, 5)).toBe(4);
  });

  it('rounds to the count whose sizes are closest to the request', () => {
    expect(groupCountFor(22, 4)).toBe(6); // 4,4,4,4,3,3 beats 5,5,4,4,4
    expect(groupCountFor(25, 4)).toBe(6); // 5,4,4,4,4,4
    expect(groupCountFor(9, 4)).toBe(2);  // 5,4 — teachers fold the 9th in
  });

  it('never produces a singleton group (odd pair-classes get a triple)', () => {
    expect(groupCountFor(5, 2)).toBe(2);  // 3,2 — NOT 2,2,1
    expect(groupCountFor(3, 2)).toBe(1);  // one group of 3
  });

  it('degenerate classes still get one group', () => {
    expect(groupCountFor(2, 4)).toBe(1);
    expect(groupCountFor(1, 3)).toBe(1);
  });
});

describe('teamCapacities — even-split sizes for a given team count', () => {
  it('splits evenly when divisible', () => {
    expect(teamCapacities(8, 2)).toEqual([4, 4]);
  });

  it('front-loads the remainder (sizes differ by at most 1)', () => {
    expect(teamCapacities(22, 6)).toEqual([4, 4, 4, 4, 3, 3]);
    expect(teamCapacities(7, 3)).toEqual([3, 2, 2]);
  });

  it('handles more teams than players', () => {
    expect(teamCapacities(2, 3)).toEqual([1, 1, 0]);
  });
});

describe('defaultTeamNames', () => {
  it('says Team for team-count sizing and Group for group-size sizing', () => {
    expect(defaultTeamNames(2, false)).toEqual(['Team 1', 'Team 2']);
    expect(defaultTeamNames(3, true)).toEqual(['Group 1', 'Group 2', 'Group 3']);
  });
});

describe('autoFill — stragglers land in the emptiest teams', () => {
  const names = ['Team 1', 'Team 2'];

  it('fills the team with the most remaining capacity first', () => {
    const assigned = { a: 'Team 1', b: 'Team 1' };
    const result = autoFill(assigned, ['c', 'd'], names, [3, 3]);
    expect(result.c).toBe('Team 2');
    expect(result.d).toBe('Team 2');
  });

  it('balances when capacities are equal', () => {
    const result = autoFill({}, ['a', 'b', 'c', 'd'], names, [2, 2]);
    const counts = Object.values(result).reduce((m, t) => { m[t] = (m[t] || 0) + 1; return m; }, {});
    expect(counts['Team 1']).toBe(2);
    expect(counts['Team 2']).toBe(2);
  });

  it('overflows past capacity rather than leaving anyone out', () => {
    const assigned = { a: 'Team 1', b: 'Team 1', c: 'Team 2', d: 'Team 2' };
    const result = autoFill(assigned, ['e'], names, [2, 2]);
    expect(names).toContain(result.e); // placed somewhere, capacity be damned
  });

  it('does not touch already-assigned players and works without capacities', () => {
    const assigned = { a: 'Team 2' };
    const result = autoFill(assigned, ['b'], names, null);
    expect(result.a).toBeUndefined(); // only returns NEW assignments
    expect(result.b).toBe('Team 1');  // fewest members
  });
});
