/**
 * Checklist state — pure rules for the shared group to-do list: item
 * normalization, group building (teams vs solo), check/un-check with
 * membership + teacher override, live progress, and final results.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeChecklistItems,
  normalizeChecklistItemsWithRoles,
  buildChecklistGroups,
  applyCheck,
  groupProgress,
  checklistResults
} from '../../engine/phases/checklist-state.js';

const ITEMS = ['Read the intro', 'Do the worksheet', 'Clean up'];
const TEAM_DATA = {
  teams: {
    'Team 1': [{ playerId: 'a', name: 'Ana' }, { playerId: 'b', name: 'Ben' }],
    'Team 2': [{ playerId: 'c', name: 'Cy' }]
  },
  playerTeam: { a: 'Team 1', b: 'Team 1', c: 'Team 2' }
};

function freshState(teamData = TEAM_DATA, players = null) {
  return {
    items: ITEMS,
    closed: false,
    ...buildChecklistGroups(ITEMS, teamData, players)
  };
}

describe('normalizeChecklistItems', () => {
  it('trims and drops blanks from arrays', () => {
    expect(normalizeChecklistItems(['  a  ', '', 'b'])).toEqual(['a', 'b']);
  });

  it('splits strings on newlines, preserving commas inside items', () => {
    expect(normalizeChecklistItems('Read pages 3, 4\nClean up'))
      .toEqual(['Read pages 3, 4', 'Clean up']);
  });

  it('falls back to comma-splitting a single-line string (AI generator format)', () => {
    expect(normalizeChecklistItems('a, b, c')).toEqual(['a', 'b', 'c']);
  });

  it('returns [] for junk', () => {
    expect(normalizeChecklistItems(null)).toEqual([]);
    expect(normalizeChecklistItems(42)).toEqual([]);
  });

  it('accepts {text, role} object items, keeping just the text', () => {
    expect(normalizeChecklistItems(['a', { text: 'take notes', role: 'Recorder' }]))
      .toEqual(['a', 'take notes']);
  });
});

describe('normalizeChecklistItemsWithRoles', () => {
  it('returns parallel texts and roles, null for untagged items', () => {
    const { texts, roles } = normalizeChecklistItemsWithRoles([
      'Read the intro',
      { text: 'Take notes', role: 'Recorder' },
      { text: 'Watch the clock', role: 'Timekeeper' }
    ]);
    expect(texts).toEqual(['Read the intro', 'Take notes', 'Watch the clock']);
    expect(roles).toEqual([null, 'Recorder', 'Timekeeper']);
  });

  it('keeps alignment when blanks are dropped', () => {
    const { texts, roles } = normalizeChecklistItemsWithRoles([
      '', { text: '  Take notes  ', role: ' Recorder ' }, '  ', 'Clean up'
    ]);
    expect(texts).toEqual(['Take notes', 'Clean up']);
    expect(roles).toEqual(['Recorder', null]);
  });

  it('string input (newline list) yields all-null roles', () => {
    const { texts, roles } = normalizeChecklistItemsWithRoles('a\nb');
    expect(texts).toEqual(['a', 'b']);
    expect(roles).toEqual([null, null]);
  });
});

describe('buildChecklistGroups', () => {
  it('one checklist per team, members mapped to their group', () => {
    const { groups, playerGroup } = buildChecklistGroups(ITEMS, TEAM_DATA, null);
    expect(Object.keys(groups)).toEqual(['Team 1', 'Team 2']);
    expect(groups['Team 1'].memberIds).toEqual(['a', 'b']);
    expect(groups['Team 1'].checked).toEqual([null, null, null]);
    expect(playerGroup.b).toBe('Team 1');
    expect(playerGroup.c).toBe('Team 2');
  });

  it('solo mode: one checklist per player, labeled by name', () => {
    const players = [{ id: 'x', name: 'Xu' }, { id: 'y', name: 'Ye' }];
    const { groups, playerGroup } = buildChecklistGroups(ITEMS, null, players);
    expect(Object.keys(groups)).toEqual(['x', 'y']);
    expect(groups.x.label).toBe('Xu');
    expect(groups.x.memberIds).toEqual(['x']);
    expect(playerGroup.y).toBe('y');
  });
});

describe('applyCheck', () => {
  it('a member checks an item with attribution', () => {
    const state = freshState();
    const res = applyCheck(state, { playerId: 'a', playerName: 'Ana', index: 1, checked: true });
    expect(res).toEqual({ ok: true, groupKey: 'Team 1' });
    expect(state.groups['Team 1'].checked[1]).toEqual({ playerId: 'a', name: 'Ana' });
  });

  it('any member may un-check (shared-draft trust model)', () => {
    const state = freshState();
    applyCheck(state, { playerId: 'a', playerName: 'Ana', index: 0, checked: true });
    const res = applyCheck(state, { playerId: 'b', playerName: 'Ben', index: 0, checked: false });
    expect(res.ok).toBe(true);
    expect(state.groups['Team 1'].checked[0]).toBeNull();
  });

  it('never touches another group\'s list', () => {
    const state = freshState();
    applyCheck(state, { playerId: 'c', playerName: 'Cy', index: 0, checked: true });
    expect(state.groups['Team 1'].checked[0]).toBeNull();
    expect(state.groups['Team 2'].checked[0]).toEqual({ playerId: 'c', name: 'Cy' });
  });

  it('rejects non-members, bad indexes, and closed state', () => {
    const state = freshState();
    expect(applyCheck(state, { playerId: 'ghost', playerName: '?', index: 0, checked: true }).ok).toBe(false);
    expect(applyCheck(state, { playerId: 'a', playerName: 'Ana', index: 9, checked: true }).ok).toBe(false);
    expect(applyCheck(state, { playerId: 'a', playerName: 'Ana', index: -1, checked: true }).ok).toBe(false);
    state.closed = true;
    expect(applyCheck(state, { playerId: 'a', playerName: 'Ana', index: 0, checked: true }).ok).toBe(false);
  });

  it('teacher override may target any group by key', () => {
    const state = freshState();
    const res = applyCheck(state, {
      playerId: 'T', playerName: 'Teacher', index: 2, checked: true,
      asTeacher: true, groupKey: 'Team 2'
    });
    expect(res).toEqual({ ok: true, groupKey: 'Team 2' });
    expect(state.groups['Team 2'].checked[2]).toEqual({ playerId: 'T', name: 'Teacher' });
    // teacher targeting a nonexistent group is rejected, not crashed
    expect(applyCheck(state, {
      playerId: 'T', playerName: 'Teacher', index: 0, checked: true,
      asTeacher: true, groupKey: 'Team 9'
    }).ok).toBe(false);
  });
});

describe('groupProgress + checklistResults', () => {
  it('counts done items and flags complete groups', () => {
    const state = freshState();
    applyCheck(state, { playerId: 'c', playerName: 'Cy', index: 0, checked: true });
    applyCheck(state, { playerId: 'c', playerName: 'Cy', index: 1, checked: true });
    applyCheck(state, { playerId: 'c', playerName: 'Cy', index: 2, checked: true });
    applyCheck(state, { playerId: 'a', playerName: 'Ana', index: 0, checked: true });

    const progress = groupProgress(state);
    expect(progress).toEqual([
      { key: 'Team 1', label: 'Team 1', done: 1, total: 3, complete: false },
      { key: 'Team 2', label: 'Team 2', done: 3, total: 3, complete: true }
    ]);

    const out = checklistResults(state);
    expect(out.doneCount).toBe(1);
    expect(out.groupCount).toBe(2);
    expect(out.itemCount).toBe(3);
    expect(out.results[1]).toEqual({ team: 'Team 2', checked: 3, total: 3, done: true });
    expect(out.resultsList).toBe('Team 1: 1/3\nTeam 2: 3/3 ✓');
  });
});
