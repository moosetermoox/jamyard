import { describe, it, expect } from 'vitest';
import { AIService } from '../../services/ai-service.js';

// Fresh-facts honesty (2026-09-10): the owner asked for a quiz about
// current events and the AI wrote confident questions about news it has
// never seen. Every prompt that writes facts now says "you only know up
// to your training data" and offers an escape hatch instead of a fake:
// needsTeacherFacts (quiz + bluff writers), cantBuild (storyboard),
// noMatch (matcher). Mock replies lead with a thinking block: these are
// Sonnet callers, and content[0].text would be undefined for them.

function reply(obj) {
  return { content: [{ type: 'thinking', thinking: '...' }, { type: 'text', text: JSON.stringify(obj) }] };
}

const RULE_MARK = 'training data ends';

describe('quiz question writer', () => {
  it('carries the fresh-facts rule and the needsTeacherFacts escape', async () => {
    const service = new AIService({ mode: 'real' });
    let prompt = '';
    service._callClaude = async (params) => {
      prompt = params.messages[0].content;
      return reply({ questions: [{ question: 'Good?', choices: ['yes', 'no'], correct: 'yes' }] });
    };
    const result = await service.generateQuizQuestions({ topic: 'the water cycle', count: 1 });
    expect(prompt).toContain(RULE_MARK);
    expect(prompt).toContain('needsTeacherFacts');
    expect(result.questions).toHaveLength(1);
  });

  it('passes the honest refusal through as a teacher-readable reason, never as questions', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => reply({
      needsTeacherFacts: true,
      reason: 'I do not know this month\'s news. Paste the facts and I will write the questions.'
    });
    const result = await service.generateQuizQuestions({ topic: 'this week\'s current events', count: 5 });
    expect(result.questions).toBeUndefined();
    expect(result.needsTeacherFacts).toBe(true);
    expect(result.error).toContain('Paste the facts');
  });

  it('fills in a default reason when the refusal comes bare', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => reply({ needsTeacherFacts: true });
    const result = await service.generateQuizQuestions({ topic: 'the latest election results' });
    expect(result.needsTeacherFacts).toBe(true);
    expect(result.error).toMatch(/recent events/);
  });
});

describe('bluff fact writer', () => {
  it('carries the rule and honors the refusal', async () => {
    const service = new AIService({ mode: 'real' });
    let prompt = '';
    service._callClaude = async (params) => {
      prompt = params.messages[0].content;
      return reply({ needsTeacherFacts: true, reason: 'I cannot see this season\'s standings.' });
    };
    const result = await service.generateBluffFacts({ topic: 'this season\'s NBA standings', count: 3 });
    expect(prompt).toContain(RULE_MARK);
    expect(prompt).toContain('needsTeacherFacts');
    expect(result.questions).toBeUndefined();
    expect(result.needsTeacherFacts).toBe(true);
    expect(result.error).toContain('standings');
  });
});

describe('storyboard builder', () => {
  it('carries the rule and routes it to cantBuild', async () => {
    const service = new AIService({ mode: 'real' });
    let prompt = '';
    service._callClaude = async (params) => {
      prompt = params.messages[0].content;
      return reply({ cantBuild: true, reason: 'I do not know recent events; paste the facts and I will build the quiz.' });
    };
    const result = await service.generateStoryboard('a quiz about this week\'s current events');
    expect(prompt).toContain(RULE_MARK);
    expect(prompt).toContain('return the cantBuild object');
    expect(result.cantBuild).toBe(true);
    expect(result.reason).toContain('paste the facts');
  });
});

describe('recipe matcher', () => {
  const recipes = [{ id: 'quiz-show', name: 'Quiz Show', description: 'Question rounds with a leaderboard.', parameters: {} }];

  it('carries the rule in both the free and the forced prompt, routed to noMatch', async () => {
    for (const options of [{}, { forced: true }]) {
      const service = new AIService({ mode: 'real' });
      let system = '';
      service._callClaude = async (params) => {
        system = params.system;
        return reply({ noMatch: true, reason: 'I do not know this week\'s news.', suggestion: 'Paste the facts or the questions themselves.' });
      };
      const result = await service.matchRecipe('a quiz on current events', recipes, options);
      expect(system).toContain(RULE_MARK);
      expect(system).toContain('return the noMatch shape');
      expect(result.noMatch).toBe(true);
      expect(result.suggestion).toContain('Paste the facts');
    }
  });
});
