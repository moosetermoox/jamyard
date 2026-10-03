/**
 * A reviewer's Create-page findings on jamyard.org (2026-10-02, round d):
 * keyboard mash read as a missing feature, a 25-question ask quietly made
 * 8, Get ideas put a ten-minute idea on top of "The whole period" and lost
 * the topic on the way to the make page, and two copies in My yard shared
 * one name.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { looksUnclear, UNCLEAR_LINE } from '../../engine/unclear-idea.js';
import {
  askedQuestionCount, builtQuestionCount, capPlanQuestions, questionCapFor, questionCountNote, MAX_QUIZ_QUESTIONS
} from '../../engine/question-count.js';
import { timeWindow, rankByTime, timeNote, missBy } from '../../engine/suggest-time.js';
import { AIService } from '../../services/ai-service.js';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

describe('an unclear idea is said plainly, never as a missing trick', () => {
  it('reads keyboard mash as unclear', () => {
    for (const t of ['asdfghjkl qwerty', 'jfkdlsjfkldsjfkl', 'aaaaaaaaaaaa', '12345 6789 !!!', 'hjkl hjkl hjkl']) {
      expect(looksUnclear(t), t).toBe(true);
    }
  });

  it('lets real ideas through, in other languages too', () => {
    for (const t of [
      'a quick poll on the causes of the Civil War',
      'Una encuesta rápida sobre los colores',
      'students write haiku and vote',
      'Strengths and rhythm drills',
      'Kahoot style review of WWII',
      '光合作用的小测验'
    ]) {
      expect(looksUnclear(t), t).toBe(false);
    }
  });

  it('the line asks for a sentence and names no missing feature', () => {
    expect(UNCLEAR_LINE).toMatch(/couldn't tell what you want to make/);
    expect(UNCLEAR_LINE).toMatch(/in a sentence/);
    expect(UNCLEAR_LINE).not.toMatch(/trick/);
  });

  it('both Create routes check before any AI call, and the plan reply can say so too', () => {
    const server = read('server.js');
    expect(server).toContain("return res.json({ unclear: true, reason: UNCLEAR_LINE });");
    expect(server).toContain("return { status: 200, json: { unclear: true, reason: UNCLEAR_LINE } };");
    const ai = new AIService();
    expect(ai._parseStoryboard('{"unclear": true}')).toEqual({ unclear: true });
    expect(read('services/ai-service.js')).toContain('return ONLY {"unclear": true}');
  });

  it('the Create page keeps the idea box open with the line, and the plan dialog titles it', () => {
    const js = read('screens/designer/designer.js');
    expect(js).toContain('if (data.unclear) {');
    expect(js).toContain("title.textContent = 'We couldn\\'t tell what you want to make';");
  });
});

describe('the questions asked for against the questions made', () => {
  it('reads the count from the idea', () => {
    expect(askedQuestionCount('a quiz with 25 questions on photosynthesis')).toBe(25);
    expect(askedQuestionCount('twenty-five trivia questions about space')).toBe(25);
    expect(askedQuestionCount('a 10-question quiz on fractions')).toBe(10);
    expect(askedQuestionCount('10 multiple choice questions about WWII')).toBe(10);
    expect(askedQuestionCount('a five minute poll')).toBe(null);
  });

  it('counts a recipe match and a plan', () => {
    expect(builtQuestionCount({ params: { questions: new Array(8).fill({}) } })).toBe(8);
    expect(builtQuestionCount({ steps: [{ brick: 'announce' }, { brick: 'quiz', questions: [1, 2, 3] }, { brick: 'solo-quiz', questions: [1] }] })).toBe(4);
    expect(builtQuestionCount({ params: { question: 'x' } })).toBe(null);
    expect(builtQuestionCount({ steps: [{ brick: 'collect' }] })).toBe(null);
  });

  it('says the difference on the card, and nothing when they match', () => {
    const note = questionCountNote(25, 8);
    expect(note).toContain('You asked for 25 questions and this has 8.');
    expect(note).toContain('A quiz holds up to ' + MAX_QUIZ_QUESTIONS + ' questions.');
    expect(questionCountNote(25, 20)).toContain('Make a second quiz for the rest.');
    expect(questionCountNote(10, 10)).toBe(null);
    expect(questionCountNote(null, 8)).toBe(null);
    expect(questionCountNote(10, 8)).not.toContain('holds up to');
  });

  it('a plan longer than a quiz holds is cut so it still builds', () => {
    const plan = { steps: [{ brick: 'quiz', questions: new Array(25).fill(0) }, { brick: 'solo-quiz', questions: new Array(40).fill(0) }] };
    capPlanQuestions(plan);
    expect(plan.steps[0].questions).toHaveLength(20);
    expect(plan.steps[1].questions).toHaveLength(30);
    expect(questionCapFor(plan)).toBe(30);
    expect(questionCapFor({ steps: [{ brick: 'quiz' }] })).toBe(20);
  });

  it('the quiz brick and the concierge hold the same 20 as the recipes', () => {
    expect(read('screens/shared/step-suggestions.js')).toMatch(/var MAX_QUIZ_QUESTIONS = 20;/);
    expect(read('engine/suggest-validate.js')).toMatch(/const MAX_QUIZ_QUESTIONS = 20;/);
  });

  it('the matcher has room for a full quiz and both routes send the note', () => {
    const ai = read('services/ai-service.js');
    expect(ai).toMatch(/model: MODELS\.haiku,\s*\n(?:\s*\/\/.*\n)*\s*max_tokens: 4000,\s*\n\s*system: systemPrompt,/);
    expect(ai).toContain('When the teacher names how many quiz questions they want, write that many');
    const server = read('server.js');
    expect(server).toContain('questionNote: questionCountNote(askedQuestionCount(description), builtQuestionCount({ params: match.params })),');
    expect(server).toContain('return { status: 200, json: { storyboard, settings, ideaId, questionNote } };');
    const js = read('screens/designer/designer.js');
    expect(js).toContain('appendQuestionNote(modal, data.questionNote);');
    expect(js).toContain('appendQuestionNote(modal, resp && resp.questionNote);');
  });
});

describe('Get ideas fits the time picked', () => {
  it('reads the four chips as windows', () => {
    expect(timeWindow('The whole period')).toMatchObject({ min: 30, max: 60 });
    expect(timeWindow('Half the period')).toMatchObject({ min: 15, max: 30 });
    expect(timeWindow('10 to 20 minutes')).toMatchObject({ min: 10, max: 20 });
    expect(timeWindow('About 5 minutes')).toMatchObject({ min: 1, max: 8 });
    expect(timeWindow('')).toBe(null);
  });

  it('the chips match the dialog word for word', () => {
    const js = read('screens/designer/designer.js');
    const m = /var CONCIERGE_TIMES = \[([^\]]*)\]/.exec(js);
    const chips = m[1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
    for (const c of chips) expect(timeWindow(c), c).not.toBe(null);
  });

  it('puts what fills the whole period first, the AI order breaking ties', () => {
    const win = timeWindow('The whole period');
    const ranked = rankByTime([
      { id: 'short', minutes: 10 },
      { id: 'none', minutes: null },
      { id: 'long', minutes: 35 },
      { id: 'mid', minutes: 22 },
      { id: 'long2', minutes: 40 }
    ], win);
    expect(ranked.map(s => s.id)).toEqual(['long', 'long2', 'mid', 'short', 'none']);
    expect(missBy(10, win)).toBe(20);
  });

  it('says so when nothing fills the time, from the computed minutes', () => {
    const win = timeWindow('The whole period');
    expect(timeNote([{ minutes: 10 }, { minutes: 12 }], win)).toContain('the longest runs about 12 minutes');
    expect(timeNote([{ minutes: 35 }], win)).toBe(null);
    expect(timeNote([{ minutes: 10 }], null)).toBe(null);
  });

  it('the route estimates every idea and ranks them; the card shows the computed time', () => {
    const server = read('server.js');
    expect(server).toContain('const suggestions = rankByTime(enriched, win);');
    expect(server).toContain('minutes: minutesOfConfig(config)');
    const js = read('screens/designer/designer.js');
    expect(js).toContain("' · about ' + s.minutes + ' min'");
    expect(read('services/ai-service.js')).toContain('Never state a running time in "why"');
  });
});

describe('Get ideas carries the topic to the make page', () => {
  it('Make it yours on a ready-made idea sends the topic as the idea the pair writer takes', () => {
    const js = read('screens/designer/designer.js');
    expect(js).toContain("(topic ? '&idea=' + encodeURIComponent(String(topic).slice(0, 200)) : '')");
    expect(js).toContain('renderConciergeResults(result.data, resultsEl, status, overlay, topic);');
    expect(read('screens/make/make.js')).toContain("var ideaText = (params.get('idea') || '').slice(0, 200);");
  });

  it('a ready-made idea never promises content it does not hold', () => {
    expect(read('services/ai-service.js')).toContain('it never says the activity already holds the topic\'s content');
  });
});

describe('a new copy never shares a name with one of this browser\'s copies', () => {
  const src = read('screens/shared/make-it-yours.js');
  const ctx = { window: {}, console };
  ctx.window.window = ctx.window;
  vm.runInNewContext(src, ctx);
  const unique = ctx.window.MakeItYours.uniqueCopyName;

  it('counts up a my-version name', () => {
    expect(unique('Solo Quiz (my version)', ['Solo Quiz (my version)'])).toBe('Solo Quiz (my version 2)');
    expect(unique('Solo Quiz (my version)', ['Solo Quiz (my version)', 'solo quiz (my version 2)'])).toBe('Solo Quiz (my version 3)');
    expect(unique('Solo Quiz (my version)', [])).toBe('Solo Quiz (my version)');
  });

  it('counts up any other name', () => {
    expect(unique('Live Poll: Pizza or tacos', ['Live Poll: Pizza or tacos'])).toBe('Live Poll: Pizza or tacos (2)');
  });

  it('every first save and every draft copy goes through it', () => {
    expect(src).toContain('config.name = uniqueCopyName(config.name, ownNames);\n    return postCopy(config);');
    expect(src.split('uniqueCopyName(config.name, ownNames)').length - 1).toBe(2);
  });
});
