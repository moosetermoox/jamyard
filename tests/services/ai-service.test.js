import { describe, it, expect } from 'vitest';
import { AIService } from '../../services/ai-service.js';

describe('AIService', () => {
  describe('creation', () => {
    it('can be created in mock mode by default', () => {
      const service = new AIService();
      expect(service.mode).toBe('mock');
    });

    it('can be created with mode: real', () => {
      const service = new AIService({ mode: 'real' });
      expect(service.mode).toBe('real');
    });
  });

  // COPPA/FERPA data minimization: prompts sent to the API must carry
  // pseudonymous playerIds only — a student NAME in the outbound message
  // is a regression, full stop.
  describe('_buildUserMessage — no student names leave the server', () => {
    const service = new AIService();
    const responses = [
      { playerId: 'abc123', name: 'Maya', text: 'a robot who\'s scared of stairs' },
      { playerId: 'def456', name: 'Dev', text: 'my dog ate the wifi' }
    ];

    it('includes playerIds and answer text, never names', () => {
      const msg = service._buildUserMessage('Group similar answers.', responses);
      expect(msg).toContain('abc123');
      expect(msg).toContain('a robot who\'s scared of stairs');
      expect(msg).not.toContain('Maya');
      expect(msg).not.toContain('Dev');
    });

    it('handles responses without playerIds (literal inputs)', () => {
      const msg = service._buildUserMessage('Summarize.', [{ text: 'just a string input' }]);
      expect(msg).toContain('just a string input');
      expect(msg).not.toContain('undefined');
    });
  });

  // Boundary test: stub the API call itself and inspect exactly what
  // would leave the server. Free-text PII (typed names, emails, phones)
  // must be scrubbed — and the classroom's own copy must NOT be mutated.
  describe('outbound PII scrub (real-mode boundary)', () => {
    function capturingService() {
      const service = new AIService({ mode: 'real' });
      const captured = {};
      service._callClaude = async (params) => {
        captured.params = params;
        return { content: [{ type: 'text', text: 'ok' }], usage: {} };
      };
      return { service, captured };
    }

    it('scrubs roster names and contact patterns from responses and instructions', async () => {
      const { service, captured } = capturingService();
      const responses = [
        { playerId: 'p1', name: 'Maya', text: 'Maya and Dev went to maya@example.com or 555-123-4567' }
      ];
      await service.process({
        instruction: 'Summarize. Earlier Maya said: hello',
        responses,
        rosterNames: ['Maya', 'Dev']
      });
      const outbound = captured.params.messages[0].content;
      expect(outbound).not.toMatch(/Maya|Dev/);
      expect(outbound).not.toContain('maya@example.com');
      expect(outbound).not.toContain('555-123-4567');
      expect(outbound).toContain('someone');
      // The classroom's copy is untouched — scrubbing is copy-only.
      expect(responses[0].text).toContain('Maya and Dev');
    });

    it('generateFakeResponses scrubs its style examples', async () => {
      const { service, captured } = capturingService();
      await service.generateFakeResponses({
        instruction: 'Make fakes.',
        responses: [{ text: 'ask Maya at 555-123-4567' }],
        count: 1,
        rosterNames: ['Maya']
      });
      const outbound = captured.params.messages[0].content;
      expect(outbound).not.toContain('Maya');
      expect(outbound).not.toContain('555-123-4567');
    });
  });

  describe('process()', () => {
    it('returns a Promise', () => {
      const service = new AIService();
      const result = service.process({
        instruction: 'Test instruction',
        responses: []
      });
      expect(result).toBeInstanceOf(Promise);
    });

    it('accepts an instruction and array of responses', async () => {
      const service = new AIService();
      const input = {
        instruction: 'Write a poem about these weekend activities',
        responses: [
          { name: 'Alex', text: 'I went hiking' },
          { name: 'Sam', text: 'I slept' }
        ]
      };

      // Should not throw
      const result = await service.process(input);
      expect(result).toBeDefined();
    });

    it('returns a result object with a text property', async () => {
      const service = new AIService();
      const result = await service.process({
        instruction: 'Test instruction',
        responses: [{ name: 'Test', text: 'Test response' }]
      });

      expect(result).toHaveProperty('text');
      expect(typeof result.text).toBe('string');
    });

    it('includes the number of responses in mock output', async () => {
      const service = new AIService();
      const result = await service.process({
        instruction: 'Test instruction',
        responses: [
          { name: 'Alex', text: 'Response 1' },
          { name: 'Sam', text: 'Response 2' },
          { name: 'Jordan', text: 'Response 3' }
        ]
      });

      expect(result.text).toContain('3');
    });

    it('mock output mentions it is a mock', async () => {
      const service = new AIService();
      const result = await service.process({
        instruction: 'Test instruction',
        responses: [{ name: 'Test', text: 'Test response' }]
      });

      expect(result.text.toLowerCase()).toContain('mock');
    });
  });

  describe('review()', () => {
    const basicConfig = {
      name: 'Test Game',
      phases: {
        lobby: { type: 'lobby', next: 'collect-1' },
        'collect-1': { type: 'collect', prompt: 'What do you think?', next: 'process-1' },
        'process-1': { type: 'ai-process', task: 'summarize', instruction: 'Summarize all responses', input: 'collect-1.responses', next: 'reveal-1' },
        'reveal-1': { type: 'reveal', template: '{{process-1.result}}', next: 'end' },
        end: { type: 'end', message: 'Thanks!' }
      }
    };

    it('returns a Promise', () => {
      const service = new AIService();
      const result = service.review({ config: basicConfig });
      expect(result).toBeInstanceOf(Promise);
    });

    it('returns issues array and summary string', async () => {
      const service = new AIService();
      const result = await service.review({ config: basicConfig });
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('summary');
      expect(Array.isArray(result.issues)).toBe(true);
      expect(typeof result.summary).toBe('string');
    });

    it('flags ai-process phases with empty instructions', async () => {
      const service = new AIService();
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'p1' },
          p1: { type: 'ai-process', task: 'summarize', instruction: '', input: 'x.responses', next: 'end' },
          end: { type: 'end' }
        }
      };
      const result = await service.review({ config });
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0].phaseId).toBe('p1');
      expect(result.issues[0].severity).toBe('warning');
    });

    it('returns no issues for well-configured games', async () => {
      const service = new AIService();
      const result = await service.review({ config: basicConfig, depth: 'light' });
      expect(result.issues.length).toBe(0);
    });

    it('deep review suggests timers on collect phases without them', async () => {
      const service = new AIService();
      const result = await service.review({ config: basicConfig, depth: 'deep' });
      // basicConfig has no timer on collect-1, so deep review should suggest one
      expect(result.issues.length).toBeGreaterThan(0);
      const timerIssue = result.issues.find(i => i.phaseId === 'collect-1');
      expect(timerIssue).toBeDefined();
      expect(timerIssue.severity).toBe('suggestion');
    });

    it('mock summary mentions MOCK', async () => {
      const service = new AIService();
      const result = await service.review({ config: basicConfig });
      expect(result.summary).toContain('MOCK');
    });

    it('issues have required fields', async () => {
      const service = new AIService();
      const config = {
        name: 'Test',
        phases: {
          lobby: { type: 'lobby', next: 'p1' },
          p1: { type: 'ai-process', task: 'compare', instruction: 'Do it', input: 'x.responses', next: 'end' },
          end: { type: 'end' }
        }
      };
      const result = await service.review({ config });
      for (const issue of result.issues) {
        expect(issue).toHaveProperty('phaseId');
        expect(issue).toHaveProperty('severity');
        expect(issue).toHaveProperty('message');
      }
    });

    it('defaults to light depth', async () => {
      const service = new AIService();
      // Config with no issues for light review
      const result = await service.review({ config: basicConfig });
      // Light review on a good config should return 0 issues
      expect(result.issues.length).toBe(0);
    });
  });
});

// Library Customize: quick tailoring questions before the copy opens.
describe('generateCustomizeQuestions', () => {
  const config = {
    name: 'Vocab Match',
    description: 'Match words to definitions',
    phases: {
      lobby: { type: 'lobby', next: 'round' },
      round: { type: 'match', prompt: 'Match each word', pairs: [], next: 'end' },
      end: { type: 'end' }
    }
  };

  it('mock mode returns usable questions', async () => {
    const service = new AIService();
    const result = await service.generateCustomizeQuestions(config);
    expect(result.questions.length).toBeGreaterThanOrEqual(2);
    for (const q of result.questions) {
      expect(typeof q.question).toBe('string');
      expect(q.question.length).toBeGreaterThan(0);
    }
  });

  it('real mode parses JSON wrapped in preamble and caps at 3', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => ({
      content: [{ type: 'text', text: 'Sure! Here you go:\n{"questions":[{"question":"What subject?","placeholder":"e.g. biology"},{"question":"Grade?"},{"question":"Tone?"},{"question":"Extra one"}]}' }]
    });
    const result = await service.generateCustomizeQuestions(config);
    expect(result.questions.length).toBe(3);
    expect(result.questions[0]).toEqual({ question: 'What subject?', placeholder: 'e.g. biology' });
    expect(result.questions[1].placeholder).toBe('');
  });

  it('real-mode failure degrades to an empty list, never throws', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => { throw new Error('api down'); };
    const result = await service.generateCustomizeQuestions(config);
    expect(result.questions).toEqual([]);
  });
});
