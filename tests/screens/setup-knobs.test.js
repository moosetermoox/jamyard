/**
 * Setup knobs (library Customize setup mode) — the gating matrix is the
 * safety story: whenever the provenance stamp and the live recipe don't
 * line up, knobsFor must return [] so the Customize dialog falls back to
 * exactly its pre-setup-mode behavior.
 */

import { describe, it, expect } from 'vitest';
import '../../screens/shared/setup-knobs.js';

const K = globalThis.SetupKnobs;

const SUMMARY = {
  id: 'quiz-show',
  version: '1',
  broken: false,
  parameters: {
    questions: {
      type: 'array',
      label: 'Questions',
      setup: { mode: 'count', label: 'How many questions' }
    },
    questionTimer: { type: 'integer', min: 5, max: 120, label: 'Seconds per question', default: 20, setup: true },
    speedBonus: { type: 'boolean', default: true, label: 'Speed bonus', setup: true },
    title: { type: 'string', label: 'Title' } // unflagged, never a knob
  }
};

const STAMP = {
  id: 'quiz-show',
  version: '1',
  params: {
    questions: [{ q: 1 }, { q: 2 }, { q: 3 }],
    questionTimer: 15,
    speedBonus: true,
    title: 'My quiz'
  }
};

describe('knobsFor — happy path', () => {
  it('returns one knob per setup-flagged param, none for unflagged', () => {
    const knobs = K.knobsFor(SUMMARY, STAMP);
    expect(knobs.map(k => k.name)).toEqual(['questions', 'questionTimer', 'speedBonus']);
  });

  it('count knob spans 1..stamped length and defaults to all', () => {
    const count = K.knobsFor(SUMMARY, STAMP).find(k => k.name === 'questions');
    expect(count).toMatchObject({ kind: 'count', label: 'How many questions', min: 1, max: 3, value: 3 });
  });

  it('scalar knobs carry widget metadata and the stamped value', () => {
    const timer = K.knobsFor(SUMMARY, STAMP).find(k => k.name === 'questionTimer');
    expect(timer).toMatchObject({ kind: 'integer', min: 5, max: 120, value: 15 });
  });

  it('falls back to the spec default when the stamp lacks a value', () => {
    const stamp = { ...STAMP, params: { ...STAMP.params } };
    delete stamp.params.questionTimer;
    const timer = K.knobsFor(SUMMARY, stamp).find(k => k.name === 'questionTimer');
    expect(timer.value).toBe(20);
  });

  it('skips a count knob when there is nothing to slice (0 or 1 items)', () => {
    const stamp = { ...STAMP, params: { ...STAMP.params, questions: [{ q: 1 }] } };
    const knobs = K.knobsFor(SUMMARY, stamp);
    expect(knobs.find(k => k.name === 'questions')).toBeUndefined();
  });
});

describe('knobsFor — gating matrix (each mismatch means NO knobs)', () => {
  it('no stamp / malformed stamp', () => {
    expect(K.knobsFor(SUMMARY, null)).toEqual([]);
    expect(K.knobsFor(SUMMARY, {})).toEqual([]);
    expect(K.knobsFor(SUMMARY, { id: 'quiz-show' })).toEqual([]);
  });

  it('recipe missing or broken', () => {
    expect(K.knobsFor(null, STAMP)).toEqual([]);
    expect(K.knobsFor({ ...SUMMARY, broken: true }, STAMP)).toEqual([]);
  });

  it('recipe id mismatch', () => {
    expect(K.knobsFor({ ...SUMMARY, id: 'other' }, STAMP)).toEqual([]);
  });

  it('version drift', () => {
    expect(K.knobsFor({ ...SUMMARY, version: '2' }, STAMP)).toEqual([]);
  });

  it('missing versions default to "1" on both sides (still match)', () => {
    const summary = { ...SUMMARY };
    delete summary.version;
    const stamp = { ...STAMP };
    delete stamp.version;
    expect(K.knobsFor(summary, stamp).length).toBeGreaterThan(0);
  });

  it('no setup-flagged params', () => {
    const summary = { ...SUMMARY, parameters: { title: { type: 'string' } } };
    expect(K.knobsFor(summary, STAMP)).toEqual([]);
  });
});

describe('panelFor', () => {
  const PANEL_SUMMARY = { ...SUMMARY, setupPanel: 'quiz' };

  it('returns the recipe panel when the stamp lines up', () => {
    expect(K.panelFor(PANEL_SUMMARY, STAMP)).toBe('quiz');
  });

  it('returns null without a declared panel', () => {
    expect(K.panelFor(SUMMARY, STAMP)).toBeNull();
    expect(K.panelFor({ ...SUMMARY, setupPanel: null }, STAMP)).toBeNull();
  });

  it('gates exactly like knobsFor (broken, id mismatch, version drift, bad stamp)', () => {
    expect(K.panelFor({ ...PANEL_SUMMARY, broken: true }, STAMP)).toBeNull();
    expect(K.panelFor({ ...PANEL_SUMMARY, id: 'other' }, STAMP)).toBeNull();
    expect(K.panelFor({ ...PANEL_SUMMARY, version: '2' }, STAMP)).toBeNull();
    expect(K.panelFor(PANEL_SUMMARY, null)).toBeNull();
    expect(K.panelFor(PANEL_SUMMARY, { id: 'quiz-show' })).toBeNull();
  });
});

describe('validateQuizList', () => {
  const OK = { question: 'Capital?', choices: ['Canberra', 'Sydney'], correct: 'Canberra' };

  it('returns [] for a saveable list', () => {
    expect(K.validateQuizList([OK])).toEqual([]);
  });

  it('requires at least one question', () => {
    expect(K.validateQuizList([])).toEqual(['The quiz needs at least one question.']);
    expect(K.validateQuizList(null)).toEqual(['The quiz needs at least one question.']);
  });

  it('names each problem with its question number', () => {
    const problems = K.validateQuizList([
      { question: '', choices: ['a', 'b'], correct: 'a' },
      { question: 'One?', choices: ['only'], correct: 'only' },
      { question: 'Unmarked?', choices: ['a', 'b'], correct: '' },
      OK
    ]);
    expect(problems.some(p => p.startsWith('Question 1 has no question text'))).toBe(true);
    expect(problems.some(p => p.startsWith('Question 2 needs at least 2 choices'))).toBe(true);
    expect(problems.some(p => p.startsWith('Question 3 needs a ✓'))).toBe(true);
    expect(problems.some(p => p.includes('Question 4'))).toBe(false);
  });

  it('flags a correct answer that is not one of the choices', () => {
    const problems = K.validateQuizList([{ question: 'q?', choices: ['a', 'b'], correct: 'c' }]);
    expect(problems.some(p => p.includes('✓'))).toBe(true);
  });
});

describe('validateBluffList', () => {
  const OK = { question: 'The mayor of Rabbit Hash is a ___.', truth: 'dog', houseLie: 'chicken' };

  it('returns [] for a saveable list, decoy optional', () => {
    expect(K.validateBluffList([OK])).toEqual([]);
    expect(K.validateBluffList([{ question: 'Honey never ___.', truth: 'spoils', houseLie: '' }])).toEqual([]);
  });

  it('requires at least one fact', () => {
    expect(K.validateBluffList([])).toEqual(['Prepared facts need at least one fact.']);
    expect(K.validateBluffList(null)).toEqual(['Prepared facts need at least one fact.']);
  });

  it('names each problem with its fact number', () => {
    const problems = K.validateBluffList([
      { question: '', truth: 'x', houseLie: '' },
      { question: 'No blank here.', truth: 'x', houseLie: '' },
      { question: 'A ___ fact.', truth: '', houseLie: '' },
      { question: 'A ___ fact.', truth: 'dog', houseLie: 'Dog' },
      OK
    ]);
    expect(problems.some(p => p.startsWith('Fact 1 has no text'))).toBe(true);
    expect(problems.some(p => p.startsWith('Fact 2 needs a blank'))).toBe(true);
    expect(problems.some(p => p.startsWith('Fact 3 needs the real answer'))).toBe(true);
    expect(problems.some(p => p.startsWith("Fact 4's decoy matches"))).toBe(true);
    expect(problems.some(p => p.includes('Fact 5'))).toBe(false);
  });

  it('caps at 10 facts', () => {
    const many = Array.from({ length: 11 }, () => OK);
    expect(K.validateBluffList(many).some(p => p.includes('caps at 10'))).toBe(true);
  });
});

describe('applyKnobs', () => {
  it('slices count knobs to the first N and overrides scalars', () => {
    const params = K.applyKnobs(STAMP.params, [
      { name: 'questions', kind: 'count', value: 2 },
      { name: 'questionTimer', kind: 'integer', value: 30 },
      { name: 'speedBonus', kind: 'boolean', value: false }
    ]);
    expect(params.questions).toEqual([{ q: 1 }, { q: 2 }]);
    expect(params.questionTimer).toBe(30);
    expect(params.speedBonus).toBe(false);
    expect(params.title).toBe('My quiz'); // untouched params ride along
  });

  it('never mutates the stamped params', () => {
    const before = JSON.parse(JSON.stringify(STAMP.params));
    K.applyKnobs(STAMP.params, [{ name: 'questions', kind: 'count', value: 1 }]);
    expect(STAMP.params).toEqual(before);
  });

  it('ignores a count knob whose target is not an array', () => {
    const params = K.applyKnobs({ questions: 'oops' }, [{ name: 'questions', kind: 'count', value: 1 }]);
    expect(params.questions).toBe('oops');
  });
});

describe('knobsFor — lines and text knobs behind another knob (Doodle Bluff)', () => {
  const SUMMARY_DB = {
    id: 'doodle-bluff', version: '3',
    parameters: {
      phraseSource: { type: 'enum', values: ['students', 'teacher', 'ai'], default: 'students', setup: true },
      phrases: { type: 'array', item: { type: 'string' }, default: ['a', 'b'], setup: { mode: 'lines', showWhen: 'phraseSource=teacher' } },
      aiTopic: { type: 'string', default: 'silly scenes', setup: { mode: 'text', showWhen: 'phraseSource=ai' } },
      rounds: { type: 'integer', default: 8, min: 1, max: 20 }
    }
  };
  const STAMP_DB = { id: 'doodle-bluff', version: '3', params: { phraseSource: 'students', phrases: ['x', 'y', 'z'], aiTopic: 'silly scenes', rounds: 8 } };

  it('renders a lines knob (stamped list) and a text knob, each tied to the source knob', () => {
    const knobs = K.knobsFor(SUMMARY_DB, STAMP_DB);
    const lines = knobs.find(k => k.name === 'phrases');
    const text = knobs.find(k => k.name === 'aiTopic');
    expect(lines.kind).toBe('lines');
    expect(lines.value).toEqual(['x', 'y', 'z']);
    expect(lines.showWhen).toEqual({ name: 'phraseSource', value: 'teacher' });
    expect(text.kind).toBe('text');
    expect(text.value).toBe('silly scenes');
    expect(text.showWhen).toEqual({ name: 'phraseSource', value: 'ai' });
  });

  it('knobVisible follows the other knob\'s current value', () => {
    const [source, lines, text] = K.knobsFor(SUMMARY_DB, STAMP_DB);
    expect(K.knobVisible(source, { phraseSource: 'ai' })).toBe(true);
    expect(K.knobVisible(lines, { phraseSource: 'students' })).toBe(false);
    expect(K.knobVisible(lines, { phraseSource: 'teacher' })).toBe(true);
    expect(K.knobVisible(text, { phraseSource: 'ai' })).toBe(true);
    expect(K.knobVisible(text, { phraseSource: 'teacher' })).toBe(false);
  });

  it('applyKnobs turns lines text into a trimmed list and keeps text as-is', () => {
    const params = K.applyKnobs(STAMP_DB.params, [
      { name: 'phraseSource', kind: 'enum', value: 'teacher' },
      { name: 'phrases', kind: 'lines', value: ' mitosis \n\nthe water cycle\n' },
      { name: 'aiTopic', kind: 'text', value: 'Rome' }
    ]);
    expect(params.phraseSource).toBe('teacher');
    expect(params.phrases).toEqual(['mitosis', 'the water cycle']);
    expect(params.aiTopic).toBe('Rome');
    expect(STAMP_DB.params.phrases).toEqual(['x', 'y', 'z']); // stamp untouched
  });
});

describe('knobsFor — a helper line per enum value, alternatives in showWhen, a writer knob (2026-09-13)', () => {
  const SUMMARY_W = {
    id: 'doodle-bluff', version: '3',
    parameters: {
      phraseSource: { type: 'enum', values: ['students', 'teacher', 'ai'], default: 'students', setup: true,
        helper: 'Pick one.', valueHelp: { students: 'S', teacher: 'T', ai: 'A' } },
      phrases: { type: 'array', item: { type: 'string' }, default: ['a'], setup: { mode: 'lines', showWhen: 'phraseSource=teacher|ai' } },
      aiTopic: { type: 'string', default: 'silly', setup: { mode: 'text', showWhen: 'phraseSource=ai',
        writes: { list: 'phrases', count: 36, button: 'Write the phrases', then: { phraseSource: 'teacher' } } } }
    }
  };
  const STAMP_W = { id: 'doodle-bluff', version: '3', params: { phraseSource: 'students', phrases: ['x'], aiTopic: 'silly' } };

  it('passes valueHelp through on the enum and writes through on the text knob, and nothing else grows a field', () => {
    const [source, lines, text] = K.knobsFor(SUMMARY_W, STAMP_W);
    expect(source.valueHelp).toEqual({ students: 'S', teacher: 'T', ai: 'A' });
    expect(text.writes).toEqual({ list: 'phrases', count: 36, button: 'Write the phrases', then: { phraseSource: 'teacher' } });
    expect(lines).not.toHaveProperty('writes');
    expect(lines).not.toHaveProperty('valueHelp');
    // showWhen keeps the raw alternatives
    expect(lines.showWhen).toEqual({ name: 'phraseSource', value: 'teacher|ai' });
  });

  it('knobVisible accepts any of the alternatives', () => {
    const [, lines, text] = K.knobsFor(SUMMARY_W, STAMP_W);
    expect(K.knobVisible(lines, { phraseSource: 'teacher' })).toBe(true);
    expect(K.knobVisible(lines, { phraseSource: 'ai' })).toBe(true);
    expect(K.knobVisible(lines, { phraseSource: 'students' })).toBe(false);
    expect(K.knobVisible(text, { phraseSource: 'ai' })).toBe(true);
    expect(K.knobVisible(text, { phraseSource: 'teacher' })).toBe(false);
  });
});
