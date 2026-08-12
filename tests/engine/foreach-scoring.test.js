/**
 * applyIterationScoring — per-iteration scoring for foreach, extracted from
 * advanceForeach (server.js) so all three modes are unit-testable:
 *
 *   correct — guessers earn points for matching correctAnswer (Who Said It)
 *   tally   — the ITEM'S AUTHOR earns points from what others picked
 *   scores  — adopt the sub-phase's own computed score map (bluff votes:
 *             collect-choice already grades truth-spotting AND foolPoints
 *             per round; this mode just accumulates those across rounds)
 */

import { describe, it, expect } from 'vitest';
import { applyIterationScoring } from '../../engine/phases/foreach-scoring.js';
import { validate } from '../../engine/game-loader.js';

const PLAYERS = [
  { id: 'p1', name: 'Ava' },
  { id: 'p2', name: 'Ben' },
  { id: 'p3', name: 'Cal' }
];

function run({ scores = {}, scoring, subData, item = {}, resolve = () => undefined }) {
  return applyIterationScoring({ scores, scoring, subData, item, resolve, players: PLAYERS });
}

describe('applyIterationScoring — correct mode', () => {
  it('awards pointsCorrect to matching guessers and pointsDecoy to the rest', () => {
    const scores = run({
      scoring: { mode: 'correct', correctAnswer: 'Blue', pointsCorrect: 100, pointsDecoy: 10 },
      subData: { responses: [
        { playerId: 'p1', choice: 'Blue' },
        { playerId: 'p2', choice: 'Red' }
      ] }
    });
    expect(scores).toEqual({ p1: 100, p2: 10 });
  });

  it('resolves _current.* correctAnswer refs through the resolver', () => {
    const scores = run({
      scoring: { mode: 'correct', correctAnswer: '_current.assigned', pointsCorrect: 50 },
      subData: { responses: [{ playerId: 'p1', choice: 'a snail wedding' }] },
      resolve: (ref) => (ref === '_current.assigned' ? 'a snail wedding' : undefined)
    });
    expect(scores).toEqual({ p1: 50 });
  });

  it('matches a picked player NAME against a correctAnswer player id', () => {
    const scores = run({
      scoring: { mode: 'correct', correctAnswer: '_current.playerId', pointsCorrect: 100 },
      subData: { responses: [{ playerId: 'p2', choice: 'Ava' }] },
      item: { playerId: 'p1' }
    });
    expect(scores).toEqual({ p2: 100 });
  });

  it('accumulates onto existing scores across iterations', () => {
    const scores = run({
      scores: { p1: 40 },
      scoring: { mode: 'correct', correctAnswer: 'x', pointsCorrect: 100 },
      subData: { responses: [{ playerId: 'p1', choice: 'x' }] }
    });
    expect(scores).toEqual({ p1: 140 });
  });
});

describe('applyIterationScoring — tally mode', () => {
  it('pays the item author from the pointMap of what others picked', () => {
    const scores = run({
      scoring: { mode: 'tally', pointMap: { 'Loved it': 10, 'Meh': 0 } },
      subData: { responses: [
        { playerId: 'p2', choice: 'Loved it' },
        { playerId: 'p3', choice: 'Meh' }
      ] },
      item: { playerId: 'p1' }
    });
    expect(scores).toEqual({ p1: 10 });
  });
});

describe('applyIterationScoring — scores mode', () => {
  it('merges the sub-phase\'s own score map (truth points + fool points)', () => {
    const scores = run({
      scores: { p1: 100 },
      scoring: { mode: 'scores' },
      subData: { scores: { p1: 50, p3: 150 }, responses: [] }
    });
    expect(scores).toEqual({ p1: 150, p3: 150 });
  });

  it('is a no-op when the sub-phase computed no scores', () => {
    const scores = run({
      scores: { p1: 100 },
      scoring: { mode: 'scores' },
      subData: { responses: [] }
    });
    expect(scores).toEqual({ p1: 100 });
  });
});

describe('foreach scoring mode "scores" — validator', () => {
  const gameWith = (guessExtras) => ({
    name: 'Test',
    phases: {
      lobby: { type: 'lobby', next: 'draw' },
      draw: { type: 'collect', prompt: 'Draw!', inputType: 'drawing', next: 'rounds' },
      rounds: {
        type: 'foreach',
        data: 'draw.responses',
        subPhases: {
          titles: { type: 'collect', prompt: 'Fake title?' },
          guess: {
            type: 'collect-choice',
            prompt: 'Real one?',
            choicePool: [{ from: 'titles.responses', field: 'text' }],
            ...guessExtras
          }
        },
        scoring: { subPhase: 'guess', mode: 'scores' },
        next: 'end'
      },
      end: { type: 'end' }
    }
  });

  it('accepts mode "scores" without a foreach-level correctAnswer', () => {
    const cfg = gameWith({ correctAnswer: '{{_current.assigned}}', foolPoints: 50, excludeAuthored: 'titles' });
    expect(() => validate(cfg, 'scores-mode-ok')).not.toThrow();
  });

  it('warns when the graded sub-step grades nothing', () => {
    const cfg = gameWith({});
    const result = validate(cfg, 'scores-mode-ungraded', { returnResults: true });
    expect(result.warnings.some(w => /nobody can ever score/.test(w))).toBe(true);
  });
});
