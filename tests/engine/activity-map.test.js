// activity-map: the treasure-map summary of an activity's path.
// Pure derivation from a game config: walk the primary phase chain,
// drop lobby/end (the map draws its own start and treasure marks),
// fold foreach and repeated runs into "rounds" stops, and carry a short
// excerpt of the human-facing content per stop.
import { describe, it, expect } from 'vitest';
import { buildActivityMap } from '../../engine/activity-map.js';

function cfg(phases) {
  return { name: 'Test', phases };
}

describe('buildActivityMap', () => {
  it('walks the next chain and drops lobby and end', () => {
    const map = buildActivityMap(cfg({
      lobby: { type: 'lobby', next: 'write' },
      write: { type: 'collect', prompt: 'Draw your dream invention', next: 'vote' },
      vote: { type: 'vote', next: 'done' },
      done: { type: 'end' }
    }));
    expect(map.stops.map(s => s.type)).toEqual(['collect', 'vote']);
    expect(map.stops.every(s => s.kind === 'step')).toBe(true);
  });

  it('carries a short excerpt of the step content', () => {
    const map = buildActivityMap(cfg({
      lobby: { type: 'lobby', next: 'write' },
      write: { type: 'collect', prompt: 'What is one thing you want to learn this year?', next: 'done' },
      done: { type: 'end' }
    }));
    expect(map.stops[0].detail).toBe('What is one thing you want to learn this year?');
  });

  it('truncates long excerpts at a word boundary', () => {
    const long = 'This prompt goes on and on about many wonderful classroom things that no map caption could ever hold';
    const map = buildActivityMap(cfg({
      lobby: { type: 'lobby', next: 'write' },
      write: { type: 'collect', prompt: long, next: 'done' },
      done: { type: 'end' }
    }));
    expect(map.stops[0].detail.length).toBeLessThanOrEqual(65);
    expect(map.stops[0].detail.endsWith('…')).toBe(true);
    expect(map.stops[0].detail).not.toContain('  ');
  });

  it('skips excerpts holding template refs', () => {
    const map = buildActivityMap(cfg({
      lobby: { type: 'lobby', next: 'show' },
      show: { type: 'announce', message: 'The winner was {{vote.winner}}', next: 'done' },
      done: { type: 'end' }
    }));
    expect(map.stops[0].detail).toBeUndefined();
  });

  it('follows approveNext through a preview gate', () => {
    const map = buildActivityMap(cfg({
      lobby: { type: 'lobby', next: 'draw' },
      draw: { type: 'collect', inputType: 'drawing', next: 'gate' },
      gate: { type: 'preview', approveNext: 'gallery', rejectNext: 'draw' },
      gallery: { type: 'reveal', next: 'done' },
      done: { type: 'end' }
    }));
    expect(map.stops.map(s => s.type)).toEqual(['collect', 'preview', 'reveal']);
  });

  it('follows the first branch of nextByWinner and counts the branches', () => {
    const map = buildActivityMap(cfg({
      lobby: { type: 'lobby', next: 'pick' },
      pick: { type: 'vote', candidates: ['Cave', 'Beach'], nextByWinner: { Cave: 'cave', Beach: 'beach' } },
      cave: { type: 'announce', message: 'Cave it is', next: 'done' },
      beach: { type: 'announce', message: 'Beach it is', next: 'done' },
      done: { type: 'end' }
    }));
    expect(map.stops.map(s => s.type)).toEqual(['vote', 'announce']);
    expect(map.stops[0].branches).toBe(2);
  });

  it('folds a foreach into one rounds stop with its sub steps in order', () => {
    const map = buildActivityMap(cfg({
      lobby: { type: 'lobby', next: 'write' },
      write: { type: 'collect', prompt: 'Write a fact', next: 'rounds' },
      rounds: {
        type: 'foreach', data: 'write.responses', limit: 5,
        subPhases: {
          guess: { type: 'collect-choice', question: 'Which is real?', next: 'answer' },
          answer: { type: 'announce', message: 'The truth' }
        },
        next: 'done'
      },
      done: { type: 'end' }
    }));
    const rounds = map.stops[1];
    expect(rounds.kind).toBe('rounds');
    expect(rounds.rounds).toBe(5);
    expect(rounds.sub).toEqual(['collect-choice', 'announce']);
  });

  it('a foreach without a limit reports rounds as null (one per answer)', () => {
    const map = buildActivityMap(cfg({
      lobby: { type: 'lobby', next: 'rounds' },
      rounds: {
        type: 'foreach', data: 'x.responses',
        subPhases: { show: { type: 'announce', message: 'Look' } },
        next: 'done'
      },
      done: { type: 'end' }
    }));
    expect(map.stops[0].kind).toBe('rounds');
    expect(map.stops[0].rounds).toBeNull();
  });

  it('collapses a repeating run of steps into one rounds stop', () => {
    const phases = { lobby: { type: 'lobby', next: 'q1' } };
    for (let i = 1; i <= 3; i++) {
      phases['q' + i] = { type: 'collect-choice', question: 'Question ' + i, next: 'a' + i };
      phases['a' + i] = { type: 'announce', message: 'Answer ' + i, next: i < 3 ? 'q' + (i + 1) : 'done' };
    }
    phases.done = { type: 'end' };
    const map = buildActivityMap(cfg(phases));
    expect(map.stops).toHaveLength(1);
    expect(map.stops[0].kind).toBe('rounds');
    expect(map.stops[0].rounds).toBe(3);
    expect(map.stops[0].sub).toEqual(['collect-choice', 'announce']);
  });

  it('collapses long-period rounds (trivia-bluff shape: 5 steps per round)', () => {
    const block = ['ai-process', 'announce', 'collect', 'collect-choice', 'announce'];
    const phases = { lobby: { type: 'lobby', next: 'intro' }, intro: { type: 'announce', message: 'Welcome', next: 'r0s0' } };
    const total = 3 * block.length;
    for (let r = 0; r < 3; r++) {
      for (let s = 0; s < block.length; s++) {
        const n = r * block.length + s;
        phases['r' + r + 's' + s] = {
          type: block[s],
          next: n + 1 < total ? 'r' + Math.floor((n + 1) / block.length) + 's' + ((n + 1) % block.length) : 'done'
        };
      }
    }
    phases.done = { type: 'end' };
    const map = buildActivityMap(cfg(phases));
    expect(map.stops.map(s => s.kind)).toEqual(['step', 'rounds']);
    expect(map.stops[1].rounds).toBe(3);
    expect(map.stops[1].sub).toEqual(block);
  });

  it('does not collapse just two same-type steps in a row', () => {
    const map = buildActivityMap(cfg({
      lobby: { type: 'lobby', next: 'intro' },
      intro: { type: 'announce', message: 'Welcome', next: 'rules' },
      rules: { type: 'announce', message: 'The rules', next: 'done' },
      done: { type: 'end' }
    }));
    expect(map.stops.map(s => s.type)).toEqual(['announce', 'announce']);
  });

  it('ignores unreachable phases and survives cycles', () => {
    const map = buildActivityMap(cfg({
      lobby: { type: 'lobby', next: 'a' },
      a: { type: 'announce', message: 'Hello', next: 'b' },
      b: { type: 'announce', message: 'Loop', next: 'a' },
      orphan: { type: 'collect', prompt: 'Never reached' }
    }));
    expect(map.stops.map(s => s.type)).toEqual(['announce', 'announce']);
  });

  it('returns no stops for an empty or missing phase set', () => {
    expect(buildActivityMap({ name: 'X' }).stops).toEqual([]);
    expect(buildActivityMap(cfg({})).stops).toEqual([]);
  });

  it('folded runs sample excerpts from across the run, not just the first', () => {
    const phases = { lobby: { type: 'lobby', next: 'a1' } };
    for (let i = 1; i <= 7; i++) {
      phases['a' + i] = { type: 'announce', message: 'Talk prompt number ' + i, next: i < 7 ? 'a' + (i + 1) : 'done' };
    }
    phases.done = { type: 'end' };
    const map = buildActivityMap(cfg(phases));
    expect(map.stops).toHaveLength(1);
    const samples = map.stops[0].samples;
    expect(samples).toHaveLength(3);
    expect(samples[0]).toBe('Talk prompt number 1');
    expect(samples).toContain('Talk prompt number 7');
    expect(new Set(samples).size).toBe(3);
  });

  it('flags a talk-driven activity (announce-heavy, nothing typed)', () => {
    const phases = { lobby: { type: 'lobby', next: 'a1' } };
    for (let i = 1; i <= 5; i++) {
      phases['a' + i] = { type: 'announce', message: 'Question ' + i, next: i < 5 ? 'a' + (i + 1) : 'checkout' };
    }
    phases.checkout = { type: 'rate', prompt: 'How did that feel?', next: 'done' };
    phases.done = { type: 'end' };
    const map = buildActivityMap(cfg(phases));
    expect(map.talk).toBe(true);
  });

  it('does not flag activities where students type', () => {
    const map = buildActivityMap(cfg({
      lobby: { type: 'lobby', next: 'i1' },
      i1: { type: 'announce', message: 'Intro one', next: 'i2' },
      i2: { type: 'announce', message: 'Intro two', next: 'i3' },
      i3: { type: 'announce', message: 'Intro three', next: 'write' },
      write: { type: 'collect', prompt: 'Type an answer', next: 'done' },
      done: { type: 'end' }
    }));
    expect(map.talk).toBeUndefined();
  });

  // --- carries: the hand-offs of student work between stops ---

  it('marks a rotation collect as receiving a classmate\'s work', () => {
    const map = buildActivityMap(cfg({
      lobby: { type: 'lobby', next: 'start' },
      start: { type: 'collect', prompt: 'Start a story', next: 'add' },
      add: { type: 'collect', prompt: 'Continue it', rotateFrom: 'start', next: 'done' },
      done: { type: 'end' }
    }));
    expect(map.stops[0].carries).toBeUndefined();
    expect(map.stops[1].carries).toBe('classmate-work');
  });

  it('marks merge and relay as inherently building on each other', () => {
    const map = buildActivityMap(cfg({
      lobby: { type: 'lobby', next: 'write' },
      write: { type: 'collect', prompt: 'One idea', next: 'combine' },
      combine: { type: 'merge', next: 'chain' },
      chain: { type: 'relay', next: 'done' },
      done: { type: 'end' }
    }));
    expect(map.stops[1].carries).toBe('partners-combine');
    expect(map.stops[2].carries).toBe('build-on-last');
  });

  it('marks a vote over student submissions, but not over fixed options', () => {
    const map = buildActivityMap(cfg({
      lobby: { type: 'lobby', next: 'write' },
      write: { type: 'collect', prompt: 'Best invention', next: 'pick' },
      pick: { type: 'vote', candidates: 'write.responses', next: 'fixed' },
      fixed: { type: 'vote', candidates: ['Cats', 'Dogs'], next: 'done' },
      done: { type: 'end' }
    }));
    expect(map.stops[1].carries).toBe('class-judges-own');
    expect(map.stops[2].carries).toBeUndefined();
  });

  it('marks AI reading the class pile and the reveal of class work', () => {
    const map = buildActivityMap(cfg({
      lobby: { type: 'lobby', next: 'write' },
      write: { type: 'collect', prompt: 'A dream', next: 'remix' },
      remix: { type: 'ai-process', instruction: 'Combine the dreams', input: 'write.responses', next: 'show' },
      show: { type: 'reveal', content: 'remix.result', next: 'done' },
      done: { type: 'end' }
    }));
    expect(map.stops[1].carries).toBe('ai-reads-pile');
    expect(map.stops[2].carries).toBe('work-goes-up-front');
  });

  it('marks a templated reveal of student work (snowball shape)', () => {
    const map = buildActivityMap(cfg({
      lobby: { type: 'lobby', next: 'write' },
      write: { type: 'collect', prompt: 'A norm', next: 'pairs' },
      pairs: { type: 'merge', next: 'share' },
      share: { type: 'reveal', template: 'What the pairs built:\n{{pairs.merged.list}}', next: 'done' },
      done: { type: 'end' }
    }));
    expect(map.stops[2].carries).toBe('work-goes-up-front');
  });

  it('marks pair-scoped reveals as a partner trade', () => {
    const map = buildActivityMap(cfg({
      lobby: { type: 'lobby', next: 'write' },
      write: { type: 'collect', prompt: 'A secret talent', assign: 'pairwise', next: 'swap' },
      swap: { type: 'reveal', scope: 'pair', pairsFrom: 'write', content: 'write.responses', next: 'done' },
      done: { type: 'end' }
    }));
    expect(map.stops[1].carries).toBe('partner-swap');
  });

  it('folded rounds carry the first hand-off found inside the round', () => {
    const phases = { lobby: { type: 'lobby', next: 'w1' } };
    for (let i = 1; i <= 3; i++) {
      phases['w' + i] = { type: 'collect', prompt: 'Write a lie ' + i, next: 'p' + i };
      phases['p' + i] = {
        type: 'collect-choice', question: 'Which is true?',
        choicePool: [{ from: 'w' + i + '.responses' }, { literal: 'The truth' }],
        next: i < 3 ? 'w' + (i + 1) : 'done'
      };
    }
    phases.done = { type: 'end' };
    const map = buildActivityMap(cfg(phases));
    expect(map.stops[0].kind).toBe('rounds');
    expect(map.stops[0].carries).toBe('answers-become-choices');
  });

  it('marks a foreach fed by class answers as a round per answer', () => {
    const map = buildActivityMap(cfg({
      lobby: { type: 'lobby', next: 'write' },
      write: { type: 'collect', prompt: 'Write an excuse', next: 'rounds' },
      rounds: {
        type: 'foreach', data: 'write.responses',
        subPhases: { show: { type: 'announce', message: 'Behold' } },
        next: 'done'
      },
      done: { type: 'end' }
    }));
    expect(map.stops[1].carries).toBe('round-per-answer');
  });

  // Each stop names the phase ids it covers, so a live view (the preview
  // map rail) can point "you are here" at the stop matching the room's
  // current phase.
  it('plain stops carry their phase id', () => {
    const map = buildActivityMap(cfg({
      lobby: { type: 'lobby', next: 'write' },
      write: { type: 'collect', prompt: 'Write', next: 'vote' },
      vote: { type: 'vote', next: 'done' },
      done: { type: 'end' }
    }));
    expect(map.stops.map(s => s.ids)).toEqual([['write'], ['vote']]);
  });

  it('a folded rounds stop carries every phase id it covers', () => {
    const phases = { lobby: { type: 'lobby', next: 'q1' } };
    for (let i = 1; i <= 3; i++) {
      phases['q' + i] = { type: 'collect-choice', question: 'Question ' + i, next: 'a' + i };
      phases['a' + i] = { type: 'announce', message: 'Answer ' + i, next: i < 3 ? 'q' + (i + 1) : 'done' };
    }
    phases.done = { type: 'end' };
    const map = buildActivityMap(cfg(phases));
    expect(map.stops[0].ids).toEqual(['q1', 'a1', 'q2', 'a2', 'q3', 'a3']);
  });

  it('a foreach rounds stop carries the foreach phase id', () => {
    const map = buildActivityMap(cfg({
      lobby: { type: 'lobby', next: 'rounds' },
      rounds: {
        type: 'foreach', data: 'x.responses',
        subPhases: { show: { type: 'announce', message: 'Look' } },
        next: 'done'
      },
      done: { type: 'end' }
    }));
    expect(map.stops[0].ids).toEqual(['rounds']);
  });
});
