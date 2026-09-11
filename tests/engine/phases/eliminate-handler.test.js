import { describe, it, expect } from 'vitest';
import { runEliminate } from '../../../engine/phases/eliminate-handler.js';
import { PlayerRegistry } from '../../../engine/player-registry.js';

function makeRegistry(ids) {
  const reg = new PlayerRegistry();
  for (const id of ids) {
    reg.add(id, `Player-${id}`);
  }
  return reg;
}

describe('EliminateHandler', () => {
  describe('hook method', () => {
    it('calls the correct hook and eliminates returned players', () => {
      const players = makeRegistry(['p1', 'p2', 'p3']);
      const hooks = {
        eliminateDuplicates(context) {
          return context.input.flat().filter((_, i, arr) =>
            arr.indexOf(_) !== arr.lastIndexOf(_) || context.input.find(g => g.length > 1 && g.includes(_))
          );
        }
      };

      // Simpler: just use a mock hook that returns specific ids
      const mockHooks = {
        testHook(context) {
          // Eliminate players in groups of 2+
          const toEliminate = [];
          for (const group of context.input) {
            if (group.length > 1) toEliminate.push(...group);
          }
          return toEliminate;
        }
      };

      const result = runEliminate({
        method: 'hook',
        input: {
          hookFn: 'testHook',
          data: [['p1', 'p2'], ['p3']],
          context: { players: players.list(), remaining: players.getRemaining(), eliminated: [], phases: {} }
        },
        hooks: mockHooks,
        players
      });

      expect(result.eliminated).toEqual(['p1', 'p2']);
      expect(result.remaining).toBe(1);
      expect(players.isEliminated('p1')).toBe(true);
      expect(players.isEliminated('p2')).toBe(true);
      expect(players.isEliminated('p3')).toBe(false);
    });

    it('throws if hook function is not found', () => {
      const players = makeRegistry(['p1']);
      expect(() => runEliminate({
        method: 'hook',
        input: { hookFn: 'nonexistent', data: [], context: {} },
        hooks: {},
        players
      })).toThrow('Hook "nonexistent" not found');
    });
  });

  describe('bottom-percent method', () => {
    it('eliminates the bottom 60% of players by score', () => {
      const players = makeRegistry(['p1', 'p2', 'p3', 'p4', 'p5']);
      const result = runEliminate({
        method: 'bottom-percent',
        input: {
          scores: { p1: 10, p2: 8, p3: 5, p4: 3, p5: 1 },
          percent: 60
        },
        hooks: {},
        players
      });

      // 60% of 5 = 3 eliminated (p3, p4, p5)
      expect(result.eliminated).toHaveLength(3);
      expect(result.eliminated).toContain('p3');
      expect(result.eliminated).toContain('p4');
      expect(result.eliminated).toContain('p5');
      expect(result.eliminated).not.toContain('p1');
      expect(result.eliminated).not.toContain('p2');
      expect(result.remaining).toBe(2);
    });

    it('handles ties by eliminating all tied players at the cutoff', () => {
      const players = makeRegistry(['p1', 'p2', 'p3', 'p4']);
      // p3 and p4 tie at score 5 — both at cutoff boundary
      const result = runEliminate({
        method: 'bottom-percent',
        input: {
          scores: { p1: 10, p2: 8, p3: 5, p4: 5 },
          percent: 25
        },
        hooks: {},
        players
      });

      // 25% of 4 = 1, cutoff score is 5
      // Both p3 and p4 have score 5 (at or below cutoff), so both eliminated
      expect(result.eliminated).toContain('p3');
      expect(result.eliminated).toContain('p4');
      expect(result.eliminated).toHaveLength(2);
      expect(result.remaining).toBe(2);
    });

    it('eliminates nobody when percent is 0', () => {
      const players = makeRegistry(['p1', 'p2', 'p3']);
      const result = runEliminate({
        method: 'bottom-percent',
        input: {
          scores: { p1: 10, p2: 5, p3: 1 },
          percent: 0
        },
        hooks: {},
        players
      });

      expect(result.eliminated).toEqual([]);
      expect(result.remaining).toBe(3);
    });

    it('handles empty scores', () => {
      const players = makeRegistry([]);
      const result = runEliminate({
        method: 'bottom-percent',
        input: { scores: {}, percent: 60 },
        hooks: {},
        players
      });

      expect(result.eliminated).toEqual([]);
      expect(result.remaining).toBe(0);
    });
  });

  describe('return value', () => {
    it('returns eliminated list and remaining count', () => {
      const players = makeRegistry(['p1', 'p2', 'p3', 'p4']);
      const result = runEliminate({
        method: 'bottom-percent',
        input: {
          scores: { p1: 10, p2: 8, p3: 3, p4: 1 },
          percent: 50
        },
        hooks: {},
        players
      });

      expect(result).toHaveProperty('eliminated');
      expect(result).toHaveProperty('remaining');
      expect(Array.isArray(result.eliminated)).toBe(true);
      expect(typeof result.remaining).toBe('number');
      expect(result.eliminated.length + result.remaining).toBe(4);
    });
  });

  describe('unknown method', () => {
    it('throws for unknown method', () => {
      const players = makeRegistry(['p1']);
      expect(() => runEliminate({
        method: 'random',
        input: {},
        hooks: {},
        players
      })).toThrow('Unknown eliminate method');
    });
  });
});

// 2026-09-10 (Elimination Tournament asks): a round where everyone ties
// at the cutoff must not empty the room, and an elimination loop ends
// early once few enough players remain (eliminate.untilRemaining).
import { shouldStopLooping } from '../../../engine/phases/eliminate-handler.js';

describe('bottom-percent with everyone tied', () => {
  it('eliminates nobody instead of everybody', () => {
    const players = makeRegistry(['p1', 'p2', 'p3', 'p4']);
    const result = runEliminate({
      method: 'bottom-percent',
      input: { scores: { p1: 0, p2: 0, p3: 0, p4: 0 }, percent: 50 },
      players
    });
    expect(result.eliminated).toEqual([]);
    expect(result.remaining).toBe(4);
  });

  it('still eliminates a genuine bottom group', () => {
    const players = makeRegistry(['p1', 'p2', 'p3', 'p4']);
    const result = runEliminate({
      method: 'bottom-percent',
      input: { scores: { p1: 0, p2: 0, p3: 3, p4: 5 }, percent: 25 },
      players
    });
    expect(result.eliminated.sort()).toEqual(['p1', 'p2']);
    expect(result.remaining).toBe(2);
  });
});

describe('shouldStopLooping', () => {
  it('stops once the remaining count reaches the floor', () => {
    expect(shouldStopLooping({ untilRemaining: 1, remaining: 1 })).toBe(true);
    expect(shouldStopLooping({ untilRemaining: 1, remaining: 0 })).toBe(true);
    expect(shouldStopLooping({ untilRemaining: 2, remaining: 2 })).toBe(true);
  });
  it('keeps going while more remain', () => {
    expect(shouldStopLooping({ untilRemaining: 1, remaining: 2 })).toBe(false);
    expect(shouldStopLooping({ untilRemaining: 3, remaining: 9 })).toBe(false);
  });
  it('is off when the field is missing or nonsense', () => {
    expect(shouldStopLooping({ remaining: 1 })).toBe(false);
    expect(shouldStopLooping({ untilRemaining: 0, remaining: 0 })).toBe(false);
    expect(shouldStopLooping({ untilRemaining: '1', remaining: 1 })).toBe(false);
  });
});
