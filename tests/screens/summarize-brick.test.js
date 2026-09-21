/**
 * The summarize brick (storyboard probe, 2026-09-20): "everyone answers,
 * then the answers get summed up into three themes for the board" was
 * declined 3 of 3 ("nothing sorts them into categories") while the
 * ai-process step has done exactly that since the start (Discussion
 * Starter). The brick compiles the same pair the Builder's + button lands:
 * an ai-process summarize over the last collect, then the reveal that
 * stages its result. Nothing a student reads names the AI (standing rule).
 *   { brick: 'summarize', text: the instruction, heading?: the projector line }
 */

import { describe, it, expect } from 'vitest';
import '../../screens/shared/step-suggestions.js';
import { validate } from '../../engine/game-loader.js';
import { STORYBOARD_BRICKS, validateSuggestions } from '../../engine/suggest-validate.js';
import { AIService } from '../../services/ai-service.js';

const S = globalThis.StepSuggestions;

function hostable(config, label) {
  const result = validate(
    { name: 'Summarize test', description: 'summarize brick test', phases: config.phases },
    'summarize-test', { returnResults: true }
  );
  const errors = result.errors.map(e => (typeof e === 'string' ? e : e.message));
  expect(errors, `${label} should be hostable as-is`).toEqual([]);
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

describe('summarize brick', () => {
  it('after a collect: an ai-process summarize over its answers, then the reveal of the result; hostable as-is', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'Themes', description: 'x',
      steps: [
        { brick: 'collect', text: 'What was the hardest part of today?' },
        { brick: 'summarize', text: 'Group the answers into three themes. Name each theme in a short phrase and quote one answer for it.', heading: 'Three things this class is saying:' },
        { brick: 'end', text: 'Bye' }
      ]
    });
    expect(problems).toEqual([]);
    hostable(config, 'themes');
    const steps = ordered(config);
    expect(steps.map(([, p]) => p.type)).toEqual(['lobby', 'collect', 'ai-process', 'reveal', 'end']);
    const [askId] = steps[1];
    const [aiId, ai] = steps[2];
    expect(ai.task).toBe('summarize');
    expect(ai.input).toBe(askId + '.responses');
    expect(ai.instruction).toContain('three themes');
    const [, show] = steps[3];
    expect(show.template).toContain('Three things this class is saying:');
    expect(show.template).toContain('{{' + aiId + '.result}}');
  });

  it('defaults the heading, and needs a collect before it', () => {
    const ok = S.compileStoryboard({
      name: 'X', description: 'y',
      steps: [{ brick: 'collect', text: 'Say it.' }, { brick: 'summarize', text: 'Find the themes.' }, { brick: 'end', text: 'Bye' }]
    });
    expect(ok.problems).toEqual([]);
    hostable(ok.config, 'default heading');
    const show = ordered(ok.config)[3][1];
    expect(show.template).toMatch(/\S.*\n\n\{\{/);

    const none = S.compileStoryboard({
      name: 'X', description: 'y',
      steps: [{ brick: 'summarize', text: 'Find the themes.' }, { brick: 'end', text: 'Bye' }]
    });
    expect(none.problems.join(' ')).toMatch(/question step/);
  });

  it('needs the instruction', () => {
    const { problems } = S.compileStoryboard({
      name: 'X', description: 'y',
      steps: [{ brick: 'collect', text: 'Say it.' }, { brick: 'summarize' }, { brick: 'end', text: 'Bye' }]
    });
    expect(problems.join(' ')).toMatch(/summarize.*text/i);
  });

  it('the audience line tells the student the class sees it (the AI reads it on the way)', async () => {
    const { audienceFor, AUDIENCE } = await import('../../engine/audience.js');
    const { config } = S.compileStoryboard({
      name: 'X', description: 'y',
      steps: [{ brick: 'collect', text: 'Say it.' }, { brick: 'summarize', text: 'Themes.' }, { brick: 'end', text: 'Bye' }]
    });
    const askId = ordered(config)[1][0];
    const a = audienceFor({ phases: config.phases }, askId);
    expect([AUDIENCE.CLASS, AUDIENCE.AI]).toContain(a.key);
  });
});

describe('summarize brick through the concierge', () => {
  it('is a known brick and its fields ride through trimmed', () => {
    expect(STORYBOARD_BRICKS).toContain('summarize');
    const { suggestions } = validateSuggestions([{
      kind: 'storyboard',
      storyboard: { name: 'S', description: 's', steps: [
        { brick: 'collect', text: 'Say it.' },
        { brick: 'summarize', text: 'Themes.', heading: 'What we said:' },
        { brick: 'end', text: 'Bye' }
      ] }
    }], { gameIds: [], recipes: {} });
    const step = suggestions[0].storyboard.steps[1];
    expect(step.text).toBe('Themes.');
    expect(step.heading).toBe('What we said:');
  });
});

describe('the storyboard prompt knows the summarize brick', () => {
  it('describes summarize and keeps the AI out of the words students read', async () => {
    const service = new AIService({ mode: 'real' });
    let prompt = '';
    service._callClaude = async (params) => {
      prompt = params.messages[0].content;
      return { content: [{ type: 'text', text: JSON.stringify({ name: 'X', description: 'y', steps: [{ brick: 'end', text: 'Bye' }] }) }] };
    };
    await service.generateStoryboard('sum up the answers into themes');
    expect(prompt).toContain('- summarize:');
    expect(prompt).toMatch(/heading = /);
    expect(prompt).toMatch(/never name the AI/i);
  });
});
