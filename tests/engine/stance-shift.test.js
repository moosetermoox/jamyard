/**
 * A vote taken twice (2026-09-26, a reviewer could not read Both Sides of
 * the Rope's before/after): the tally keeps the step's own choice order
 * with zero rows, the paired chart lines both votes up on one scale, and
 * the sentence under it counts the students who picked differently.
 */
import { describe, it, expect } from 'vitest';
import { orderedTally, formatPairedChart, countMoved, movedLine } from '../../engine/phases/stance-shift.js';
import { GameEngine } from '../../engine/game-engine.js';
import { validate } from '../../engine/game-loader.js';

const SCALE = ['Yes', 'Lean yes', 'Not sure', 'Lean no', 'No'];

describe('orderedTally', () => {
  it('keeps the choice order and shows zeros', () => {
    expect(orderedTally({ No: 2, Yes: 1, 'Lean no': 3 }, SCALE)).toEqual([
      ['Yes', 1], ['Lean yes', 0], ['Not sure', 0], ['Lean no', 3], ['No', 2]
    ]);
  });
  it('puts a label outside the order after it, by count', () => {
    expect(orderedTally({ Other: 4, Yes: 1, Maybe: 2 }, ['Yes'])).toEqual([['Yes', 1], ['Other', 4], ['Maybe', 2]]);
  });
  it('survives an empty tally', () => {
    expect(orderedTally(null, ['Yes', 'No'])).toEqual([['Yes', 0], ['No', 0]]);
    expect(orderedTally({}, [])).toEqual([]);
  });
});

describe('formatPairedChart', () => {
  it('one row per choice in order, both counts, one shared scale', () => {
    const text = formatPairedChart({ 'Lean no': 2, Yes: 1, No: 1, 'Not sure': 1 }, { Yes: 2, No: 2, 'Lean no': 1, 'Lean yes': 1 }, SCALE);
    const lines = text.split('\n');
    expect(lines.map(l => l.split('  ')[0].trim())).toEqual(SCALE);
    expect(lines[0]).toMatch(/^Yes\s+█+░*\s+1 → █+░*\s+2$/);
    expect(lines[1]).toMatch(/^Lean yes\s+░+\s+0 → █+░*\s+1$/);
    // the widest bar is the biggest count on either side (2 → 20 blocks)
    expect(lines[0]).toContain('█'.repeat(20) + '  2');
    expect(lines[3]).toContain('█'.repeat(20) + '  2 →');
  });
  it('is empty when nobody voted either time', () => {
    expect(formatPairedChart({}, {}, SCALE)).toBe('');
    expect(formatPairedChart(null, null, SCALE)).toBe('');
  });
});

describe('countMoved and movedLine', () => {
  it('counts only students who voted both times', () => {
    const before = { a: 'Yes', b: 'No', c: 'Not sure', d: 'Lean no' };
    const after = { a: 'Yes', b: 'Lean no', c: 'Yes', d: 'Lean no', late: 'Yes' };
    expect(countMoved(before, after)).toEqual({ moved: 2, total: 4 });
  });
  it('writes the sentence in the activity\'s language', () => {
    expect(movedLine('en', 2, 4)).toBe('2 of 4 students changed their minds.');
    expect(movedLine('es', 2, 4)).toBe('2 de 4 estudiantes cambiaron de opinión.');
    expect(movedLine('en', 0, 4)).toBe('Nobody changed their mind.');
    expect(movedLine('fr', 0, 4)).toBe("Personne n'a changé d'avis.");
    expect(movedLine('en', 0, 0)).toBe('');
  });
});

describe('{{step.barChart}} with chartOrder', () => {
  function engineWith(data) {
    const engine = new GameEngine({
      name: 'x', phases: { lobby: { type: 'lobby', next: 'v' }, v: { type: 'collect-choice', prompt: 'p', choices: SCALE, next: 'end' }, end: { type: 'end' } }
    });
    engine.storePhaseData('v', data);
    return engine;
  }
  it('keeps the stored choice order and shows zero rows', () => {
    const lines = engineWith({ tally: { No: 2, Yes: 1, 'Lean yes': 0, 'Not sure': 0, 'Lean no': 0 }, chartOrder: SCALE }).resolve('v.barChart').split('\n');
    expect(lines.map(l => l.split('  ')[0].trim())).toEqual(SCALE);
    expect(lines[1]).toMatch(/Lean yes\s+░{20}\s+0 \(0%\)/);
  });
  it('sorts by count with no order, as before', () => {
    const lines = engineWith({ tally: { No: 2, Yes: 1 } }).resolve('v.barChart').split('\n');
    expect(lines[0]).toMatch(/^No/);
    expect(lines).toHaveLength(2);
  });
});

describe('the validator on compareTo', () => {
  const base = (extra) => ({
    name: 'x',
    phases: {
      lobby: { type: 'lobby', next: 'v1' },
      v1: { type: 'collect-choice', prompt: 'p', choices: SCALE, next: 'v2' },
      v2: { type: 'collect-choice', prompt: 'p', choices: SCALE, next: 'r', ...extra },
      r: { type: 'reveal', template: '{{v2.beforeAfter}} {{v2.movedLine}}', next: 'end' },
      end: { type: 'end' }
    }
  });
  it('accepts an earlier pick-one step with the same choices', () => {
    const result = validate(base({ compareTo: 'v1', chartOrder: 'choices' }), 'x', { returnResults: true });
    expect(result.errors).toEqual([]);
    expect(result.warnings.filter(w => /compareTo/.test(w))).toEqual([]);
  });
  it('refuses a missing step or the wrong type', () => {
    expect(validate(base({ compareTo: 'nope' }), 'x', { returnResults: true }).errors.join('\n')).toMatch(/compareTo "nope" which does not exist/);
    const cfg = base({ compareTo: 'lobby' });
    expect(validate(cfg, 'x', { returnResults: true }).errors.join('\n')).toMatch(/must point to a collect-choice step/);
  });
  it('warns when the choices differ', () => {
    const cfg = base({ compareTo: 'v1', choices: ['Yes', 'No'] });
    expect(validate(cfg, 'x', { returnResults: true }).warnings.join('\n')).toMatch(/different choices/);
  });
});
