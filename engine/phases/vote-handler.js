/**
 * Handles the "vote" phase type.
 *
 * Supports two modes:
 * - "pick-one": each voter picks one candidate, simple plurality
 * - "head-to-head": voters see A/B matchups, each candidate appears ~3 times
 */

import { translate } from '../i18n/index.js';

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
 * A pick-one ballot for one voter. With excludeAuthors on, the voter's own
 * candidate is left off (2026-09-10: an elimination round where everyone
 * voted for themselves tied the whole room). Literal string candidates
 * have no author and always stay.
 * @param {any[]} candidates - {playerId, text, ...} objects or strings
 * @param {string} voterId
 * @param {boolean} excludeAuthors
 * @returns {any[]}
 */
export function ballotFor(candidates, voterId, excludeAuthors) {
  if (!excludeAuthors) return candidates;
  return candidates.filter(c => !(c && typeof c === 'object' && c.playerId === voterId));
}

/**
 * Did this voter pick their own candidate? Used by the server to refuse a
 * self-vote that a stale or hand-crafted client sends past the ballot.
 * @param {any[]} candidates
 * @param {string} voterId
 * @param {any} choice - candidate id (playerId for response candidates)
 * @returns {boolean}
 */
export function isOwnCandidate(candidates, voterId, choice) {
  return candidates.some(c => c && typeof c === 'object' && c.playerId === voterId && c.playerId === choice);
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

/**
 * Yes-or-no votes (mode "approve", 2026-09-25): every voter says yes or no
 * to every candidate, so a vote can pass several proposals at once (a
 * clause into a constitution, a class norm, a budget line). A candidate
 * passes when its yes votes beat `passAt` percent of the votes cast on it
 * (default 50: more yes than no; a tie fails; 100 means every vote on it
 * said yes). `scores` stays the yes count per candidate so a crown or a
 * leaderboard can still read the vote.
 *
 * The lists never come back blank: an empty one reads "None." so a
 * "Did not pass:" heading over it still says something, and `turnout`
 * ("3 of 4 students voted.") tells the class how many decided it (an
 * outside reviewer's third Convention run, 2026-09-26: two clauses passed
 * on one vote out of four, and the ones that failed vanished).
 *
 * @param {Array<{ voterId: string, choice: string, approve: boolean }>} votes
 * @param {any[]} candidates - {playerId, text, ...} objects or strings
 * @param {{ passAt?: number, eligible?: number, lang?: string }} [opts]
 *   eligible = how many students could vote; lang = the activity language
 */
export function tallyApprove(votes, candidates, opts = {}) {
  const passAt = Number.isFinite(opts.passAt) ? opts.passAt : 50;
  const lang = opts.lang || 'en';
  const ids = (candidates || []).map(c => (c && typeof c === 'object' && c.playerId ? c.playerId : c));
  const scores = {};
  const noCounts = {};
  for (const id of ids) { scores[id] = 0; noCounts[id] = 0; }
  const voters = new Set();
  const seen = new Set();
  for (const v of votes || []) {
    if (!v || !(v.choice in scores)) continue;
    // one answer per voter per candidate: the first one counts
    const key = String(v.voterId) + '\u0000' + String(v.choice);
    if (seen.has(key)) continue;
    seen.add(key);
    voters.add(v.voterId);
    if (v.approve === true) scores[v.choice]++;
    else noCounts[v.choice]++;
  }
  const results = ids.map((id, i) => {
    const yes = scores[id];
    const no = noCounts[id];
    const cast = yes + no;
    const passed = passAt >= 100
      ? (cast > 0 && no === 0)
      : (yes * 100 > passAt * cast);
    const c = candidates[i];
    const entry = c && typeof c === 'object' ? { ...c } : { text: String(c) };
    if (entry.drawing) delete entry.drawing;
    return { ...entry, text: candidateText(c), yes, no, passed };
  });
  results.sort((a, b) => b.yes - a.yes || a.no - b.no);
  const approved = results.filter(r => r.passed).map(({ passed, ...r }) => r);
  const rejected = results.filter(r => !r.passed).map(({ passed, ...r }) => r);
  const top = results[0] || null;
  return {
    scores,
    noCounts,
    results,
    approved,
    rejected,
    approvedCount: approved.length,
    approvedList: approvedLines(approved, lang) || translate(lang, 'None.'),
    rejectedList: approvedLines(rejected, lang) || translate(lang, 'None.'),
    turnout: turnoutLine(voters.size, opts.eligible, lang),
    eligibleCount: Number.isInteger(opts.eligible) ? opts.eligible : null,
    resultsList: results.map(r => `${r.passed ? 'Passed' : 'Did not pass'}: ${r.text} (${r.yes} yes, ${r.no} no)`).join('\n'),
    winner: top ? (top.playerId || top.text) : null,
    winnerText: top ? top.text : null,
    tied: !!(results.length > 1 && results[1].yes === results[0].yes),
    totalVotes: voters.size
  };
}

/**
 * A numbered list of entries with their yes and no counts, for a reveal.
 * The counts close each line as "(3 yes, 1 no)" in the activity's words;
 * the screens paint that group as a small tag (RichText's tally lines).
 * @param {Array<{ text: string, yes: number, no: number }>} entries
 * @param {string} [lang]
 * @returns {string}
 */
export function approvedLines(entries, lang = 'en') {
  const yes = translate(lang, 'Yes').toLowerCase();
  const no = translate(lang, 'No').toLowerCase();
  return (entries || []).map((r, i) => `${i + 1}. ${r.text} (${r.yes} ${yes}, ${r.no} ${no})`).join('\n');
}

/**
 * The convention floor: while a yes-or-no vote is open the projector lists
 * every proposal, numbered, words only, so the class reads them together
 * before and while they vote (an outside reviewer's third Convention run,
 * 2026-09-26: each student read the clauses alone on their own screen).
 * Never a name or an id; a drawing has no words and stays off the list
 * (the projector gets no student drawing without a teacher gate).
 * @param {string} mode
 * @param {any[]} candidates
 * @returns {string[]|null} null for any other voting style
 */
export function proposalsForProjector(mode, candidates) {
  if (mode !== 'approve') return null;
  const out = [];
  for (const c of candidates || []) {
    if (c && typeof c === 'object' && Array.isArray(c.drawing)) continue;
    const words = typeof c === 'string' ? c : (c && typeof c.text === 'string' ? c.text : '');
    if (words.trim()) out.push(words.trim());
  }
  return out;
}

/**
 * "3 of 4 students voted." for the reveal under the lists; blank when the
 * class size is unknown.
 * @param {number} voted
 * @param {number} [eligible]
 * @param {string} [lang]
 * @returns {string}
 */
export function turnoutLine(voted, eligible, lang = 'en') {
  if (!Number.isInteger(eligible) || eligible <= 0) return '';
  return translate(lang, '{voted} of {total} students voted.')
    .replace('{voted}', String(voted)).replace('{total}', String(eligible));
}

/**
 * Display text of a candidate — literal strings ARE their text; response
 * objects use text, then name.
 * @param {any} candidate
 * @returns {string}
 */
export function candidateText(candidate) {
  if (candidate == null) return '';
  if (typeof candidate === 'string') return candidate;
  return candidate.text || candidate.name || String(candidate.playerId || '');
}

/**
 * Branching votes: resolve where the game goes based on the winner.
 *
 * `phase.nextByWinner` maps a candidate's TEXT to a phase id:
 *   "nextByWinner": { "Enter the cave": "cave-intro", ... }
 *
 * Returns the branch phase id, or null when there's no map / the winner
 * isn't in it (caller falls back to phase.next). Designed for literal
 * option lists (choose-your-own-adventure) but works on response
 * candidates too — matched by exact text.
 *
 * @param {any} phase
 * @param {string|null} winnerId  The tally winner (candidate id: literal text or playerId)
 * @param {any[]} candidates      The candidates the vote ran on
 * @returns {string|null}
 */
export function resolveBranchTarget(phase, winnerId, candidates) {
  if (!phase || !phase.nextByWinner || typeof phase.nextByWinner !== 'object' || winnerId == null) {
    return null;
  }
  const winner = (candidates || []).find(c => (c && c.playerId ? c.playerId : c) === winnerId);
  const text = candidateText(winner !== undefined ? winner : winnerId);
  if (Object.prototype.hasOwnProperty.call(phase.nextByWinner, text)) {
    const target = phase.nextByWinner[text];
    return typeof target === 'string' && target ? target : null;
  }
  return null;
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
