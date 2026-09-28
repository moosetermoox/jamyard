import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { inputIsEmpty, asksForInput, NO_ANSWERS_LINE } from '../../engine/phases/ai-empty-input.js';
import { STRINGS } from '../../engine/i18n/index.js';

describe('inputIsEmpty', () => {
  const phase = { input: '{{q.responses}}' };
  it('no answers, blanks, or passes are empty', () => {
    expect(inputIsEmpty(phase, [])).toBe(true);
    expect(inputIsEmpty(phase, undefined)).toBe(true);
    expect(inputIsEmpty(phase, [{ text: '  ' }, { passed: true, text: '' }])).toBe(true);
    expect(inputIsEmpty(phase, '')).toBe(true);
  });
  it('one real answer is not', () => {
    expect(inputIsEmpty(phase, [{ text: '' }, { text: 'fractions' }])).toBe(false);
    expect(inputIsEmpty(phase, [{ fields: { a: 'x' } }])).toBe(false);
  });
  it('a step with no input (a generate) is never empty', () => {
    expect(inputIsEmpty({}, undefined)).toBe(false);
  });
});

describe('asksForInput', () => {
  it('catches the reply the projector showed', () => {
    expect(asksForInput("I'm ready to help! But I don't see the student responses in your message. Could you paste the list?")).toBe(true);
    expect(asksForInput('No student responses were provided.')).toBe(true);
  });
  it('leaves a real summary alone', () => {
    expect(asksForInput('Most of you said fractions are about equal parts of a whole.')).toBe(false);
  });
});

describe('the step and its line', () => {
  it('every language has the line', () => {
    for (const lang of Object.keys(STRINGS)) expect(STRINGS[lang][NO_ANSWERS_LINE]).toBeTruthy();
  });
  it('ai-process reads both guards', () => {
    const src = readFileSync(new URL('../../engine/phase-handlers/ai-process.js', import.meta.url), 'utf8');
    expect(src).toMatch(/inputIsEmpty\(phase, input\)/);
    expect(src).toMatch(/asksForInput\(/);
  });
});
