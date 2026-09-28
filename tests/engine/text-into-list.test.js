/**
 * A block of text wired into a list slot is an error in plain words
 * (2026-09-27): a design-chat change pointed a one-at-a-time reveal at
 * {{vote.resultsList}}, the validator only warned in grammar jargon, the
 * autosave went through, and pretend students saw blank cards.
 */
import { describe, it, expect } from 'vitest';
import { validate } from '../../engine/game-loader.js';

function config(showOne) {
  return {
    name: 'Question box', description: 'test',
    phases: {
      lobby: { type: 'lobby', next: 'ask' },
      ask: { type: 'collect', prompt: 'What do you want to know?', next: 'vote' },
      vote: { type: 'vote', mode: 'pick-one', candidates: 'ask.responses', excludeAuthors: true, next: 'top' },
      top: showOne,
      end: { type: 'end', message: 'Bye' }
    }
  };
}

describe('text into a list slot', () => {
  it('is an error that says what to do instead, never grammar jargon', () => {
    const r = validate(config({ type: 'reveal-one', from: 'vote.resultsList', message: 'The top questions', next: 'end' }), 'qbox', { returnResults: true });
    const errors = r.errors.map(e => e.message || e);
    expect(errors.length).toBe(1);
    expect(errors[0]).toMatch(/one block of text, not a list of answers/);
    expect(errors[0]).toMatch(/Show content step/);
    expect(errors[0]).not.toMatch(/string\/renderable/);
  });
  it('lets a list of answers, and a text shown in a reveal, through', () => {
    const ok = validate(config({ type: 'reveal-one', from: 'ask.responses', message: 'The questions', next: 'end' }), 'qbox', { returnResults: true });
    expect(ok.errors).toEqual([]);
    const shown = validate(config({ type: 'reveal', template: 'The top questions:\n\n{{vote.resultsList}}', next: 'end' }), 'qbox', { returnResults: true });
    expect(shown.errors).toEqual([]);
  });
  it('keeps an object feeding a vote a warning (the AI-step shape built-ins use)', () => {
    const c = config({ type: 'reveal', template: 'x', next: 'end' });
    c.phases.sum = { type: 'ai-process', task: 'generate-choices', format: 'json', instruction: 'Pick five', input: 'ask.responses', next: 'vote2' };
    c.phases.vote2 = { type: 'vote', mode: 'pick-one', candidates: 'sum.result', next: 'end' };
    c.phases.top.next = 'sum';
    const r = validate(c, 'qbox', { returnResults: true });
    expect(r.errors).toEqual([]);
    expect(r.warnings.map(w => w.message || w).join(' ')).toMatch(/produces object/);
  });
});
