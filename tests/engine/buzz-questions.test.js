/**
 * A buzzer round with the teacher's own questions (2026-10-04, owner: a
 * Jeopardy idea built a buzzer with nowhere to put the questions). The buzz
 * step takes an optional `questions` list: the projector and every student
 * screen show "Question 2 of 5" and the question's words, the answer goes to
 * the teacher consoles only, Next stops at the last question. Without a list
 * the buzzer runs as before (questions asked out loud).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeBuzzQuestions, buzzQuestionView, buzzTeacherView, MAX_BUZZ_QUESTIONS } from '../../engine/phases/buzz-questions.js';
import { createBuzzState, applyNextQuestion } from '../../engine/phase-handlers/buzz.js';
import { getHandler } from '../../engine/phase-handlers/phase-registry.js';
import { EVENTS } from '../../engine/events.js';
import { PHASE_SCHEMAS } from '../../engine/phase-schemas.js';
import { validate } from '../../engine/game-loader.js';
import { validateSuggestions } from '../../engine/suggest-validate.js';
import { translate } from '../../engine/i18n/index.js';
import '../../screens/shared/step-suggestions.js';

const S = globalThis.StepSuggestions;
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

describe('normalizeBuzzQuestions', () => {
  it('takes objects, plain strings, and "question | answer" lines; drops blanks', () => {
    expect(normalizeBuzzQuestions([
      { question: ' What gas do plants take in? ', answer: ' carbon dioxide ' },
      'What is the powerhouse of the cell? | mitochondria',
      'Which planet is closest to the sun?',
      '', '   ', null, { answer: 'no question' }
    ])).toEqual([
      { question: 'What gas do plants take in?', answer: 'carbon dioxide' },
      { question: 'What is the powerhouse of the cell?', answer: 'mitochondria' },
      { question: 'Which planet is closest to the sun?', answer: '' }
    ]);
  });
  it('caps the list and every field', () => {
    const many = Array.from({ length: 80 }, (_, i) => 'Q' + i + ' ' + 'x'.repeat(500));
    const out = normalizeBuzzQuestions(many);
    expect(out.length).toBe(MAX_BUZZ_QUESTIONS);
    expect(out[0].question.length).toBeLessThanOrEqual(300);
  });
  it('anything that is not a list is no list', () => {
    expect(normalizeBuzzQuestions(undefined)).toEqual([]);
    expect(normalizeBuzzQuestions('Q?')).toEqual([]);
  });
});

describe('the referee with a list', () => {
  const list = [{ question: 'A?', answer: '1' }, { question: 'B?', answer: '2' }];
  it('the public view has the words and the count, never the answer', () => {
    const state = createBuzzState({ id: 'b', questions: list });
    expect(buzzQuestionView(state)).toEqual({ questionText: 'A?', total: 2 });
    expect(JSON.stringify(buzzQuestionView(state))).not.toContain('"1"');
    expect(buzzTeacherView(state)).toEqual({ number: 1, total: 2, text: 'A?', answer: '1' });
  });
  it('Next steps through the list and stops at the last', () => {
    const state = createBuzzState({ id: 'b', questions: list });
    expect(applyNextQuestion(state)).toBe(true);
    expect(buzzQuestionView(state).questionText).toBe('B?');
    expect(applyNextQuestion(state)).toBe(false);
    expect(state.question).toBe(2);
  });
  it('without a list nothing changes: no words, Next always moves on', () => {
    const state = createBuzzState({ id: 'b' });
    expect(buzzQuestionView(state)).toEqual({ questionText: '', total: null });
    expect(buzzTeacherView(state)).toBe(null);
    expect(applyNextQuestion(state)).toBe(true);
    expect(applyNextQuestion(state)).toBe(true);
    expect(state.question).toBe(3);
  });
});

describe('the handler', () => {
  function ctxFor(phase) {
    const sent = { host: [], players: [], teachers: [] };
    const ctx = {
      phase, room: {},
      engine: { players: { list: () => [{ id: 'p1' }], find: () => null } },
      resolveTemplate: (t) => t,
      resolveScreenControl: () => ({}),
      emitToHost: (e, p) => sent.host.push({ e, p }),
      emitToPlayer: (id, e, p) => sent.players.push({ e, p }),
      emitToTeachers: (e, p) => sent.teachers.push({ e, p })
    };
    return { ctx, sent };
  }
  it('the opening shows the first question to the class and the answer to the consoles only', async () => {
    const { ctx, sent } = ctxFor({ id: 'bz', type: 'buzz', questions: ['What is 7 x 8? | 56', 'What is 9 x 6? | 54'] });
    await getHandler('buzz').onEnter(ctx);
    const host = sent.host.find(s => s.e === EVENTS.BUZZ_START).p;
    const player = sent.players.find(s => s.e === EVENTS.BUZZ_START).p;
    for (const p of [host, player]) {
      expect(p.questionText).toBe('What is 7 x 8?');
      expect(p.total).toBe(2);
      expect(JSON.stringify(p)).not.toContain('56');
    }
    const teacher = sent.teachers.find(s => s.e === EVENTS.TEACHER_BUZZ_QUESTION).p;
    expect(teacher).toMatchObject({ number: 1, total: 2, text: 'What is 7 x 8?', answer: '56' });
  });
  it('a refreshed screen gets the question it is on, never the answer', async () => {
    const { ctx } = ctxFor({ id: 'bz', type: 'buzz', questions: ['A? | 1', 'B? | 2'] });
    await getHandler('buzz').onEnter(ctx);
    applyNextQuestion(ctx.room.phaseState);
    const emitted = [];
    getHandler('buzz').onReconnect(ctx, { id: 'p1', emit: (e, p) => emitted.push({ e, p }) });
    const start = emitted.find(s => s.e === EVENTS.BUZZ_START).p;
    expect(start).toMatchObject({ question: 2, questionText: 'B?', total: 2 });
    expect(JSON.stringify(start)).not.toContain('"2"');
  });
});

describe('the server', () => {
  const server = read('server.js');
  it('Next sends the next question to all and its answer to the consoles; a Next past the end is dropped', () => {
    const at = server.indexOf('socket.on(EVENTS.BUZZ_NEXT');
    const body = server.slice(at, at + 1600);
    expect(body).toMatch(/if \(!applyNextQuestion\(state\)\) return;/);
    expect(body).toContain('buzzQuestionView(state)');
    expect(body).toContain('EVENTS.TEACHER_BUZZ_QUESTION');
    expect(body).toContain('teachersChannel(code)');
  });
  it('a console that joins or changes step learns the question and its answer', () => {
    expect(server).toContain('buzzQuestion: buzzQuestionFor(room, phase)');
    expect(server).toContain('snap.buzzQuestion = buzzQuestionFor(room, phase)');
  });
});

describe('schema, validator, and the builder', () => {
  it('the buzz step declares questions', () => {
    expect(PHASE_SCHEMAS.buzz.fields.questions).toBeTruthy();
    expect(PHASE_SCHEMAS.buzz.fields.questions.type).toBe('array');
  });
  it('the validator takes a list and refuses an item with no question', () => {
    const base = { name: 'B', phases: { lobby: { type: 'lobby', next: 'b' }, b: { type: 'buzz', next: 'end' }, end: { type: 'end' } } };
    const ok = JSON.parse(JSON.stringify(base)); ok.phases.b.questions = [{ question: 'A?', answer: '1' }, 'B? | 2'];
    expect(validate(ok, 'b', { returnResults: true }).errors).toEqual([]);
    const bad = JSON.parse(JSON.stringify(base)); bad.phases.b.questions = [{ answer: '1' }];
    expect(validate(bad, 'b', { returnResults: true }).errors.join(' ')).toMatch(/question/i);
  });
  it('the buzz brick carries the questions into the step', () => {
    const { suggestions } = validateSuggestions([{ kind: 'storyboard', storyboard: { name: 'J', steps: [
      { brick: 'buzz', text: 'Listen!', questions: [{ question: 'A?', answer: '1' }, { question: 'B?', answer: '2' }] },
      { brick: 'end', text: 'Bye' }
    ] } }], { gameIds: [], recipes: {} });
    const sb = suggestions[0].storyboard;
    expect(sb.steps[0].questions).toEqual([{ question: 'A?', answer: '1' }, { question: 'B?', answer: '2' }]);
    const { config, problems } = S.compileStoryboard(sb);
    expect(problems).toEqual([]);
    const buzz = Object.values(config.phases).find(p => p.type === 'buzz');
    expect(buzz.questions).toEqual([{ question: 'A?', answer: '1' }, { question: 'B?', answer: '2' }]);
    expect(validate(config, 'j', { returnResults: true }).errors).toEqual([]);
  });
  it('the plan prompts tell the model to put the teacher\'s questions in the buzzer', () => {
    const src = read('services/ai-service.js');
    expect(src).toMatch(/buzz \(a buzzer round[^)]*"questions"/);
    expect(src).toMatch(/- buzz: a buzzer round\.[^\n]*questions = /);
  });
  it('"Question {n} of {total}" reads in every language', () => {
    for (const lang of ['es', 'fr', 'de', 'pt', 'it']) {
      const t = translate(lang, 'Question {n} of {total}');
      expect(t, lang).not.toBe('Question {n} of {total}');
      expect(t).toContain('{n}');
      expect(t).toContain('{total}');
    }
  });
});

describe('the screens', () => {
  it('the projector shows the words and "Question n of m", and hides Next on the last', () => {
    const js = read('screens/host/host.js');
    expect(js).toMatch(/UiLang\.t\('Question \{n\} of \{total\}'\)/);
    expect(js).toContain('buzzNextBtn.hidden');
    expect(js).toContain('questionText');
  });
  it('the student screen shows the words', () => {
    expect(read('screens/player/player.js')).toMatch(/socket\.on\('buzz-open', \(\{[^}]*questionText/);
  });
  it('the console shows the question and its answer', () => {
    const js = read('screens/teacher/teacher.js');
    expect(js).toContain("socket.on('teacher-buzz-question'");
    expect(js).toContain('data.buzzQuestion');
    expect(read('screens/teacher/index.html')).toContain('id="buzz-answer-block"');
  });
  it('the editor offers the list', () => {
    expect(read('screens/designer/editor.js')).toMatch(/Questions \(optional\)/);
  });
});
