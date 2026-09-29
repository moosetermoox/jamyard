// Pretend students' fakes in a bluff are blank-fillers like the truth
// (review eighteen: Trivia Bluff's fakes were whole sentences beside a
// one-word truth, so the truth stood out).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { AIService, bluffTruths } from '../../services/ai-service.js';

const triviaBluff = JSON.parse(readFileSync('games/trivia-bluff/config.json', 'utf8'));

describe('bluffTruths', () => {
  it('finds each lie step and its truth in Trivia Bluff', () => {
    const t = bluffTruths(triviaBluff.phases);
    expect(t.qlies1).toBe('marrying');
    expect(t.qlies3).toBe('wallpaper');
  });
  it('finds nothing in an activity without a ballot of answers', () => {
    expect(bluffTruths({ a: { type: 'collect' }, b: { type: 'collect-choice', choices: ['x', 'y'] } })).toEqual({});
  });
});

describe('writeSampleAnswers on a bluff', () => {
  const config = { name: 'Copy', phases: {
    lies: { type: 'collect', prompt: 'Old ___ as coffee filters. Write a lie.', next: 'pick' },
    pick: { type: 'collect-choice', prompt: 'Which is true?', choicePool: [{ from: 'lies.responses', field: 'text' }, { literal: 'wallpaper' }], next: 'end' },
    end: { type: 'end' }
  } };

  it('tells the model the truth and asks for blank-fillers', async () => {
    const service = new AIService({ mode: 'real' });
    let prompt = '';
    service._callClaude = async (params) => {
      prompt = params.messages[0].content;
      return { content: [{ type: 'text', text: JSON.stringify({ lies: [
        'newspaper', 'cotton rags.', 'Cloth that had already been used for other purposes around the house', 'wallpaper', 'socks'
      ] }) }] };
    };
    const { sampleAnswers } = await service.writeSampleAnswers({ config, seats: 5 });
    expect(prompt).toContain('a bluff');
    expect(prompt).toContain('"wallpaper"');
    expect(prompt).toMatch(/never a sentence/);
    // the sentence and the truth itself are dropped, a trailing period too
    expect(sampleAnswers.lies).toEqual(['newspaper', 'cotton rags', 'socks']);
  });

  it('mock mode writes short fakes', async () => {
    const service = new AIService({ mode: 'mock' });
    const { sampleAnswers } = await service.writeSampleAnswers({ config, seats: 3 });
    expect(sampleAnswers.lies).toEqual(['fake 1', 'fake 2', 'fake 3']);
  });
});
