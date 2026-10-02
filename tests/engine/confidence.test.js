/**
 * Confidence after the answer (2026-10-01, the mechanics inventory's
 * Part 3): a "how sure are you?" pick-one step names a graded question in
 * `confidenceFor`; at its close the class's confidence is split by who
 * got it right (engine/phases/confidence.js); the answer card draws a dial
 * of the class's average confidence and one line about the students who
 * were sure but wrong (owner 2026-10-01: the right/wrong chart was hard to
 * read), the report shows each student's confidence, and the fixed English
 * words reach a room in the activity's language.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CONFIDENCE_PROMPT, CONFIDENCE_LEVELS, localizeConfidence, splitByRight,
  averageConfidence, formatConfidenceDial, sureButWrongLine
} from '../../engine/phases/confidence.js';
import { buildActivityReport } from '../../engine/report.js';
import { GameEngine } from '../../engine/game-engine.js';
import { validate } from '../../engine/game-loader.js';
import { STRINGS } from '../../engine/i18n/index.js';
import { STORYBOARD_BRICKS, validateSuggestions } from '../../engine/suggest-validate.js';
import '../../screens/shared/step-suggestions.js';

const S = globalThis.StepSuggestions;
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// a, b right; c, d wrong; e did not answer the question
const scores = { a: 1200, b: 900, c: 0, d: 0 };
const sure = { a: 'Certain', b: 'Not sure', c: 'Certain', d: 'Just guessing', e: 'Certain' };

describe('confidence: the rules', () => {
  it('splits the levels by right and wrong, over students who did both', () => {
    const split = splitByRight(scores, sure);
    expect(split.right).toEqual({ Certain: 1, 'Not sure': 1 });
    expect(split.wrong).toEqual({ Certain: 1, 'Just guessing': 1 });
    expect(split.total).toBe(4);
  });

  it('the class average and its nearest level, over everyone who said', () => {
    // Certain 4, Not sure 2, Certain 4, Just guessing 1, Certain 4 = 15 / 5
    expect(averageConfidence(sure, CONFIDENCE_LEVELS)).toEqual({ value: 3, label: 'Pretty sure', count: 5 });
    expect(averageConfidence({}, CONFIDENCE_LEVELS)).toBeNull();
  });

  it('draws a dial: the title, the dial line, the level on average', () => {
    expect(formatConfidenceDial(sure, CONFIDENCE_LEVELS, 'en'))
      .toBe('How sure the class was\n◔ 3.0/4 | Just guessing | Certain\nPretty sure on average');
    expect(formatConfidenceDial({}, CONFIDENCE_LEVELS, 'en')).toBe('');
  });

  it('one line about the sure ones: wrong out of sure, or everyone right', () => {
    // sure = Pretty sure + Certain among students who answered: a right, c wrong
    expect(sureButWrongLine(splitByRight(scores, sure), CONFIDENCE_LEVELS, 'en')).toBe('Sure but wrong: 1 of 2.');
    expect(sureButWrongLine(splitByRight({ a: 5 }, { a: 'Certain' }), CONFIDENCE_LEVELS, 'en')).toBe('Everyone who was sure got it right.');
    expect(sureButWrongLine(splitByRight({ a: 0 }, { a: 'Not sure' }), CONFIDENCE_LEVELS, 'en')).toBe('');
  });

  it('speaks the activity\'s language, every table carries the rows', () => {
    const keys = [CONFIDENCE_PROMPT, ...CONFIDENCE_LEVELS, 'How sure the class was', '{level} on average', 'Sure but wrong: {wrong} of {total}.', 'Everyone who was sure got it right.'];
    for (const [lang, table] of Object.entries(STRINGS)) {
      for (const k of keys) expect(table[k], `${lang}: ${k}`).toBeTruthy();
    }
    const es = ['Solo adivino', 'No estoy seguro', 'Bastante seguro', 'Totalmente seguro'];
    expect(formatConfidenceDial({ a: 'Totalmente seguro' }, es, 'es')).toBe('Qué tan segura estaba la clase\n◔ 4.0/4 | Solo adivino | Totalmente seguro\nTotalmente seguro, en promedio');
    expect(sureButWrongLine(splitByRight({ a: 0 }, { a: 'Totalmente seguro' }), es, 'es')).toBe('Seguros pero equivocados: 1 de 1.');
  });
});

describe('confidence: the report', () => {
  it('reads how sure each student was beside their answer, never as a section of its own', () => {
    const players = [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Ben' }];
    const engine = {
      config: { name: 'Q', phases: {
        q: { type: 'collect-choice', prompt: 'Which?', choices: ['A', 'B'], correctAnswer: 'A', next: 'sure' },
        sure: { type: 'collect-choice', prompt: CONFIDENCE_PROMPT, choices: CONFIDENCE_LEVELS.slice(), confidenceFor: 'q' }
      } },
      phaseData: {
        q: { correctAnswer: 'A', tally: { A: 1, B: 1 }, responses: [{ playerId: 'a', name: 'Ana', choice: 'A' }, { playerId: 'b', name: 'Ben', choice: 'B' }] },
        sure: { byPlayer: { a: 'Pretty sure', b: 'Certain' }, responses: [] }
      },
      players: { find: id => players.find(p => p.id === id), count: () => 2, listPublic: () => players }
    };
    const report = buildActivityReport(engine);
    expect(report.sections.map(s => s.id)).toEqual(['q']);
    const blocks = report.sections[0].blocks;
    expect(blocks.find(b => b.kind === 'fact' && b.label === 'How sure the class was').value).toBe('Pretty sure on average (3.5 of 4)');
    const table = blocks.find(b => b.kind === 'table' && b.columns.includes('How sure'));
    expect(table.columns).toEqual(['Student', 'Their pick', 'Correct', 'How sure']);
    expect(table.rows).toEqual([['Ana', 'A', '✓', 'Pretty sure'], ['Ben', 'B', '', 'Certain']]);
  });
});

describe('confidence: a room in another language', () => {
  const config = {
    name: 'Prueba', language: 'es',
    phases: {
      lobby: { type: 'lobby', next: 'q' },
      q: { type: 'collect-choice', prompt: '¿Cuál?', choices: ['A', 'B'], correctAnswer: 'A', next: 'sure' },
      sure: { type: 'collect-choice', prompt: CONFIDENCE_PROMPT, choices: CONFIDENCE_LEVELS.slice(), confidenceFor: 'q', next: 'end' },
      end: { type: 'end' }
    }
  };

  it('the room gets the words in Spanish and the loaded config is untouched', () => {
    const engine = new GameEngine(config);
    expect(engine.config.phases.sure.prompt).toBe('¿Qué tan seguro estás de tu respuesta?');
    expect(engine.config.phases.sure.choices).toEqual(['Solo adivino', 'No estoy seguro', 'Bastante seguro', 'Totalmente seguro']);
    expect(engine.config.phases.q.prompt).toBe('¿Cuál?');
    expect(config.phases.sure.prompt).toBe(CONFIDENCE_PROMPT);
  });

  it('an English room and a teacher\'s own wording are left alone', () => {
    expect(localizeConfidence({ ...config, language: 'en' }, 'en')).toEqual({ ...config, language: 'en' });
    const own = { phases: { s: { type: 'collect-choice', prompt: '¿Seguro?', choices: ['Poco', 'Mucho'], confidenceFor: 'q' } } };
    expect(localizeConfidence(own, 'es').phases.s).toEqual(own.phases.s);
  });
});

describe('confidence: the validator', () => {
  const errorsOf = (phases) => validate({ name: 'C', description: 'c', phases }, 'c-test', { returnResults: true })
    .errors.map(e => (typeof e === 'string' ? e : e.message)).join(' ');
  const base = (target) => ({
    lobby: { type: 'lobby', next: 'q' },
    q: target,
    sure: { type: 'collect-choice', prompt: 'How sure?', choices: ['Not', 'Very'], confidenceFor: 'q', next: 'end' },
    end: { type: 'end' }
  });

  it('accepts a graded pick-one or a graded open answer', () => {
    expect(errorsOf(base({ type: 'collect-choice', prompt: 'Q', choices: ['A', 'B'], correctAnswer: 'A', next: 'sure' }))).toBe('');
    expect(errorsOf(base({ type: 'collect', prompt: 'Q', correctAnswer: 'Paris', next: 'sure' }))).toBe('');
  });

  it('refuses a question with nothing to be right about', () => {
    expect(errorsOf(base({ type: 'collect-choice', prompt: 'Q', choices: ['A', 'B'], next: 'sure' }))).toMatch(/must point to a question with a correct answer/);
  });

  it('the editor mirrors it', () => {
    expect(read('screens/designer/editor.js')).toMatch(/"How sure about which question" must name a question with a correct answer/);
  });
});

describe('confidence: the quiz brick', () => {
  const questions = [
    { text: 'One?', choices: ['A', 'B'], correct: 'A' },
    { text: 'Two?', choices: ['C', 'D'], correct: 'D' }
  ];

  it('puts how-sure between every question and its answer, and the answer reads it', () => {
    const { config, problems } = S.compileStoryboard({ name: 'Q', steps: [{ brick: 'quiz', confidence: true, questions }, { brick: 'end', text: 'Bye' }] });
    expect(problems).toEqual([]);
    const order = [];
    let id = 'lobby';
    while (id) { order.push(id); id = config.phases[id].next; }
    const types = order.map(x => config.phases[x].type);
    expect(types).toEqual(['lobby', 'collect-choice', 'collect-choice', 'announce', 'collect-choice', 'collect-choice', 'announce', 'leaderboard', 'end']);
    const sure = config.phases[order[2]];
    expect(sure).toMatchObject({ prompt: CONFIDENCE_PROMPT, choices: CONFIDENCE_LEVELS, confidenceFor: order[1], chartOrder: 'choices' });
    expect(config.phases[order[3]].message).toContain('{{' + order[2] + '.confidenceChart}}');
    expect(config.phases[order[3]].message).toContain('{{' + order[2] + '.confidenceLine}}');
    const result = validate({ name: 'Q', description: 'q', phases: config.phases }, 'q-test', { returnResults: true });
    expect(result.errors).toEqual([]);
  });

  it('the compiler\'s words are the engine\'s', () => {
    expect(S.CONFIDENCE_PROMPT).toBe(CONFIDENCE_PROMPT);
    expect(S.CONFIDENCE_LEVELS).toEqual(CONFIDENCE_LEVELS);
  });

  it('without the knob the quiz is unchanged', () => {
    const { config } = S.compileStoryboard({ name: 'Q', steps: [{ brick: 'quiz', questions }, { brick: 'end', text: 'Bye' }] });
    expect(Object.values(config.phases).some(p => p.confidenceFor)).toBe(false);
  });

  it('the validator passes the knob, the prompts and the plan dialog name it', () => {
    expect(STORYBOARD_BRICKS).toContain('quiz');
    const { suggestions } = validateSuggestions([{ kind: 'storyboard', storyboard: { name: 'X', steps: [
      { brick: 'quiz', confidence: true, questions }, { brick: 'end', text: 'Bye' }
    ] } }], { gameIds: [], recipes: {} });
    expect(suggestions[0].storyboard.steps[0].confidence).toBe(true);
    const src = read('services/ai-service.js');
    expect(src).toMatch(/confidence = true \(optional\) asks "How sure are you of your answer\?"/);
    expect(src).toMatch(/HOW SURE ARE YOU \(confidence after a graded question\)/);
    expect(read('screens/designer/designer.js')).toMatch(/step\.brick === 'quiz' && step\.confidence === true/);
  });
});

describe('confidence: the dial on the screens', () => {
  function fakeEl(tag) {
    return { tag, className: '', textContent: '', style: {}, attrs: {}, children: [],
      appendChild(c) { this.children.push(c); return c; }, setAttribute(k, v) { this.attrs[k] = v; } };
  }
  function load() {
    globalThis.window = globalThis.window || {};
    globalThis.document = { createElement: fakeEl, createElementNS: (ns, tag) => fakeEl(tag) };
    new Function(read('screens/shared/chart-render.js'))();
    return globalThis.window.ChartRender;
  }
  const text = 'The answer was: A!\n\n' + formatConfidenceDial(sure, CONFIDENCE_LEVELS, 'en') + '\n\nSure but wrong: 1 of 2.';

  it('reads the dial line into a dial segment, the words around it stay text', () => {
    const CR = load();
    expect(CR.containsChart(text)).toBe(true);
    const segs = CR.split(text);
    const dial = segs.find(s => s.type === 'dial');
    expect(dial).toEqual({ type: 'dial', value: 3, max: 4, low: 'Just guessing', high: 'Certain' });
    const words = segs.filter(s => s.type === 'text').map(s => s.text).join(' ');
    expect(words).toMatch(/How sure the class was/);
    expect(words).toMatch(/Pretty sure on average/);
    expect(words).not.toMatch(/◔/);
  });

  it('draws a half circle filled to the average, a needle, and the two ends', () => {
    const CR = load();
    const el = CR.buildSegment(CR.split(text).find(s => s.type === 'dial'));
    expect(el.className).toBe('msg-dial');
    const svg = el.children[0];
    expect(svg.children.map(c => c.attrs.class)).toEqual(['msg-dial-track', 'msg-dial-fill', 'msg-dial-needle', 'msg-dial-hub']);
    expect(el.children[1].children.map(c => c.textContent)).toEqual(['Just guessing', 'Certain']);
  });

  it('both screens style the dial', () => {
    for (const f of ['screens/host/styles.css', 'screens/player/styles.css']) expect(read(f)).toMatch(/\.msg-dial-fill \{/);
  });
});
