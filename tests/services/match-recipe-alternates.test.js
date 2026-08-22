import { describe, it, expect } from 'vitest';
import { AIService } from '../../services/ai-service.js';

// Recipe-match alternates (2026-08-22): a goal-shaped idea ("laugh
// together") genuinely fits several recipes, so the matcher may name up
// to two OTHER recipes alongside its top pick. The server resolves the
// ids to real recipes; this file covers the service-level sanitation.

const recipes = [
  { id: 'one-voice', name: 'One Voice', description: 'Count together.', parameters: {} },
  { id: 'doodle-bluff', name: 'Doodle Bluff', description: 'Draw and bluff.', parameters: {} },
  { id: 'trivia-bluff', name: 'Trivia Bluff', description: 'Bluff quiz.', parameters: {} },
  { id: 'creative-vote', name: 'Creative Vote', description: 'Write and vote.', parameters: {} }
];

function textResponse(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

describe('matchRecipe alternates', () => {
  it('passes well-formed alternates through with the match', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => textResponse({
      recipe: 'one-voice',
      params: {},
      explanation: 'Counting together gets the whole room laughing.',
      alternates: [
        { recipe: 'doodle-bluff', why: 'Drawing badly is its own comedy.' }
      ]
    });
    const result = await service.matchRecipe('I want my class to laugh together', recipes);
    expect(result.recipe).toBe('one-voice');
    expect(result.alternates).toEqual([
      { recipe: 'doodle-bluff', why: 'Drawing badly is its own comedy.' }
    ]);
  });

  it('drops the main recipe and malformed entries, caps at two', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => textResponse({
      recipe: 'one-voice',
      params: {},
      alternates: [
        { recipe: 'one-voice', why: 'echoes the main pick' },
        { nothing: true },
        { recipe: 'doodle-bluff', why: 42 },
        { recipe: 'trivia-bluff', why: 'bluffing is funny' },
        { recipe: 'creative-vote', why: 'a third good fit' }
      ]
    });
    const result = await service.matchRecipe('I want my class to laugh together', recipes);
    expect(result.alternates).toEqual([
      { recipe: 'doodle-bluff', why: '' },
      { recipe: 'trivia-bluff', why: 'bluffing is funny' }
    ]);
  });

  it('defaults to an empty list when the AI sends none', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => textResponse({
      recipe: 'one-voice',
      params: {},
      explanation: 'Fits.'
    });
    const result = await service.matchRecipe('I want my class to laugh together', recipes);
    expect(result.alternates).toEqual([]);
  });

  it('mock mode includes the empty alternates shape', async () => {
    const service = new AIService(); // mock
    const result = await service.matchRecipe('anything at all really', recipes);
    expect(result.alternates).toEqual([]);
  });

  // Forced mode: the teacher clicked an alternate card, so the recipe is
  // already chosen. The prompt must ask only for parameters, never offer
  // the noMatch escape hatch (a refit that "refuses" is a dead end).
  it('forced mode tells the AI the recipe is chosen and drops the noMatch option', async () => {
    const service = new AIService({ mode: 'real' });
    let system = '';
    service._callClaude = async (params) => {
      system = params.system;
      return textResponse({ recipe: 'doodle-bluff', params: {}, explanation: 'Filled.' });
    };
    const result = await service.matchRecipe(
      'help my students get to know each other',
      [recipes[1]],
      { forced: true }
    );
    expect(result.recipe).toBe('doodle-bluff');
    expect(system).toContain('already chosen');
    expect(system).not.toContain('noMatch');
  });

  it('unforced mode still offers the noMatch shape', async () => {
    const service = new AIService({ mode: 'real' });
    let system = '';
    service._callClaude = async (params) => {
      system = params.system;
      return textResponse({ recipe: 'one-voice', params: {} });
    };
    await service.matchRecipe('I want my class to laugh together', recipes);
    expect(system).toContain('noMatch');
  });
});
