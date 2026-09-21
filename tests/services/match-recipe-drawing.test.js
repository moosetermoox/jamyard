import { describe, it, expect } from 'vitest';
import { AIService } from '../../services/ai-service.js';

// 2026-09-21, the owner's own live try: "everyone draws a picture of me,
// then we vote on the best one" came back as Creative Vote (a text box)
// once and Draw Gallery (no vote) twice. Every recipe's answer box is
// typed, so a drawing idea never fits a recipe, and a drawing idea with a
// vote is not Draw Gallery either: the matcher must say noMatch so the
// step builder makes draw then vote.

const recipes = [
  { id: 'creative-vote', name: 'Creative Vote', description: 'Students submit creative responses, the class votes.', parameters: {} }
];
const games = [
  { id: 'art-gallery', name: 'Draw Gallery', description: 'Everyone draws the same prompt; a gallery.', playTime: '~10 min' }
];

function textResponse(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

describe('matchRecipe and drawing ideas', () => {
  it('tells the matcher that every recipe box is typed and a drawing idea with a vote is noMatch', async () => {
    const service = new AIService({ mode: 'real' });
    let system = '';
    service._callClaude = async (params) => {
      system = params.system;
      return textResponse({ noMatch: true, reason: 'drawing with a vote', suggestion: '' });
    };
    await service.matchRecipe('everyone draws a picture of me and then we vote on the best one', recipes, { games });
    expect(system).toContain('DRAWING IDEAS');
    expect(system).toMatch(/answer box is a TEXT box/);
    expect(system).toMatch(/drawing idea that also votes[^.]*is noMatch/);
    expect(system).toMatch(/Draw Gallery fits only draw-and-show/);
  });

  it('keeps the rule out of the forced refit (the recipe is already chosen there)', async () => {
    const service = new AIService({ mode: 'real' });
    let system = '';
    service._callClaude = async (params) => {
      system = params.system;
      return textResponse({ recipe: 'creative-vote', params: {} });
    };
    await service.matchRecipe('draw me', recipes, { forced: true });
    expect(system).not.toContain('DRAWING IDEAS');
  });
});
