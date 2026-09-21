/**
 * The draw brick (storyboard probe, 2026-09-20): "draw a monster, put them
 * all on the wall" was declined 3 of 3 ("my tools only work with typed
 * text") while Draw Gallery already does it: a drawing collect, the
 * teacher preview gate (nothing student-drawn reaches the projector
 * without one), then a one-at-a-time gallery. The brick compiles all three:
 *   { brick: 'draw', text, gallery?, timer? }
 * A vote cannot show drawings, so the prompt keeps "pick a favorite" to a
 * show of hands during the gallery; the compiler refuses a vote fed by a
 * drawing step with a plain problem.
 */

import { describe, it, expect } from 'vitest';
import '../../screens/shared/step-suggestions.js';
import { validate } from '../../engine/game-loader.js';
import { STORYBOARD_BRICKS, validateSuggestions } from '../../engine/suggest-validate.js';
import { AIService } from '../../services/ai-service.js';

const S = globalThis.StepSuggestions;

function hostable(config, label) {
  const result = validate(
    { name: 'Draw test', description: 'draw brick test', phases: config.phases },
    'draw-test', { returnResults: true }
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
    id = config.phases[id].next || config.phases[id].approveNext;
  }
  return out;
}

describe('draw brick', () => {
  it('compiles a drawing step, the teacher preview gate, and a one-at-a-time gallery; hostable as-is', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'Monsters', description: 'draw and show',
      steps: [
        { brick: 'announce', text: 'Draw the scariest monster you can in ninety seconds.' },
        { brick: 'draw', text: 'Draw a monster. Make it scary.', gallery: 'The monster wall is open. Shout when one makes you jump.', timer: 90 },
        { brick: 'end', text: 'Sleep well.' }
      ]
    });
    expect(problems).toEqual([]);
    hostable(config, 'monsters');
    const steps = ordered(config);
    expect(steps.map(([, p]) => p.type)).toEqual(['lobby', 'announce', 'collect', 'preview', 'reveal-one', 'end']);
    const [drawId, draw] = steps[2];
    expect(draw.inputType).toBe('drawing');
    expect(draw.prompt).toBe('Draw a monster. Make it scary.');
    expect(draw.timer).toBe(90);
    const [galleryId, gallery] = steps[4];
    const [, gate] = steps[3];
    expect(gate.approveNext).toBe(galleryId);
    expect(gate.rejectNext).toBe(drawId);
    expect(gate.next).toBeUndefined();
    expect(gallery.from).toBe(drawId + '.responses');
    expect(gallery.message).toBe('The monster wall is open. Shout when one makes you jump.');
  });

  it('defaults the gallery line and the timer when the AI gives none', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'X', description: 'y',
      steps: [{ brick: 'draw', text: 'Draw your dream invention.' }, { brick: 'end', text: 'Bye' }]
    });
    expect(problems).toEqual([]);
    hostable(config, 'defaults');
    const steps = ordered(config);
    expect(steps[1][1].timer).toBe(90);
    expect(typeof steps[3][1].message).toBe('string');
    expect(steps[3][1].message.length).toBeGreaterThan(0);
  });

  it('needs the drawing instruction', () => {
    const { problems } = S.compileStoryboard({
      name: 'X', description: 'y',
      steps: [{ brick: 'draw' }, { brick: 'end', text: 'Bye' }]
    });
    expect(problems.join(' ')).toMatch(/draw.*text/i);
  });

  it('refuses a vote fed by drawings, with a plain problem', () => {
    const { problems } = S.compileStoryboard({
      name: 'X', description: 'y',
      steps: [
        { brick: 'draw', text: 'Draw a monster.' },
        { brick: 'vote' },
        { brick: 'end', text: 'Bye' }
      ]
    });
    expect(problems.join(' ')).toMatch(/vote.*drawing/i);
  });

  it('the audience line tells the artist the class sees it after the teacher reviews it', async () => {
    const { audienceFor, AUDIENCE } = await import('../../engine/audience.js');
    const { config } = S.compileStoryboard({
      name: 'X', description: 'y',
      steps: [{ brick: 'draw', text: 'Draw.' }, { brick: 'end', text: 'Bye' }]
    });
    const drawId = Object.keys(config.phases).find(id => config.phases[id].inputType === 'drawing');
    expect(audienceFor({ phases: config.phases }, drawId).key).toBe(AUDIENCE.CLASS_AFTER_REVIEW);
  });
});

describe('draw brick through the concierge', () => {
  it('is a known brick and its fields ride through trimmed', () => {
    expect(STORYBOARD_BRICKS).toContain('draw');
    const { suggestions } = validateSuggestions([{
      kind: 'storyboard',
      storyboard: { name: 'D', description: 'd', steps: [
        { brick: 'draw', text: 'Draw.', gallery: 'Look.', timer: 60 },
        { brick: 'end', text: 'Bye' }
      ] }
    }], { gameIds: [], recipes: {} });
    const step = suggestions[0].storyboard.steps[0];
    expect(step.text).toBe('Draw.');
    expect(step.gallery).toBe('Look.');
    expect(step.timer).toBe(60);
  });
});

describe('the storyboard prompt knows the draw brick', () => {
  it('describes draw, the teacher preview, and keeps a favorite to a show of hands', async () => {
    const service = new AIService({ mode: 'real' });
    let prompt = '';
    service._callClaude = async (params) => {
      prompt = params.messages[0].content;
      return { content: [{ type: 'text', text: JSON.stringify({ name: 'X', description: 'y', steps: [{ brick: 'end', text: 'Bye' }] }) }] };
    };
    await service.generateStoryboard('draw a monster');
    expect(prompt).toContain('- draw:');
    expect(prompt).toMatch(/show of hands/);
    expect(prompt).toMatch(/never a vote step over drawings/i);
  });
});
