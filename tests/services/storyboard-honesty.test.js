import { describe, it, expect } from 'vitest';
import { AIService } from '../../services/ai-service.js';

// Storyboard honesty (2026-08-22): the "Human or AI" one-shot produced a
// storyboard whose announce text PROMISED AI-written rival answers, while
// no brick can generate them. The storyboard prompt now forbids promising
// mechanics the bricks don't deliver, and the AI may answer cantBuild
// instead of faking the premise with words.

function textResponse(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

describe('generateStoryboard honesty', () => {
  it('carries the no-fake-mechanics rule and the cantBuild escape in the prompt', async () => {
    const service = new AIService({ mode: 'real' });
    let prompt = '';
    service._callClaude = async (params) => {
      prompt = params.messages[0].content;
      return textResponse({ name: 'X', description: 'y', steps: [{ brick: 'end', text: 'Bye' }] });
    };
    await service.generateStoryboard('a guessing game about anything');
    expect(prompt).toContain('cantBuild');
    expect(prompt).toContain('BE HONEST IN THE WORDS');
    expect(prompt.toLowerCase()).toContain('written by ai');
  });

  // 2026-08-25: "judge these questions, no winners" couldn't one-shot. The
  // prompt must offer the quiz brick's no-winners mode and forbid hand-rolled
  // collect-choice chains for teacher-supplied question lists.
  it('carries the no-winners quiz mode and the one-quiz-step rule in the prompt', async () => {
    const service = new AIService({ mode: 'real' });
    let prompt = '';
    service._callClaude = async (params) => {
      prompt = params.messages[0].content;
      return textResponse({ name: 'X', description: 'y', steps: [{ brick: 'end', text: 'Bye' }] });
    };
    await service.generateStoryboard('students judge each question, no winners');
    expect(prompt).toContain('leaderboard: false');
    expect(prompt).toContain('even with no winners');
    expect(prompt).toContain('never build a chain of separate collect-choice');
    expect(prompt).toContain('shuffled order');
  });

  it('returns the cantBuild shape when the AI declines', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => textResponse({
      cantBuild: true,
      reason: 'This needs AI-written rival answers, and no step can create them.'
    });
    const result = await service.generateStoryboard('students guess which answer an AI wrote');
    expect(result.cantBuild).toBe(true);
    expect(result.reason).toBe('This needs AI-written rival answers, and no step can create them.');
    expect(result.error).toBeUndefined();
  });

  it('defaults the reason when the AI declines without one', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => textResponse({ cantBuild: true });
    const result = await service.generateStoryboard('students guess which answer an AI wrote');
    expect(result.cantBuild).toBe(true);
    expect(typeof result.reason).toBe('string');
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it('passes a normal storyboard through unchanged', async () => {
    const service = new AIService({ mode: 'real' });
    const board = {
      name: 'Exit Ticket',
      description: 'A quick share-out.',
      steps: [
        { brick: 'announce', text: 'Welcome!' },
        { brick: 'collect', text: 'What stuck with you today?' },
        { brick: 'reveal', text: 'Here is what we said.' },
        { brick: 'end', text: 'See you tomorrow.' }
      ]
    };
    service._callClaude = async () => textResponse(board);
    const result = await service.generateStoryboard('a quick end of class share');
    expect(result).toEqual(board);
  });
});
