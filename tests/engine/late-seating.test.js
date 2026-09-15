/**
 * Late seating (2026-09-14, owner: "can the system add people as they
 * enter? If you pick a team you're then added to a team. If you pick a
 * role your role then shows up"): a student who joins after a team step
 * has opened gets a seat wherever the class is, instead of the waiting
 * screen for the rest of the period. These guard the pure rules in
 * engine/phases/late-seating.js; scripts/simulate-late-seating.js proves
 * the wiring against a live server.
 */

import { describe, it, expect } from 'vitest';
import {
  smallestTeam, seatInTeamData, openTeamSpot, leastHeldRole,
  seatInRoleState, seatInRoleOutput, boardFromTeams, seatInChecklistState
} from '../../engine/phases/late-seating.js';

const m = (id, name) => ({ playerId: id, name });

describe('smallestTeam / seatInTeamData: teams already set', () => {
  it('picks the team with the fewest members, the first on a tie', () => {
    expect(smallestTeam({ A: [1, 2], B: [1], C: [1] })).toBe('B');
    expect(smallestTeam({ A: [1], B: [1] })).toBe('A');
    expect(smallestTeam({})).toBe(null);
    expect(smallestTeam(null)).toBe(null);
  });

  it('adds the newcomer to the smallest team and to playerTeam', () => {
    const data = { teams: { 'Group 1': [m('a', 'Ana'), m('b', 'Ben'), m('c', 'Cy')], 'Group 2': [m('d', 'Di'), m('e', 'Ed')] }, playerTeam: { a: 'Group 1', b: 'Group 1', c: 'Group 1', d: 'Group 2', e: 'Group 2' } };
    expect(seatInTeamData(data, 'z', 'Zoe')).toBe('Group 2');
    expect(data.teams['Group 2']).toEqual([m('d', 'Di'), m('e', 'Ed'), m('z', 'Zoe')]);
    expect(data.playerTeam.z).toBe('Group 2');
  });

  it('is idempotent for a player already seated, and null without teams', () => {
    const data = { teams: { A: [m('a', 'Ana')] }, playerTeam: { a: 'A' } };
    expect(seatInTeamData(data, 'a', 'Ana')).toBe('A');
    expect(data.teams.A).toHaveLength(1);
    expect(seatInTeamData(null, 'z', 'Zoe')).toBe(null);
    expect(seatInTeamData({ pairs: [] }, 'z', 'Zoe')).toBe(null);
  });
});

describe('openTeamSpot: a split still choosing or being arranged', () => {
  const mk = () => ({
    kind: 'team-split', mode: 'choice', teamNames: ['Red', 'Blue'], capacities: [2, 2],
    assignments: { a: 'Red', b: 'Red', c: 'Blue' }, eligibleIds: new Set(['a', 'b', 'c', 'd']), closed: false
  });

  it('makes the newcomer eligible and grows the emptiest team by one spot (caps keep covering everyone)', () => {
    const state = mk();
    expect(openTeamSpot(state, 'z')).toBe('Blue');
    expect(state.eligibleIds.has('z')).toBe(true);
    expect(state.capacities).toEqual([2, 3]);
    expect(state.capacities[0] + state.capacities[1]).toBe(state.eligibleIds.size);
  });

  it('leaves open-capacity splits alone and never double-adds', () => {
    const state = mk();
    state.capacities = null;
    expect(openTeamSpot(state, 'z')).toBe(null);
    expect(state.eligibleIds.has('z')).toBe(true);
    expect(openTeamSpot(state, 'z')).toBe(null);
    expect(state.eligibleIds.size).toBe(5);
  });
});

describe('leastHeldRole / seatInRoleState: the roles step', () => {
  it('finds the role with the fewest holders among the given members, first on a tie', () => {
    const roleOf = pid => ({ a: 'Facilitator', b: 'Recorder', c: 'Facilitator' })[pid];
    expect(leastHeldRole(['Facilitator', 'Recorder', 'Timekeeper'], ['a', 'b', 'c'], roleOf)).toBe('Timekeeper');
    expect(leastHeldRole(['Facilitator', 'Recorder'], ['a', 'b', 'c'], roleOf)).toBe('Recorder');
    expect(leastHeldRole(['Facilitator', 'Recorder'], [], roleOf)).toBe('Facilitator');
    expect(leastHeldRole([], ['a'], roleOf)).toBe(null);
  });

  it('open choice: the newcomer joins the group and still gets to pick', () => {
    const state = { kind: 'team-roles', roles: ['Facilitator', 'Recorder'], groups: { 'Group 1': { label: 'Group 1', memberIds: ['a', 'b'] } }, playerGroup: { a: 'Group 1', b: 'Group 1' }, picks: { a: 'Facilitator' }, closed: false };
    expect(seatInRoleState(state, 'z', 'Group 1', 'Group 1')).toBe(null);
    expect(state.groups['Group 1'].memberIds).toEqual(['a', 'b', 'z']);
    expect(state.playerGroup.z).toBe('Group 1');
    expect(state.picks.z).toBeUndefined();
  });

  it('closed: the newcomer gets the least-held role at once; a missing group is created', () => {
    const state = { kind: 'team-roles', roles: ['Facilitator', 'Recorder'], groups: { 'Group 1': { label: 'Group 1', memberIds: ['a', 'b'] } }, playerGroup: { a: 'Group 1', b: 'Group 1' }, picks: { a: 'Facilitator', b: 'Facilitator' }, closed: true };
    expect(seatInRoleState(state, 'z', 'Group 1', 'Group 1')).toBe('Recorder');
    expect(state.picks.z).toBe('Recorder');
    expect(seatInRoleState(state, 'y', 'The class', 'The class')).toBe('Facilitator');
    expect(state.groups['The class'].memberIds).toEqual(['y']);
  });
});

describe('seatInRoleOutput: roles already dealt (the stored output later steps read)', () => {
  const mk = () => ({
    roles: ['Facilitator', 'Recorder', 'Timekeeper'],
    playerRole: { a: 'Facilitator', b: 'Recorder', c: 'Timekeeper', d: 'Facilitator' },
    byPlayer: { a: 'Facilitator', b: 'Recorder', c: 'Timekeeper', d: 'Facilitator' },
    roleMembers: { Facilitator: [m('a', 'Ana'), m('d', 'Di')], Recorder: [m('b', 'Ben')], Timekeeper: [m('c', 'Cy')] },
    rolesList: 'Group 1: Ana (Facilitator), Ben (Recorder), Cy (Timekeeper)\nGroup 2: Di (Facilitator)'
  });

  it('gives the least-held role among the group-mates and joins the group\'s line', () => {
    const out = mk();
    expect(seatInRoleOutput(out, 'z', 'Zoe', 'Group 2', ['d', 'z'])).toBe('Recorder');
    expect(out.playerRole.z).toBe('Recorder');
    expect(out.byPlayer.z).toBe('Recorder');
    expect(out.roleMembers.Recorder).toEqual([m('b', 'Ben'), { playerId: 'z', name: 'Zoe', group: 'Group 2' }]);
    expect(out.rolesList).toBe('Group 1: Ana (Facilitator), Ben (Recorder), Cy (Timekeeper)\nGroup 2: Di (Facilitator), Zoe (Recorder)');
  });

  it('adds a line for a group not on the list yet, keeps a seat already given, and refuses without roles', () => {
    const out = mk();
    expect(seatInRoleOutput(out, 'z', 'Zoe', 'Group 3', ['z'])).toBe('Facilitator');
    expect(out.rolesList.split('\n')[2]).toBe('Group 3: Zoe (Facilitator)');
    expect(seatInRoleOutput(out, 'a', 'Ana', 'Group 1', ['a'])).toBe('Facilitator');
    expect(out.roleMembers.Facilitator).toHaveLength(3);
    expect(seatInRoleOutput({ roles: [] }, 'z', 'Zoe', 'G', ['z'])).toBe(null);
  });

  it('boardFromTeams rebuilds the projector lineup from the split plus the roles', () => {
    const board = boardFromTeams({ teams: { 'Group 1': [m('a', 'Ana'), m('z', 'Zoe')] } }, { a: 'Facilitator', z: 'Recorder' });
    expect(board).toEqual({ groups: [{ label: 'Group 1', picks: [{ name: 'Ana', role: 'Facilitator' }, { name: 'Zoe', role: 'Recorder' }] }], placed: 2, total: 2 });
  });
});

describe('seatInChecklistState: mid-checklist', () => {
  it('joins the team\'s list without touching what is checked', () => {
    const state = { kind: 'checklist', items: ['x', 'y'], solo: false, groups: { 'Group 1': { label: 'Group 1', memberIds: ['a'], checked: [{ playerId: 'a', name: 'Ana' }, null] } }, playerGroup: { a: 'Group 1' } };
    expect(seatInChecklistState(state, 'z', 'Zoe', 'Group 1')).toBe('Group 1');
    expect(state.groups['Group 1'].memberIds).toEqual(['a', 'z']);
    expect(state.groups['Group 1'].checked[0]).toEqual({ playerId: 'a', name: 'Ana' });
    expect(state.playerGroup.z).toBe('Group 1');
  });

  it('solo lists: a fresh blank list under the newcomer\'s name', () => {
    const state = { kind: 'checklist', items: ['x', 'y', 'z'], solo: true, groups: {}, playerGroup: {} };
    expect(seatInChecklistState(state, 'z', 'Zoe', null)).toBe('z');
    expect(state.groups.z).toEqual({ label: 'Zoe', memberIds: ['z'], checked: [null, null, null] });
  });

  it('no team to join (pair-born groups) = no seat', () => {
    const state = { kind: 'checklist', items: ['x'], solo: false, groups: {}, playerGroup: {} };
    expect(seatInChecklistState(state, 'z', 'Zoe', null)).toBe(null);
  });
});
