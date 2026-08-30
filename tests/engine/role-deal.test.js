/**
 * Tests for the team-roles pure logic: dealing roles inside existing
 * groups (random mode), capacity-checked student claims (choice mode),
 * auto-fill for stragglers, and the stored output shape.
 */

import { describe, it, expect } from 'vitest';
import {
  roleCapacity, dealRoles, claimRole, autoFillRoles, buildRoleOutput
} from '../../engine/phases/role-deal.js';

const ROLES = ['Facilitator', 'Recorder', 'Timekeeper'];

function groups3x2() {
  return {
    'Group 1': { label: 'Group 1', memberIds: ['a', 'b', 'c'] },
    'Group 2': { label: 'Group 2', memberIds: ['d', 'e'] }
  };
}

function mkState(groups, roles) {
  const playerGroup = {};
  for (const [key, g] of Object.entries(groups)) {
    for (const id of g.memberIds) playerGroup[id] = key;
  }
  return { roles, groups, playerGroup, picks: {}, closed: false };
}

describe('roleCapacity', () => {
  it('is ceil(members / roles): every member gets a role, repeats minimal', () => {
    expect(roleCapacity(3, 3)).toBe(1);
    expect(roleCapacity(4, 3)).toBe(2);
    expect(roleCapacity(2, 3)).toBe(1);
    expect(roleCapacity(6, 3)).toBe(2);
  });
});

describe('dealRoles (random mode)', () => {
  it('gives every member exactly one role', () => {
    const deal = dealRoles(groups3x2(), ROLES);
    expect(Object.keys(deal).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    for (const role of Object.values(deal)) expect(ROLES).toContain(role);
  });

  it('spreads roles evenly inside each group (counts differ by at most 1)', () => {
    for (let trial = 0; trial < 20; trial++) {
      const deal = dealRoles({
        Big: { label: 'Big', memberIds: ['p1', 'p2', 'p3', 'p4', 'p5'] }
      }, ROLES);
      const counts = {};
      for (const r of Object.values(deal)) counts[r] = (counts[r] || 0) + 1;
      const values = ROLES.map(r => counts[r] || 0);
      expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
    }
  });

  it('a group smaller than the role list fills roles first-come, none doubled', () => {
    const deal = dealRoles({ Duo: { label: 'Duo', memberIds: ['x', 'y'] } }, ROLES);
    expect(deal.x).not.toBe(deal.y);
  });

  it('is deterministic under an injected rand', () => {
    const fixed = () => 0.42;
    expect(dealRoles(groups3x2(), ROLES, fixed)).toEqual(dealRoles(groups3x2(), ROLES, fixed));
  });
});

describe('claimRole (choice mode)', () => {
  it('assigns a valid claim', () => {
    const state = mkState(groups3x2(), ROLES);
    const res = claimRole(state, 'a', 'Recorder');
    expect(res.ok).toBe(true);
    expect(state.picks.a).toBe('Recorder');
  });

  it('rejects an unknown role and an unknown player', () => {
    const state = mkState(groups3x2(), ROLES);
    expect(claimRole(state, 'a', 'DJ').ok).toBe(false);
    expect(claimRole(state, 'ghost', 'Recorder').ok).toBe(false);
  });

  it('enforces per-group capacity: second Recorder in a 3-person group is turned away', () => {
    const state = mkState(groups3x2(), ROLES);
    claimRole(state, 'a', 'Recorder');
    const res = claimRole(state, 'b', 'Recorder');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('full');
  });

  it('capacity is per group: both groups can have a Recorder', () => {
    const state = mkState(groups3x2(), ROLES);
    expect(claimRole(state, 'a', 'Recorder').ok).toBe(true);
    expect(claimRole(state, 'd', 'Recorder').ok).toBe(true);
  });

  it('a re-pick moves the player and frees their old role', () => {
    const state = mkState(groups3x2(), ROLES);
    claimRole(state, 'a', 'Recorder');
    expect(claimRole(state, 'a', 'Timekeeper').ok).toBe(true);
    expect(state.picks.a).toBe('Timekeeper');
    expect(claimRole(state, 'b', 'Recorder').ok).toBe(true);
  });

  it('a big group opens repeat slots (capacity 2 for 5 members, 3 roles)', () => {
    const state = mkState({ Big: { label: 'Big', memberIds: ['1', '2', '3', '4', '5'] } }, ROLES);
    expect(claimRole(state, '1', 'Recorder').ok).toBe(true);
    expect(claimRole(state, '2', 'Recorder').ok).toBe(true);
    expect(claimRole(state, '3', 'Recorder').ok).toBe(false);
  });

  it('rejects after close', () => {
    const state = mkState(groups3x2(), ROLES);
    state.closed = true;
    expect(claimRole(state, 'a', 'Recorder').ok).toBe(false);
  });
});

describe('autoFillRoles', () => {
  it('gives every unpicked member the least-taken role in their group', () => {
    const state = mkState(groups3x2(), ROLES);
    claimRole(state, 'a', 'Recorder');
    autoFillRoles(state);
    expect(Object.keys(state.picks).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    // Group 1: a=Recorder, so b and c get the two untaken roles
    const g1 = [state.picks.b, state.picks.c].sort();
    expect(g1).toEqual(['Facilitator', 'Timekeeper']);
  });

  it('keeps the spread even in big groups', () => {
    const state = mkState({ Big: { label: 'Big', memberIds: ['1', '2', '3', '4', '5', '6'] } }, ROLES);
    autoFillRoles(state);
    const counts = {};
    for (const r of Object.values(state.picks)) counts[r] = (counts[r] || 0) + 1;
    expect(ROLES.map(r => counts[r] || 0)).toEqual([2, 2, 2]);
  });
});

describe('buildRoleOutput', () => {
  it('produces playerRole, byPlayer, roleMembers, and a readable rolesList', () => {
    const state = mkState(groups3x2(), ROLES);
    autoFillRoles(state);
    const names = { a: 'Ana', b: 'Ben', c: 'Cy', d: 'Dot', e: 'Eli' };
    const out = buildRoleOutput(state, id => names[id]);
    expect(out.playerRole).toEqual(state.picks);
    expect(out.byPlayer).toEqual(state.picks);
    for (const role of ROLES) {
      expect(Array.isArray(out.roleMembers[role])).toBe(true);
    }
    expect(out.rolesList).toContain('Group 1:');
    expect(out.rolesList).toContain('Ana');
  });
});
