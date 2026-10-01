/**
 * Confidence after the answer (2026-10-01, the mechanics inventory's
 * Part 3): a "how sure are you?" pick-one step names a graded question in
 * `confidenceFor`; at its close the class's confidence is split by who
 * got it right (engine/phases/confidence.js), the answer card draws the
 * paired chart under a "Right | Wrong" head (shared/chart-render.js), and
 * the fixed English words reach a room in the activity's language.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CONFIDENCE_PROMPT, CONFIDENCE_LEVELS, localizeConfidence, splitByRight,
  formatConfidenceChart, confidenceLine
} from '../../engine/phases/confidence.js';
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

  it('draws one paired chart in level order under a Right | Wrong head', () => {
    const chart = formatConfidenceChart(splitByRight(scores, sure), CONFIDENCE_LEVELS, 'en');
    const lines = chart.split('\n');
    expect(lines[0]).toBe('↔ Right | Wrong');
    expect(lines.slice(1).map(l => l.trim().split(/\s{2,}/)[0])).toEqual(CONFIDENCE_LEVELS);
    expect(lines[4]).toMatch(/^Certain\s+[█░]+\s+1 → [█░]+\s+1$/);
    expect(lines[3]).toMatch(/Pretty sure\s+░+\s+0 → ░+\s+0$/);
  });

  it('names the most and least sure levels anyone picked', () => {
    expect(confidenceLine(splitByRight(scores, sure), CONFIDENCE_LEVELS, 'en'))
      .toBe('Certain: 1 of 2 were right. Just guessing: 0 of 1 were right.');
    expect(confidenceLine(splitByRight({ a: 5 }, { a: 'Pretty sure' }), CONFIDENCE_LEVELS, 'en'))
      .toBe('Pretty sure: 1 of 1 were right.');
    expect(confidenceLine(splitByRight({}, {}), CONFIDENCE_LEVELS, 'en')).toBe('');
    expect(formatConfidenceChart(splitByRight({}, {}), CONFIDENCE_LEVELS, 'en')).toBe('');
  });

  it('speaks the activity\'s language, every table carries the rows', () => {
    const keys = [CONFIDENCE_PROMPT, ...CONFIDENCE_LEVELS, 'Right', 'Wrong', '{level}: {right} of {total} were right.'];
    for (const [lang, table] of Object.entries(STRINGS)) {
      for (const k of keys) expect(table[k], `${lang}: ${k}`).toBeTruthy();
    }
    const es = splitByRight({ a: 1 }, { a: 'Totalmente seguro' });
    expect(formatConfidenceChart(es, ['Solo adivino', 'Totalmente seguro'], 'es').split('\n')[0]).toBe('↔ Correctas | Incorrectas');
    expect(confidenceLine(es, ['Solo adivino', 'Totalmente seguro'], 'es')).toBe('Totalmente seguro: 1 de 1 acertaron.');
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

describe('confidence: the chart renderer', () => {
  function fakeEl(tag) {
    return { tag, className: '', textContent: '', style: {}, children: [], appendChild(c) { this.children.push(c); return c; } };
  }
  function load() {
    globalThis.window = globalThis.window || {};
    globalThis.document = { createElement: fakeEl };
    new Function(read('screens/shared/chart-render.js'))();
    return globalThis.window.ChartRender;
  }
  const text = 'The answer was: A!\n\n' + formatConfidenceChart(splitByRight(scores, sure), CONFIDENCE_LEVELS, 'en') + '\n\nCertain: 1 of 2 were right.';

  it('reads the head line into the paired chart, never as text', () => {
    const segs = load().split(text);
    const pair = segs.find(s => s.type === 'pair');
    expect(pair.heads).toEqual(['Right', 'Wrong']);
    expect(pair.rows.map(r => r.label)).toEqual(CONFIDENCE_LEVELS);
    expect(segs.filter(s => s.type === 'text').map(s => s.text).join(' ')).not.toMatch(/↔/);
  });

  it('draws named columns with nothing marked as moved', () => {
    const CR = load();
    const pair = CR.split(text).find(s => s.type === 'pair');
    const el = CR.buildSegment(pair);
    expect(el.children.filter(c => c.className === 'msg-chart-head').map(c => c.textContent)).toEqual(['', 'Right', '', 'Wrong', '']);
    const fills = el.children.filter(c => c.className === 'msg-chart-track').map(t => t.children[0].className);
    expect(fills.some(c => /moved/.test(c))).toBe(false);
  });

  it('a vote taken twice keeps Before and After', () => {
    const CR = load();
    const pair = CR.split('Yes  ██  2 → ████  4\nNo  ████  4 → ██  2').find(s => s.type === 'pair');
    expect(pair.heads).toBeUndefined();
    const heads = CR.buildSegment(pair).children.filter(c => c.className === 'msg-chart-head').map(c => c.textContent);
    expect(heads).toEqual(['', 'Before', '', 'After', '']);
  });
});
