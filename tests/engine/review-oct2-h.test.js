/**
 * Review oct2 H (2026-10-02): an outside reviewer's pass over Buzzer Quiz,
 * Book Bracket, Four Corners, Fist to Five, Creative Vote, and One Voice.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withEveryStudent } from '../../engine/phase-handlers/leaderboard.js';
import { adjudicateTap } from '../../engine/phase-handlers/one-voice.js';
import {
  mergeSameAnswers, creditCoAuthors, ballotFor, isOwnCandidate, tallyBracket, authorsOf
} from '../../engine/phases/vote-handler.js';
import { buildLiveTally, LIVE_TALLY_MIN_ANSWERS } from '../../engine/phases/live-tally.js';
import { continueLabelForPhase } from '../../engine/phases/continue-labels.js';
import { translate, LANGUAGE_CODES } from '../../engine/i18n/index.js';
import { compileRecipe } from '../../engine/recipe-compiler.js';
import '../../screens/shared/step-suggestions.js';

const S = globalThis.StepSuggestions;
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const compile = (steps) => S.compileStoryboard({ name: 'T', steps });

describe('item 6: a buzzer round after a teams step ranks the teams', () => {
  it('the buzzer standings roll up into team totals', () => {
    const { config } = compile([
      { brick: 'teams', count: 4 },
      { brick: 'buzz', text: 'Buzz in!' },
      { brick: 'end', text: 'Done.' }
    ]);
    const split = Object.keys(config.phases).find(id => config.phases[id].type === 'team-split');
    const board = Object.values(config.phases).find(p => p.type === 'leaderboard');
    expect(split).toBeTruthy();
    expect(board.teamsFrom).toBe(split);
  });
  it('without a teams step the board stays individual', () => {
    const { config } = compile([{ brick: 'buzz', text: 'Buzz in!' }, { brick: 'end', text: 'Done.' }]);
    const board = Object.values(config.phases).find(p => p.type === 'leaderboard');
    expect(board.teamsFrom).toBeUndefined();
  });
});

describe('item 7: every student is on the board, a 0 included', () => {
  const players = [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Ben' }, { id: 'c', name: 'Cy' }];
  it('adds a 0 row for a student the scores left out', () => {
    const rows = withEveryStudent([{ playerId: 'a', name: 'Ana', score: 3 }], players, 'buzz.scores');
    expect(rows.map(r => [r.playerId, r.score])).toEqual([['a', 3], ['b', 0], ['c', 0]]);
  });
  it('an empty score map still lists the class', () => {
    expect(withEveryStudent([], players, 'q.scores').length).toBe(3);
  });
  it('a board keyed by team names is left alone', () => {
    const teams = [{ playerId: 'Team 1', name: 'Team 1', score: 4 }];
    expect(withEveryStudent(teams, players, ['r1.teamScores'])).toEqual(teams);
    expect(withEveryStudent(teams, players, 'x.scores')).toEqual(teams);
  });
});

describe('item 8 and 22: the same answer twice is one entry, crediting both', () => {
  it('merges answers that differ only in case and spacing, keeping the first spelling', () => {
    const merged = mergeSameAnswers([
      { playerId: 'a', text: 'Hatchet' }, { playerId: 'b', text: ' hatchet ' }, { playerId: 'c', text: 'Holes' }
    ]);
    expect(merged).toEqual([{ playerId: 'a', text: 'Hatchet', coAuthors: ['b'] }, { playerId: 'c', text: 'Holes' }]);
  });
  it('dedupes a literal list too', () => {
    expect(mergeSameAnswers(['Hatchet', 'hatchet', 'Holes'])).toEqual(['Hatchet', 'Holes']);
  });
  it('never merges drawings or students by name, and never changes the source', () => {
    const src = [{ playerId: 'a', text: 'Sam' }, { playerId: 'b', text: 'Sam' }];
    expect(mergeSameAnswers(src, new Set(['a', 'b']))).toEqual(src);
    const pics = [{ playerId: 'a', text: '[drawing]', drawing: [[1]] }, { playerId: 'b', text: '[drawing]', drawing: [[2]] }];
    expect(mergeSameAnswers(pics).length).toBe(2);
    mergeSameAnswers(src);
    expect(src[0].coAuthors).toBeUndefined();
  });
  it('a merged entry is off both authors’ ballots and the server refuses either self-vote', () => {
    const merged = mergeSameAnswers([{ playerId: 'a', text: 'Same' }, { playerId: 'b', text: 'same' }, { playerId: 'c', text: 'Other' }]);
    expect(authorsOf(merged[0])).toEqual(['a', 'b']);
    expect(ballotFor(merged, 'b', true).map(c => c.playerId)).toEqual(['c']);
    expect(isOwnCandidate(merged, 'b', 'a')).toBe(true);
    expect(isOwnCandidate(merged, 'c', 'a')).toBe(false);
  });
  it('the votes count for every author', () => {
    const merged = mergeSameAnswers([{ playerId: 'a', text: 'Same' }, { playerId: 'b', text: 'Same' }]);
    expect(creditCoAuthors({ a: 2 }, merged)).toEqual({ a: 2, b: 2 });
  });
});

describe('item 9: a matchup nobody voted on says so', () => {
  it('names the empty matchup and why the first one goes on', () => {
    const r = tallyBracket([], ['Holes', 'Hatchet'], [['Holes', 'Hatchet']], []);
    expect(r.winners).toEqual(['Holes']);
    expect(r.bracketList).toBe('No votes for Holes or Hatchet, so Holes goes on as the first listed.');
    expect(r.bracketList).not.toMatch(/tied/);
  });
  it('a real tie still reads as a tie', () => {
    const r = tallyBracket([{ voterId: 's1', choice: 'A' }, { voterId: 's2', choice: 'B' }], ['A', 'B'], [['A', 'B']], []);
    expect(r.bracketList).toMatch(/tied/);
  });
  it('every language has the line', () => {
    for (const lang of LANGUAGE_CODES.filter(l => l !== 'en')) {
      expect(translate(lang, 'No votes for {a} or {b}, so {a} goes on as the first listed.')).not.toBe('No votes for {a} or {b}, so {a} goes on as the first listed.');
      expect(translate(lang, 'Groups')).not.toBe('Groups');
    }
  });
});

describe('item 10: a decided bracket never offers "Start the voting"', () => {
  const phases = {
    'round-2-results': { type: 'reveal', template: 'Round 2:\n\n{{round-2.bracketList}}', next: 'round-3' },
    'round-3': { type: 'vote', mode: 'head-to-head', bracket: true, candidates: 'round-2.winners' }
  };
  const card = { id: 'round-2-results', ...phases['round-2-results'] };
  it('reads Crown the winner when the round sent one candidate on', () => {
    expect(continueLabelForPhase(card, phases, 'en', { 'round-2': { winners: ['Holes'] } })).toBe('Crown the winner');
  });
  it('keeps Start the voting while two or more are left', () => {
    expect(continueLabelForPhase(card, phases, 'en', { 'round-2': { winners: ['Holes', 'Hoot'] } })).toBe('Start the voting');
    expect(continueLabelForPhase(card, phases, 'en')).toBe('Start the voting');
  });
});

describe('item 11: the live chart waits for three answers', () => {
  it('the first vote never shows as 100 percent', () => {
    expect(LIVE_TALLY_MIN_ANSWERS).toBe(3);
    const r = buildLiveTally([{ response: 'Corner A' }], ['Corner A', 'Corner B']);
    expect(r.held).toBe(true);
    expect(r.rows.every(row => row.count === 0 && row.pct === 0)).toBe(true);
  });
  it('shows the counts once three have answered', () => {
    const r = buildLiveTally([{ response: 'A' }, { response: 'B' }, { response: 'A' }], ['A', 'B']);
    expect(r.held).toBe(false);
    expect(r.rows).toEqual([{ label: 'A', count: 2, pct: 67 }, { label: 'B', count: 1, pct: 33 }]);
  });
});

describe('item 15: the split heading says the word the cards say', () => {
  it('the projector picks Groups for Group N names, through the language table', () => {
    const host = read('screens/host/host.js');
    expect(host).toMatch(/function splitHeadingFor/);
    expect(host).toMatch(/UiLang\.t\(splitHeadingFor\(/);
    expect(host).not.toMatch(/teamSplitHeading\.textContent = 'Teams'/);
  });
  it('the student board never says "Team Group 1"', () => {
    expect(read('screens/player/player.js')).toMatch(/\/\^\(team\|group\)\\b\/i\.test\(String\(myTeamStanding\.team\)\)/);
  });
});

describe('item 18: a scale poll charts in its own order', () => {
  it('fist to five keeps 0 to 5 with the empty values', () => {
    const { config } = compile([
      { brick: 'collect-choice', text: 'Fist to five?', choices: ['0', '1', '2', '3', '4', '5'] },
      { brick: 'end', text: 'Done.' }
    ]);
    const poll = Object.values(config.phases).find(p => p.type === 'collect-choice');
    expect(poll.chartOrder).toBe('choices');
  });
  it('a plain opinion poll keeps the most-picked-first chart', () => {
    const { config } = compile([
      { brick: 'collect-choice', text: 'Which?', choices: ['Cats', 'Dogs', 'Fish'] },
      { brick: 'end', text: 'Done.' }
    ]);
    const poll = Object.values(config.phases).find(p => p.type === 'collect-choice');
    expect(poll.chartOrder).toBeUndefined();
  });
});

describe('item 21: Creative Vote keeps a student off their own entry', () => {
  it('the vote step sets excludeAuthors', () => {
    const recipe = JSON.parse(read('recipes/creative-vote.json'));
    const { config } = compileRecipe(recipe, { prompt: 'Write a slogan for our class.' });
    expect(config.phases.vote.excludeAuthors).toBe(true);
  });
});

describe('item 23: no bare number under the crown on a student screen', () => {
  it('the winner details never print the score alone', () => {
    const player = read('screens/player/player.js');
    expect(player).not.toMatch(/String\(winnerScore\)/);
    expect(player).not.toMatch(/winnerScore \+ ' each'/);
  });
});

describe('One Voice: any two voices inside the window collide', () => {
  const fresh = () => ({
    phaseId: 'count', kind: 'one-voice', target: 10, windowMs: 400, maxAttempts: null,
    count: 0, attempt: 1, bestRun: 0, resets: 0, lastTapAt: null, lastTapBy: null, lastHeardAt: null,
    lockoutUntil: 0, finished: false, history: [], timer: null, cleanup() {}
  });
  it('a classmate 100 ms after the last speaker’s refused tap resets the count', () => {
    const s = fresh();
    adjudicateTap(s, 'p1', 1000);
    adjudicateTap(s, 'p2', 2000); // 2
    expect(adjudicateTap(s, 'p2', 3000)).toEqual({ type: 'reject', reason: 'same-player' });
    expect(adjudicateTap(s, 'p3', 3100).type).toBe('reset');
  });
  it('the other order resets too, as it always did', () => {
    const s = fresh();
    adjudicateTap(s, 'p1', 1000);
    adjudicateTap(s, 'p2', 2000);
    expect(adjudicateTap(s, 'p3', 3000).type).toBe('count');
    expect(adjudicateTap(s, 'p2', 3100).type).toBe('reset');
  });
  it('a classmate well after a refused tap still counts', () => {
    const s = fresh();
    adjudicateTap(s, 'p1', 1000);
    adjudicateTap(s, 'p1', 1500);
    expect(adjudicateTap(s, 'p2', 2000)).toEqual({ type: 'count', count: 2 });
  });
});
