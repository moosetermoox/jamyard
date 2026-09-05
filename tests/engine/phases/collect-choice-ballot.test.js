/**
 * The bluff-vote ballot is ONE list for the whole room (engine/phase-handlers/
 * collect-choice.js): sampled and shuffled once per step, so every student
 * sees the same options in the same order and only their own fake is missing
 * from their copy. A reconnect hands back the same ballot.
 *
 * Field report 2026-09-04 (Trivia Bluff): per-player shuffles and samples
 * read as "we all got different questions".
 */
import { describe, it, expect } from 'vitest';
import '../../../engine/phase-handlers/collect-choice.js';
import { getHandler, } from '../../../engine/phase-handlers/phase-registry.js';
import { buildSharedBallot, ballotFor } from '../../../engine/phase-handlers/collect-choice.js';
import { GameEngine } from '../../../engine/game-engine.js';

function setup({ lieCount = 3, poolLimit = 8 } = {}) {
  const phases = {
    lobby: { type: 'lobby', next: 'lies' },
    lies: { type: 'collect', prompt: 'Lie', next: 'vote' },
    vote: {
      type: 'collect-choice',
      prompt: 'Which is the truth?',
      choicePool: [
        { from: 'lies.responses', field: 'text' },
        { literal: 'the truth' }
      ],
      excludeAuthored: 'lies',
      shuffle: true,
      poolLimit,
      correctAnswer: 'the truth',
      next: 'end'
    },
    end: { type: 'end' }
  };
  const engine = new GameEngine({ phases });
  const ids = [];
  for (let i = 1; i <= lieCount; i++) {
    const id = 'p' + i;
    ids.push(id);
    engine.players.add(id, 'Student ' + i);
  }
  engine.storePhaseData('lies', {
    responses: ids.map(id => ({ playerId: id, name: id, text: 'lie by ' + id }))
  });
  engine.stateMachine.transition('lies');
  engine.stateMachine.transition('vote');
  const room = { phaseState: {}, gameId: 'x' };
  const phase = { id: 'vote', ...phases.vote };
  const host = [];
  const players = [];
  const ctx = {
    phase, engine, room,
    resolveScreenControl: () => ({}),
    resolveTemplate: (t) => t,
    getEligibleVoters: () => engine.players.list(),
    emitToHost: (event, payload) => host.push({ event, payload }),
    emitToPlayer: (id, event, payload) => players.push({ id, event, payload }),
    services: {
      resolveImageUrl: () => null,
      resolveVideoEmbed: () => null,
      resolvePerPlayerTemplate: (t) => t
    }
  };
  return { ctx, host, players, room, ids };
}

describe('collect-choice shared ballot', () => {
  it('every student sees the same options in the same order, minus their own fake', async () => {
    const { ctx, host, players, room, ids } = setup({ lieCount: 4 });
    await getHandler('collect-choice').onEnter(ctx);

    const ballot = room.phaseState.ballot;
    expect(Array.isArray(ballot)).toBe(true);
    expect(ballot).toHaveLength(5); // 4 lies + the truth
    expect(host[0].payload.choices).toEqual(ballot);

    const started = players.filter(p => p.event === 'game-started');
    expect(started.map(p => p.id).sort()).toEqual(ids);
    for (const p of started) {
      const own = 'lie by ' + p.id;
      expect(p.payload.choices).toEqual(ballot.filter(c => c !== own));
      expect(p.payload.choices).toContain('the truth');
      expect(p.payload.choices).not.toContain(own);
    }
  });

  it('poolLimit samples once for the room, keeping the truth for everyone', async () => {
    const { ctx, players, room } = setup({ lieCount: 12, poolLimit: 5 });
    await getHandler('collect-choice').onEnter(ctx);

    const ballot = room.phaseState.ballot;
    expect(ballot).toHaveLength(5);
    expect(ballot).toContain('the truth');
    const started = players.filter(p => p.event === 'game-started');
    for (const p of started) {
      const own = 'lie by ' + p.id;
      // Same sample for all: a student whose lie was sampled out sees the
      // full 5; one whose lie made the cut sees the other 4.
      expect(p.payload.choices).toEqual(ballot.filter(c => c !== own));
    }
  });

  it('a reconnecting student gets the same ballot back', async () => {
    const { ctx, room } = setup({ lieCount: 4 });
    await getHandler('collect-choice').onEnter(ctx);
    const ballot = room.phaseState.ballot;

    const sent = [];
    const socket = { id: 'p2', emit: (event, payload) => sent.push({ event, payload }) };
    getHandler('collect-choice').onReconnect(ctx, socket);
    const again = sent.find(s => s.event === 'game-started');
    expect(again.payload.choices).toEqual(ballot.filter(c => c !== 'lie by p2'));
  });

  it('keeps a configured order when nothing asks for a shuffle (Live Poll)', () => {
    const ballot = buildSharedBallot(Object.assign(['A', 'B', 'C'], { _literalKeys: new Set() }), { choices: ['A', 'B', 'C'] });
    expect(ballot).toEqual(['A', 'B', 'C']);
    expect(ballotFor(ballot, 'p1', null)).toEqual(['A', 'B', 'C']);
  });
});
