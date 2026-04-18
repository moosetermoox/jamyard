import { describe, it, expect } from 'vitest';
import { determineWinner } from '../../../engine/phases/winner-handler.js';
import { PlayerRegistry } from '../../../engine/player-registry.js';

function makeRegistry(ids) {
  const reg = new PlayerRegistry();
  for (const id of ids) {
    reg.add(id, `Player-${id}`);
  }
  return reg;
}

describe('WinnerHandler', () => {
  it('identifies player with highest score as winner', () => {
    const players = makeRegistry(['p1', 'p2', 'p3']);
    const result = determineWinner({ p1: 5, p2: 8, p3: 3 }, players);

    expect(result.winnerId).toBe('p2');
    expect(result.winnerScore).toBe(8);
  });

  it('includes winner name from the player registry', () => {
    const players = makeRegistry(['p1', 'p2']);
    const result = determineWinner({ p1: 3, p2: 7 }, players);

    expect(result.winnerName).toBe('Player-p2');
  });

  it('handles ties deterministically (first alphabetically)', () => {
    const players = makeRegistry(['beta', 'alpha']);
    const result = determineWinner({ beta: 5, alpha: 5 }, players);

    expect(result.winnerId).toBe('alpha');
    expect(result.winnerScore).toBe(5);
  });

  it('returns full standings sorted by score descending', () => {
    const players = makeRegistry(['p1', 'p2', 'p3']);
    const result = determineWinner({ p1: 5, p2: 8, p3: 3 }, players);

    expect(result.standings).toHaveLength(3);
    expect(result.standings[0]).toEqual({ playerId: 'p2', name: 'Player-p2', score: 8 });
    expect(result.standings[1]).toEqual({ playerId: 'p1', name: 'Player-p1', score: 5 });
    expect(result.standings[2]).toEqual({ playerId: 'p3', name: 'Player-p3', score: 3 });
  });

  it('breaks ties in standings by playerId alphabetically', () => {
    const players = makeRegistry(['p1', 'p2', 'p3']);
    const result = determineWinner({ p1: 5, p2: 5, p3: 5 }, players);

    expect(result.standings[0].playerId).toBe('p1');
    expect(result.standings[1].playerId).toBe('p2');
    expect(result.standings[2].playerId).toBe('p3');
  });

  it('handles empty scores', () => {
    const players = makeRegistry([]);
    const result = determineWinner({}, players);

    expect(result.winnerId).toBeNull();
    expect(result.winnerName).toBeNull();
    expect(result.winnerScore).toBe(0);
    expect(result.standings).toEqual([]);
  });

  it('exposes tied winners via winnerIds and isTie', () => {
    const players = makeRegistry(['p1', 'p2', 'p3']);
    const result = determineWinner({ p1: 5, p2: 5, p3: 3 }, players);

    expect(result.isTie).toBe(true);
    expect(result.winnerIds).toEqual(['p1', 'p2']);
    expect(result.winnerNames).toEqual(['Player-p1', 'Player-p2']);
  });

  it('isTie is false when there is a clear winner', () => {
    const players = makeRegistry(['p1', 'p2']);
    const result = determineWinner({ p1: 10, p2: 5 }, players);

    expect(result.isTie).toBe(false);
    expect(result.winnerIds).toEqual(['p1']);
  });

  it('handles single player', () => {
    const players = makeRegistry(['p1']);
    const result = determineWinner({ p1: 10 }, players);

    expect(result.winnerId).toBe('p1');
    expect(result.winnerScore).toBe(10);
    expect(result.standings).toHaveLength(1);
  });
});
