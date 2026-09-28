/**
 * Jigsaw regroup (2026-09-27, a reviewer's fifteen classroom routines):
 * a team-split with method "jigsaw" and regroupFrom = an earlier split
 * makes home groups with one member from each expert group.
 */
import { describe, it, expect } from 'vitest';
import { jigsawGroups } from '../../engine/phases/team-grouping.js';
import { validate } from '../../engine/game-loader.js';

function member(id) { return { playerId: id, name: 'Student ' + id }; }
function teamsOf(sizes) {
  const teams = {};
  let n = 0;
  sizes.forEach((size, t) => {
    teams['Group ' + (t + 1)] = Array.from({ length: size }, () => member('p' + (++n)));
  });
  return teams;
}
function oldTeamOf(oldTeams, playerId) {
  return Object.keys(oldTeams).find(name => oldTeams[name].some(m => m.playerId === playerId));
}

describe('jigsawGroups', () => {
  it('puts one member of every old team into each new group (12 students, 3 by 4)', () => {
    const old = teamsOf([4, 4, 4]);
    const { teams, playerTeam } = jigsawGroups(old);
    expect(Object.keys(teams).length).toBe(4);
    for (const members of Object.values(teams)) {
      expect(members.length).toBe(3);
      const origins = members.map(m => oldTeamOf(old, m.playerId));
      expect(new Set(origins).size).toBe(3);
    }
    expect(Object.keys(playerTeam).length).toBe(12);
  });

  it('keeps sizes even and never doubles an old team inside a new group on an uneven class (11 students)', () => {
    const old = teamsOf([4, 4, 3]);
    const { teams } = jigsawGroups(old);
    const sizes = Object.values(teams).map(t => t.length).sort();
    expect(sizes).toEqual([2, 3, 3, 3]);
    for (const members of Object.values(teams)) {
      const origins = members.map(m => oldTeamOf(old, m.playerId));
      expect(new Set(origins).size).toBe(origins.length);
    }
  });

  it('names the new groups Group 1..N and seats everyone once', () => {
    const old = teamsOf([2, 2]);
    const { teams, playerTeam } = jigsawGroups(old);
    expect(Object.keys(teams)).toEqual(['Group 1', 'Group 2']);
    expect(Object.values(playerTeam).sort()).toEqual(['Group 1', 'Group 1', 'Group 2', 'Group 2']);
  });

  it('uses the shuffle it is given inside each old team', () => {
    const old = teamsOf([3, 3]);
    const reversed = a => a.slice().reverse();
    const a = jigsawGroups(old);
    const b = jigsawGroups(old, reversed);
    expect(a.playerTeam.p1).not.toBe(b.playerTeam.p1);
  });
});

describe('validator: method jigsaw', () => {
  function config(split) {
    return {
      name: 'Jigsaw', description: 'test',
      phases: {
        lobby: { type: 'lobby', next: 'experts' },
        experts: { type: 'team-split', method: 'random', teamCount: 3, next: 'home' },
        home: split,
        end: { type: 'end', message: 'Bye' }
      }
    };
  }
  it('accepts a jigsaw split that regroups from an earlier split, with no sizing of its own', () => {
    const r = validate(config({ type: 'team-split', method: 'jigsaw', regroupFrom: 'experts', next: 'end' }), 'jigsaw-test', { returnResults: true });
    expect(r.errors).toEqual([]);
  });
  it('refuses a jigsaw split with nothing to regroup from, or from a step that is not a split', () => {
    const none = validate(config({ type: 'team-split', method: 'jigsaw', next: 'end' }), 'jigsaw-test', { returnResults: true });
    expect(none.errors.map(e => e.message || e).join(' ')).toMatch(/Regroup from/);
    const wrong = validate(config({ type: 'team-split', method: 'jigsaw', regroupFrom: 'lobby', next: 'end' }), 'jigsaw-test', { returnResults: true });
    expect(wrong.errors.map(e => e.message || e).join(' ')).toMatch(/Split into Teams/);
  });
  it('refuses regroupFrom on a split that is not a jigsaw', () => {
    const r = validate(config({ type: 'team-split', method: 'random', teamCount: 2, regroupFrom: 'experts', next: 'end' }), 'jigsaw-test', { returnResults: true });
    expect(r.errors.map(e => e.message || e).join(' ')).toMatch(/jigsaw/);
  });
});
