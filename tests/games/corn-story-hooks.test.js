import { describe, it, expect } from 'vitest';
import { eliminateDuplicates } from '../../games/corn-story/hooks.js';

const baseContext = {
  players: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }, { id: 'p5' }],
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

  it('handles non-array input gracefully', () => {
    const result = eliminateDuplicates({
      ...baseContext,
      input: 'not an array'
    });
    expect(result).toEqual([]);
  });

  it('maps response text back to playerIds when AI returns text', () => {
    const result = eliminateDuplicates({
      ...baseContext,
      input: [['eat it', 'eating corn'], ['make a sword']],
      phases: {
        'round1-collect': {
          responses: [
            { playerId: 'p1', name: 'Alice', text: 'eat it' },
            { playerId: 'p2', name: 'Bob', text: 'eating corn' },
            { playerId: 'p3', name: 'Carol', text: 'make a sword' }
          ]
        }
      }
    });
    expect(result).toEqual(['p1', 'p2']);
  });

  it('maps response text case-insensitively', () => {
    const result = eliminateDuplicates({
      ...baseContext,
      input: [['Eat It', 'EATING CORN'], ['make a sword']],
      phases: {
        'round1-collect': {
          responses: [
            { playerId: 'p1', name: 'Alice', text: 'eat it' },
            { playerId: 'p2', name: 'Bob', text: 'eating corn' },
            { playerId: 'p3', name: 'Carol', text: 'make a sword' }
          ]
        }
      }
    });
    expect(result).toEqual(['p1', 'p2']);
  });

  it('skips unresolvable items in groups', () => {
    const result = eliminateDuplicates({
      ...baseContext,
      input: [['p1', 'unknown-text'], ['p3']],
      phases: {}
    });
    // Only p1 resolved, group becomes size 1, so no elimination
    expect(result).toEqual([]);
  });

  it('deduplicates when AI mixes playerIds and response text for same player', () => {
    const result = eliminateDuplicates({
      ...baseContext,
      input: [
        ['p1', 'p2', 'eat it'],           // p1 said "eat it" — should deduplicate to [p1, p2]
        ['p3', 'make a doll'],             // p3 said "make a doll" — deduplicates to [p3] (size 1, no elimination)
        ['p4', 'play catch']               // p4 said "play catch" — deduplicates to [p4] (size 1, no elimination)
      ],
      phases: {
        'round1-collect': {
          responses: [
            { playerId: 'p1', name: 'Alice', text: 'eat it' },
            { playerId: 'p2', name: 'Bob', text: 'eat it' },
            { playerId: 'p3', name: 'Carol', text: 'make a doll' },
            { playerId: 'p4', name: 'Dave', text: 'play catch' }
          ]
        }
      }
    });
    // Only p1 and p2 should be eliminated (they matched)
    expect(result).toHaveLength(2);
    expect(result).toContain('p1');
    expect(result).toContain('p2');
  });

  it('does not produce duplicate playerIds in output', () => {
    const result = eliminateDuplicates({
      ...baseContext,
      input: [['p1', 'p2', 'eat it', 'eating corn']],
      phases: {
        'round1-collect': {
          responses: [
            { playerId: 'p1', name: 'Alice', text: 'eat it' },
            { playerId: 'p2', name: 'Bob', text: 'eating corn' }
          ]
        }
      }
    });
    expect(result).toEqual(['p1', 'p2']);
  });
});
