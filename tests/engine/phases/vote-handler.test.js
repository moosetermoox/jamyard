import { describe, it, expect } from 'vitest';
import {
  tallyPickOne,
  tallyHeadToHead,
  getEligibleVoters,
  generateMatchups
} from '../../../engine/phases/vote-handler.js';
import { PlayerRegistry } from '../../../engine/player-registry.js';

function makeRegistry(ids) {
  const reg = new PlayerRegistry();
  for (const id of ids) {
    reg.add(id, `Player-${id}`);
  }
  return reg;
}

describe('VoteHandler', () => {
  describe('tallyPickOne', () => {
    it('tallies pick-one votes correctly', () => {
      const votes = [
        { voterId: 'v1', choice: 'c1' },
        { voterId: 'v2', choice: 'c2' },
        { voterId: 'v3', choice: 'c1' }
      ];
      const result = tallyPickOne(votes, ['c1', 'c2', 'c3']);

      expect(result.scores.c1).toBe(2);
      expect(result.scores.c2).toBe(1);
      expect(result.scores.c3).toBe(0);
      expect(result.totalVotes).toBe(3);
    });

    it('determines the correct winner', () => {
      const votes = [
        { voterId: 'v1', choice: 'c2' },
        { voterId: 'v2', choice: 'c2' },
        { voterId: 'v3', choice: 'c1' }
      ];
      const result = tallyPickOne(votes, ['c1', 'c2']);

      expect(result.winner).toBe('c2');
    });

    it('handles ties by picking first alphabetically', () => {
      const votes = [
        { voterId: 'v1', choice: 'beta' },
        { voterId: 'v2', choice: 'alpha' }
      ];
      const result = tallyPickOne(votes, ['alpha', 'beta']);

      expect(result.scores.alpha).toBe(1);
      expect(result.scores.beta).toBe(1);
      expect(result.winner).toBe('alpha');
      expect(result.tied).toBe(true);
    });

    it('returns tied: false when there is a clear winner', () => {
      const votes = [
        { voterId: 'v1', choice: 'c1' },
        { voterId: 'v2', choice: 'c1' }
      ];
      const result = tallyPickOne(votes, ['c1', 'c2']);

      expect(result.tied).toBe(false);
    });

    it('handles zero votes', () => {
      const result = tallyPickOne([], ['c1', 'c2']);

      expect(result.scores.c1).toBe(0);
      expect(result.scores.c2).toBe(0);
      expect(result.totalVotes).toBe(0);
    });

    it('ignores votes for unknown candidates', () => {
      const votes = [
        { voterId: 'v1', choice: 'c1' },
        { voterId: 'v2', choice: 'unknown' }
      ];
      const result = tallyPickOne(votes, ['c1', 'c2']);

      expect(result.scores.c1).toBe(1);
      expect(result.scores.c2).toBe(0);
      expect(result.totalVotes).toBe(2);
    });
  });

  describe('tallyHeadToHead', () => {
    it('tallies head-to-head votes correctly', () => {
      const matchups = [['c1', 'c2'], ['c1', 'c3']];
      const votes = [
        { voterId: 'v1', matchup: ['c1', 'c2'], choice: 'c1' },
        { voterId: 'v2', matchup: ['c1', 'c2'], choice: 'c2' },
        { voterId: 'v3', matchup: ['c1', 'c3'], choice: 'c1' }
      ];
      const result = tallyHeadToHead(votes, ['c1', 'c2', 'c3'], matchups);

      expect(result.scores.c1).toBe(2);
      expect(result.scores.c2).toBe(1);
      expect(result.scores.c3).toBe(0);
      expect(result.winner).toBe('c1');
      expect(result.totalVotes).toBe(3);
    });

    it('includes matchups in result', () => {
      const matchups = [['c1', 'c2'], ['c2', 'c3']];
      const result = tallyHeadToHead([], ['c1', 'c2', 'c3'], matchups);
      expect(result.matchups).toEqual(matchups);
    });

    it('accumulates scores across multiple matchups from multiple voters', () => {
      const matchups = [['c1', 'c2'], ['c2', 'c3'], ['c1', 'c3']];
      // 3 voters each vote on all 3 matchups
      const votes = [
        // Voter 1
        { voterId: 'v1', matchup: ['c1', 'c2'], choice: 'c1' },
        { voterId: 'v1', matchup: ['c2', 'c3'], choice: 'c2' },
        { voterId: 'v1', matchup: ['c1', 'c3'], choice: 'c1' },
        // Voter 2
        { voterId: 'v2', matchup: ['c1', 'c2'], choice: 'c2' },
        { voterId: 'v2', matchup: ['c2', 'c3'], choice: 'c3' },
        { voterId: 'v2', matchup: ['c1', 'c3'], choice: 'c3' },
        // Voter 3
        { voterId: 'v3', matchup: ['c1', 'c2'], choice: 'c1' },
        { voterId: 'v3', matchup: ['c2', 'c3'], choice: 'c2' },
        { voterId: 'v3', matchup: ['c1', 'c3'], choice: 'c1' }
      ];
      const result = tallyHeadToHead(votes, ['c1', 'c2', 'c3'], matchups);

      // c1: wins matchup1(v1,v3) + matchup3(v1,v3) = 4
      // c2: wins matchup1(v2) + matchup2(v1,v3) = 3
      // c3: wins matchup2(v2) + matchup3(v2) = 2
      expect(result.scores.c1).toBe(4);
      expect(result.scores.c2).toBe(3);
      expect(result.scores.c3).toBe(2);
      expect(result.winner).toBe('c1');
      expect(result.totalVotes).toBe(9);
    });

    it('defaults to empty matchups if none provided', () => {
      const result = tallyHeadToHead([], ['c1', 'c2']);
      expect(result.matchups).toEqual([]);
    });
  });

  describe('getEligibleVoters', () => {
    it('returns all players for voters="all"', () => {
      const players = makeRegistry(['p1', 'p2', 'p3']);
      players.eliminate('p2');

      const voters = getEligibleVoters(players, 'all');
      expect(voters).toHaveLength(3);
    });

    it('returns only active players for voters="remaining"', () => {
      const players = makeRegistry(['p1', 'p2', 'p3']);
      players.eliminate('p2');

      const voters = getEligibleVoters(players, 'remaining');
      expect(voters).toHaveLength(2);
      expect(voters.map(v => v.id)).not.toContain('p2');
    });

    it('returns only eliminated players for voters="eliminated"', () => {
      const players = makeRegistry(['p1', 'p2', 'p3']);
      players.eliminate('p2');

      const voters = getEligibleVoters(players, 'eliminated');
      expect(voters).toHaveLength(1);
      expect(voters[0].id).toBe('p2');
    });
  });

  describe('generateMatchups', () => {
    it('generates the correct number of comparisons', () => {
      const { matchups, comparisons } = generateMatchups(['c1', 'c2', 'c3', 'c4']);
      // ceil(4 * 3 / 2) = 6
      expect(comparisons).toBe(6);
      expect(matchups).toHaveLength(6);
    });

    it('each matchup contains two different candidates', () => {
      const { matchups } = generateMatchups(['c1', 'c2', 'c3', 'c4']);
      for (const [a, b] of matchups) {
        expect(a).not.toBe(b);
      }
    });

    it('each candidate appears roughly 3 times', () => {
      const candidates = ['c1', 'c2', 'c3', 'c4'];
      const { matchups } = generateMatchups(candidates);

      const appearances = {};
      for (const id of candidates) appearances[id] = 0;
      for (const [a, b] of matchups) {
        appearances[a]++;
        appearances[b]++;
      }

      for (const count of Object.values(appearances)) {
        expect(count).toBeGreaterThanOrEqual(2);
        expect(count).toBeLessThanOrEqual(4);
      }
    });

    it('returns empty matchups for fewer than 2 candidates', () => {
      const { matchups, comparisons } = generateMatchups(['c1']);
      expect(matchups).toEqual([]);
      expect(comparisons).toBe(0);
    });

    it('respects custom appearancesPerCandidate', () => {
      const candidates = ['c1', 'c2', 'c3', 'c4'];
      const { matchups, comparisons } = generateMatchups(candidates, 5);
      // ceil(4 * 5 / 2) = 10
      expect(comparisons).toBe(10);
      expect(matchups).toHaveLength(10);

      const appearances = {};
      for (const id of candidates) appearances[id] = 0;
      for (const [a, b] of matchups) {
        appearances[a]++;
        appearances[b]++;
      }
      for (const count of Object.values(appearances)) {
        expect(count).toBeGreaterThanOrEqual(4);
        expect(count).toBeLessThanOrEqual(6);
      }
    });

    it('handles exactly 2 candidates', () => {
      const { matchups, comparisons } = generateMatchups(['c1', 'c2']);
      // ceil(2 * 3 / 2) = 3
      expect(comparisons).toBe(3);
      for (const [a, b] of matchups) {
        expect(a).not.toBe(b);
        expect(['c1', 'c2']).toContain(a);
        expect(['c1', 'c2']).toContain(b);
      }
    });
  });
});
