import { describe, it, expect } from 'vitest';
import { AIService } from '../../services/ai-service.js';

// Matcher knows the ready-made activities (2026-08-22): "Human or AI"
// fell to the storyboard even though a built-in game IS that exact idea,
// because the matcher's catalog only held recipes. Unforced matches now
// carry the built-in activity list, and the AI may answer with
// {"game": "<id>"} when a ready-made activity already is the idea.

const recipes = [
  { id: 'question-share', name: 'Question Share', description: 'Ask, answer, reveal.', parameters: {} },
  { id: 'doodle-bluff', name: 'Doodle Bluff', description: 'Draw and bluff.', parameters: {} }
];

const games = [
  {
    id: 'human-vs-ai-birthday-party-battle',
    name: 'Human vs AI: Birthday Party Battle',
    description: 'Students write ideas, AI writes rivals, everyone guesses which is which.',
    playTime: '~12 min'
  },
  { id: 'snowball', name: 'Snowball', description: 'Anonymous answers fly around the room.', playTime: '~10 min' }
];

function textResponse(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

describe('matchRecipe with a ready-made activity catalog', () => {
  it('lists the activities and the game answer shape in the unforced prompt', async () => {
    const service = new AIService({ mode: 'real' });
    let system = '';
    service._callClaude = async (params) => {
      system = params.system;
      return textResponse({ recipe: 'question-share', params: {} });
    };
    await service.matchRecipe('human or ai guessing', recipes, { games });
    expect(system).toContain('human-vs-ai-birthday-party-battle');
    expect(system).toContain('"game"');
  });

  it('passes a game pick through with explanation and alternates', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => textResponse({
      game: 'human-vs-ai-birthday-party-battle',
      explanation: 'This ready-made activity is exactly that idea.',
      alternates: [{ recipe: 'doodle-bluff', why: 'The drawing version of the same bluff.' }]
    });
    const result = await service.matchRecipe('human or ai guessing', recipes, { games });
    expect(result.game).toBe('human-vs-ai-birthday-party-battle');
    expect(result.explanation).toBe('This ready-made activity is exactly that idea.');
    expect(result.alternates).toEqual([
      { recipe: 'doodle-bluff', why: 'The drawing version of the same bluff.' }
    ]);
    expect(result.noMatch).toBeUndefined();
    expect(result.recipe).toBeUndefined();
  });

  it('treats a malformed game pick as no match', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => textResponse({ game: 42 });
    const result = await service.matchRecipe('human or ai guessing', recipes, { games });
    expect(result.noMatch).toBe(true);
  });

  it('leaves the ready-made section out of the forced prompt', async () => {
    const service = new AIService({ mode: 'real' });
    let system = '';
    service._callClaude = async (params) => {
      system = params.system;
      return textResponse({ recipe: 'doodle-bluff', params: {} });
    };
    await service.matchRecipe('human or ai guessing', [recipes[1]], { forced: true, games });
    expect(system).not.toContain('human-vs-ai-birthday-party-battle');
    expect(system).not.toContain('"game"');
  });

  it('leaves the ready-made section out when no games are passed', async () => {
    const service = new AIService({ mode: 'real' });
    let system = '';
    service._callClaude = async (params) => {
      system = params.system;
      return textResponse({ recipe: 'question-share', params: {} });
    };
    await service.matchRecipe('human or ai guessing', recipes);
    expect(system).not.toContain('Ready-made activities');
    expect(system).not.toContain('"game"');
  });

  it('still returns plain recipe matches untouched when games are in the catalog', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => textResponse({
      recipe: 'question-share',
      params: { question: 'What did we learn?' },
      explanation: 'Fits.'
    });
    const result = await service.matchRecipe('a quick share-out', recipes, { games });
    expect(result.recipe).toBe('question-share');
    expect(result.game).toBeUndefined();
  });
});
