/**
 * Points for how close a guess is, with a speed bonus (2026-10-01, owner:
 * "if the question is how many square kilometers is Yemen, you get more
 * points based on how close you are ... and maybe a speed bonus too").
 * estimate scoring "distance" (engine/phases/estimate-scoring.js) pays
 * points times closeness; speedBonus keeps 100% for an instant guess down
 * to 50% at the buzzer; the brick sets both and a scoreboard follows a run.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { closeness, scoreByDistance, withSpeedBonus } from '../../engine/phases/estimate-scoring.js';
import { validate } from '../../engine/game-loader.js';
import { validateSuggestions } from '../../engine/suggest-validate.js';
import '../../screens/shared/step-suggestions.js';

const S = globalThis.StepSuggestions;
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const YEMEN = 527968;

describe('points for how close', () => {
  it('the right answer earns everything, twice or half earns half, over and under alike', () => {
    expect(closeness(YEMEN, YEMEN)).toBe(1);
    expect(closeness(YEMEN * 2, YEMEN)).toBe(0.5);
    expect(closeness(YEMEN / 2, YEMEN)).toBe(0.5);
    expect(closeness(500000, YEMEN)).toBeCloseTo(0.947, 3);
  });

  it('zero, negatives, and nonsense fall back to the gap over the answer\'s size', () => {
    expect(closeness(0, 100)).toBe(0);
    expect(closeness(-5, -10)).toBe(0.5);
    expect(closeness(3, 0)).toBe(0);
    expect(closeness(NaN, 10)).toBe(0);
  });

  it('every guess scores its share of the points', () => {
    expect(scoreByDistance({ a: 527968, b: 1000000, c: 50000, d: 500000 }, YEMEN, 1000))
      .toEqual({ a: 1000, b: 528, c: 95, d: 947 });
    expect(scoreByDistance({ a: 5 }, null, 1000)).toEqual({});
  });

  it('a speed bonus keeps all of it at once, half at the buzzer, the last guess counting', () => {
    const start = 1000000;
    const scores = { fast: 1000, mid: 1000, late: 1000, none: 1000 };
    const at = { fast: start, mid: start + 30000, late: start + 90000 };
    expect(withSpeedBonus(scores, at, start, 60)).toEqual({ fast: 1000, mid: 750, late: 500, none: 500 });
    expect(withSpeedBonus(scores, at, start, null)).toEqual(scores);
  });
});

describe('the step and the brick', () => {
  it('the validator takes scoring distance and a speed bonus', () => {
    const result = validate({ name: 'E', description: 'e', phases: {
      lobby: { type: 'lobby', next: 'g' },
      g: { type: 'estimate', prompt: 'How many square kilometers is Yemen?', answer: YEMEN, scoring: 'distance', speedBonus: true, timer: 45, next: 'end' },
      end: { type: 'end' }
    } }, 'e1', { returnResults: true });
    expect(result.errors).toEqual([]);
  });

  it('the close scores by distance, then applies the bonus, and stores when each guess landed', () => {
    const server = read('server.js');
    expect(server).toMatch(/let scores = mode === 'distance'\s+\? scoreByDistance\(state\.guesses, state\.answer, points\)/);
    expect(server).toMatch(/scores = withSpeedBonus\(scores, state\.guessedAt, state\.startedAt, phase\.timer\);/);
    expect(server).toMatch(/state\.guessedAt\[socket\.id\] = Date\.now\(\);/);
    expect(read('engine/phase-handlers/estimate.js')).toMatch(/startedAt: Date\.now\(\)/);
  });

  it('the brick sets distance and the bonus (a guess keeps its 60-second default clock), and one scoreboard after a run', () => {
    const { config, problems } = S.compileStoryboard({ name: 'G', steps: [
      { brick: 'estimate', text: 'How many square kilometers is Yemen?', answer: YEMEN, unit: 'km²', scoring: 'distance', speedBonus: true },
      { brick: 'estimate', text: 'How tall is Mount Everest in meters?', answer: 8849, unit: 'm', scoring: 'distance', speedBonus: true, timer: 30 },
      { brick: 'end', text: 'Bye' }
    ] });
    expect(problems).toEqual([]);
    const guesses = Object.entries(config.phases).filter(([, p]) => p.type === 'estimate');
    expect(guesses.map(([, p]) => [p.scoring, p.speedBonus, p.timer])).toEqual([['distance', true, 60], ['distance', true, 30]]);
    const boards = Object.values(config.phases).filter(p => p.type === 'leaderboard');
    expect(boards).toHaveLength(1);
    expect(boards[0].from).toEqual(guesses.map(([id]) => id + '.scores'));
    expect(validate({ name: 'G', description: 'g', phases: config.phases }, 'g1', { returnResults: true }).errors).toEqual([]);
  });

  it('a guess with no answer stays a poll: no bonus, no scoreboard', () => {
    const { config } = S.compileStoryboard({ name: 'G', steps: [
      { brick: 'estimate', text: 'How many beans in the jar?', scoring: 'distance', speedBonus: true }, { brick: 'end', text: 'Bye' }
    ] });
    const g = Object.values(config.phases).find(p => p.type === 'estimate');
    expect(g.speedBonus).toBeUndefined();
    expect(Object.values(config.phases).some(p => p.type === 'leaderboard')).toBe(false);
  });

  it('the plan validator passes distance; the prompts name it; the screens highlight only the top score', () => {
    const { suggestions } = validateSuggestions([{ kind: 'storyboard', storyboard: { name: 'X', steps: [
      { brick: 'estimate', text: 'Yemen?', answer: YEMEN, scoring: 'distance', speedBonus: true }, { brick: 'end', text: 'Bye' }
    ] } }], { gameIds: [], recipes: {} });
    expect(suggestions[0].storyboard.steps[0]).toMatchObject({ scoring: 'distance', speedBonus: true });
    expect(read('services/ai-service.js')).toMatch(/or "distance" \(every guess earns points by how close it is/);
    expect(read('screens/host/host.js')).toMatch(/topScore > 0 && g\.score === topScore \? 'estimate-winner'/);
    expect(read('screens/player/player.js')).toMatch(/mine\.score === topScore && J\) J\.confetti/);
  });
});
