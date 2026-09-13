/**
 * An estimate step with a known range gets a tappable scale or a slider
 * on the student screen, not a bare number box. The range is the step's
 * own min/max, or, when those are missing, the question's wording
 * ("On a scale of 1 to 10"): the owner's Guess the Class (2026-09-12)
 * asked exactly that and showed a number box with no bounds.
 */

import { describe, it, expect } from 'vitest';
import { inferRange, effectiveRange, clampGuess } from '../../engine/phases/estimate-range.js';

describe('inferRange', () => {
  it('reads "on a scale of 1 to 10" and its cousins', () => {
    expect(inferRange('On a scale of 1 to 10, how stressed are you feeling right now?')).toEqual({ min: 1, max: 10 });
    expect(inferRange('Rate today on a scale from 1 to 5.')).toEqual({ min: 1, max: 5 });
    expect(inferRange('Give it a 1-10 scale rating')).toEqual({ min: 1, max: 10 });
    expect(inferRange('Pick a number from 0 to 100.')).toEqual({ min: 0, max: 100 });
    expect(inferRange('Somewhere between 1 and 20?')).toEqual({ min: 1, max: 20 });
    expect(inferRange('How would you rate lunch out of 10?')).toEqual({ min: 1, max: 10 });
  });

  it('leaves an open guess open', () => {
    expect(inferRange('How many liters of water does a cow drink in a day?')).toBeNull();
    expect(inferRange('Now predict: what do you think the CLASS AVERAGE stress level will be?')).toBeNull();
    expect(inferRange('')).toBeNull();
    expect(inferRange(null)).toBeNull();
  });

  it('refuses a backwards or absurd range', () => {
    expect(inferRange('on a scale of 10 to 1')).toBeNull();
    expect(inferRange('from 0 to 99999999')).toBeNull();
  });
});

describe('effectiveRange', () => {
  it('explicit min and max win over the wording', () => {
    expect(effectiveRange({ prompt: 'On a scale of 1 to 10', min: 0, max: 5 })).toEqual({ min: 0, max: 5 });
  });
  it('the wording fills what the step leaves open', () => {
    expect(effectiveRange({ prompt: 'On a scale of 1 to 10, how tired are you?' })).toEqual({ min: 1, max: 10 });
    expect(effectiveRange({ prompt: 'On a scale of 1 to 10', max: 7 })).toEqual({ min: 1, max: 7 });
  });
  it('an open question stays open on both sides', () => {
    expect(effectiveRange({ prompt: 'How many jelly beans?' })).toEqual({ min: null, max: null });
    expect(effectiveRange({ prompt: 'How many jelly beans?', min: 0 })).toEqual({ min: 0, max: null });
  });
});

describe('clampGuess', () => {
  it('pulls a guess inside the range, either side open', () => {
    expect(clampGuess(15, { min: 1, max: 10 })).toBe(10);
    expect(clampGuess(-3, { min: 1, max: 10 })).toBe(1);
    expect(clampGuess(7, { min: 1, max: 10 })).toBe(7);
    expect(clampGuess(500, { min: 0, max: null })).toBe(500);
    expect(clampGuess(500, null)).toBe(500);
  });
});
