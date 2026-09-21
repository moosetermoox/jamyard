/**
 * The pairs brick (storyboard probe, 2026-09-20): "debate pairs, partners
 * get opposite sides, write an opening, swap, write a rebuttal, then argue
 * the other side" was the one idea a teacher got NOTHING for. The engine
 * pairs students (assign:"pairwise"), keeps the pair across steps
 * (reusePairsFrom), shows a partner's text ({{X.partner}}) and deals sides.
 * The brick compiles all of that from the AI's words alone:
 *   { brick: 'pairs', text, rounds?: string[], sides?: [A, B], timer? }
 * = one pairwise collect, one collect per round (same partner, the
 * partner's latest piece under the instruction), and a pair-private reveal
 * of the last exchange. Nothing goes on the projector.
 */

import { describe, it, expect } from 'vitest';
import '../../screens/shared/step-suggestions.js';
import { validate } from '../../engine/game-loader.js';
import { STORYBOARD_BRICKS, validateSuggestions } from '../../engine/suggest-validate.js';
import { AIService } from '../../services/ai-service.js';

const S = globalThis.StepSuggestions;

function hostable(config, label) {
  const result = validate(
    { name: 'Pairs test', description: 'pairs brick test', phases: config.phases },
    'pairs-test', { returnResults: true }
  );
  const errors = result.errors.map(e => (typeof e === 'string' ? e : e.message));
  expect(errors, `${label} should be hostable as-is`).toEqual([]);
  return result;
}

function ordered(config) {
  const out = [];
  let id = 'lobby';
  const seen = new Set();
  while (id && config.phases[id] && !seen.has(id)) {
    seen.add(id);
    out.push([id, config.phases[id]]);
    id = config.phases[id].next;
  }
  return out;
}

const DEBATE = {
  name: 'Debate Pairs',
  description: 'Partners argue opposite sides, then switch.',
  steps: [
    { brick: 'announce', text: 'You and a partner will argue a question from opposite sides.' },
    {
      brick: 'pairs',
      text: 'Should schools run year-round? Write your opening argument for your side.',
      rounds: [
        'Read your partner\'s opening. Write a rebuttal.',
        'Switch sides. Now argue the other side in three sentences.'
      ],
      sides: ['For', 'Against'],
      timer: 120
    },
    { brick: 'end', text: 'You argued both sides. Which one was harder?' }
  ]
};

describe('pairs brick', () => {
  it('compiles a debate exchange: pairwise collect, one collect per round, a pair-private reveal; hostable as-is', () => {
    const { config, problems } = S.compileStoryboard(DEBATE);
    expect(problems).toEqual([]);
    hostable(config, 'debate pairs');
    const steps = ordered(config);
    const types = steps.map(([, p]) => p.type);
    expect(types).toEqual(['lobby', 'announce', 'collect', 'collect', 'collect', 'reveal', 'end']);

    const [openId, open] = steps[2];
    expect(open.assign).toBe('pairwise');
    expect(open.oddHandling).toBe('triple');
    expect(open.sides).toEqual(['For', 'Against']);
    expect(open.timer).toBe(120);
    expect(open.prompt).toContain('Write your opening argument for your side.');
    expect(open.prompt).toContain('{{' + openId + '.side}}');

    const [r1Id, r1] = steps[3];
    expect(r1.assign).toBe('pairwise');
    expect(r1.reusePairsFrom).toBe(openId);
    expect(r1.sides).toBeUndefined();
    expect(r1.prompt).toContain('Write a rebuttal.');
    expect(r1.prompt).toContain('{{' + openId + '.partner}}');
    expect(r1.prompt).toContain('{{' + openId + '.side}}');
    expect(r1.timer).toBe(120);

    const [, r2] = steps[4];
    expect(r2.reusePairsFrom).toBe(openId);
    expect(r2.prompt).toContain('{{' + r1Id + '.partner}}');

    const [, share] = steps[5];
    expect(share.scope).toBe('pair');
    expect(share.pairsFrom).toBe(steps[4][0]);
    expect(share.template).toContain('{{_pair.answers}}');
  });

  it('rewrites the AI\'s plain tokens: {{side}}, {{otherSide}}, {{partner}}', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'X', description: 'y',
      steps: [
        { brick: 'pairs', text: 'You argue {{side}} against {{otherSide}}.', rounds: ['Answer this from {{partner}}, still as {{side}}.'], sides: ['Yes', 'No'] },
        { brick: 'end', text: 'Bye' }
      ]
    });
    expect(problems).toEqual([]);
    hostable(config, 'tokens');
    const steps = ordered(config);
    const [openId, open] = steps[1];
    expect(open.prompt).toBe('You argue {{' + openId + '.side}} against {{' + openId + '.partnerSide}}.');
    const [, r1] = steps[2];
    expect(r1.prompt).toBe('Answer this from {{' + openId + '.partner}}, still as {{' + openId + '.side}}.');
    expect(r1.prompt.split('.partner}}').length).toBe(2); // the partner piece is not appended twice
  });

  it('a plain exchange with no rounds and no sides: write, then see each other', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'X', description: 'y',
      steps: [
        { brick: 'pairs', text: 'Tell your partner one thing you are proud of this week.' },
        { brick: 'end', text: 'Bye' }
      ]
    });
    expect(problems).toEqual([]);
    hostable(config, 'plain exchange');
    const types = ordered(config).map(([, p]) => p.type);
    expect(types).toEqual(['lobby', 'collect', 'reveal', 'end']);
    const open = ordered(config)[1][1];
    expect(open.sides).toBeUndefined();
    expect(open.prompt).not.toContain('{{');
  });

  it('needs the first instruction, caps rounds, and ignores a one-sided sides list', () => {
    const missing = S.compileStoryboard({ name: 'X', description: 'y', steps: [{ brick: 'pairs' }, { brick: 'end', text: 'Bye' }] });
    expect(missing.problems.join(' ')).toMatch(/pairs.*text/i);

    const many = S.compileStoryboard({
      name: 'X', description: 'y',
      steps: [{ brick: 'pairs', text: 'Go.', rounds: ['a', 'b', 'c', 'd', 'e'], sides: ['Only'] }, { brick: 'end', text: 'Bye' }]
    });
    expect(many.problems.join(' ')).toMatch(/rounds/);
    expect(many.problems.join(' ')).toMatch(/sides/);
    hostable(many.config, 'capped');
    const types = ordered(many.config).map(([, p]) => p.type);
    expect(types.filter(t => t === 'collect')).toHaveLength(1 + 3);
    expect(ordered(many.config)[1][1].sides).toBeUndefined();
  });
});

describe('pairs brick through the concierge', () => {
  it('is a known brick and its fields ride through in trimmed shape', () => {
    expect(STORYBOARD_BRICKS).toContain('pairs');
    const { suggestions } = validateSuggestions([{
      kind: 'storyboard',
      storyboard: { name: 'D', description: 'd', steps: [
        { brick: 'pairs', text: 'Open.', rounds: ['Rebut.', 42, 'Switch.', 'x', 'y'], sides: ['For', 'Against', 'Extra'], timer: 90 },
        { brick: 'end', text: 'Bye' }
      ] }
    }], { gameIds: [], recipes: {} });
    expect(suggestions).toHaveLength(1);
    const step = suggestions[0].storyboard.steps[0];
    expect(step.rounds).toEqual(['Rebut.', 'Switch.', 'x']);
    expect(step.sides).toEqual(['For', 'Against']);
    expect(step.timer).toBe(90);
  });
});

describe('the storyboard prompt knows the pairs brick', () => {
  it('describes pairs, no longer bans partner exchanges, and routes debate pairs to ONE pairs step', async () => {
    const service = new AIService({ mode: 'real' });
    let prompt = '';
    service._callClaude = async (params) => {
      prompt = params.messages[0].content;
      return { content: [{ type: 'text', text: JSON.stringify({ name: 'X', description: 'y', steps: [{ brick: 'end', text: 'Bye' }] }) }] };
    };
    await service.generateStoryboard('debate pairs');
    expect(prompt).toContain('- pairs:');
    expect(prompt).toContain('sides = ');
    expect(prompt).toContain('{{otherSide}}');
    expect(prompt).not.toMatch(/pair students up for a private two-way exchange/);
    expect(prompt).toMatch(/ONE pairs step/);
  });
});
