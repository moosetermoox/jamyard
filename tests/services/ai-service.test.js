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

  // The setup card (2026-09-13): one question the wording hangs on, a
  // second only when the content depends on it, never a third.
  it('real mode parses JSON wrapped in preamble and caps at 2', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => ({
      content: [{ type: 'text', text: 'Sure! Here you go:\n{"questions":[{"question":"What subject?","placeholder":"e.g. biology"},{"question":"Grade?"},{"question":"Tone?"}]}' }]
    });
    const result = await service.generateCustomizeQuestions(config);
    expect(result.questions.length).toBe(2);
    expect(result.questions[0]).toEqual({ question: 'What subject?', label: 'What subject', kind: 'text', choices: [], placeholder: 'e.g. biology' });
    expect(result.questions[1].placeholder).toBe('');
  });

  it('a choice question keeps its choices, tidied; too few choices makes it a text question', () => {
    const q = AIService.shapeCustomizeQuestion({
      question: 'How long should answers be?', label: 'Answers you expect', kind: 'choice',
      choices: [' A word or two ', 'One sentence', 'one sentence', '', 42, 'A list', 'A paragraph', 'A page', 'An essay']
    });
    expect(q).toEqual({
      question: 'How long should answers be?', label: 'Answers you expect', kind: 'choice',
      choices: ['A word or two', 'One sentence', 'A list', 'A paragraph', 'A page', 'An essay'], placeholder: ''
    });
    const lone = AIService.shapeCustomizeQuestion({ question: 'Which book?', kind: 'choice', choices: ['Only one'], placeholder: 'e.g. Holes' });
    expect(lone.kind).toBe('text');
    expect(lone.choices).toEqual([]);
    expect(lone.label).toBe('Which book');
  });

  // A real run asked "What kind of answers do you want students to give:
  // short phrases, full sentences, or a mix?" over the same three chips
  // (owner: "it's asking the same question twice", 2026-09-13)
  it('a choice question that lists its choices loses the list; a text question keeps its colon', () => {
    const listed = AIService.shapeCustomizeQuestion({
      question: 'What kind of answers do you want students to give: short phrases, full sentences, or a mix?',
      kind: 'choice', choices: ['Short phrases', 'Full sentences', 'A mix']
    });
    expect(listed.question).toBe('What kind of answers do you want students to give?');
    const typed = AIService.shapeCustomizeQuestion({ question: 'Paste the facts: one per line', kind: 'text', placeholder: 'x'.repeat(100) });
    expect(typed.question).toBe('Paste the facts: one per line');
    expect(typed.placeholder.length).toBe(70);
  });

  it('the prompt asks one question for the whole activity, never one per round, and short ones', async () => {
    const service = new AIService({ mode: 'real' });
    let sentPrompt = '';
    service._callClaude = async (req) => {
      sentPrompt = req.messages[0].content;
      return { content: [{ type: 'text', text: '{"questions":[]}' }] };
    };
    await service.generateCustomizeQuestions(config);
    expect(sentPrompt).toContain('never one per round or per step');
    expect(sentPrompt).toContain('must NOT list the choices');
    expect(sentPrompt).toContain('under ten words');
  });

  it('the prompt asks for one question, a second only if needed, and names the two kinds', async () => {
    const service = new AIService({ mode: 'real' });
    let sentPrompt = '';
    service._callClaude = async (req) => {
      sentPrompt = req.messages[0].content;
      return { content: [{ type: 'text', text: '{"questions":[]}' }] };
    };
    await service.generateCustomizeQuestions(config);
    expect(sentPrompt).toContain('Ask ONE short question');
    expect(sentPrompt).toContain('Never a third');
    expect(sentPrompt).toContain('"choice" when the answer is a SHAPE');
    expect(sentPrompt).toContain('"text" when the answer is a specific THING');
    expect(sentPrompt).toContain('Never guess facts');
    // Timers, rounds, grade, subject have controls on the page (a real run
    // asked "how long should students spend writing alone", 2026-09-13)
    expect(sentPrompt).toContain('NEVER ask about timing, timers, minutes, how many rounds, group sizes, grade, or subject');
  });

  it('mock mode leads with a choice question so the page can be exercised', async () => {
    const service = new AIService();
    const result = await service.generateCustomizeQuestions(config);
    expect(result.questions[0].kind).toBe('choice');
    expect(result.questions[0].choices.length).toBeGreaterThanOrEqual(3);
    expect(result.questions[0].label).toBeTruthy();
    expect(result.questions[1].kind).toBe('text');
  });

  it('real-mode failure degrades to an empty list, never throws', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => { throw new Error('api down'); };
    const result = await service.generateCustomizeQuestions(config);
    expect(result.questions).toEqual([]);
  });

  // The teacher's saved profile must not be re-asked ("you already asked me
  // my subject" - field feedback 2026-08-09).
  it('real mode tells the model the known class and forbids re-asking it', async () => {
    const service = new AIService({ mode: 'real' });
    let sentPrompt = '';
    service._callClaude = async (req) => {
      sentPrompt = req.messages[0].content;
      return { content: [{ type: 'text', text: '{"questions":[{"question":"Which unit are you on?"}]}' }] };
    };
    await service.generateCustomizeQuestions(config, 'Middle school (6-8), Science');
    expect(sentPrompt).toContain('Middle school (6-8), Science');
    expect(sentPrompt).toContain('Do not ask about grade level, age, or subject');
  });

  // Setup knobs the dialog renders (round count, timers) must not be
  // re-asked as interview questions (trivia-bluff rounds knob, 2026-08-16).
  it('real mode tells the model the dialog\'s setting knobs and forbids re-asking them', async () => {
    const service = new AIService({ mode: 'real' });
    let sentPrompt = '';
    service._callClaude = async (req) => {
      sentPrompt = req.messages[0].content;
      return { content: [{ type: 'text', text: '{"questions":[{"question":"What topic?"}]}' }] };
    };
    await service.generateCustomizeQuestions(config, '', ['How many rounds', 'Lie-writing time (seconds)']);
    expect(sentPrompt).toContain('How many rounds');
    expect(sentPrompt).toContain('Never ask about any of those');
  });

  it('no knobs = no settings block in the prompt', async () => {
    const service = new AIService({ mode: 'real' });
    let sentPrompt = '';
    service._callClaude = async (req) => {
      sentPrompt = req.messages[0].content;
      return { content: [{ type: 'text', text: '{"questions":[]}' }] };
    };
    await service.generateCustomizeQuestions(config, '', []);
    expect(sentPrompt).not.toContain('ALREADY HAS setting controls');
  });

  it('mock mode with a known class asks deeper questions, not subject or grade', async () => {
    const service = new AIService();
    const result = await service.generateCustomizeQuestions(config, 'Middle school (6-8), Science');
    expect(result.questions.length).toBeGreaterThanOrEqual(2);
    for (const q of result.questions) {
      expect(q.question.toLowerCase()).not.toContain('subject');
      expect(q.question.toLowerCase()).not.toContain('grade');
      expect(q.question.toLowerCase()).not.toContain('who is it for');
    }
  });
});

// Concierge: suggestions must parse and degrade safely.
describe('generateSuggestions', () => {
  const args = {
    occasion: 'Review material', topic: 'fractions', time: '10 to 20 minutes',
    games: [{ id: 'vocab-match', name: 'Vocab Match', description: 'Match words', playTime: '~10 min' }],
    recipes: [{ id: 'question-share', name: 'Question & Share', description: 'Open question', parameters: { question: {}, timer: {} } }]
  };

  it('mock mode returns suggestions referencing real things', async () => {
    const service = new AIService();
    const result = await service.generateSuggestions(args);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions[0].kind).toBe('host');
    expect(result.suggestions[0].id).toBe('vocab-match');
  });

  it('real mode parses preamble-wrapped JSON', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => ({
      content: [{ type: 'text', text: 'Here:\n{"suggestions":[{"kind":"host","id":"vocab-match","why":"Fits review."}],"note":null}' }]
    });
    const result = await service.generateSuggestions(args);
    expect(result.suggestions).toEqual([{ kind: 'host', id: 'vocab-match', why: 'Fits review.' }]);
  });

  it('real-mode failure degrades to empty suggestions, never throws', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => { throw new Error('api down'); };
    const result = await service.generateSuggestions(args);
    expect(result.suggestions).toEqual([]);
  });
});

describe('repairJsonStringQuotes (unescaped-quote model output)', () => {
  // The someones-got-you incident (2026-08-16): the config's typographic
  // “{{notes.assigned}}” came back from Sonnet as straight quotes inside
  // a JSON string, unescaped — unparseable, and a prompt rule alone did
  // not stop the normalization. The repair escapes interior quotes whose
  // next non-whitespace char can't legally follow a string.
  it('escapes interior quotes around a token', async () => {
    const { repairJsonStringQuotes } = await import('../../services/ai-service.js');
    const broken = '{"prompt": "A classmate wrote:\\n\\n"{{notes.assigned}}"\\n\\nWrite ONE line."}';
    const parsed = JSON.parse(repairJsonStringQuotes(broken));
    expect(parsed.prompt).toContain('"{{notes.assigned}}"');
    expect(parsed.prompt).toContain('Write ONE line.');
  });

  it('leaves valid JSON byte-identical', async () => {
    const { repairJsonStringQuotes } = await import('../../services/ai-service.js');
    const valid = JSON.stringify({ a: 'text with \\ and "escaped" quotes', b: [1, 2], c: { d: 'x' } });
    expect(repairJsonStringQuotes(valid)).toBe(valid);
  });

  it('reviseGame recovers a response with unescaped interior quotes', async () => {
    const { AIService } = await import('../../services/ai-service.js');
    const service = new AIService({ mode: 'real' });
    const cfg = {
      name: 'T',
      phases: {
        lobby: { type: 'lobby', next: 'end' },
        end: { type: 'end' }
      }
    };
    const brokenEnvelope =
      '{"updatedConfig": {"name": "T", "phases": {"lobby": {"type": "lobby", "next": "end"}, ' +
      '"end": {"type": "end", "message": "He said "cowabunga" and left."}}}, "summary": "Themed it."}';
    service._callClaude = async () => ({ content: [{ type: 'text', text: brokenEnvelope }] });
    const result = await service.reviseGame({ config: cfg, request: 'theme it' });
    expect(result.updatedConfig.phases.end.message).toBe('He said "cowabunga" and left.');
    expect(result.summary).toBe('Themed it.');
  });
});

describe('reviseGame envelope tolerance', () => {
  // Found by the 2026-08-08 persona field test: Sonnet sometimes returns the
  // revised config BARE (valid JSON, no {updatedConfig, summary} envelope),
  // which read as "AI response missing updatedConfig" and silently degraded
  // the library's Customize flow to a plain copy.
  const config = {
    name: 'Test Game',
    phases: { lobby: { type: 'lobby', next: 'ask' }, ask: { type: 'collect', prompt: 'Hi?', next: 'end' }, end: { type: 'end' } }
  };

  it('accepts the proper envelope', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => ({
      content: [{ type: 'text', text: JSON.stringify({ updatedConfig: config, summary: 'Did the thing.' }) }]
    });
    const result = await service.reviseGame({ config, request: 'test' });
    expect(result.updatedConfig.phases.ask.prompt).toBe('Hi?');
    expect(result.summary).toBe('Did the thing.');
  });

  it('accepts a bare config returned without the envelope', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => ({
      content: [{ type: 'text', text: JSON.stringify(config) }]
    });
    const result = await service.reviseGame({ config, request: 'test' });
    expect(result.updatedConfig.phases.ask.prompt).toBe('Hi?');
    expect(typeof result.summary).toBe('string');
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it('still rejects JSON that is neither envelope nor config', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => ({
      content: [{ type: 'text', text: '{"message": "sure, here you go"}' }]
    });
    await expect(service.reviseGame({ config, request: 'test' })).rejects.toThrow(/updatedConfig/);
  });
});

describe('generateQuizQuestions (quiz Customize panel)', () => {
  it('mock mode returns the requested number of well-formed questions', async () => {
    const service = new AIService();
    const result = await service.generateQuizQuestions({ topic: 'the water cycle', count: 3 });
    expect(result.questions).toHaveLength(3);
    for (const q of result.questions) {
      expect(q.question).toContain('the water cycle');
      expect(q.choices.length).toBeGreaterThanOrEqual(2);
      expect(q.choices).toContain(q.correct);
    }
  });

  it('defaults to 5 questions when count is missing or out of range', async () => {
    const service = new AIService();
    expect((await service.generateQuizQuestions({ topic: 'x y z' })).questions).toHaveLength(5);
    expect((await service.generateQuizQuestions({ topic: 'x y z', count: 99 })).questions).toHaveLength(5);
  });

  it('real mode cleans the AI output through the drop-dont-fail gate', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => ({
      content: [{ type: 'text', text: 'Sure! Here you go: ' + JSON.stringify({
        questions: [
          { question: 'Good?', choices: ['yes', 'no'], correct: 'yes' },
          { question: 'Bad?', choices: ['a', 'b'], correct: 'nope' }
        ]
      }) }]
    });
    const result = await service.generateQuizQuestions({ topic: 'anything here', count: 5 });
    expect(result.questions).toEqual([{ question: 'Good?', choices: ['yes', 'no'], correct: 'yes' }]);
  });

  it('real mode returns a friendly error when nothing usable comes back', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => ({
      content: [{ type: 'text', text: '{"questions": []}' }]
    });
    const result = await service.generateQuizQuestions({ topic: 'anything here' });
    expect(result.error).toMatch(/could not write usable questions/);
  });

  it('rethrows budget errors so the route can 429', async () => {
    const service = new AIService({ mode: 'real' });
    const budgetErr = new Error('cap');
    budgetErr.name = 'AiBudgetError';
    service._callClaude = async () => { throw budgetErr; };
    await expect(service.generateQuizQuestions({ topic: 'anything here' })).rejects.toThrow('cap');
  });
});

describe('generateBluffFacts (bluff Customize panel)', () => {
  it('mock mode returns the requested number of well-formed facts', async () => {
    const service = new AIService();
    const result = await service.generateBluffFacts({ topic: 'ocean animals', count: 4 });
    expect(result.questions).toHaveLength(4);
    for (const q of result.questions) {
      expect(q.question).toContain('ocean animals');
      expect(q.question).toContain('___');
      expect(q.truth.length).toBeGreaterThan(0);
      expect(typeof q.houseLie).toBe('string');
    }
  });

  it('defaults to 3 facts when count is missing or out of range', async () => {
    const service = new AIService();
    expect((await service.generateBluffFacts({ topic: 'x y z' })).questions).toHaveLength(3);
    expect((await service.generateBluffFacts({ topic: 'x y z', count: 99 })).questions).toHaveLength(3);
  });

  it('real mode cleans the AI output through the drop-dont-fail gate', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => ({
      content: [{ type: 'text', text: 'Sure! Here you go: ' + JSON.stringify({
        questions: [
          { question: 'A group of flamingos is a ___.', truth: 'flamboyance', houseLie: 'flock' },
          { question: 'No blank in this one.', truth: 'x', houseLie: 'y' }
        ]
      }) }]
    });
    const result = await service.generateBluffFacts({ topic: 'anything here', count: 5 });
    expect(result.questions).toEqual([
      { question: 'A group of flamingos is a ___.', truth: 'flamboyance', houseLie: 'flock' }
    ]);
  });

  it('real mode returns a friendly error when nothing usable comes back', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => ({
      content: [{ type: 'text', text: '{"questions": []}' }]
    });
    const result = await service.generateBluffFacts({ topic: 'anything here' });
    expect(result.error).toMatch(/could not write usable facts/);
  });

  it('rethrows budget errors so the route can 429', async () => {
    const service = new AIService({ mode: 'real' });
    const budgetErr = new Error('cap');
    budgetErr.name = 'AiBudgetError';
    service._callClaude = async () => { throw budgetErr; };
    await expect(service.generateBluffFacts({ topic: 'anything here' })).rejects.toThrow('cap');
  });
});

describe('generatePhraseList (Doodle Bluff\'s "Write the phrases", 2026-09-13)', () => {
  it('mock mode writes 36 by default, or the count asked for', async () => {
    const service = new AIService();
    const a = await service.generatePhraseList({ topic: 'the water cycle' });
    expect(a.phrases).toHaveLength(36);
    expect(a.phrases[0]).toContain('the water cycle');
    const b = await service.generatePhraseList({ topic: 'Rome', count: 5 });
    expect(b.phrases).toHaveLength(5);
    const c = await service.generatePhraseList({ topic: 'Rome', count: 500 });
    expect(c.phrases).toHaveLength(36);
  });
});
