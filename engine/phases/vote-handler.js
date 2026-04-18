/**
 * Handles the "vote" phase type.
 *
 * Supports two modes:
 * - "pick-one": each voter picks one candidate, simple plurality
 * - "head-to-head": voters see A/B matchups, each candidate appears ~3 times
 */

/**
 * Get eligible voters from a PlayerRegistry based on the voters field.
 * @param {any} players
 * @param {"all"|"remaining"|"eliminated"} votersField
 * @returns {any[]}
 */
export function getEligibleVoters(players, votersField) {
  if (votersField === 'remaining') return players.getRemaining();
  if (votersField === 'eliminated') return players.getEliminated();
  return players.list();
}

/**
 * Generate head-to-head matchups so each candidate appears roughly equal times.
 * @param {string[]} candidateIds
 * @param {number} [appearancesPerCandidate=3] - target appearances per candidate
 * @returns {{ matchups: [string, string][], comparisons: number }}
 */
export function generateMatchups(candidateIds, appearancesPerCandidate = 3) {
  if (candidateIds.length < 2) return { matchups: [], comparisons: 0 };

  const comparisons = Math.ceil(candidateIds.length * appearancesPerCandidate / 2);
  /** @type {[string, string][]} */
  const matchups = [];

  // Track appearances to keep them roughly balanced
  const appearances = {};
  for (const id of candidateIds) appearances[id] = 0;

  for (let i = 0; i < comparisons; i++) {
    // Sort by fewest appearances, break ties randomly
    const sorted = [...candidateIds].sort((a, b) =>
      appearances[a] - appearances[b] || Math.random() - 0.5
    );
    const a = sorted[0];
    const b = sorted[1];
    matchups.push([a, b]);
    appearances[a]++;
    appearances[b]++;
  }

  // Shuffle the final matchup order for randomness
  for (let i = matchups.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [matchups[i], matchups[j]] = [matchups[j], matchups[i]];
  }

  return { matchups, comparisons };
}

/**
 * Tally pick-one votes into scores.
 * @param {Array<{ voterId: string, choice: string }>} votes
 * @param {string[]} candidateIds - all candidate IDs (to include 0-vote candidates)
 * @returns {{ scores: Object, winner: string, totalVotes: number, tied: boolean }}
 */
export function tallyPickOne(votes, candidateIds) {
  const scores = {};
  for (const id of candidateIds) scores[id] = 0;
  for (const { choice } of votes) {
    if (choice in scores) scores[choice]++;
  }
  return buildResult(scores, votes.length);
}

/**
 * Tally head-to-head votes into scores.
 * @param {Array<{ voterId: string, matchup: [string, string], choice: string }>} votes
 * @param {string[]} candidateIds
 * @param {[string, string][]} matchups - the matchup pairs used
 * @returns {{ scores: Object, winner: string, totalVotes: number, tied: boolean, matchups: [string, string][] }}
 */
export function tallyHeadToHead(votes, candidateIds, matchups) {
  const scores = {};
  for (const id of candidateIds) scores[id] = 0;
  for (const { choice } of votes) {
    if (choice in scores) scores[choice]++;
  }
  return { ...buildResult(scores, votes.length), matchups: matchups || [] };
}

function buildResult(scores, totalVotes) {
  const entries = Object.entries(scores);
  if (entries.length === 0) {
    return { scores, winner: null, totalVotes, tied: false };
  }

  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const topScore = entries[0][1];
  const tied = entries.length > 1 && entries[1][1] === topScore;
  const winner = entries[0][0];

  return { scores, winner, totalVotes, tied };
}
