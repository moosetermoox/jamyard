// The crown shows WHAT the winner won for: when the winner phase's scores
// come from a vote over collected responses, the winner's own submission is
// traced back and surfaced (winnerEntry / winnerEntries). An explicit
// `entryFrom` ref overrides the auto-trace.
import { describe, it, expect } from 'vitest';
import { traceEntryRef, findWinnerEntries } from '../../engine/phases/winner-handler.js';
import { GameEngine } from '../../engine/game-engine.js';

describe('traceEntryRef', () => {
  const phases = {
    ideas: { type: 'collect', prompt: 'Best idea?', next: 'vote' },
    vote: { type: 'vote', mode: 'pick-one', candidates: 'ideas.responses', next: 'crown' },
    crown: { type: 'winner', from: 'vote.scores', next: 'end' }
  };

  it('follows vote scores back to the responses the vote judged', () => {
    expect(traceEntryRef(phases.crown, phases)).toBe('ideas.responses');
  });

  it('explicit entryFrom wins over the auto-trace', () => {
    const phase = { ...phases.crown, entryFrom: 'other.responses' };
    expect(traceEntryRef(phase, phases)).toBe('other.responses');
  });

  it('returns null when the score source is not a vote', () => {
    const p = { quiz: { type: 'collect-choice' }, crown: { type: 'winner', from: 'quiz.scores' } };
    expect(traceEntryRef(p.crown, p)).toBeNull();
  });

  it('ignores literal candidate lists (arrays and comma strings carry no playerIds)', () => {
    const arr = { v: { type: 'vote', candidates: ['Cats', 'Dogs'] }, crown: { type: 'winner', from: 'v.scores' } };
    expect(traceEntryRef(arr.crown, arr)).toBeNull();
    const lit = { v: { type: 'vote', candidates: 'Cats, Dogs' }, crown: { type: 'winner', from: 'v.scores' } };
    expect(traceEntryRef(lit.crown, lit)).toBeNull();
  });

  it('returns null on missing/undotted from refs and unknown source phases', () => {
    expect(traceEntryRef({ type: 'winner' }, phases)).toBeNull();
    expect(traceEntryRef({ type: 'winner', from: 'scores' }, phases)).toBeNull();
    expect(traceEntryRef({ type: 'winner', from: 'ghost.scores' }, phases)).toBeNull();
  });
});

describe('findWinnerEntries', () => {
  const records = [
    { playerId: 'p1', name: 'Ada', text: 'Robot pets' },
    { playerId: 'p2', name: 'Ben', text: 'Longer recess' },
    { playerId: 'p3', name: 'Cy', text: '[drawing]', drawing: [] }
  ];

  it('returns each winner\'s own submission, in winner order', () => {
    expect(findWinnerEntries(['p2', 'p1'], records)).toEqual([
      { playerId: 'p2', name: 'Ben', text: 'Longer recess' },
      { playerId: 'p1', name: 'Ada', text: 'Robot pets' }
    ]);
  });

  it('skips drawings, missing records, and blank text', () => {
    expect(findWinnerEntries(['p3'], records)).toEqual([]);
    expect(findWinnerEntries(['ghost'], records)).toEqual([]);
    expect(findWinnerEntries(['p1'], [{ playerId: 'p1', name: 'Ada', text: '   ' }])).toEqual([]);
  });

  it('is safe on malformed input', () => {
    expect(findWinnerEntries(null, records)).toEqual([]);
    expect(findWinnerEntries(['p1'], null)).toEqual([]);
    expect(findWinnerEntries(['p1'], [null, 'nope'])).toEqual([]);
  });
});

describe('winner phase output carries the winning entry', () => {
  function makeEngine() {
    const engine = new GameEngine({
      phases: {
        lobby: { type: 'lobby', next: 'ideas' },
        ideas: { type: 'collect', prompt: 'Best idea?', next: 'vote' },
        vote: { type: 'vote', mode: 'pick-one', candidates: 'ideas.responses', question: 'Pick!', next: 'crown' },
        crown: { type: 'winner', from: 'vote.scores', next: 'end' },
        end: { type: 'end' }
      }
    });
    engine.players.add('p1', 'Ada', 't1');
    engine.players.add('p2', 'Ben', 't2');
    engine.phaseData['ideas'] = {
      responses: [
        { playerId: 'p1', name: 'Ada', text: 'Robot pets' },
        { playerId: 'p2', name: 'Ben', text: 'Longer recess' }
      ]
    };
    return engine;
  }

  it('winnerEntry is the winner\'s own submission', () => {
    const engine = makeEngine();
    engine.phaseData['vote'] = { scores: { p1: 3, p2: 1 } };
    const result = engine.runPhase('crown');
    expect(result.winnerName).toBe('Ada');
    expect(result.winnerEntry).toBe('Robot pets');
    expect(result.winnerEntries).toEqual([{ playerId: 'p1', name: 'Ada', text: 'Robot pets' }]);
  });

  it('ties carry every tied winner\'s entry', () => {
    const engine = makeEngine();
    engine.phaseData['vote'] = { scores: { p1: 2, p2: 2 } };
    const result = engine.runPhase('crown');
    expect(result.isTie).toBe(true);
    expect(result.winnerEntries.map(e => e.text).sort()).toEqual(['Longer recess', 'Robot pets']);
  });

  it('non-vote score sources produce no entry (and no crash)', () => {
    const engine = new GameEngine({
      phases: {
        lobby: { type: 'lobby', next: 'quiz' },
        quiz: { type: 'collect-choice', prompt: 'Q', choices: ['a'], next: 'crown' },
        crown: { type: 'winner', from: 'quiz.scores', next: 'end' },
        end: { type: 'end' }
      }
    });
    engine.players.add('p1', 'Ada', 't1');
    engine.phaseData['quiz'] = { scores: { p1: 100 } };
    const result = engine.runPhase('crown');
    expect(result.winnerName).toBe('Ada');
    expect(result.winnerEntry).toBeNull();
    expect(result.winnerEntries).toEqual([]);
  });
});
