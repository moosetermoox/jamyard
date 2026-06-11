/**
 * Branching votes — vote.nextByWinner routes the game by outcome.
 *
 * The structural gap this closes: `next` could never depend on what the
 * class decided. With nextByWinner, a pick-one vote on literal options
 * ("Enter the cave" / "Climb the mountain") sends the game down different
 * phase paths — choose-your-own-adventure.
 */

import { describe, it, expect } from 'vitest';
import { resolveBranchTarget, candidateText } from '../../engine/phases/vote-handler.js';
import { validate } from '../../engine/game-loader.js';
import { GameEngine } from '../../engine/game-engine.js';

describe('candidateText', () => {
  it('handles literal strings, response objects, and nulls', () => {
    expect(candidateText('Enter the cave')).toBe('Enter the cave');
    expect(candidateText({ playerId: 'p1', text: 'my answer', name: 'Maya' })).toBe('my answer');
    expect(candidateText({ playerId: 'p1', name: 'Maya' })).toBe('Maya');
    expect(candidateText(null)).toBe('');
  });
});

describe('resolveBranchTarget', () => {
  const phase = {
    nextByWinner: { 'Enter the cave': 'cave', 'Climb the mountain': 'mountain' },
    next: 'fallback'
  };

  it('routes literal winners through the map', () => {
    const candidates = ['Enter the cave', 'Climb the mountain'];
    expect(resolveBranchTarget(phase, 'Enter the cave', candidates)).toBe('cave');
    expect(resolveBranchTarget(phase, 'Climb the mountain', candidates)).toBe('mountain');
  });

  it('routes response-object winners by their text', () => {
    const candidates = [
      { playerId: 'p1', text: 'Enter the cave' },
      { playerId: 'p2', text: 'Climb the mountain' }
    ];
    expect(resolveBranchTarget(phase, 'p2', candidates)).toBe('mountain');
  });

  it('returns null (fall back to next) for unmapped winners or no map', () => {
    expect(resolveBranchTarget(phase, 'Swim the river', ['Swim the river'])).toBe(null);
    expect(resolveBranchTarget({ next: 'x' }, 'Enter the cave', ['Enter the cave'])).toBe(null);
    expect(resolveBranchTarget(phase, null, [])).toBe(null);
  });
});

describe('validator: branching votes', () => {
  function cyoa(voteOverrides = {}, extraPhases = {}) {
    return {
      name: 'CYOA Test',
      phases: {
        lobby: { type: 'lobby', next: 'choose' },
        choose: {
          type: 'vote', mode: 'pick-one',
          candidates: ['Enter the cave', 'Climb the mountain'],
          nextByWinner: { 'Enter the cave': 'cave', 'Climb the mountain': 'mountain' },
          next: 'cave',
          ...voteOverrides
        },
        cave: { type: 'announce', message: 'Dark in here…', next: 'end' },
        mountain: { type: 'announce', message: 'Cold up here…', next: 'end' },
        end: { type: 'end' },
        ...extraPhases
      }
    };
  }

  function run(config) {
    return validate(config, 'cyoa-test', { returnResults: true });
  }

  it('accepts a well-formed branching vote (branch targets are reachable)', () => {
    const res = run(cyoa());
    expect(res.errors).toEqual([]);
    // mountain is reachable ONLY via nextByWinner — must not be flagged
    expect(res.warnings.filter(w => /unreachable/i.test(w))).toEqual([]);
  });

  it('errors when a branch target phase does not exist', () => {
    const res = run(cyoa({ nextByWinner: { 'Enter the cave': 'nope' } }));
    expect(res.errors.some(e => /nope/.test(e) && /nextByWinner/.test(e))).toBe(true);
  });

  it('warns when a branch key does not match any literal option', () => {
    const res = run(cyoa({
      nextByWinner: { 'Enter the cove': 'cave' } // typo'd key
    }));
    expect(res.warnings.some(w => /Enter the cove/.test(w))).toBe(true);
  });

  it('needs at least 2 literal options to vote on', () => {
    const res = run(cyoa({ candidates: ['Only one'], nextByWinner: { 'Only one': 'cave' } }));
    expect(res.errors.some(e => /at least 2 options/.test(e))).toBe(true);
  });

  it('the state machine allows transitions to branch targets', () => {
    // Regression: nextByWinner targets must be legal transitions — the
    // first live playthrough crashed with "Invalid transition" because the
    // state machine only knew next/approveNext/rejectNext/loopBack edges.
    const engine = new GameEngine(cyoa());
    engine.transition('choose');
    expect(() => engine.transition('mountain')).not.toThrow(); // branch ≠ next
  });
});
