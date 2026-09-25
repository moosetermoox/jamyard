// engine/make-print.js: what the Make it yours page draws as "what your
// class will see" (the first student step, its words, timer, audience line)
// and how the teacher's edits go back into a copy. Pure functions.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { firstStudentStep, printFor, applyEdits, nameFor, pairsFor, addRound, talkQuestionsFor } from '../../engine/make-print.js';

function snowballish() {
  return {
    name: 'Snowball',
    phases: {
      lobby: { id: 'lobby', type: 'lobby', next: 'intro' },
      intro: { id: 'intro', type: 'announce', message: 'Three rounds.', next: 'write' },
      write: { id: 'write', type: 'collect', prompt: 'What should our class norms be?', instruction: 'One sentence.', timer: 120, next: 'merge' },
      merge: { id: 'merge', type: 'merge', prompt: 'Combine your answers', from: 'write', next: 'end' },
      end: { id: 'end', type: 'end' }
    }
  };
}

describe('firstStudentStep', () => {
  it('skips the lobby and the intro and lands on the first step students answer', () => {
    const step = firstStudentStep(snowballish());
    expect(step.id).toBe('write');
    expect(step.phase.type).toBe('collect');
  });

  it('is null for an activity with no student step', () => {
    expect(firstStudentStep({ phases: { lobby: { type: 'lobby', next: 'end' }, end: { type: 'end' } } })).toBe(null);
  });
});

describe('printFor', () => {
  it('draws the first step: its words, timer, and who will read the answer', () => {
    const print = printFor(snowballish());
    expect(print.name).toBe('Snowball');
    expect(print.phaseId).toBe('write');
    expect(print.type).toBe('collect');
    expect(print.prompt).toEqual({ text: 'What should our class norms be?', display: 'What should our class norms be?', editable: true });
    expect(print.instruction).toBe('One sentence.');
    expect(print.timer).toBe(120);
    expect(print.timerEditable).toBe(true);
    expect(typeof print.audience).toBe('string');
    expect(print.fields).toEqual([]);
  });

  it('lists a multi-field step as one editable plank per field', () => {
    const cfg = snowballish();
    cfg.phases.write.prompt = 'Answer in a sentence or two.';
    cfg.phases.write.fields = [{ key: 'q1', label: 'One thing you learned today' }, { key: 'q2', label: 'One question you still have' }];
    const print = printFor(cfg);
    expect(print.fields).toEqual([
      { key: 'q1', label: 'One thing you learned today', editable: true },
      { key: 'q2', label: 'One question you still have', editable: true }
    ]);
  });

  it('marks a templated prompt as not editable, and draws its token as a blank', () => {
    const cfg = snowballish();
    cfg.phases.write.prompt = '{{fact.result.question}}\n\nWrite a lie that could fool the class.';
    const print = printFor(cfg);
    expect(print.prompt.editable).toBe(false);
    expect(print.prompt.text).toBe('{{fact.result.question}}\n\nWrite a lie that could fool the class.');
    expect(print.prompt.display).toBe('…\n\nWrite a lie that could fool the class.');
  });

  it('shows a self-paced quiz by its first question, read-only', () => {
    const cfg = snowballish();
    cfg.phases.write = { id: 'write', type: 'solo-quiz', questions: [{ question: 'Capital of Peru?', choices: ['Lima', 'Quito'], correct: 0 }], next: 'merge' };
    const print = printFor(cfg);
    expect(print.prompt).toEqual({ text: 'Capital of Peru?', display: 'Capital of Peru?', editable: false });
    expect(print.choices).toEqual(['Lima', 'Quito']);
  });

  it('keeps the timer read-only on a recipe-born copy (the recipe owns it)', () => {
    const cfg = snowballish();
    cfg.recipe = { id: 'snowball', version: 1, params: {} };
    expect(printFor(cfg).timerEditable).toBe(false);
  });

  it('shows the choices of a multiple-choice step, read-only', () => {
    const cfg = snowballish();
    cfg.phases.write = { id: 'write', type: 'collect-choice', prompt: 'How are you feeling?', choices: ['Great', 'Okay', 'Lost'], next: 'merge' };
    const print = printFor(cfg);
    expect(print.choices).toEqual(['Great', 'Okay', 'Lost']);
    expect(print.type).toBe('collect-choice');
  });

  it('is null when there is nothing to draw', () => {
    expect(printFor({ name: 'Talk', phases: { lobby: { type: 'lobby', next: 'end' }, end: { type: 'end' } } })).toBe(null);
  });
});

describe('applyEdits', () => {
  it('puts the teacher\'s words into the first step without touching the original', () => {
    const cfg = snowballish();
    const out = applyEdits(cfg, { prompt: 'What makes an experiment fair?' });
    expect(out.changed).toBe(true);
    expect(out.config.phases.write.prompt).toBe('What makes an experiment fair?');
    expect(cfg.phases.write.prompt).toBe('What should our class norms be?');
  });

  it('carries a new question into every step that quoted the old one, and into the recipe stamp (Live Poll, 2026-09-24)', () => {
    const cfg = JSON.parse(readFileSync(new URL('../../games/live-poll/config.json', import.meta.url), 'utf8'));
    const was = cfg.phases.ask.prompt;
    expect(cfg.phases.results.template).toContain(was);
    const out = applyEdits(cfg, { prompt: 'How confident are you about spotting a reliable source?' });
    expect(out.changed).toBe(true);
    expect(out.config.phases.ask.prompt).toBe('How confident are you about spotting a reliable source?');
    expect(out.config.phases.results.template).toContain('How confident are you about spotting a reliable source?');
    expect(out.config.phases.results.template).not.toContain(was);
    expect(out.config.phases.results.template).toContain('{{ask.barChart}}');
    expect(out.config.recipe.params.question).toBe('How confident are you about spotting a reliable source?');
    expect(out.config.sampleAnswers).toEqual(cfg.sampleAnswers);
    expect(cfg.phases.results.template).toContain(was);
  });

  it('applies field labels by key and the timer, and reports nothing changed when nothing did', () => {
    const cfg = snowballish();
    cfg.phases.write.fields = [{ key: 'q1', label: 'A' }, { key: 'q2', label: 'B' }];
    const same = applyEdits(cfg, { prompt: 'What should our class norms be?', timer: 120, fields: { q1: 'A' } });
    expect(same.changed).toBe(false);
    const out = applyEdits(cfg, { fields: { q2: 'One question you still have' }, timer: 90 });
    expect(out.changed).toBe(true);
    expect(out.config.phases.write.fields[1].label).toBe('One question you still have');
    expect(out.config.phases.write.fields[0].label).toBe('A');
    expect(out.config.phases.write.timer).toBe(90);
  });

  it('ignores blank words, a templated prompt, and a timer on a recipe-born copy', () => {
    const cfg = snowballish();
    expect(applyEdits(cfg, { prompt: '   ' }).changed).toBe(false);
    cfg.phases.write.prompt = 'Build on this: {{write.assigned}}';
    expect(applyEdits(cfg, { prompt: 'Nope' }).changed).toBe(false);
    const born = snowballish();
    born.recipe = { id: 'x', version: 1, params: {} };
    expect(applyEdits(born, { timer: 30 }).changed).toBe(false);
  });

  it('never accepts an em dash into the activity', () => {
    const out = applyEdits(snowballish(), { prompt: 'Norms — what are they?' });
    expect(out.config.phases.write.prompt).not.toMatch(/—/);
  });
});

// The pairs panel (owner 2026-09-13: "there should be a way to preview
// the pairs, similar to the quiz ones")
describe('pairsFor + applyEdits.pairs', () => {
  const vocab = {
    name: 'Vocab Match',
    phases: {
      lobby: { type: 'lobby', next: 'round1' },
      round1: { type: 'match', prompt: 'Match', pairs: [{ left: 'chat', right: 'cat' }, { left: 'chien', right: 'dog' }], next: 'round2' },
      round2: { type: 'match', name: 'Food', prompt: 'Match', pairs: [['pain', 'bread']], next: 'end' },
      end: { type: 'end' }
    }
  };

  it('lists every match step\'s pairs, tuples included, labelled by name or round number', () => {
    expect(pairsFor(vocab)).toEqual([
      { id: 'round1', label: 'Round 1', pairs: [{ left: 'chat', right: 'cat' }, { left: 'chien', right: 'dog' }] },
      { id: 'round2', label: 'Food', pairs: [{ left: 'pain', right: 'bread' }] }
    ]);
    expect(printFor(vocab).pairs.length).toBe(2);
  });

  it('leaves a step whose pairs carry a token to the designer', () => {
    const templated = { phases: { m: { type: 'match', prompt: 'x', pairs: [{ left: '{{ai.word}}', right: 'cat' }], next: 'end' }, end: { type: 'end' } } };
    expect(pairsFor(templated)).toEqual([]);
  });

  it('applies edited pairs by step id, drops half-empty pairs, keeps a round the edit would empty, and reports the change', () => {
    const out = applyEdits(vocab, { pairs: {
      round1: [{ left: ' le chat ', right: 'the cat' }, { left: '', right: 'dog' }],
      round2: [{ left: '', right: '' }],
      nope: [{ left: 'a', right: 'b' }]
    } });
    expect(out.changed).toBe(true);
    expect(out.config.phases.round1.pairs).toEqual([{ left: 'le chat', right: 'the cat' }]);
    expect(out.config.phases.round2.pairs).toEqual([['pain', 'bread']]);
    expect(out.config.phases.nope).toBeUndefined();
    expect(vocab.phases.round1.pairs.length).toBe(2);
    // The same pairs again: nothing changed
    expect(applyEdits(vocab, { pairs: { round1: [{ left: 'chat', right: 'cat' }, { left: 'chien', right: 'dog' }] } }).changed).toBe(false);
  });

  // "+ round" (owner 2026-09-13): a clone of the last round with the new
  // pairs, chained after it; the leaderboard sums it too
  it('adds a round after the last match step, wired into the chain and the leaderboard', () => {
    const withBoard = JSON.parse(JSON.stringify(vocab));
    withBoard.phases.round2.next = 'board';
    withBoard.phases.board = { type: 'leaderboard', from: ['round1.scores', 'round2.scores'], next: 'end' };
    const out = applyEdits(withBoard, { newRounds: [
      { pairs: [{ left: 'rouge', right: 'red' }, { left: '', right: 'x' }] },
      { pairs: [] },
      { pairs: [{ left: 'bleu', right: 'blue' }] }
    ] });
    expect(out.changed).toBe(true);
    const p = out.config.phases;
    expect(p.round2.next).toBe('round3');
    expect(p.round3).toEqual({ type: 'match', prompt: 'Match', pairs: [{ left: 'rouge', right: 'red' }], next: 'round4' });
    expect(p.round4.pairs).toEqual([{ left: 'bleu', right: 'blue' }]);
    expect(p.round4.next).toBe('board');
    expect(p.board.from).toEqual(['round1.scores', 'round2.scores', 'round3.scores', 'round4.scores']);
    expect(withBoard.phases.round3).toBeUndefined();
    expect(pairsFor(out.config).map((r) => r.label)).toEqual(['Round 1', 'Food', 'Round 3', 'Round 4']);
  });

  it('addRound is null with no match step, and never reuses an id', () => {
    expect(addRound({ phases: { end: { type: 'end' } } }, [{ left: 'a', right: 'b' }])).toBeNull();
    const taken = { phases: { round1: { type: 'match', pairs: [['a', 'b']], next: 'round3' }, round3: { type: 'announce', next: 'end' }, end: { type: 'end' } } };
    expect(addRound(taken, [{ left: 'c', right: 'd' }])).toBe('round2');
    expect(taken.phases.round1.next).toBe('round2');
    expect(taken.phases.round2.next).toBe('round3');
  });
});

describe('nameFor', () => {
  it('names a copy after the new question, short, and after the template otherwise', () => {
    expect(nameFor('Snowball', 'What makes an experiment fair?')).toBe('Snowball: What makes an experiment fair?');
    expect(nameFor('Snowball', 'A very long question that goes on and on about the water cycle and more')).toBe('Snowball: A very long question that goes on and on about…');
    expect(nameFor('Snowball', '')).toBe('Snowball (my version)');
  });
});

describe('talkQuestionsFor: a talk-only activity\'s questions, tier by tier (Closer)', () => {
  const closerish = () => ({
    name: 'Closer',
    phases: {
      lobby: { type: 'lobby', next: 'welcome' },
      welcome: { type: 'announce', message: 'Welcome.\n\nNothing to type today.', next: 't1' },
      t1: { type: 'announce', message: 'Tier 1. Warm-up.\n\nTurn to the person next to you.', next: 't1q1' },
      t1q1: { type: 'announce', message: 'Window seat or aisle seat, and why?\n\nWhoever woke up earlier goes first.', next: 't1q2' },
      t1q2: { type: 'announce', message: 'If our class had a mascot, what should it be?\n\nBoth answer.', next: 't2' },
      t2: { type: 'announce', message: 'Tier 2. A little deeper.\n\nNew partner.', next: 't2q1' },
      t2q1: { type: 'announce', message: 'What makes someone a good friend?\n\nBoth answer.', next: 'checkout' },
      checkout: { type: 'rate', prompt: 'How did that feel?', scales: [{ id: 'felt', label: 'How that felt', min: 1, max: 5 }], next: 'end' },
      end: { type: 'end' }
    }
  });

  it('groups the question steps under the tier that opened them, first lines only, tier names without the trailing period', () => {
    const tiers = talkQuestionsFor(closerish());
    expect(tiers).toEqual([
      { name: 'Tier 1. Warm-up', questions: ['Window seat or aisle seat, and why?', 'If our class had a mascot, what should it be?'] },
      { name: 'Tier 2. A little deeper', questions: ['What makes someone a good friend?'] }
    ]);
    // the welcome opened a tier with no questions: dropped
    expect(tiers.some((t) => t.name === 'Welcome')).toBe(false);
  });

  it('an activity with fewer than two question steps has no tiers, and printFor carries the list', () => {
    expect(talkQuestionsFor(snowballish())).toEqual([]);
    const print = printFor(closerish());
    expect(print.phaseId).toBe('checkout');
    expect(print.talk.length).toBe(2);
    expect(printFor(snowballish()).talk).toEqual([]);
  });

  it('reads the real Closer: three tiers of three', async () => {
    const { readFile } = await import('node:fs/promises');
    const config = JSON.parse(await readFile(new URL('../../games/closer/config.json', import.meta.url), 'utf8'));
    const tiers = talkQuestionsFor(config);
    expect(tiers.map((t) => t.questions.length)).toEqual([3, 3, 3]);
    expect(tiers[0].name).toMatch(/^Tier 1/);
    expect(tiers[2].questions[2]).toContain('remember in ten years');
  });
});
