import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ALLOWANCES, TIMER_FLOORS,
  parseRequestedMinutes, estimateDuration, fitToBudget, timingReport, paramsForTrim
} from '../../engine/duration-estimate.js';

// The reviewer's case (2026-09-06): "a five-minute history activity" matched
// Snowball, the AI said it fit the timeline, and the config carried 90s of
// thinking plus 240s of merging before any instructions, seat moves, or
// discussion. Duration must be computed from the configuration, checked
// against the request, and a concrete trim offered when it runs over.

const snowball = JSON.parse(readFileSync(new URL('../../games/snowball/config.json', import.meta.url), 'utf8'));

function config(phases) {
  return { name: 'T', phases };
}

describe('parseRequestedMinutes', () => {
  it('reads digits, hyphenated forms, and number words', () => {
    expect(parseRequestedMinutes('a 5 minute warm up')).toBe(5);
    expect(parseRequestedMinutes('I have 10 min tomorrow')).toBe(10);
    expect(parseRequestedMinutes('a five-minute, no-score history activity')).toBe(5);
    expect(parseRequestedMinutes('Fifteen minutes on WWI causes')).toBe(15);
    expect(parseRequestedMinutes('about twenty mins')).toBe(20);
  });
  it('takes the top of a range and understands hours', () => {
    expect(parseRequestedMinutes('5-10 minutes to discuss')).toBe(10);
    expect(parseRequestedMinutes('five to ten minutes')).toBe(10);
    expect(parseRequestedMinutes('half an hour of review')).toBe(30);
    expect(parseRequestedMinutes('an hour long lesson')).toBe(60);
  });
  it('returns null when no time is named, and ignores timers inside the idea', () => {
    expect(parseRequestedMinutes('students draw a classmate and guess')).toBeNull();
    expect(parseRequestedMinutes('')).toBeNull();
    expect(parseRequestedMinutes(null)).toBeNull();
    // "60 seconds each" is a step length, not a budget for the activity.
    expect(parseRequestedMinutes('give them 60 seconds each')).toBeNull();
  });
});

describe('estimateDuration', () => {
  it('adds every timer plus a transition and overrun allowance', () => {
    const est = estimateDuration(config({
      lobby: { type: 'lobby', next: 'q' },
      q: { type: 'collect', prompt: 'Why?', timer: 90, next: 'end' },
      end: { type: 'end' }
    }));
    const expected = ALLOWANCES.lobbyJoin + 90 + ALLOWANCES.timedOverrun + ALLOWANCES.transition;
    expect(est.seconds).toBe(expected);
    expect(est.minutes).toBe(Math.ceil(expected / 60));
    expect(est.steps.map(s => s.id)).toEqual(['lobby', 'q']);
    expect(est.steps[1].timed).toBe(true);
  });

  it('gives host-paced screens reading time and merges a seat move', () => {
    const est = estimateDuration(config({
      lobby: { type: 'lobby', next: 'intro' },
      intro: { type: 'announce', message: 'Hello', next: 'pairs' },
      pairs: { type: 'merge', seedFrom: 'x', groupSize: 2, timer: 240, next: 'end' },
      end: { type: 'end' }
    }));
    const intro = est.steps.find(s => s.id === 'intro');
    const pairs = est.steps.find(s => s.id === 'pairs');
    expect(intro.seconds).toBe(ALLOWANCES.hostPacedRead + ALLOWANCES.transition);
    expect(pairs.seconds).toBe(240 + ALLOWANCES.seatMove + ALLOWANCES.timedOverrun + ALLOWANCES.transition);
  });

  it('charges the AI wait and untimed input steps', () => {
    const est = estimateDuration(config({
      lobby: { type: 'lobby', next: 'q' },
      q: { type: 'collect', prompt: 'Why?', next: 'ai' },
      ai: { type: 'ai-process', input: 'q.responses', task: 'summarize', next: 'end' },
      end: { type: 'end' }
    }));
    expect(est.steps.find(s => s.id === 'q').seconds).toBe(ALLOWANCES.untimedInput + ALLOWANCES.transition);
    expect(est.steps.find(s => s.id === 'ai').seconds).toBe(ALLOWANCES.aiProcess + ALLOWANCES.transition);
  });

  it('multiplies foreach rounds by the round length, limit first, then the class size', () => {
    const rounds = {
      type: 'foreach', data: 'q.responses', limit: 3,
      subPhases: { guess: { type: 'collect-choice', prompt: 'Guess', timer: 30, next: 'show' }, show: { type: 'reveal', template: 'x' } },
      next: 'end'
    };
    const est = estimateDuration(config({
      lobby: { type: 'lobby', next: 'q' },
      q: { type: 'collect', prompt: 'Why?', timer: 60, next: 'rounds' },
      rounds, end: { type: 'end' }
    }));
    const oneRound = (30 + ALLOWANCES.timedOverrun + ALLOWANCES.transition) + (ALLOWANCES.hostPacedRead + ALLOWANCES.transition);
    expect(est.steps.find(s => s.id === 'rounds').seconds).toBe(3 * oneRound);
    expect(est.steps.find(s => s.id === 'rounds').rounds).toBe(3);

    const unlimited = { ...rounds }; delete unlimited.limit;
    const est2 = estimateDuration(config({
      lobby: { type: 'lobby', next: 'q' },
      q: { type: 'collect', prompt: 'Why?', timer: 60, next: 'rounds' },
      rounds: unlimited, end: { type: 'end' }
    }), { players: 10 });
    expect(est2.steps.find(s => s.id === 'rounds').rounds).toBe(10);
  });

  it('walks only the primary path and survives cycles', () => {
    const est = estimateDuration(config({
      lobby: { type: 'lobby', next: 'a' },
      a: { type: 'announce', message: 'a', next: 'b' },
      b: { type: 'announce', message: 'b', next: 'a' },
      orphan: { type: 'announce', message: 'never' }
    }));
    expect(est.steps.map(s => s.id)).toEqual(['lobby', 'a', 'b']);
  });

  it('puts the real Snowball well over five minutes', () => {
    const est = estimateDuration(snowball);
    expect(est.minutes).toBeGreaterThan(5);
    expect(est.timerSeconds).toBe(90 + 240);
  });
});

describe('fitToBudget', () => {
  it('returns the config untouched when it already fits', () => {
    const c = config({
      lobby: { type: 'lobby', next: 'q' },
      q: { type: 'collect', prompt: 'Why?', timer: 30, next: 'end' },
      end: { type: 'end' }
    });
    const fit = fitToBudget(c, 5);
    expect(fit.changes).toEqual([]);
    expect(fit.config).toBe(c);
  });

  it('scales the timers down to the budget, never below their floors, and never touches the original', () => {
    const fit = fitToBudget(snowball, 7);
    expect(fit.fits).toBe(true);
    expect(fit.changes.length).toBe(2);
    const solo = fit.changes.find(ch => ch.id === 'solo');
    const pairs = fit.changes.find(ch => ch.id === 'pairs');
    expect(solo.from).toBe(90);
    expect(pairs.from).toBe(240);
    expect(solo.to).toBeLessThan(90);
    expect(pairs.to).toBeLessThan(240);
    expect(solo.to).toBeGreaterThanOrEqual(TIMER_FLOORS.collect);
    expect(pairs.to).toBeGreaterThanOrEqual(TIMER_FLOORS.merge);
    expect(fit.estimate.minutes).toBeLessThanOrEqual(7);
    // The trimmed config is a copy; the built-in is drift-guarded.
    expect(snowball.phases.solo.timer).toBe(90);
    expect(fit.config.phases.solo.timer).toBe(solo.to);
  });

  it('still hands over the floor trim when even the shortest timers cannot fit', () => {
    const fit = fitToBudget(snowball, 5);
    expect(fit.fits).toBe(false);
    expect(fit.changes.length).toBe(2);
    expect(fit.changes.find(ch => ch.id === 'solo').to).toBe(TIMER_FLOORS.collect);
    expect(fit.changes.find(ch => ch.id === 'pairs').to).toBe(TIMER_FLOORS.merge);
    expect(fit.config.phases.pairs.timer).toBe(TIMER_FLOORS.merge);
    expect(fit.estimate.minutes).toBeGreaterThan(5);
  });
});

describe('paramsForTrim', () => {
  const template = {
    solo: { type: 'collect', timer: '${soloTimer}' },
    pairs: { type: 'merge', timer: 240 },
    rounds: { type: 'foreach', subPhases: { guess: { type: 'collect-choice', timer: '${guessTimer}' } } }
  };
  it('writes a trimmed timer back onto the parameter it came from, and only that', () => {
    const out = paramsForTrim(template, { soloTimer: 90, guessTimer: 30, prompt: 'Why?' }, [
      { id: 'solo', to: 30 }, { id: 'pairs', to: 90 }, { id: 'rounds.guess', to: 15 }
    ]);
    expect(out.params).toEqual({ soloTimer: 30, guessTimer: 15, prompt: 'Why?' });
    expect(out.changed).toEqual(['soloTimer', 'guessTimer']);
  });
  it('leaves params alone when nothing maps', () => {
    const params = { prompt: 'Why?' };
    const out = paramsForTrim(template, params, [{ id: 'pairs', to: 90 }]);
    expect(out.params).toEqual(params);
    expect(out.changed).toEqual([]);
  });
});

describe('timingReport', () => {
  it('states the estimate alone when no time was requested', () => {
    const rep = timingReport(snowball, null);
    expect(rep.requestedMinutes).toBeNull();
    expect(rep.over).toBe(false);
    expect(rep.trim).toBeNull();
    expect(rep.note).toMatch(/^About \d+ minutes as set up\.$/);
  });

  it('flags an overrun against the request and offers the trim with specifics', () => {
    const rep = timingReport(snowball, 7);
    expect(rep.over).toBe(true);
    expect(rep.trim).not.toBeNull();
    expect(rep.trim.config.phases.pairs.timer).toBeLessThan(240);
    expect(rep.trim.estimatedMinutes).toBeLessThanOrEqual(7);
    expect(rep.note).toContain('7');
    expect(rep.note).toMatch(/Solo \d+s to \d+s/);
    expect(rep.note).not.toContain('—');
  });

  it("tells the truth when the request is under the floors (the reviewer's five-minute Snowball)", () => {
    const rep = timingReport(snowball, 5);
    expect(rep.over).toBe(true);
    expect(rep.note).toContain('even with the shortest timers');
    expect(rep.note).toContain('5');
    expect(rep.trim).not.toBeNull();
    expect(rep.trim.estimatedMinutes).toBeGreaterThan(5);
    expect(rep.trim.config.phases.solo.timer).toBe(TIMER_FLOORS.collect);
  });

  it('says so plainly when it fits', () => {
    const rep = timingReport(snowball, 20);
    expect(rep.over).toBe(false);
    expect(rep.trim).toBeNull();
    expect(rep.note).toContain('20');
  });

  it('can be told not to offer a trim', () => {
    const rep = timingReport(snowball, 5, { trim: false });
    expect(rep.over).toBe(true);
    expect(rep.trim).toBeNull();
    expect(rep.note).toContain('5');
  });
});
