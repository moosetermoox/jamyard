/**
 * Follow-up questions on the Create page (2026-10-04, owner): before a typed
 * idea is built, one or two short questions, only when the answer changes
 * the steps or the content, never about what the builder already has a
 * default or a control for. The filter here is the server's backstop under
 * the prompt; IdeaAnswers puts the teacher's answers into the idea text.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { isBannedIdeaQuestion, pickIdeaQuestions, MAX_IDEA_QUESTIONS } from '../../engine/idea-questions.js';
import { AIService } from '../../services/ai-service.js';

describe('isBannedIdeaQuestion', () => {
  it('drops what the builder already decides or the page already asks', () => {
    for (const q of [
      'How many minutes should this take?',
      'How long should the activity run?',
      'How many rounds do you want?',
      'Should there be a timer?',
      'What grade do you teach?',
      'How old are your students?',
      'What subject is this for?',
      'How many students are in your class?',
      'Should students see each other\'s names?',
      'Should answers be anonymous?',
      'What language should it be in?',
      'How big should the groups be?',
      'Can you describe the activity in more detail?',
      'Is this right?',
      'How many estimation questions should students answer?',
      'Should the fears be real or funny?',
      'What tone should the answers have?',
      "What's the big question students will answer?",
      'What question should the pairs debate?',
      'What topic should the questions cover?'
    ]) expect(isBannedIdeaQuestion(q), q).toBe(true);
  });

  it('keeps questions that change the steps or the content', () => {
    for (const q of [
      'Which questions should the buzzer round ask?',
      'Should students play alone or in teams?',
      'Should the quiz keep score?',
      'Which words and meanings should students match?',
      'What should students rank?'
    ]) expect(isBannedIdeaQuestion(q), q).toBe(false);
  });
});

describe('pickIdeaQuestions', () => {
  it('keeps at most two usable questions, drops banned and repeated ones', () => {
    const picked = pickIdeaQuestions([
      { question: 'How many minutes?' },
      { question: 'Which questions should the quiz ask?', kind: 'text' },
      { question: 'Which questions should the quiz ask?', kind: 'text' },
      { question: '' },
      null,
      { question: 'Should students play alone or in teams?', kind: 'choice', choices: ['Alone', 'Teams'] },
      { question: 'Should it keep score?' }
    ]);
    expect(MAX_IDEA_QUESTIONS).toBe(2);
    expect(picked.map(q => q.question)).toEqual(['Which questions should the quiz ask?', 'Should students play alone or in teams?']);
  });
  it('drops a choice question whose choices would be cut off on a chip', () => {
    const picked = pickIdeaQuestions([
      { question: 'What should students guess?', kind: 'choice', choices: ['A number you pick, like the beans in a jar', 'A real measurement'] },
      { question: 'Alone or in teams?', kind: 'choice', choices: ['Alone', 'Teams'] }
    ]);
    expect(picked.map(q => q.question)).toEqual(['Alone or in teams?']);
  });
  it('an empty or missing list asks nothing', () => {
    expect(pickIdeaQuestions(undefined)).toEqual([]);
    expect(pickIdeaQuestions([])).toEqual([]);
  });
});

describe('IdeaAnswers.combine (the answers become part of the idea)', async () => {
  const code = await readFile(new URL('../../screens/shared/idea-answers.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox);
  const { combine } = sandbox.window.IdeaAnswers;

  it('adds each answered question under the idea, as the teacher wrote it', () => {
    const out = combine('A Jeopardy-style buzzer game for review', [
      { question: 'Which questions should it ask?', answer: 'What is 7 x 8?\nWhat is 9 x 6?' },
      { question: 'Teams or alone?', answer: 'Teams' }
    ]);
    expect(out).toBe('A Jeopardy-style buzzer game for review\n\nMore from the teacher:\n- Which questions should it ask? What is 7 x 8?\nWhat is 9 x 6?\n- Teams or alone? Teams');
  });
  it('skipped or blank answers leave the idea as typed', () => {
    expect(combine('A poll on lunch', [])).toBe('A poll on lunch');
    expect(combine('A poll on lunch', [{ question: 'Which choices?', answer: '   ' }])).toBe('A poll on lunch');
  });
  it('a very long answer is capped so the idea stays a sensible size', () => {
    const out = combine('A quiz', [{ question: 'Which questions?', answer: 'x'.repeat(5000) }]);
    expect(out.length).toBeLessThan(2200);
  });
});

describe('AIService.generateIdeaQuestions', () => {
  it('mock mode asks nothing, so every sim and test runs the Create flow as before', async () => {
    const service = new AIService();
    expect(await service.generateIdeaQuestions('A Jeopardy-style buzzer game')).toEqual({ questions: [] });
  });

  it('real mode: Haiku, the idea and the class in the prompt, shaped and filtered output', async () => {
    const service = new AIService({ mode: 'real' });
    let sent = null;
    service._callClaude = async (params) => {
      sent = params;
      return { content: [{ type: 'text', text: 'Here:\n{"questions":[{"question":"What grade?"},{"question":"Which questions should the buzzer round ask?","kind":"text","placeholder":"Paste them, or name a topic"},{"question":"Teams or each student alone?","kind":"choice","choices":["Teams","Alone"]},{"question":"Keep score?"}]}' }] };
    };
    const result = await service.generateIdeaQuestions('A Jeopardy-style buzzer game for review', { classDescription: '7th grade science' });
    expect(sent.model).toMatch(/haiku/);
    const prompt = sent.messages[0].content;
    expect(prompt).toContain('A Jeopardy-style buzzer game for review');
    expect(prompt).toContain('7th grade science');
    expect(prompt).toMatch(/\{"questions":\[\]\}/); // asking nothing is the default answer
    expect(result.questions.map(q => q.question)).toEqual(['Which questions should the buzzer round ask?', 'Teams or each student alone?']);
    expect(result.questions[0].kind).toBe('text');
    expect(result.questions[1]).toMatchObject({ kind: 'choice', choices: ['Teams', 'Alone'] });
  });

  it('a failed call asks nothing (Create goes on to build)', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => { throw new Error('boom'); };
    expect(await service.generateIdeaQuestions('A quiz about volcanoes')).toEqual({ questions: [] });
  });
});
