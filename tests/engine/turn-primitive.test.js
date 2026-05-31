/**
 * Tests for the 'turn' phase (charades / describe-it style gameplay).
 *
 * Handler internals are exercised via the exported helpers (handleGotIt,
 * handleSkip). The full socket round-trip is covered by the simulator
 * scripts. Validator checks are run inline.
 */

import { describe, it, expect } from 'vitest';
import { validate } from '../../engine/game-loader.js';
import { handleGotIt, handleSkip, advanceItemInPhase } from '../../engine/phase-handlers/turn.js';

const baseGame = (phases) => ({ name: 'Test', phases });

describe('turn phase — validator', () => {
  it('accepts a valid turn config', () => {
    const cfg = baseGame({
      lobby: { type: 'lobby', next: 'words' },
      words: { type: 'collect', prompt: 'Write a phrase', next: 'teams' },
      teams: { type: 'team-split', method: 'random', teamCount: 2, next: 'round1' },
      round1: {
        type: 'turn',
        pool: 'words.responses',
        teamsFrom: 'teams',
        timer: 60,
        instruction: 'Describe without saying the word',
        next: 'end'
      },
      end: { type: 'end' }
    });
    expect(() => validate(cfg, 'turn-ok')).not.toThrow();
  });

  it('rejects a turn missing pool', () => {
    const cfg = baseGame({
      lobby: { type: 'lobby', next: 'teams' },
      teams: { type: 'team-split', method: 'random', teamCount: 2, next: 'round1' },
      round1: { type: 'turn', teamsFrom: 'teams', next: 'end' },
      end: { type: 'end' }
    });
    expect(() => validate(cfg, 'turn-no-pool'))
      .toThrow(/missing required field "pool"/);
  });

  it('rejects a turn missing teamsFrom', () => {
    const cfg = baseGame({
      lobby: { type: 'lobby', next: 'words' },
      words: { type: 'collect', prompt: 'Write a phrase', next: 'round1' },
      round1: { type: 'turn', pool: 'words.responses', next: 'end' },
      end: { type: 'end' }
    });
    expect(() => validate(cfg, 'turn-no-teams'))
      .toThrow(/missing required field "teamsFrom"/);
  });
});

describe('turn phase — runtime helpers', () => {
  // Build a fake room.phaseState resembling what the handler sets up
  function makeRoom() {
    return {
      phaseState: {
        pool: ['Pizza', 'Bicycle', 'Sunset'],
        itemCount: 4,
        teams: {
          'Team 1': [{ playerId: 'p1', name: 'Alice' }, { playerId: 'p2', name: 'Bob' }],
          'Team 2': [{ playerId: 'p3', name: 'Carol' }, { playerId: 'p4', name: 'Dave' }]
        },
        playerTeam: { p1: 'Team 1', p2: 'Team 1', p3: 'Team 2', p4: 'Team 2' },
        teamNames: ['Team 1', 'Team 2'],
        currentTeamName: 'Team 1',
        currentDescriberId: 'p1',
        currentDescriberName: 'Alice',
        currentItem: 'Carrot',
        teamScores: { 'Team 1': 0, 'Team 2': 0 },
        capturedBy: { 'Team 1': [], 'Team 2': [] },
        allowSkip: true,
        ended: false
      }
    };
  }

  it('handleGotIt scores +1 for the describer\'s team and removes the item', () => {
    const room = makeRoom();
    expect(handleGotIt(room, 'p1')).toBe(true);
    expect(room.phaseState.teamScores['Team 1']).toBe(1);
    expect(room.phaseState.capturedBy['Team 1']).toContain('Carrot');
    expect(room.phaseState.currentItem).toBeNull();
  });

  it('handleGotIt ignores presses from non-describers', () => {
    const room = makeRoom();
    expect(handleGotIt(room, 'p2')).toBe(false);
    expect(room.phaseState.teamScores['Team 1']).toBe(0);
    expect(room.phaseState.currentItem).toBe('Carrot');
  });

  it('handleSkip returns the item to the bottom of the pool', () => {
    const room = makeRoom();
    const poolLenBefore = room.phaseState.pool.length;
    expect(handleSkip(room, 'p1')).toBe(true);
    expect(room.phaseState.currentItem).toBeNull();
    expect(room.phaseState.pool.length).toBe(poolLenBefore + 1);
    expect(room.phaseState.pool[room.phaseState.pool.length - 1]).toBe('Carrot');
    expect(room.phaseState.teamScores['Team 1']).toBe(0);
  });

  it('handleSkip is rejected when allowSkip is false', () => {
    const room = makeRoom();
    room.phaseState.allowSkip = false;
    expect(handleSkip(room, 'p1')).toBe(false);
  });
});

describe('leaderboard — sum across multiple sources', () => {
  it('accepts an array of refs in the schema', () => {
    const cfg = baseGame({
      lobby: { type: 'lobby', next: 'teams' },
      teams: { type: 'team-split', method: 'random', teamCount: 2, next: 'words' },
      words: { type: 'collect', prompt: '?', next: 'r1' },
      r1: { type: 'turn', pool: 'words.responses', teamsFrom: 'teams', next: 'r2' },
      r2: { type: 'turn', pool: 'words.responses', teamsFrom: 'teams', next: 'r3' },
      r3: { type: 'turn', pool: 'words.responses', teamsFrom: 'teams', next: 'board' },
      board: {
        type: 'leaderboard',
        from: ['r1.teamScores', 'r2.teamScores', 'r3.teamScores'],
        next: 'end'
      },
      end: { type: 'end' }
    });
    expect(() => validate(cfg, 'multi-source-board')).not.toThrow();
  });
});
