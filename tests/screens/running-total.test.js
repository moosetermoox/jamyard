/**
 * The lesson's running total (2026-10-05): every scoreboard the storyboard
 * compiler appends reads every per-student score source so far, so a
 * board after the quiz still carries the matching and the fill-in before
 * it. A reviewer's four lessons (2026-10-04) each had a board per scored
 * step that showed only that step: players at 100 points fell to 0 on the
 * next board, and the estimate's winner was tied at 0 on the final one.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

let S;
beforeAll(async () => {
  globalThis.window = globalThis;
  await import('../../screens/shared/step-suggestions.js');
  S = globalThis.StepSuggestions;
});

function compile(steps) {
  const out = S.compileStoryboard({ name: 'Lesson', description: 'd', steps });
  expect(out.config, (out.problems || []).join(' | ')).toBeTruthy();
  return out.config;
}
function ordered(config) { return S.orderedPhaseIds(config.phases).map((id) => [id, config.phases[id]]); }
function boards(config) { return ordered(config).filter(([, p]) => p.type === 'leaderboard'); }
function idOf(config, type, nth = 0) { return ordered(config).filter(([, p]) => p.type === type)[nth][0]; }

const QUIZ = { brick: 'quiz', questions: [
  { text: 'Unit rate of 3 for $6?', choices: ['$1', '$2', '$3'], correct: '$2' },
  { text: 'Unit rate of 5 for $10?', choices: ['$1', '$2', '$5'], correct: '$2' }
] };

describe('the lesson running total', () => {
  it('a ranking, a fill-in, then a quiz: every board reads every scored step so far', () => {
    const config = compile([
      { brick: 'rank', text: 'Order them', items: ['one', 'two', 'three'], correct: true },
      { brick: 'collect', text: 'Say "I ate" in Spanish', answer: 'comí', accepted: ['comi'] },
      QUIZ,
      { brick: 'end' }
    ]);
    const rank = idOf(config, 'rank');
    const fill = idOf(config, 'collect');
    const q1 = idOf(config, 'collect-choice', 0);
    const q2 = idOf(config, 'collect-choice', 1);
    const bs = boards(config);
    expect(bs.length).toBe(3);
    expect(bs[0][1].from).toBe(rank + '.scores');
    expect(bs[1][1].from).toEqual([rank + '.scores', fill + '.scores']);
    expect(bs[2][1].from).toEqual([rank + '.scores', fill + '.scores', q1 + '.scores', q2 + '.scores']);
  });

  it('an estimate with an answer, then a quiz: the final board carries the guess', () => {
    const config = compile([
      { brick: 'estimate', text: 'How many seats on the bus?', answer: 240, unit: 'seats', scoring: 'distance' },
      QUIZ,
      { brick: 'end' }
    ]);
    const guess = idOf(config, 'estimate');
    const bs = boards(config);
    expect(bs.length).toBe(2);
    expect(bs[0][1].from).toBe(guess + '.scores');
    expect(bs[1][1].from[0]).toBe(guess + '.scores');
    expect(bs[1][1].from.length).toBe(3);
  });

  it('match, then sort, then a buzzer round: the matching and sorting points ride onto the buzzer board', () => {
    const config = compile([
      { brick: 'match', text: 'Pair them', pairs: [{ left: 'ir', right: 'to go' }, { left: 'ser', right: 'to be' }] },
      { brick: 'sort', text: 'Sort them', buckets: ['past', 'present'], items: [{ text: 'fui', bucket: 'past' }, { text: 'voy', bucket: 'present' }] },
      { brick: 'announce', text: 'Now the buzzer.' },
      { brick: 'buzz', text: 'Buzz!' },
      { brick: 'end' }
    ]);
    const match = idOf(config, 'match');
    const sort = idOf(config, 'sort');
    const buzz = idOf(config, 'buzz');
    const bs = boards(config);
    expect(bs.length).toBe(2);
    expect(bs[0][1].from).toEqual([match + '.scores', sort + '.scores']);
    expect(bs[1][1].from).toEqual([match + '.scores', sort + '.scores', buzz + '.scores']);
  });

  it('standings: false drops that board, the points still count on the next one', () => {
    const config = compile([
      { brick: 'collect', text: 'Say "I ate"', answer: 'comí', standings: false },
      { brick: 'collect', text: 'Say "I went"', answer: 'fui' },
      { brick: 'end' }
    ]);
    const first = idOf(config, 'collect', 0);
    const second = idOf(config, 'collect', 1);
    const bs = boards(config);
    expect(bs.length).toBe(1);
    expect(bs[0][1].from).toEqual([first + '.scores', second + '.scores']);
  });

  it('a no-winners quiz never ranks anyone: its points stay out of a later board', () => {
    const config = compile([
      { ...QUIZ, leaderboard: false },
      { brick: 'collect', text: 'Say "I ate"', answer: 'comí' },
      { brick: 'end' }
    ]);
    const fill = idOf(config, 'collect');
    const bs = boards(config);
    expect(bs.length).toBe(1);
    expect(bs[0][1].from).toBe(fill + '.scores');
  });

  it('team points (charades) keep their own board and never join the per-student sum', () => {
    const config = compile([
      { brick: 'collect', text: 'Say "I ate"', answer: 'comí' },
      { brick: 'teams', teamCount: 2 },
      { brick: 'charades', text: 'Act it out', phrases: 'Write a phrase to act out' },
      { brick: 'end' }
    ]);
    const turn = idOf(config, 'turn');
    const bs = boards(config);
    const last = bs[bs.length - 1][1];
    expect(last.from).toBe(turn + '.teamScores');
    bs.slice(0, -1).forEach(([, b]) => {
      const refs = Array.isArray(b.from) ? b.from : [b.from];
      refs.forEach((r) => expect(r).not.toMatch(/teamScores$/));
    });
  });

  it('the storyboard prompt says every board is the running total', async () => {
    const src = await read('services/ai-service.js');
    expect(src).toContain("Every scoreboard shows the lesson's running total");
  });
});
