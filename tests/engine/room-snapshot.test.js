/**
 * Room snapshots — survive a server restart/sleep mid-game.
 *
 * Semantic: snapshot at each phase transition; a restored room resumes at
 * the START of the interrupted phase (that one phase's mid-progress is
 * lost; the game — completed phases, players, scores — is not).
 */

import { describe, it, expect } from 'vitest';
import { serializeRoom, restoreRoom } from '../../engine/room-snapshot.js';
import { GameEngine } from '../../engine/game-engine.js';

const CONFIG = {
  name: 'Snapshot Test',
  phases: {
    lobby: { type: 'lobby', next: 'ask' },
    ask: { type: 'collect', prompt: 'Q?', next: 'loop' },
    loop: {
      type: 'foreach', data: 'ask.responses',
      subPhases: { show: { type: 'announce', message: '{{_current.text}}', timer: 5 } },
      next: 'board'
    },
    board: { type: 'leaderboard', from: 'loop.scores', next: 'end' },
    end: { type: 'end' }
  }
};

function liveRoom() {
  const engine = new GameEngine(CONFIG);
  engine.players.add('sock-1', 'Maya', 'token-maya');
  engine.players.add('sock-2', 'Jordan', 'token-jordan');
  engine.players.eliminate('sock-2');
  engine.transition('ask');
  engine.storePhaseData('ask', { responses: [{ playerId: 'sock-1', text: 'hi' }] });
  return {
    code: 'TEST',
    engine,
    gameId: 'snapshot-test',
    gameSource: 'built-in',
    simulated: false,
    teacherPin: '1234',
    hostToken: 'host-secret',
    kickedTokens: new Set(['token-kicked']),
    phaseInstanceId: 7,
    teacherSocketIds: new Set(['t-1']),
    createdAt: Date.now(),
    journal: []
  };
}

describe('serializeRoom', () => {
  it('captures game identity, position, data, and players (JSON-safe)', () => {
    const snap = serializeRoom(liveRoom());
    const roundTripped = JSON.parse(JSON.stringify(snap));
    expect(roundTripped.gameId).toBe('snapshot-test');
    expect(roundTripped.currentPhaseId).toBe('ask');
    expect(roundTripped.phaseData.ask.responses[0].text).toBe('hi');
    expect(roundTripped.players).toHaveLength(2);
    expect(roundTripped.players.find(p => p.name === 'Jordan').status).toBe('eliminated');
    expect(roundTripped.kickedTokens).toContain('token-kicked');
    expect(roundTripped.hostToken).toBe('host-secret');
    expect(roundTripped.teacherPin).toBe('1234');
  });

  it('skips simulated rooms and rooms without an engine', () => {
    const room = liveRoom();
    room.simulated = true;
    expect(serializeRoom(room)).toBe(null);
    expect(serializeRoom({ code: 'X' })).toBe(null);
  });
});

describe('restoreRoom', () => {
  it('rebuilds a playable room at the interrupted phase', () => {
    const snap = JSON.parse(JSON.stringify(serializeRoom(liveRoom())));
    const room = restoreRoom(snap, CONFIG, {});

    expect(room.code).toBe('TEST');
    expect(room.engine.getCurrentPhase().id).toBe('ask');
    expect(room.engine.phaseData.ask.responses[0].text).toBe('hi');
    expect(room.restored).toBe(true);
    expect(room.kickedTokens.has('token-kicked')).toBe(true);

    // Players come back disconnected — the token-reconnect path rebinds them
    const maya = room.engine.players.findByToken('token-maya');
    expect(maya).toBeDefined();
    expect(maya.connected).toBe(false);
    expect(room.engine.players.findByToken('token-jordan').status).toBe('eliminated');

    // The room can advance normally from the restored position
    expect(() => room.engine.transition('loop')).not.toThrow();
  });

  it('carries the word-help ledger through a restart, so purses are not refilled', () => {
    const live = liveRoom();
    live.wordHelp = { tokens: 3, from: 'es', to: 'en', spent: { 'p-maya': 2 }, cache: { escuela: 'school' }, looked: { escuela: { word: 'escuela', count: 2 } } };
    const snap = JSON.parse(JSON.stringify(serializeRoom(live)));
    expect(snap.wordHelp.spent['p-maya']).toBe(2);
    const room = restoreRoom(snap, CONFIG, {});
    expect(room.wordHelp.spent['p-maya']).toBe(2);
    expect(room.wordHelp.cache.escuela).toBe('school');
    expect(restoreRoom(JSON.parse(JSON.stringify(serializeRoom(liveRoom()))), CONFIG, {}).wordHelp).toBeNull();
  });

  it('maps a mid-foreach virtual phase back to the foreach parent (fresh re-entry)', () => {
    const room = liveRoom();
    room.engine.foreachState.loop = { items: [{ text: 'hi' }], currentIndex: 0, scores: {}, subPhaseIds: [] };
    // Pretend we were inside the virtual sub-phase when the server died
    room.engine.stateMachine.state = '_fe:loop:show';
    const snap = JSON.parse(JSON.stringify(serializeRoom(room)));
    const restored = restoreRoom(snap, CONFIG, {});

    expect(restored.engine.getCurrentPhase().id).toBe('loop');
    // That foreach's state is cleared so onEnter restarts the loop cleanly
    expect(restored.engine.foreachState.loop).toBeUndefined();
  });
});
