/**
 * The knobs (2026-09-30, the mechanics inventory part two): six small
 * turns on existing blocks that unlock a dozen classroom routines.
 *   groupsByAnswer   team-split method "byAnswer" (same | mixed)
 *   pollExtremes     collect-choice .most / .least
 *   players ballot   vote candidates "players" (the engine maps the roster)
 *   runMostVotes     eliminate method "most-votes"
 *   gradeRankings    rank correctOrder (points per right slot)
 *   questionsFromResponses  solo-quiz questionsFrom (the class writes it)
 * Pure rules here; the validator's rules on each; the handler wiring is
 * read in tests/screens/knob-bricks.test.js and proved live by
 * scripts/simulate-knobs.js.
 */
import { describe, it, expect } from 'vitest';
import { groupsByAnswer } from '../../engine/phases/team-grouping.js';
import { pollExtremes } from '../../engine/phases/poll-extremes.js';
import { runMostVotes, runEliminate } from '../../engine/phases/eliminate-handler.js';
import { gradeRankings } from '../../engine/phases/rank-grading.js';
import { questionsFromResponses } from '../../engine/phases/solo-quiz-scoring.js';
import { validate } from '../../engine/game-loader.js';

const members = (n) => Array.from({ length: n }, (_, i) => ({ playerId: 'p' + (i + 1), name: 'S' + (i + 1) }));
const errorsOf = (phases, extra) => validate({ name: 'K', description: 'knobs', phases, ...(extra || {}) }, 'knobs', { returnResults: true }).errors.map(e => typeof e === 'string' ? e : e.message);
const warningsOf = (phases) => validate({ name: 'K', description: 'knobs', phases }, 'knobs', { returnResults: true }).warnings.map(w => typeof w === 'string' ? w : w.message);

describe('groupsByAnswer', () => {
  const answers = { p1: 'Yes', p2: 'No', p3: 'Yes', p4: 'Not sure', p5: 'No', p6: 'Yes' };
  it('same: one group per answer in the choice order, named by the answer', () => {
    const { teams, playerTeam } = groupsByAnswer(members(6), answers, ['Yes', 'No', 'Not sure']);
    expect(Object.keys(teams)).toEqual(['Yes', 'No', 'Not sure']);
    expect(teams.Yes.map(m => m.playerId)).toEqual(['p1', 'p3', 'p6']);
    expect(playerTeam.p5).toBe('No');
  });
  it('same with a group size splits a big answer into numbered groups', () => {
    const many = members(8);
    const all = Object.fromEntries(many.map(m => [m.playerId, 'Yes']));
    const { teams } = groupsByAnswer(many, all, ['Yes', 'No'], { groupSize: 4 });
    expect(Object.keys(teams)).toEqual(['Yes 1', 'Yes 2']);
    expect(Object.values(teams).map(t => t.length).sort()).toEqual([4, 4]);
  });
  it('mixed: one of each answer per group where the numbers allow', () => {
    const { teams } = groupsByAnswer(members(6), answers, ['Yes', 'No', 'Not sure'], { mode: 'mixed' });
    expect(Object.keys(teams).length).toBe(3);
    for (const t of Object.values(teams)) {
      const picks = t.map(m => answers[m.playerId]);
      expect(new Set(picks).size).toBe(picks.length);
    }
  });
  it('a student with no answer joins the smallest group; an answer off the list still groups', () => {
    const { teams, playerTeam } = groupsByAnswer(members(4), { p1: 'Cats', p2: 'Cats', p3: 'Dogs' }, ['Cats', 'Dogs']);
    expect(playerTeam.p4).toBe('Dogs');
    expect(teams.Dogs.length).toBe(2);
    const off = groupsByAnswer(members(2), { p1: 'Other' }, ['A']);
    expect(Object.keys(off.teams)).toEqual(['Other']);
    expect(off.playerTeam.p2).toBe('Other');
  });
  it('nobody answered: one group holds everyone', () => {
    const { teams } = groupsByAnswer(members(3), {}, ['A', 'B']);
    expect(Object.keys(teams)).toEqual(['Group 1']);
    expect(teams['Group 1'].length).toBe(3);
  });
  it('the validator wants a pick-one source and no team count, and refuses groupBy elsewhere', () => {
    const base = { lobby: { type: 'lobby', next: 'poll' }, poll: { type: 'collect-choice', prompt: 'Yes or no?', choices: ['Yes', 'No'], next: 'groups' }, groups: { type: 'team-split', method: 'byAnswer', groupBy: 'poll', next: 'talk' }, talk: { type: 'announce', message: 'Talk in your group: {{groups.teams}}', next: 'end' }, end: { type: 'end', message: 'Done' } };
    expect(errorsOf(base)).toEqual([]);
    expect(errorsOf({ ...base, groups: { ...base.groups, groupBy: 'talk' } })[0]).toMatch(/must be an earlier Multiple choice step/);
    expect(errorsOf({ ...base, groups: { type: 'team-split', method: 'byAnswer', next: 'talk' } })[0]).toMatch(/Group by the answers to/);
    expect(errorsOf({ ...base, groups: { ...base.groups, teamCount: 3 } })[0]).toMatch(/Number of teams. has no meaning/);
    expect(errorsOf({ ...base, groups: { type: 'team-split', method: 'random', teamCount: 2, groupBy: 'poll', next: 'talk' } })[0]).toMatch(/only "byAnswer" groups by answer/);
    expect(warningsOf({ ...base, groups: { ...base.groups, groupMode: 'mixed', groupSize: 3 } }).some(w => /Group size. is ignored/.test(w))).toBe(true);
  });
});

describe('pollExtremes', () => {
  it('names the most and the least picked, a tie to the first listed', () => {
    expect(pollExtremes({ Yes: 5, No: 2, 'Not sure': 2 }, ['Yes', 'No', 'Not sure'])).toEqual({ most: 'Yes', least: 'No', mostCount: 5, leastCount: 2 });
    expect(pollExtremes({ B: 3, A: 3 }, ['A', 'B']).most).toBe('A');
    expect(pollExtremes({}, ['A'])).toEqual({ most: '', least: '', mostCount: 0, leastCount: 0 });
    expect(pollExtremes({ Cats: 1, Dogs: 4 }).most).toBe('Dogs');
  });
});

describe('runMostVotes', () => {
  it('the top-voted goes out; ties at the cutoff all go; nobody voted removes nobody; everyone tied stays', () => {
    expect(runMostVotes({ scores: { a: 3, b: 1, c: 0 } })).toEqual(['a']);
    expect(runMostVotes({ scores: { a: 3, b: 3, c: 1 }, count: 1 }).sort()).toEqual(['a', 'b']);
    expect(runMostVotes({ scores: { a: 4, b: 2, c: 1 }, count: 2 }).sort()).toEqual(['a', 'b']);
    expect(runMostVotes({ scores: { a: 0, b: 0 } })).toEqual([]);
    expect(runMostVotes({ scores: { a: 2, b: 2 } })).toEqual([]);
    expect(runMostVotes({ scores: {} })).toEqual([]);
  });
  it('runEliminate takes the method and marks the player', () => {
    const gone = [];
    const players = { eliminate: (id) => gone.push(id), getRemaining: () => [1, 2] };
    const out = runEliminate({ method: 'most-votes', input: { scores: { a: 2, b: 1 }, count: 1 }, hooks: {}, players });
    expect(out.eliminated).toEqual(['a']);
    expect(gone).toEqual(['a']);
  });
  it('the validator wants a score source for most-votes', () => {
    const phases = { lobby: { type: 'lobby', next: 'pick' }, pick: { type: 'vote', mode: 'pick-one', candidates: 'players', excludeAuthors: true, question: 'Who was the spy?', next: 'out' }, out: { type: 'eliminate', method: 'most-votes', count: 1, input: 'pick.scores', next: 'end' }, end: { type: 'end', message: 'Done' } };
    expect(errorsOf(phases)).toEqual([]);
    expect(errorsOf({ ...phases, out: { type: 'eliminate', method: 'most-votes', next: 'end' } })[0]).toMatch(/input. must point at a vote/);
  });
});

describe('gradeRankings', () => {
  const right = ['1776', '1789', '1812', '1848'];
  it('points per item in its right slot, the class slots counted, the right order listed', () => {
    const out = gradeRankings({ p1: ['1776', '1789', '1812', '1848'], p2: ['1789', '1776', '1812', '1848'], p3: ['1848', '1812', '1789', '1776'] }, right, ['1776', '1789', '1848', '1812'], 10);
    expect(out.scores).toEqual({ p1: 40, p2: 20, p3: 0 });
    expect(out.placedRight).toBe(2);
    expect(out.itemCount).toBe(4);
    expect(out.correctList).toBe('1. 1776\n2. 1789\n3. 1812\n4. 1848');
    expect(out.rightByPlayer.p2).toBe(2);
  });
  it('defaults to ten points and ignores case and spaces', () => {
    const out = gradeRankings({ p1: [' a ', 'B'] }, ['A', 'b']);
    expect(out.scores.p1).toBe(20);
  });
  it('the validator checks the right order against a fixed list', () => {
    const phases = { lobby: { type: 'lobby', next: 'order' }, order: { type: 'rank', prompt: 'Put the dates in order', candidates: ['1812', '1776', '1789'], correctOrder: ['1776', '1789', '1812'], next: 'show' }, show: { type: 'reveal', template: '{{order.rankedList}}\n{{order.correctList}}', next: 'end' }, end: { type: 'end', message: 'Done' } };
    expect(errorsOf(phases)).toEqual([]);
    expect(errorsOf({ ...phases, order: { ...phases.order, correctOrder: ['1776', '1789'] } })[0]).toMatch(/exactly the items to rank/);
    expect(errorsOf({ ...phases, order: { ...phases.order, correctOrder: ['1776'] } })[0]).toMatch(/fewer than two items/);
  });
});

describe('questionsFromResponses', () => {
  it('every complete answer becomes a question; blanks and a wrong equal to the right one are skipped', () => {
    const out = questionsFromResponses([
      { playerId: 'p1', fields: { question: 'Capital of France?', correct: 'Paris', wrong1: 'Rome', wrong2: 'Berlin' } },
      { playerId: 'p2', fields: { question: 'Two plus two?', correct: '4', wrong1: '4', wrong2: '' } },
      { playerId: 'p3', fields: { question: '', correct: 'x', wrong1: 'y' } },
      { playerId: 'p4', text: 'no fields' },
      { playerId: 'p5', fields: { question: 'Biggest planet?', correct: 'Jupiter', wrong1: 'Mars', wrong2: 'mars' } }
    ]);
    expect(out.map(q => q.question)).toEqual(['Capital of France?', 'Biggest planet?']);
    expect(out[0].choices).toEqual(['Paris', 'Rome', 'Berlin']);
    expect(out[1].choices).toEqual(['Jupiter', 'Mars']);
  });
  it('the validator wants a keyed source or a question list', () => {
    const phases = { lobby: { type: 'lobby', next: 'write' }, write: { type: 'collect', prompt: 'Write a question', fields: [{ label: 'Q', key: 'question' }, { label: 'Right', key: 'correct' }, { label: 'Wrong', key: 'wrong1' }], next: 'quiz' }, quiz: { type: 'solo-quiz', title: 'Ours', questionsFrom: 'write', next: 'end' }, end: { type: 'end', message: 'Done' } };
    expect(errorsOf(phases)).toEqual([]);
    expect(errorsOf({ ...phases, write: { ...phases.write, fields: [{ label: 'Q', key: 'question' }, { label: 'Right', key: 'correct' }] } })[0]).toMatch(/at least one wrong answer/);
    expect(errorsOf({ ...phases, quiz: { type: 'solo-quiz', questionsFrom: 'end', next: 'end' } })[0]).toMatch(/must be an earlier Open answer step/);
    expect(errorsOf({ ...phases, quiz: { type: 'solo-quiz', title: 'x', next: 'end' } })[0]).toMatch(/needs at least one question/);
  });
});
