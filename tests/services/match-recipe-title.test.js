import { describe, it, expect } from 'vitest';
import { AIService } from '../../services/ai-service.js';

// Reviewer finding (2026-09-06): a matched activity kept the recipe's
// generic name ("Snowball"), and the AI claimed the activity "matched the
// timeline" when the timers alone ran past the request. The matcher now
// asks for a contextual title and is told never to claim a timing fit; the
// server computes duration itself (engine/duration-estimate.js).

const recipes = [
  { id: 'snowball', name: 'Snowball', description: 'Think, pair, share.', parameters: {} },
  { id: 'doodle-bluff', name: 'Doodle Bluff', description: 'Draw and bluff.', parameters: {} }
];

function textResponse(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

describe('matchRecipe contextual title', () => {
  it('asks for a title and forbids timing claims, in both the open and the forced prompt', async () => {
    const service = new AIService({ mode: 'real' });
    const systems = [];
    service._callClaude = async (params) => {
      systems.push(params.system);
      return textResponse({ recipe: 'snowball', params: {} });
    };
    await service.matchRecipe('five minute WWI causes think pair share', recipes, {});
    await service.matchRecipe('five minute WWI causes think pair share', recipes, { forced: true });
    for (const system of systems) {
      expect(system).toContain('"title"');
      expect(system).toContain('Never claim the activity fits a time limit');
    }
  });

  it('passes a clean title through on recipe and game picks', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => textResponse({
      recipe: 'snowball', params: {}, explanation: 'Fits.', title: 'Snowball: Causes of WWI'
    });
    const result = await service.matchRecipe('WWI causes', recipes, {});
    expect(result.title).toBe('Snowball: Causes of WWI');

    service._callClaude = async () => textResponse({
      game: 'snowball', explanation: 'Already exists.', title: 'Snowball: Class Norms'
    });
    const picked = await service.matchRecipe('class norms', recipes, { games: [{ id: 'snowball', name: 'Snowball', description: '' }] });
    expect(picked.title).toBe('Snowball: Class Norms');
  });

  it('folds an em dash to a colon and drops titles that are missing, blank, or too long', async () => {
    const service = new AIService({ mode: 'real' });
    const titles = ['Snowball — Causes of WWI', '   ', undefined, 42, 'x'.repeat(61)];
    const results = [];
    for (const title of titles) {
      service._callClaude = async () => textResponse({ recipe: 'snowball', params: {}, title });
      results.push(await service.matchRecipe('WWI causes', recipes, {}));
    }
    expect(results[0].title).toBe('Snowball: Causes of WWI');
    expect(results[1].title).toBeUndefined();
    expect(results[2].title).toBeUndefined();
    expect(results[3].title).toBeUndefined();
    expect(results[4].title).toBeUndefined();
  });
});
