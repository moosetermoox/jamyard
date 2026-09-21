/**
 * Video on the storyboard bricks (storyboard probe, 2026-09-20): "watch
 * this YouTube clip, then answer two questions" was the other idea a
 * teacher got NOTHING for, noMatch upstream and declined downstream, while
 * announce, collect, and collect-choice already carry a `video` field the
 * projector plays (engine/video.js). The bricks now pass a YouTube link
 * through; anything that is not one is dropped with a plain problem.
 */

import { describe, it, expect } from 'vitest';
import '../../screens/shared/step-suggestions.js';
import { validate } from '../../engine/game-loader.js';
import { validateSuggestions } from '../../engine/suggest-validate.js';
import { resolveVideoEmbed } from '../../engine/video.js';
import { AIService } from '../../services/ai-service.js';

const S = globalThis.StepSuggestions;
const CLIP = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

function hostable(config, label) {
  const result = validate(
    { name: 'Video test', description: 'video brick test', phases: config.phases },
    'video-test', { returnResults: true }
  );
  const errors = result.errors.map(e => (typeof e === 'string' ? e : e.message));
  expect(errors, `${label} should be hostable as-is`).toEqual([]);
}

function byType(config, type) {
  return Object.values(config.phases).filter(p => p.type === type);
}

describe('video on the bricks', () => {
  it('an announce, a collect, and a collect-choice carry the clip; hostable as-is', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'Clip', description: 'watch then answer',
      steps: [
        { brick: 'announce', text: 'Watch this clip, then two questions.', video: CLIP },
        { brick: 'collect', text: 'What was the main claim?', video: 'https://youtu.be/dQw4w9WgXcQ?t=90' },
        { brick: 'collect-choice', text: 'Which side did it take?', choices: ['For', 'Against'], video: 'https://www.youtube.com/shorts/dQw4w9WgXcQ' },
        { brick: 'end', text: 'Bye' }
      ]
    });
    expect(problems).toEqual([]);
    hostable(config, 'clip');
    expect(byType(config, 'announce')[0].video).toBe(CLIP);
    expect(byType(config, 'collect')[0].video).toBe('https://youtu.be/dQw4w9WgXcQ?t=90');
    expect(byType(config, 'collect-choice')[0].video).toBe('https://www.youtube.com/shorts/dQw4w9WgXcQ');
    // the server can embed every one of them
    for (const p of Object.values(config.phases)) {
      if (p.video) expect(resolveVideoEmbed(p.video), p.video).toMatch(/youtube\.com\/embed\//);
    }
  });

  it('drops a link that is not YouTube, with a plain problem, and still builds', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'Clip', description: 'x',
      steps: [
        { brick: 'announce', text: 'Watch.', video: 'https://vimeo.com/12345' },
        { brick: 'end', text: 'Bye' }
      ]
    });
    expect(problems.join(' ')).toMatch(/YouTube/);
    hostable(config, 'bad link');
    expect(byType(config, 'announce')[0].video).toBeUndefined();
  });

  it('ignores video on bricks that have no player (reveal, end, quiz)', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'Clip', description: 'x',
      steps: [
        { brick: 'collect', text: 'Say something.' },
        { brick: 'reveal', text: 'Here it is.', video: CLIP },
        { brick: 'end', text: 'Bye', video: CLIP }
      ]
    });
    expect(problems).toEqual([]);
    hostable(config, 'no player');
    expect(byType(config, 'reveal')[0].video).toBeUndefined();
    expect(byType(config, 'end')[0].video).toBeUndefined();
  });
});

describe('video through the concierge', () => {
  it('rides through trimmed', () => {
    const { suggestions } = validateSuggestions([{
      kind: 'storyboard',
      storyboard: { name: 'C', description: 'c', steps: [
        { brick: 'announce', text: 'Watch.', video: CLIP },
        { brick: 'collect', text: 'Answer.', video: 42 },
        { brick: 'end', text: 'Bye' }
      ] }
    }], { gameIds: [], recipes: {} });
    expect(suggestions[0].storyboard.steps[0].video).toBe(CLIP);
    expect(suggestions[0].storyboard.steps[1].video).toBeUndefined();
  });
});

describe('the storyboard prompt knows video', () => {
  it('names the video field on announce and routes "watch a clip" to it', async () => {
    const service = new AIService({ mode: 'real' });
    let prompt = '';
    service._callClaude = async (params) => {
      prompt = params.messages[0].content;
      return { content: [{ type: 'text', text: JSON.stringify({ name: 'X', description: 'y', steps: [{ brick: 'end', text: 'Bye' }] }) }] };
    };
    await service.generateStoryboard('watch a clip then answer');
    expect(prompt).toMatch(/video = /);
    expect(prompt).toMatch(/YouTube/);
  });
});
