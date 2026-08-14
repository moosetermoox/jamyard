/**
 * Team standings — the aggregation that makes "team competition" literal.
 * Individual scores sum into team totals; ties share a rank (competition
 * ranking, same rule as the individual board); members keep their own
 * contribution for the per-player view.
 */
import { describe, it, expect } from 'vitest';
import { buildTeamStandings } from '../../engine/phases/team-standings.js';
import { validate } from '../../engine/game-loader.js';

const teamData = {
  teams: {
    'Red': [{ playerId: 'p1', name: 'Ana' }, { playerId: 'p2', name: 'Ben' }],
    'Blue': [{ playerId: 'p3', name: 'Cy' }, { playerId: 'p4', name: 'Dee' }],
    'Green': [{ playerId: 'p5', name: 'Ed' }]
  },
  playerTeam: { p1: 'Red', p2: 'Red', p3: 'Blue', p4: 'Blue', p5: 'Green' }
};

describe('buildTeamStandings', () => {
  it('sums member scores into ranked team totals', () => {
    const scores = { p1: 100, p2: 200, p3: 500, p4: 100, p5: 250 };
    const standings = buildTeamStandings(scores, teamData);
    expect(standings.map(t => t.team)).toEqual(['Blue', 'Red', 'Green']);
    expect(standings.map(t => t.score)).toEqual([600, 300, 250]);
    expect(standings.map(t => t.rank)).toEqual([1, 2, 3]);
  });

  it('tied team totals share a rank, Olympic style', () => {
    const scores = { p1: 300, p2: 0, p3: 150, p4: 150, p5: 100 };
    const standings = buildTeamStandings(scores, teamData);
    expect(standings[0].rank).toBe(1);
    expect(standings[1].rank).toBe(1);
    expect(standings[2].rank).toBe(3);
  });

  it('members carry their own contribution, sorted high to low', () => {
    const scores = { p1: 100, p2: 200, p3: 0, p4: 0, p5: 0 };
    const standings = buildTeamStandings(scores, teamData);
    const red = standings.find(t => t.team === 'Red');
    expect(red.members).toEqual([
      { playerId: 'p2', name: 'Ben', score: 200 },
      { playerId: 'p1', name: 'Ana', score: 100 }
    ]);
  });

  it('a team whose members all scored nothing still appears at 0', () => {
    const scores = { p1: 50 };
    const standings = buildTeamStandings(scores, teamData);
    expect(standings.length).toBe(3);
    const blue = standings.find(t => t.team === 'Blue');
    expect(blue.score).toBe(0);
    expect(blue.members.length).toBe(2);
  });

  it('scores from players outside any team do not leak into totals', () => {
    const scores = { p1: 100, ghost: 9999 };
    const standings = buildTeamStandings(scores, teamData);
    for (const t of standings) {
      expect(t.score).toBeLessThan(9999);
      for (const m of t.members) expect(m.playerId).not.toBe('ghost');
    }
  });

  it('returns [] when team data is missing or empty', () => {
    expect(buildTeamStandings({ p1: 10 }, null)).toEqual([]);
    expect(buildTeamStandings({ p1: 10 }, { teams: {}, playerTeam: {} })).toEqual([]);
  });
});

describe('leaderboard.teamsFrom validation', () => {
  function quizConfig(teamsFrom) {
    return {
      name: 'Team Quiz',
      description: 'validator fixture',
      phases: {
        lobby: { type: 'lobby', next: 'teams' },
        teams: { type: 'team-split', method: 'random', teamCount: 2, next: 'q' },
        q: {
          type: 'collect-choice', prompt: '2+2?', choices: ['3', '4'],
          correctAnswer: '4', pointsCorrect: 1000, speedBonus: true, timer: 15, next: 'board'
        },
        board: { type: 'leaderboard', from: 'q.scores', teamsFrom, next: 'end' },
        end: { type: 'end', message: 'done' }
      }
    };
  }

  it('accepts a teamsFrom pointing at a real team-split', () => {
    const result = validate(quizConfig('teams'), 'team-lb-ok', { returnResults: true });
    expect(result.errors).toEqual([]);
  });

  it('rejects a dangling teamsFrom loudly', () => {
    const result = validate(quizConfig('nope'), 'team-lb-bad', { returnResults: true });
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
