import { describe, it, expect } from 'vitest';
import { eliminateDuplicates } from '../../games/corn-story/hooks.js';

const baseContext = {
  players: [],
  remaining: [],
  eliminated: [],
  phases: {}
};

describe('Corn Story: eliminateDuplicates', () => {
  it('returns empty array when all groups have 1 player', () => {
    const result = eliminateDuplicates({
      ...baseContext,
      input: [['p1'], ['p2'], ['p3']]
    });
    expect(result).toEqual([]);
  });

  it('returns playerIds from groups with 2 players', () => {
    const result = eliminateDuplicates({
      ...baseContext,
      input: [['p1', 'p2'], ['p3']]
    });
    expect(result).toEqual(['p1', 'p2']);
  });

  it('returns all players from a group of 3+', () => {
    const result = eliminateDuplicates({
      ...baseContext,
      input: [['p1', 'p2', 'p3'], ['p4']]
    });
    expect(result).toEqual(['p1', 'p2', 'p3']);
  });

  it('returns players from multiple matching groups', () => {
    const result = eliminateDuplicates({
      ...baseContext,
      input: [['p1', 'p2'], ['p3'], ['p4', 'p5']]
    });
    expect(result).toEqual(['p1', 'p2', 'p4', 'p5']);
  });

  it('handles empty input gracefully', () => {
    const result = eliminateDuplicates({
      ...baseContext,
      input: []
    });
    expect(result).toEqual([]);
  });
});
