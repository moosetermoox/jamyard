/**
 * Collective choices (engine/phases/choice-draft.js): the rank step's
 * average-position rule reused per group, and the draft that hands each
 * group (or student) one choice, first choices first, spread evenly.
 */

import { describe, it, expect } from 'vitest';
import {
  aggregateRankings, groupOrders, spotsPerChoice, draftChoices, buildAssignOutput
} from '../../engine/phases/choice-draft.js';

const ITEMS = ['Self and identity', 'Working with others', 'Thinking and problem solving', 'Execution and adaptation'];

// A seeded generator so the shuffles are repeatable
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('aggregateRankings', () => {
  it('orders by average position, best first, with the rank step\'s score', () => {
    const agg = aggregateRankings([['B', 'A', 'C'], ['A', 'B', 'C']], ['A', 'B', 'C']);
    expect(agg.map(r => r.item)).toEqual(['A', 'B', 'C']);
    expect(agg[0].avgRank).toBe(1.5);
    expect(agg[2].avgRank).toBe(3);
    expect(agg[2].score).toBe(1);
  });

  it('puts an item nobody placed last and breaks ties by list order', () => {
    const agg = aggregateRankings([['B']], ['A', 'B', 'C']);
    expect(agg.map(r => r.item)).toEqual(['B', 'A', 'C']);
    expect(aggregateRankings([], ['A', 'B']).map(r => r.item)).toEqual(['A', 'B']);
  });

  it('ignores items outside the candidate list and non-array rankings', () => {
    const agg = aggregateRankings([['Z', 'A'], null, ['A']], ['A', 'B']);
    expect(agg[0].item).toBe('A');
    expect(agg[0].avgRank).toBe(1.5);
  });
});

describe('groupOrders', () => {
  const groups = { g1: { label: 'Group 1' }, g2: { label: 'Group 2' }, g3: { label: 'Group 3' } };
  const playerGroup = { a: 'g1', b: 'g1', c: 'g2', d: 'g2', stranger: undefined };

  it('averages each group\'s members and keys the result by label', () => {
    const { byGroup, groupRankings } = groupOrders({
      a: ['A', 'B', 'C'], b: ['B', 'A', 'C'], c: ['C', 'B', 'A'], d: ['C', 'A', 'B'], stranger: ['B', 'C', 'A']
    }, playerGroup, groups, ['A', 'B', 'C']);
    expect(byGroup['Group 1']).toEqual(['A', 'B', 'C']);
    expect(byGroup['Group 2']).toEqual(['C', 'A', 'B']);
    expect(groupRankings['Group 2'][0].avgRank).toBe(1);
  });

  it('leaves out a group whose members ranked nothing', () => {
    const { byGroup } = groupOrders({ a: ['A', 'B'] }, playerGroup, groups, ['A', 'B']);
    expect(Object.keys(byGroup)).toEqual(['Group 1']);
  });
});

describe('spotsPerChoice', () => {
  it('spreads evenly by default and honors the teacher\'s number', () => {
    expect(spotsPerChoice(7, 4, undefined)).toBe(2);
    expect(spotsPerChoice(4, 4, null)).toBe(1);
    expect(spotsPerChoice(3, 4, undefined)).toBe(1);
    expect(spotsPerChoice(7, 4, 5)).toBe(5);
    expect(spotsPerChoice(7, 4, 0)).toBe(2);
    expect(spotsPerChoice(5, 0, undefined)).toBe(0);
  });
});

describe('draftChoices', () => {
  it('gives everyone their first choice when the firsts are all different', () => {
    const prefs = { g1: [ITEMS[0], ITEMS[1]], g2: [ITEMS[1], ITEMS[0]], g3: [ITEMS[2]], g4: [ITEMS[3]] };
    const d = draftChoices(prefs, ITEMS, { rand: seeded(1) });
    expect(d.assignments).toEqual({ g1: ITEMS[0], g2: ITEMS[1], g3: ITEMS[2], g4: ITEMS[3] });
    expect(Object.values(d.choiceRank)).toEqual([1, 1, 1, 1]);
    expect(d.spots).toBe(1);
  });

  it('a contested first choice: the spots go to some, the rest get their second', () => {
    // Five groups, four choices: two spots each. Four groups want A first.
    const prefs = {
      g1: ['A', 'B', 'C', 'D'], g2: ['A', 'C', 'B', 'D'], g3: ['A', 'D', 'B', 'C'],
      g4: ['A', 'B', 'D', 'C'], g5: ['B', 'A', 'C', 'D']
    };
    const d = draftChoices(prefs, ['A', 'B', 'C', 'D'], { rand: seeded(7) });
    expect(d.byChoice.A).toHaveLength(2);
    expect(Object.values(d.assignments)).toHaveLength(5);
    const firsts = Object.values(d.choiceRank).filter(r => r === 1).length;
    // Two A-firsts plus g5's B first
    expect(firsts).toBe(3);
    // Nobody landed on something they never ranked
    expect(Object.values(d.choiceRank).every(r => r !== null)).toBe(true);
    // The two who missed A got their SECOND choice, not a later one
    for (const [unit, choice] of Object.entries(d.assignments)) {
      if (choice !== 'A') expect(prefs[unit].indexOf(choice)).toBeLessThanOrEqual(1);
    }
    // No choice is over its two spots
    for (const list of Object.values(d.byChoice)) expect(list.length).toBeLessThanOrEqual(2);
  });

  it('serves the waiting units in a different order across runs (nobody is always first)', () => {
    const prefs = { g1: ['A', 'B'], g2: ['A', 'B'], g3: ['A', 'B'], g4: ['A', 'B'] };
    const winners = new Set();
    for (let seed = 1; seed <= 40; seed++) {
      const d = draftChoices(prefs, ['A', 'B'], { rand: seeded(seed) });
      for (const u of d.byChoice.A) winners.add(u);
    }
    expect(winners.size).toBe(4);
  });

  it('a unit with no ranking lands on the least-taken choice with no choice rank', () => {
    const prefs = { g1: ['A', 'B'], g2: ['A', 'B'], g3: [] };
    const d = draftChoices(prefs, ['A', 'B'], { rand: seeded(3) });
    expect(d.assignments.g3).toBe('B');
    expect(d.choiceRank.g3).toBeNull();
  });

  it('a unit whose every pick is full still gets a choice (over the cap when the cap cannot cover everyone)', () => {
    const prefs = { g1: ['A'], g2: ['A'], g3: ['A'] };
    const d = draftChoices(prefs, ['A', 'B'], { perChoice: 1, rand: seeded(5) });
    expect(Object.values(d.assignments).sort()).toEqual(['A', 'A', 'B']);
    // The third landed on the least-taken choice; A was on its list only once it overflowed
    const overflow = Object.entries(d.assignments).filter(([, c]) => c === 'A');
    expect(overflow).toHaveLength(2);
  });

  it('ignores picks that are not choices and copes with an empty choice list', () => {
    const d = draftChoices({ g1: ['Nope', 'A'] }, ['A'], { rand: seeded(2) });
    expect(d.assignments.g1).toBe('A');
    expect(d.choiceRank.g1).toBe(2);
    expect(draftChoices({ g1: ['A'] }, []).assignments).toEqual({});
  });
});

describe('buildAssignOutput', () => {
  it('keys the output by label, maps every member for {{X.mine}}, and writes the projector list', () => {
    const draft = draftChoices({ g1: ['A', 'B'], g2: ['B', 'A'] }, ['A', 'B'], { rand: seeded(1) });
    const units = {
      g1: { label: 'Group 1', memberIds: ['p1', 'p2'], memberNames: ['Ana', 'Ben'] },
      g2: { label: 'Group 2', memberIds: ['p3'], memberNames: ['Cy'] }
    };
    const out = buildAssignOutput(draft, units, ['A', 'B']);
    expect(out.assignments).toEqual({ 'Group 1': 'A', 'Group 2': 'B' });
    expect(out.byPlayer).toEqual({ p1: 'A', p2: 'A', p3: 'B' });
    expect(out.byChoice).toEqual({ A: ['Group 1'], B: ['Group 2'] });
    expect(out.choiceRank).toEqual({ 'Group 1': 1, 'Group 2': 1 });
    expect(out.assignedList).toBe('Group 1: A\nGroup 2: B');
    expect(out.board[0]).toEqual({ label: 'Group 1', choice: 'A', choiceRank: 1, members: ['Ana', 'Ben'], memberIds: ['p1', 'p2'] });
    expect(out.perGroup).toBe(true);
    expect(out.choices).toEqual(['A', 'B']);
  });
});
