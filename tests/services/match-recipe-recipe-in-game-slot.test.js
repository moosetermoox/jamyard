import { describe, it, expect } from 'vitest';
import { AIService } from '../../services/ai-service.js';

// Storyboard probe (2026-09-20): "Guess the number of jelly beans in the
// jar, closest guess wins" came back as {"game": "estimation-station"},
// a RECIPE id in the game slot. The route looked the id up among the
// built-ins, called it an unknown activity, and answered noMatch, so the
// teacher fell through to a storyboard that cannot score guesses. The
// mirror of the 2026-09-07 rule (a game id in the recipe slot is a game
// pick): an id that names an offered recipe is a recipe pick whichever
// slot it sits in.

const recipes = [
  { id: 'estimation-station', name: 'Estimation Station', description: 'Guess numbers, closest wins.', parameters: {} },
  { id: 'question-share', name: 'Question Share', description: 'Ask, answer, reveal.', parameters: {} }
];

const games = [
  { id: 'snowball', name: 'Snowball', description: 'Anonymous answers fly around the room.', playTime: '~10 min' }
];

function textResponse(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

describe('matchRecipe with a recipe id in the game slot', () => {
  it('reads an offered recipe id out of the game slot as a recipe pick', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => textResponse({
      game: 'estimation-station',
      params: { scoring: 'closest' },
      explanation: 'Estimation Station is exactly this.',
      alternates: [{ recipe: 'question-share', why: 'The open version.' }, { recipe: 'estimation-station', why: 'echo' }]
    });
    const result = await service.matchRecipe('guess the jelly beans, closest wins', recipes, { games });
    expect(result.recipe).toBe('estimation-station');
    expect(result.game).toBeUndefined();
    expect(result.params).toEqual({ scoring: 'closest' });
    expect(result.explanation).toBe('Estimation Station is exactly this.');
    expect(result.alternates).toEqual([{ recipe: 'question-share', why: 'The open version.' }]);
  });

  it('defaults the params to an empty object when the game slot carried none', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => textResponse({ game: 'estimation-station' });
    const result = await service.matchRecipe('guess the jelly beans', recipes, { games });
    expect(result.recipe).toBe('estimation-station');
    expect(result.params).toEqual({});
  });

  it('leaves a real game id in the game slot alone', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => textResponse({ game: 'snowball' });
    const result = await service.matchRecipe('anonymous answers fly around', recipes, { games });
    expect(result.game).toBe('snowball');
    expect(result.recipe).toBeUndefined();
  });

  it('still passes an unknown id in the game slot through for the route to refuse', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => textResponse({ game: 'made-up-thing' });
    const result = await service.matchRecipe('anything', recipes, { games });
    expect(result.game).toBe('made-up-thing');
  });
});
