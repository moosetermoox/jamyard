/**
 * The finale leaderboard (next stop = end screen) tells the host it is the
 * activity's winning moment via `final: true`, so the projector throws the
 * meadow cheer there — leaderboard-ended activities like Speed Quiz have no
 * winner phase, and their big moment played as just another board (owner
 * report 2026-08-30). Mid-game boards must stay `final: false` so the cheer
 * can't wear out.
 */

import { describe, it, expect } from 'vitest';
import '../../../engine/phase-handlers/leaderboard.js';
import { getHandler } from '../../../engine/phase-handlers/phase-registry.js';
import { GameEngine } from '../../../engine/game-engine.js';

function runLeaderboard(phases, leaderboardId) {
  const engine = new GameEngine({ phases });
  engine.players.add('p1', 'Maya');
  engine.players.add('p2', 'Sam');
  engine.storePhaseData('quiz', { scores: { p1: 5, p2: 3 } });

  const phase = { id: leaderboardId, ...phases[leaderboardId] };
  const hostPayloads = [];
  const ctx = {
    phase,
    engine,
    getNextPhaseId: () => phase.next || null,
    resolveScreenControl: () => ({}),
    emitToHost: (event, payload) => hostPayloads.push({ event, payload }),
    emitToPlayer: () => {},
    isStale: () => true
  };
  return getHandler('leaderboard').onEnter(ctx).then(() => hostPayloads[0].payload);
}

describe('leaderboard final flag', () => {
  it('marks the board final when the next phase is the end screen', async () => {
    const payload = await runLeaderboard({
      lobby: { type: 'lobby', next: 'board' },
      board: { type: 'leaderboard', from: 'quiz.scores', next: 'end' },
      end: { type: 'end' }
    }, 'board');
    expect(payload.final).toBe(true);
  });

  it('marks the board final when there is no next phase at all', async () => {
    const payload = await runLeaderboard({
      lobby: { type: 'lobby', next: 'board' },
      board: { type: 'leaderboard', from: 'quiz.scores' }
    }, 'board');
    expect(payload.final).toBe(true);
  });

  it('keeps mid-game boards quiet (next phase is not the end)', async () => {
    const payload = await runLeaderboard({
      lobby: { type: 'lobby', next: 'board' },
      board: { type: 'leaderboard', from: 'quiz.scores', next: 'round2' },
      round2: { type: 'announce', message: 'Round 2!', next: 'end' },
      end: { type: 'end' }
    }, 'board');
    expect(payload.final).toBe(false);
  });
});
