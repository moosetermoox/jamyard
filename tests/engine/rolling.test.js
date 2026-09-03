/**
 * Rolling start (engine/phases/rolling.js): the pure rules behind
 * `start: "rolling"` activities, plus the validator's acceptance of the
 * top-level field and its warnings for roster-bound steps.
 */
import { describe, it, expect } from 'vitest';
import { isRolling, isRosterBound, moreInputAhead, doneMessageFor, START_MODES } from '../../engine/phases/rolling.js';
import { validate } from '../../engine/game-loader.js';

const exitTicket = {
  name: 'Exit ticket',
  start: 'rolling',
  phases: {
    lobby: { type: 'lobby', next: 'ask' },
    ask: { type: 'collect', prompt: 'One thing you learned today?', next: 'end' },
    end: { type: 'end', message: 'Thanks!' }
  }
};

describe('isRolling / START_MODES', () => {
  it('reads the top-level start field', () => {
    expect(isRolling(exitTicket)).toBe(true);
    expect(isRolling({ start: 'together' })).toBe(false);
    expect(isRolling({})).toBe(false);
    expect(isRolling(null)).toBe(false);
    expect(START_MODES).toEqual(['together', 'rolling']);
  });
});

describe('moreInputAhead', () => {
  it('is false when only display/end steps follow (the student is done)', () => {
    expect(moreInputAhead(exitTicket, 'ask')).toBe(false);
  });

  it('is true when another input step, including a vote, is still ahead', () => {
    const poll = {
      phases: {
        lobby: { type: 'lobby', next: 'ask' },
        ask: { type: 'collect', prompt: 'Idea?', next: 'vote' },
        vote: { type: 'vote', mode: 'pick-one', candidates: 'ask', next: 'end' },
        end: { type: 'end' }
      }
    };
    expect(moreInputAhead(poll, 'ask')).toBe(true);
    expect(moreInputAhead(poll, 'vote')).toBe(false);
  });

  it('survives a cycle and a missing phase', () => {
    const loop = { phases: { a: { type: 'announce', next: 'b' }, b: { type: 'announce', next: 'a' } } };
    expect(moreInputAhead(loop, 'a')).toBe(false);
    expect(moreInputAhead(loop, 'zzz')).toBe(false);
  });
});

describe('isRosterBound', () => {
  it('flags pairs, rotation chains, teams and turn-taking', () => {
    expect(isRosterBound({ type: 'collect', assign: 'pairwise' })).toBe(true);
    expect(isRosterBound({ type: 'collect', rotateFrom: 'ask' })).toBe(true);
    expect(isRosterBound({ type: 'team-split', method: 'random' })).toBe(true);
    expect(isRosterBound({ type: 'relay' })).toBe(true);
    expect(isRosterBound({ type: 'collect', prompt: 'x' })).toBe(false);
    expect(isRosterBound({ type: 'collect-choice' })).toBe(false);
  });
});

describe('doneMessageFor', () => {
  it('prefers the phase\'s own wording, else the default', () => {
    expect(doneMessageFor({ doneMessage: '  See you tomorrow.  ' })).toBe('See you tomorrow.');
    expect(doneMessageFor({})).toMatch(/put your device away/);
    expect(doneMessageFor(null)).toMatch(/put your device away/);
  });
});

describe('validator: start field', () => {
  it('accepts together, rolling, and absent', () => {
    expect(() => validate(exitTicket, 'test')).not.toThrow();
    expect(() => validate({ ...exitTicket, start: 'together' }, 'test')).not.toThrow();
    const { start, ...noStart } = exitTicket;
    expect(() => validate(noStart, 'test')).not.toThrow();
  });

  it('rejects anything else', () => {
    expect(() => validate({ ...exitTicket, start: 'later' }, 'test')).toThrow(/start/);
    expect(() => validate({ ...exitTicket, start: true }, 'test')).toThrow(/start/);
  });

  it('warns about roster-bound steps and timers in a rolling activity', () => {
    const config = {
      name: 'Rolling pairs',
      start: 'rolling',
      phases: {
        lobby: { type: 'lobby', next: 'ask' },
        ask: { type: 'collect', prompt: 'Idea?', timer: 60, assign: 'pairwise', next: 'end' },
        end: { type: 'end' }
      }
    };
    const result = validate(config, 'test', { returnResults: true });
    expect(result.errors).toEqual([]);
    expect(result.warnings.some(w => /rolling/.test(w) && /pairs|roster|arrive/.test(w))).toBe(true);
    expect(result.warnings.some(w => /timer/.test(w) && /rolling/.test(w))).toBe(true);
  });

  it('accepts a doneMessage on an input step', () => {
    const config = JSON.parse(JSON.stringify(exitTicket));
    config.phases.ask.doneMessage = 'Thanks, see you tomorrow.';
    expect(() => validate(config, 'test')).not.toThrow();
  });
});
