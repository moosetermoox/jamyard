/**
 * Instant runoff (2026-10-01, the mechanics inventory's Part 3): a rank
 * step with `runoff: true` treats every student's order as a ballot. Each
 * round counts the first choice still in the running on every ballot; an
 * item with more than half of those wins; otherwise the last place goes
 * out (every item nobody put first goes at once) and the ballots that had
 * it on top move to their next choice. Ranked-choice voting, the way a
 * class picks one book, one field trip, one name, so a split favorite
 * does not lose to the item a third of the class liked.
 *
 * Ties are broken by the class's overall ranking (the average place,
 * engine/phases/choice-draft.js aggregateRankings), then by list order,
 * so nothing depends on who submitted first.
 *
 * Pure: ballots in, rounds and words out. No engine, no sockets.
 */
import { translate } from '../i18n/index.js';
import { aggregateRankings } from './choice-draft.js';

const key = (x) => (typeof x === 'string' ? x : JSON.stringify(x));

/**
 * @param {Array<Array<string>>} ballots  each student's order, first choice first
 * @param {string[]} candidates           the items, in list order
 * @returns {{ winner: string|null, rounds: Array<{counts: Array<[string, number]>, active: number, out: string[]}>, decidedBy: 'majority'|'last'|'tie'|null }}
 */
export function instantRunoff(ballots, candidates) {
  const items = (Array.isArray(candidates) ? candidates : []).map(key);
  const valid = (Array.isArray(ballots) ? ballots : []).filter(Array.isArray).map(b => b.map(key));
  // Tie order: the class's overall ranking first, then list order
  const overall = aggregateRankings(valid, items).map(r => r.item);
  const standing = (item) => overall.indexOf(item);
  const rounds = [];
  let remaining = items.slice();

  if (items.length === 0 || valid.length === 0) return { winner: null, rounds, decidedBy: null };

  while (remaining.length > 0) {
    const counts = Object.fromEntries(remaining.map(i => [i, 0]));
    let active = 0;
    for (const ballot of valid) {
      const top = ballot.find(i => i in counts);
      if (top !== undefined) { counts[top]++; active++; }
    }
    const ordered = remaining.slice().sort((a, b) => counts[b] - counts[a] || standing(a) - standing(b));
    const row = { counts: ordered.map(i => [i, counts[i]]), active, out: [] };
    rounds.push(row);

    if (remaining.length === 1) return { winner: remaining[0], rounds, decidedBy: 'last' };
    if (active > 0 && counts[ordered[0]] * 2 > active) return { winner: ordered[0], rounds, decidedBy: 'majority' };
    if (remaining.length === 2) {
      // Two left and even: the class's overall ranking decides
      return { winner: ordered[0], rounds, decidedBy: active > 0 ? 'tie' : null };
    }

    const low = Math.min(...remaining.map(i => counts[i]));
    let out = low === 0 ? remaining.filter(i => counts[i] === 0) : [];
    if (out.length === 0 || out.length >= remaining.length) {
      // One goes: the lowest count, the worst overall place among them
      const lowest = remaining.filter(i => counts[i] === low);
      out = [lowest.sort((a, b) => standing(b) - standing(a))[0]];
    }
    row.out = out;
    remaining = remaining.filter(i => !out.includes(i));
  }
  return { winner: null, rounds, decidedBy: null };
}

/**
 * The rounds in words, one line each, in the activity's language:
 * "Round 1: Pizza 4, Tacos 3, Sushi 2. Sushi is out."
 * "Round 2: Pizza 5, Tacos 4. Pizza wins with 5 of 9."
 */
export function runoffList(result, lang) {
  if (!result || !result.winner) return translate(lang, 'Nobody ranked anything.');
  return result.rounds.map((r, i) => {
    const head = translate(lang, 'Round {n}:').replace('{n}', String(i + 1));
    const tally = r.counts.map(([item, n]) => `${item} ${n}`).join(', ');
    const last = i === result.rounds.length - 1;
    let tail;
    if (!last) {
      tail = r.out.map(item => translate(lang, '{item} is out.').replace('{item}', item)).join(' ');
    } else if (result.decidedBy === 'tie') {
      tail = translate(lang, '{item} wins the tie on the class\'s overall ranking.').replace('{item}', result.winner);
    } else {
      const votes = (r.counts.find(([item]) => item === result.winner) || [null, 0])[1];
      tail = translate(lang, '{item} wins with {votes} of {total}.')
        .replace('{item}', result.winner).replace('{votes}', String(votes)).replace('{total}', String(r.active));
    }
    return `${head} ${tally}. ${tail}`;
  }).join('\n');
}
