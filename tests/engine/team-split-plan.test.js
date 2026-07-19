/**
 * Team-split plan + rosters — resolveTeamPlan (sizing, names, capacities)
 * and buildTeamRosters (the live roster payload the choice/teacher screens
 * render). The capacity option matters for classes with PRE-EXISTING teams:
 * "even" caps spots at an even split (fair free-pick), "open" removes the
 * caps so students can always join their real team, absences be damned.
 */

import { describe, it, expect } from 'vitest';
import { resolveTeamPlan, buildTeamRosters } from '../../engine/phase-handlers/team-split.js';

const fakePlayers = (names) => ({
  find: (id) => (names[id] ? { id, name: names[id] } : null)
});

describe('resolveTeamPlan — sizing, names, capacities', () => {
  it('teamCount sizing: N teams with even-split capacities', () => {
    const plan = resolveTeamPlan({ teamCount: 7 }, 28);
    expect(plan.teamCount).toBe(7);
    expect(plan.teamNames).toEqual(['Team 1', 'Team 2', 'Team 3', 'Team 4', 'Team 5', 'Team 6', 'Team 7']);
    expect(plan.capacities).toEqual([4, 4, 4, 4, 4, 4, 4]);
  });

  it('groupSize sizing: computed count, Group names, front-loaded capacities', () => {
    const plan = resolveTeamPlan({ groupSize: 2 }, 5);
    expect(plan.teamCount).toBe(2);
    expect(plan.teamNames).toEqual(['Group 1', 'Group 2']);
    expect(plan.capacities).toEqual([3, 2]);
  });

  it('custom teamNames win when the length matches, fall back when it does not', () => {
    expect(resolveTeamPlan({ teamCount: 2, teamNames: ['Red', 'Blue'] }, 6).teamNames)
      .toEqual(['Red', 'Blue']);
    expect(resolveTeamPlan({ teamCount: 3, teamNames: ['Red', 'Blue'] }, 6).teamNames)
      .toEqual(['Team 1', 'Team 2', 'Team 3']);
  });

  it('capacity "open" drops the caps entirely (pre-existing teams with absences)', () => {
    // 7 real teams of 4 but 2 kids absent — even split would cap two teams
    // at 3 and lock a present member out of their own team.
    const plan = resolveTeamPlan({ teamCount: 7, capacity: 'open' }, 26);
    expect(plan.teamCount).toBe(7);
    expect(plan.capacities).toBeNull();
  });

  it('capacity "even" (and unset) keeps the even-split caps', () => {
    expect(resolveTeamPlan({ teamCount: 2, capacity: 'even' }, 5).capacities).toEqual([3, 2]);
    expect(resolveTeamPlan({ teamCount: 2 }, 5).capacities).toEqual([3, 2]);
  });
});

describe('buildTeamRosters — live roster payload for choice/teacher screens', () => {
  const players = fakePlayers({ p1: 'Ana', p2: 'Ben', p3: 'Cy' });

  it('reports capacity and open spots per team (open never negative)', () => {
    const state = {
      teamNames: ['Red', 'Blue'],
      capacities: [2, 1],
      assignments: { p1: 'Red', p2: 'Red', p3: 'Red' } // overfilled via teacher mode
    };
    const rosters = buildTeamRosters(state, players);
    expect(rosters[0]).toMatchObject({ name: 'Red', capacity: 2, open: 0 });
    expect(rosters[0].members.map(m => m.name)).toEqual(['Ana', 'Ben', 'Cy']);
    expect(rosters[1]).toMatchObject({ name: 'Blue', capacity: 1, open: 1, members: [] });
  });

  it('null capacities → capacity and open are null (screens hide the spot counts)', () => {
    const state = {
      teamNames: ['Red', 'Blue'],
      capacities: null,
      assignments: { p1: 'Red' }
    };
    const rosters = buildTeamRosters(state, players);
    expect(rosters[0].capacity).toBeNull();
    expect(rosters[0].open).toBeNull();
    expect(rosters[1].capacity).toBeNull();
    expect(rosters[1].open).toBeNull();
  });
});
