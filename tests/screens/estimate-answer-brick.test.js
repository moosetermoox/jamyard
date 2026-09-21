/**
 * The estimate brick's answer (storyboard probe, 2026-09-20): "closest
 * guess wins" built an estimate with no answer and no scoring, and one run
 * promised "comes out on top" anyway. The estimate phase already reveals
 * the answer, the class distribution, and closeness-ranked scores at close
 * when it has one. The brick now carries answer, unit, and scoring.
 */

import { describe, it, expect } from 'vitest';
import '../../screens/shared/step-suggestions.js';
import { validate } from '../../engine/game-loader.js';
import { validateSuggestions } from '../../engine/suggest-validate.js';
import { AIService } from '../../services/ai-service.js';

const S = globalThis.StepSuggestions;

function hostable(config, label) {
  const result = validate(
    { name: 'Estimate test', description: 'estimate answer test', phases: config.phases },
    'estimate-test', { returnResults: true }
  );
  const errors = result.errors.map(e => (typeof e === 'string' ? e : e.message));
  expect(errors, `${label} should be hostable as-is`).toEqual([]);
}

function estimateOf(config) {
  return Object.values(config.phases).find(p => p.type === 'estimate');
}

describe('estimate brick: answer, unit, scoring', () => {
  it('carries a known answer with closest scoring; hostable as-is', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'Heartbeats', description: 'x',
      steps: [
        { brick: 'estimate', text: 'How many times does a heart beat in a day?', answer: 100000, unit: 'beats', scoring: 'closest', timer: 45 },
        { brick: 'end', text: 'Bye' }
      ]
    });
    expect(problems).toEqual([]);
    hostable(config, 'heartbeats');
    const est = estimateOf(config);
    expect(est.answer).toBe(100000);
    expect(est.unit).toBe('beats');
    expect(est.scoring).toBe('closest');
    expect(est.timer).toBe(45);
  });

  it('graduated scoring rides through; anything else falls back to closest', () => {
    const grad = S.compileStoryboard({
      name: 'X', description: 'y',
      steps: [{ brick: 'estimate', text: 'Guess.', answer: 42, scoring: 'graduated' }, { brick: 'end', text: 'Bye' }]
    });
    expect(estimateOf(grad.config).scoring).toBe('graduated');
    const odd = S.compileStoryboard({
      name: 'X', description: 'y',
      steps: [{ brick: 'estimate', text: 'Guess.', answer: 42, scoring: 'winner-takes-all' }, { brick: 'end', text: 'Bye' }]
    });
    expect(estimateOf(odd.config).scoring).toBe('closest');
    hostable(odd.config, 'odd scoring');
  });

  it('no answer means poll mode: scoring and unit are left off, no problem raised', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'X', description: 'y',
      steps: [{ brick: 'estimate', text: 'How many jelly beans are in the jar?', scoring: 'closest', unit: 'beans' }, { brick: 'end', text: 'Bye' }]
    });
    expect(problems).toEqual([]);
    hostable(config, 'poll mode');
    const est = estimateOf(config);
    expect(est.answer).toBeUndefined();
    expect(est.scoring).toBeUndefined();
    expect(est.unit).toBeUndefined();
  });

  it('ignores a non-numeric answer', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'X', description: 'y',
      steps: [{ brick: 'estimate', text: 'Guess.', answer: 'about a hundred' }, { brick: 'end', text: 'Bye' }]
    });
    expect(problems).toEqual([]);
    hostable(config, 'string answer');
    expect(estimateOf(config).answer).toBeUndefined();
  });
});

describe('estimate answer through the concierge', () => {
  it('rides through trimmed', () => {
    const { suggestions } = validateSuggestions([{
      kind: 'storyboard',
      storyboard: { name: 'E', description: 'e', steps: [
        { brick: 'estimate', text: 'Guess.', answer: 930, unit: 'jelly beans', scoring: 'graduated' },
        { brick: 'estimate', text: 'Guess.', answer: 'nope', unit: 7, scoring: 'x' },
        { brick: 'end', text: 'Bye' }
      ] }
    }], { gameIds: [], recipes: {} });
    const [a, b] = suggestions[0].storyboard.steps;
    expect(a.answer).toBe(930);
    expect(a.unit).toBe('jelly beans');
    expect(a.scoring).toBe('graduated');
    expect(b.answer).toBeUndefined();
    expect(b.unit).toBeUndefined();
    expect(b.scoring).toBeUndefined();
  });
});

describe('the storyboard prompt knows the estimate answer', () => {
  it('names answer and scoring on estimate, and lets an answered estimate promise a closest guess', async () => {
    const service = new AIService({ mode: 'real' });
    let prompt = '';
    service._callClaude = async (params) => {
      prompt = params.messages[0].content;
      return { content: [{ type: 'text', text: JSON.stringify({ name: 'X', description: 'y', steps: [{ brick: 'end', text: 'Bye' }] }) }] };
    };
    await service.generateStoryboard('closest guess wins');
    expect(prompt).toMatch(/answer = /);
    expect(prompt).toMatch(/scoring = /);
    expect(prompt).toMatch(/estimate brick with an answer/);
  });
});
