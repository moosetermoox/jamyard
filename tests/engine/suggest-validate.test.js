// The concierge's structural guarantee: an AI suggestion the platform can't
// actually deliver never reaches the teacher. Every suggestion must resolve
// to something real (a library activity, a recipe with legal params, or a
// storyboard made only of known bricks); anything else is dropped.
import { describe, it, expect } from 'vitest';
import { validateSuggestions, STORYBOARD_BRICKS } from '../../engine/suggest-validate.js';

const ctx = {
  gameIds: ['snowball', 'vocab-match'],
  recipes: {
    'class-poll': { parameters: { question: {}, choices: {}, timer: {} } },
    'question-share': { parameters: { question: {}, timer: {} } }
  }
};

describe('validateSuggestions', () => {
  it('keeps a valid host suggestion and trims the why line', () => {
    const out = validateSuggestions([
      { kind: 'host', id: 'snowball', why: '  Fits a connect moment.  ' }
    ], ctx);
    expect(out.suggestions).toEqual([{ kind: 'host', id: 'snowball', why: 'Fits a connect moment.' }]);
    expect(out.dropped).toBe(0);
  });

  it('drops host suggestions for unknown activities', () => {
    const out = validateSuggestions([{ kind: 'host', id: 'made-up-game', why: 'x' }], ctx);
    expect(out.suggestions).toEqual([]);
    expect(out.dropped).toBe(1);
  });

  it('keeps recipe suggestions and strips unknown params', () => {
    const out = validateSuggestions([
      { kind: 'recipe', id: 'class-poll', params: { question: 'Favorite planet?', bogus: 'x', timer: 60 }, why: 'w' }
    ], ctx);
    expect(out.suggestions[0].params).toEqual({ question: 'Favorite planet?', timer: 60 });
  });

  it('drops recipes that do not exist; keeps a recipe with no params', () => {
    const out = validateSuggestions([
      { kind: 'recipe', id: 'ghost-recipe', why: 'w' },
      { kind: 'recipe', id: 'question-share', why: 'w' }
    ], ctx);
    expect(out.suggestions).toEqual([{ kind: 'recipe', id: 'question-share', params: {}, why: 'w' }]);
    expect(out.dropped).toBe(1);
  });

  it('keeps storyboards built only of known bricks', () => {
    const sb = { name: 'Quick Check', steps: [
      { brick: 'announce', text: 'Welcome!' },
      { brick: 'collect', text: 'One thing you learned?' },
      { brick: 'reveal', text: 'Here is what we said:' },
      { brick: 'end', text: 'Nice work.' }
    ] };
    const out = validateSuggestions([{ kind: 'storyboard', storyboard: sb, why: 'w' }], ctx);
    expect(out.suggestions.length).toBe(1);
    expect(out.suggestions[0].storyboard.steps.length).toBe(4);
  });

  it('drops storyboards with unknown bricks or too few steps', () => {
    const bad1 = { steps: [{ brick: 'record-audio', text: 'x' }, { brick: 'end' }] };
    const bad2 = { steps: [{ brick: 'end' }] };
    const out = validateSuggestions([
      { kind: 'storyboard', storyboard: bad1, why: 'w' },
      { kind: 'storyboard', storyboard: bad2, why: 'w' }
    ], ctx);
    expect(out.suggestions).toEqual([]);
    expect(out.dropped).toBe(2);
  });

  it('caps at three suggestions and survives malformed input', () => {
    const many = ['snowball', 'vocab-match', 'snowball', 'vocab-match'].map(function (id) {
      return { kind: 'host', id: id, why: 'w' };
    });
    expect(validateSuggestions(many, ctx).suggestions.length).toBe(3);
    expect(validateSuggestions(null, ctx).suggestions).toEqual([]);
    expect(validateSuggestions([null, 'nope', { kind: 'dance' }], ctx).suggestions).toEqual([]);
  });

  it('exports the storyboard brick vocabulary', () => {
    expect(STORYBOARD_BRICKS).toContain('collect-two');
    expect(STORYBOARD_BRICKS).toContain('guessing-rounds');
    expect(STORYBOARD_BRICKS).toContain('chain');
    expect(STORYBOARD_BRICKS).toContain('rank');
    expect(STORYBOARD_BRICKS).not.toContain('foreach');
  });

  // 2026-09-07: guess "who" on guessing rounds, items on rank.
  it('carries the guess mode and rank items through in trimmed shape', () => {
    const sb = { name: 'Fears', steps: [
      { brick: 'collect', text: 'A fear?' },
      { brick: 'guessing-rounds', guess: 'who' },
      { brick: 'rank', text: 'Scariest first.', items: ['Spiders', 'Heights', 42] },
      { brick: 'end', text: 'Done.' }
    ] };
    const out = validateSuggestions([{ kind: 'storyboard', storyboard: sb, why: 'w' }], ctx);
    const steps = out.suggestions[0].storyboard.steps;
    expect(steps[1].guess).toBe('who');
    expect(steps[2].items).toEqual(['Spiders', 'Heights', '42']);
    const odd = { name: 'X', steps: [
      { brick: 'guessing-rounds', guess: 'everything' }, { brick: 'end' }
    ] };
    const out2 = validateSuggestions([{ kind: 'storyboard', storyboard: odd, why: 'w' }], ctx);
    expect(out2.suggestions[0].storyboard.steps[0].guess).toBeUndefined();
  });

  it('carries chain fields through in trimmed shape', () => {
    const sb = { name: 'Pass It On', steps: [
      { brick: 'chain', start: 'Write a line.', hops: ['Add a line.', 'Add another.', 42],
        visibility: 'tail', sentence: 'The {1} {2}.', timer: 60 },
      { brick: 'end', text: 'Done.' }
    ] };
    const out = validateSuggestions([{ kind: 'storyboard', storyboard: sb, why: 'w' }], ctx);
    expect(out.suggestions.length).toBe(1);
    const step = out.suggestions[0].storyboard.steps[0];
    expect(step.start).toBe('Write a line.');
    expect(step.hops).toEqual(['Add a line.', 'Add another.']); // non-strings dropped
    expect(step.visibility).toBe('tail');
    expect(step.sentence).toBe('The {1} {2}.');
    expect(step.timer).toBe(60);
  });

  it('drops an illegal chain visibility rather than passing it through', () => {
    const sb = { name: 'X', steps: [
      { brick: 'chain', start: 's', hops: ['h'], visibility: 'x-ray' },
      { brick: 'end' }
    ] };
    const out = validateSuggestions([{ kind: 'storyboard', storyboard: sb, why: 'w' }], ctx);
    expect(out.suggestions[0].storyboard.steps[0].visibility).toBeUndefined();
  });
});

describe('validateSuggestions — numeric params clamp to recipe min/max', () => {
  // 2026-08-08 field test: the AI thinks in minutes ("evidenceTime": 4) but
  // recipe fields are seconds (min 60), so the prefilled form failed create
  // with "must be at least 60" — an error the teacher didn't cause. Numbers
  // now clamp into the spec's legal range before reaching the form.
  const clampCtx = {
    gameIds: [],
    recipes: {
      'debate': { parameters: {
        claim: { type: 'string' },
        evidenceTime: { type: 'integer', min: 60, max: 300, default: 120 }
      } }
    }
  };

  it('clamps a below-min number up to min', () => {
    const out = validateSuggestions([
      { kind: 'recipe', id: 'debate', params: { evidenceTime: 4 }, why: 'w' }
    ], clampCtx);
    expect(out.suggestions[0].params.evidenceTime).toBe(60);
  });

  it('clamps an above-max number down to max', () => {
    const out = validateSuggestions([
      { kind: 'recipe', id: 'debate', params: { evidenceTime: 9999 }, why: 'w' }
    ], clampCtx);
    expect(out.suggestions[0].params.evidenceTime).toBe(300);
  });

  it('leaves in-range numbers alone', () => {
    const out = validateSuggestions([
      { kind: 'recipe', id: 'debate', params: { evidenceTime: 180 }, why: 'w' }
    ], clampCtx);
    expect(out.suggestions[0].params.evidenceTime).toBe(180);
  });

  it('drops a non-numeric value aimed at an integer param', () => {
    const out = validateSuggestions([
      { kind: 'recipe', id: 'debate', params: { evidenceTime: 'three minutes', claim: 'Cats rule.' }, why: 'w' }
    ], clampCtx);
    expect(out.suggestions[0].params).toEqual({ claim: 'Cats rule.' });
  });
});
