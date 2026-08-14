/**
 * team-standings — pure aggregation for the team-scored leaderboard.
 *
 * Takes an individual score map and a team-split's stored output
 * ({ teams, playerTeam }) and returns ranked team totals with each
 * member's own contribution preserved. Players who are not on any team
 * (joined after the split) are excluded from team totals: their points
 * still show on their own device via the individual standings.
 */

/**
 * @param {Object<string, number>} scores - { playerId: total }
 * @param {{ teams: Object<string, Array<{playerId: string, name: string}>>,
 *           playerTeam: Object<string, string> } | null} teamData
 * @returns {Array<{ rank: number, team: string, score: number,
 *                   members: Array<{playerId: string, name: string, score: number}> }>}
 */
export function buildTeamStandings(scores, teamData) {
  if (!teamData || !teamData.teams) return [];
  const scoreMap = scores && typeof scores === 'object' ? scores : {};

  const standings = Object.entries(teamData.teams).map(([team, roster]) => {
    const members = (Array.isArray(roster) ? roster : []).map(m => ({
      playerId: m.playerId,
      name: m.name,
      score: typeof scoreMap[m.playerId] === 'number' ? scoreMap[m.playerId] : 0
    }));
    members.sort((a, b) => b.score - a.score);
    return {
      team,
      score: members.reduce((sum, m) => sum + m.score, 0),
      members
    };
  });
  if (standings.length === 0) return [];

  // Competition ranking (1, 1, 3) — same tie rule as the individual board.
  standings.sort((a, b) => b.score - a.score);
  let prevScore = null;
  let rank = 0;
  standings.forEach((t, i) => {
    if (t.score !== prevScore) {
      rank = i + 1;
      prevScore = t.score;
    }
    t.rank = rank;
  });
  return standings;
}
