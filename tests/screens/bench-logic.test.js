// bench-logic.js is a plain browser script that attaches to globalThis —
// the side-effect import pattern shared with game-visibility.js. It holds
// the pure decisions behind Try it out's header plan row and NEXT banner
// (design handoff 14a/15a, 2026-09-09) so they can be tested without a DOM.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import '../../screens/prototype/bench-logic.js';

const { planBlocks, nextStep, isStudentStep, HOST_ADVANCE_BUTTONS } = globalThis.BenchLogic;

const NAMES = { collect: 'Open answer', vote: 'Vote', reveal: 'Reveal results', announce: 'Announcement' };
const nameOf = (t) => NAMES[t] || t;

function stops(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ kind: 'step', type: i % 2 ? 'reveal' : 'collect', ids: ['s' + i] });
  return out;
}

describe('planBlocks: the plan as a row of blocks', () => {
  it('wraps the stops in a Join block and a Wrap up block', () => {
    const blocks = planBlocks(stops(3), -1, { nameOf });
    expect(blocks.map(b => b.kind)).toEqual(['join', 'stop', 'stop', 'stop', 'end']);
    expect(blocks[0].label).toBe('Join');
    expect(blocks[4].label).toBe('Wrap up');
    expect(blocks[1].number).toBe(1);
    expect(blocks[1].label).toBe('Open answer');
  });

  it('marks the lobby as now before the first stop, then done', () => {
    expect(planBlocks(stops(2), -1, { nameOf })[0].state).toBe('now');
    const later = planBlocks(stops(2), 0, { nameOf });
    expect(later[0].state).toBe('done');
    expect(later[1].state).toBe('now');
    expect(later[2].state).toBe('later');
  });

  it('marks passed stops done, the live one now, and Wrap up now at the end', () => {
    const mid = planBlocks(stops(4), 2, { nameOf });
    expect(mid.map(b => b.state)).toEqual(['done', 'done', 'done', 'now', 'later', 'later']);
    const end = planBlocks(stops(4), 4, { nameOf });
    expect(end.map(b => b.state)).toEqual(['done', 'done', 'done', 'done', 'done', 'now']);
  });

  it('names a run of rounds by its count and step', () => {
    const rounds = [{ kind: 'rounds', rounds: 3, sub: ['collect'], ids: ['r'] }];
    expect(planBlocks(rounds, -1, { nameOf })[1].label).toBe('3 × Open answer');
    const open = [{ kind: 'rounds', rounds: null, sub: ['collect', 'vote'], ids: ['r'] }];
    expect(planBlocks(open, -1, { nameOf })[1].label).toBe('Rounds');
  });

  it('leaves a plan of seven blocks or fewer unfolded', () => {
    expect(planBlocks(stops(5), 1, { nameOf }).some(b => b.kind === 'fold')).toBe(false);
  });

  it('folds a long plan around the live step, keeping the first and last stops', () => {
    const blocks = planBlocks(stops(10), 5, { nameOf, cap: 7 });
    expect(blocks.length).toBeLessThanOrEqual(7);
    expect(blocks.map(b => b.kind)).toEqual(['join', 'stop', 'fold', 'stop', 'fold', 'stop', 'end']);
    expect(blocks[1].index).toBe(0);
    expect(blocks[3].index).toBe(5);
    expect(blocks[3].state).toBe('now');
    expect(blocks[5].index).toBe(9);
    // The folded blocks are still there for the "open the full list" click
    expect(blocks[2].blocks.map(b => b.index)).toEqual([1, 2, 3, 4]);
    expect(blocks[4].blocks.map(b => b.index)).toEqual([6, 7, 8]);
    expect(blocks[2].count).toBe(4);
  });

  it('folds only one side when the live step is near an edge', () => {
    const blocks = planBlocks(stops(10), 0, { nameOf, cap: 7 });
    expect(blocks.map(b => b.kind)).toEqual(['join', 'stop', 'fold', 'stop', 'end']);
  });

  it('returns the whole row when asked to expand', () => {
    const blocks = planBlocks(stops(10), 5, { nameOf, cap: 7, expanded: true });
    expect(blocks.length).toBe(12);
    expect(blocks.some(b => b.kind === 'fold')).toBe(false);
  });

  it('keeps no block as now when the position is unknown', () => {
    const blocks = planBlocks(stops(3), -2, { nameOf });
    expect(blocks.some(b => b.state === 'now')).toBe(false);
  });
});

describe('isStudentStep: when the shortcuts strip shows', () => {
  it('is true for steps students answer on their own screens', () => {
    for (const t of ['collect', 'collect-choice', 'vote', 'estimate', 'rank', 'rate', 'relay', 'merge', 'solo-quiz']) {
      expect(isStudentStep(t)).toBe(true);
    }
  });
  it('is false for the lobby, projector-only steps, the AI, and the end', () => {
    for (const t of ['lobby', 'announce', 'reveal', 'winner', 'ai-process', 'preview', 'end', null]) {
      expect(isStudentStep(t)).toBe(false);
    }
  });
});

describe('nextStep: the one thing to press', () => {
  it('points at Launch before the room exists', () => {
    expect(nextStep({ launched: false })).toEqual({ at: 'launch', text: 'Pick an activity, then press LAUNCH.' });
  });

  it('points at the teacher screen\'s Start in the lobby', () => {
    const step = nextStep({ launched: true, phaseType: 'lobby', startEnabled: true });
    expect(step.at).toBe('start');
    expect(step.text).toBe("Press START to begin. You'll play the students too.");
  });

  it('points at the add-a-student slot when Start is still locked', () => {
    const step = nextStep({ launched: true, phaseType: 'lobby', startEnabled: false, startHint: 'Start unlocks when the first student joins.' });
    expect(step.at).toBe('add-student');
    expect(step.text).toContain('first student');
  });

  it('points at Add sample answers on an answer step', () => {
    const step = nextStep({ launched: true, phaseType: 'collect' });
    expect(step).toEqual({ at: 'samples', text: 'Press ADD SAMPLE ANSWERS to fill one in for everyone.' });
  });

  it('moves to the teacher screen once every student has answered', () => {
    const step = nextStep({ launched: true, phaseType: 'collect', allIn: true, hostButtonLabel: 'Close submissions' });
    expect(step).toEqual({ at: 'close', text: 'Press CLOSE SUBMISSIONS.' });
  });

  it('points at Skip timer when samples went in but the step did not close', () => {
    const step = nextStep({ launched: true, phaseType: 'collect', samplesPressed: true, allIn: false });
    expect(step.at).toBe('skip');
    expect(step.text).toBe('Press SKIP TIMER to move on.');
  });

  it('sends the teacher to Teacher controls on a preview gate', () => {
    expect(nextStep({ launched: true, phaseType: 'preview' })).toEqual({ at: 'teacher-controls', text: 'Open Teacher controls to approve.' });
  });

  it('points at the host\'s own button on a teacher-paced step, in its words', () => {
    const step = nextStep({ launched: true, phaseType: 'reveal', hostButtonLabel: 'Continue' });
    expect(step).toEqual({ at: 'continue', text: 'Press CONTINUE when the class is ready.' });
  });

  it('has nothing to point at while the AI works or a step runs itself', () => {
    expect(nextStep({ launched: true, phaseType: 'ai-process' }).at).toBe(null);
    expect(nextStep({ launched: true, phaseType: 'announce', hostButtonLabel: null }).at).toBe(null);
  });

  it('carries a status line instead while skipping ahead', () => {
    const step = nextStep({ launched: true, phaseType: 'collect', busy: 'Skipping ahead to step 3...' });
    expect(step).toEqual({ at: null, text: 'Skipping ahead to step 3...' });
  });

  it('closes on Reset and Host this at the end', () => {
    const step = nextStep({ launched: true, phaseType: 'end' });
    expect(step.at).toBe('reset');
    expect(step.text).toContain('Host this');
  });

  it('never uses an em dash in banner copy', () => {
    const states = [
      { launched: false }, { launched: true, phaseType: 'lobby', startEnabled: true },
      { launched: true, phaseType: 'lobby', startEnabled: false }, { launched: true, phaseType: 'collect' },
      { launched: true, phaseType: 'collect', allIn: true, hostButtonLabel: 'Close' },
      { launched: true, phaseType: 'collect', samplesPressed: true }, { launched: true, phaseType: 'preview' },
      { launched: true, phaseType: 'reveal', hostButtonLabel: 'Continue' }, { launched: true, phaseType: 'ai-process' },
      { launched: true, phaseType: 'announce' }, { launched: true, phaseType: 'end' }
    ];
    for (const s of states) expect(nextStep(s).text).not.toMatch(/—/);
  });
});

describe('TOUR_STOPS: the first-visit tour names every piece', () => {
  const { TOUR_STOPS } = globalThis.BenchLogic;
  const html = readFileSync(new URL('../../screens/prototype/index.html', import.meta.url), 'utf8');
  const ids = new Set(Array.from(html.matchAll(/\bid="([^"]+)"/g)).map(m => m[1]));

  it('has a stop for each piece a teacher meets, in walking order', () => {
    const targets = TOUR_STOPS.map(s => s.target);
    expect(targets).toEqual([
      '#host-column', '#host-tabs', '#student-column', '#pager', '#add-student-btn',
      '#bench-bar', '#map-rail', '#toolbar', '#next-banner'
    ]);
  });

  it('points only at elements that exist on the page (fallbacks too)', () => {
    for (const stop of TOUR_STOPS) {
      expect(stop.target.startsWith('#')).toBe(true);
      expect(ids.has(stop.target.slice(1))).toBe(true);
      if (stop.fallback) expect(ids.has(stop.fallback.slice(1))).toBe(true);
    }
  });

  it('keeps every stop to a title and a short plain sentence or two', () => {
    for (const stop of TOUR_STOPS) {
      expect(stop.title.length).toBeGreaterThan(2);
      expect(stop.text.split(/\s+/).length).toBeLessThanOrEqual(45);
      expect(stop.title + stop.text).not.toMatch(/—/);
    }
  });

  it('gives the shortcuts stop a fallback, since the strip is hidden in the lobby', () => {
    const shortcuts = TOUR_STOPS.find(s => s.target === '#bench-bar');
    expect(shortcuts.fallback).toBe('#student-mat');
  });
});

describe('HOST_ADVANCE_BUTTONS mirrors the host\'s prototype-skip list', () => {
  it('names every button id host.js clicks on a skip, in the same order', () => {
    const src = readFileSync(new URL('../../screens/host/host.js', import.meta.url), 'utf8');
    const start = src.indexOf("e.data.type !== 'prototype-skip'");
    const listStart = src.indexOf('const candidates = [', start);
    const listEnd = src.indexOf('];', listStart);
    const ids = Array.from(src.slice(listStart, listEnd).matchAll(/'([a-z0-9-]+)'/g)).map(m => m[1]);
    expect(ids.length).toBeGreaterThan(10);
    expect(HOST_ADVANCE_BUTTONS).toEqual(ids);
  });
});

describe('Play Again inside the bench', () => {
  // The projector's Play Again reloads the page into a new room. Inside
  // Try it out that new room was one nothing else on the bench knew about:
  // the pretend students, the console tab and the plan rail stayed on the
  // old one (owner, 2026-09-12). The host hands the click to the bench,
  // which resets and relaunches the same activity with the same count.
  it('the host hands the click to the bench instead of reloading', () => {
    const src = readFileSync(new URL('../../screens/host/host.js', import.meta.url), 'utf8');
    const start = src.indexOf("playAgainBtn.addEventListener('click'");
    const handler = src.slice(start, src.indexOf('});', start));
    expect(handler).toContain("type: 'prototype-play-again'");
    expect(handler.indexOf('prototype-play-again')).toBeLessThan(handler.indexOf('location.reload'));
  });

  it('the bench resets and relaunches on that message', () => {
    const src = readFileSync(new URL('../../screens/prototype/prototype.js', import.meta.url), 'utf8');
    const start = src.indexOf("e.data.type !== 'prototype-play-again'");
    expect(start).toBeGreaterThan(-1);
    const handler = src.slice(start, src.indexOf('});', start));
    expect(handler).toContain('resetBtn.click()');
    expect(handler).toContain('launchBtn.click()');
  });
});
