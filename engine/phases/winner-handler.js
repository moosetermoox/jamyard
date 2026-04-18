/**
 * Handles the "winner" phase type.
 *
 * Determines the winner from a scores object and builds full standings.
 * Ties are broken alphabetically by playerId (deterministic).
 */

/**
 * Determine winner and build standings from scores.
 * @param {Object} scores - { playerId: voteCount }
 * @param {any} players - PlayerRegistry for name lookup
 * @returns {{ winnerId: string|null, winnerName: string|null, winnerScore: number, winnerIds: string[], winnerNames: string[], isTie: boolean, standings: Array }}
 */
export function determineWinner(scores, players) {
  const entries = Object.entries(scores);

  const standings = entries
    .map(([playerId, score]) => {
      const player = players.find(playerId);
      return { playerId, name: player ? player.name : playerId, score };
    })
    .sort((a, b) => b.score - a.score || a.playerId.localeCompare(b.playerId));

  if (standings.length === 0) {
    return { winnerId: null, winnerName: null, winnerScore: 0, winnerIds: [], winnerNames: [], isTie: false, standings: [] };
  }

  const winner = standings[0];
  const tiedWinners = standings.filter(s => s.score === winner.score);
  return {
    winnerId: winner.playerId,
    winnerName: winner.name,
    winnerScore: winner.score,
    winnerIds: tiedWinners.map(w => w.playerId),
    winnerNames: tiedWinners.map(w => w.name),
    isTie: tiedWinners.length > 1,
    standings
  };
}
