/**
 * Bracket votes (2026-09-27, a reviewer's "book bracket"): a head-to-head
 * vote with bracket: true pairs the candidates in list order, every
 * student votes on every matchup, the winners move on as .winners, and a
 * chain of such rounds is a single-elimination bracket.
 */
import { describe, it, expect } from 'vitest';
import { bracketMatchups, tallyBracket, rankedResultsList, bracketLines } from '../../engine/phases/vote-handler.js';
import { validate } from '../../engine/game-loader.js';

const BOOKS = ['Holes', 'Hatchet', 'Wonder', 'Matilda', 'Frindle'];

describe('bracketMatchups', () => {
  it('pairs consecutive candidates and gives an odd last one a bye', () => {
    expect(bracketMatchups(BOOKS)).toEqual({ matchups: [['Holes', 'Hatchet'], ['Wonder', 'Matilda']], byes: ['Frindle'] });
    expect(bracketMatchups(['A', 'B', 'C', 'D'])).toEqual({ matchups: [['A', 'B'], ['C', 'D']], byes: [] });
    expect(bracketMatchups(['A'])).toEqual({ matchups: [], byes: ['A'] });
  });
  it('lists the matchups for the projector in words', () => {
    expect(bracketLines([['Holes', 'Hatchet']], BOOKS)).toEqual(['Holes  vs  Hatchet']);
  });
});

describe('tallyBracket', () => {
  const { matchups, byes } = bracketMatchups(BOOKS);
  const votes = [
    { voterId: 's1', choice: 'Holes' }, { voterId: 's1', choice: 'Matilda' },
    { voterId: 's2', choice: 'Holes' }, { voterId: 's2', choice: 'Wonder' },
    { voterId: 's3', choice: 'Hatchet' }, { voterId: 's3', choice: 'Matilda' }
  ];
  it('sends every matchup winner and the bye on, and says the round in words', () => {
    const r = tallyBracket(votes, BOOKS, matchups, byes);
    expect(r.winners).toEqual(['Holes', 'Matilda', 'Frindle']);
    expect(r.bracketList).toBe('Holes beat Hatchet, 2 to 1.\nMatilda beat Wonder, 2 to 1.\nFrindle moves on, no opponent this round.');
    expect(r.totalVotes).toBe(3);
    expect(r.winner).toBeNull();
    expect(r.scores).toEqual({ Holes: 2, Hatchet: 1, Wonder: 1, Matilda: 2, Frindle: 0 });
  });
  it('sends the first-listed on in a tie and names the champion when one is left', () => {
    const r = tallyBracket([{ voterId: 's1', choice: 'A' }, { voterId: 's2', choice: 'B' }], ['A', 'B'], [['A', 'B']], []);
    expect(r.winners).toEqual(['A']);
    expect(r.bracketList).toBe('A and B tied, A moves on.');
    expect(r.winner).toBe('A');
    expect(r.winnerText).toBe('A');
  });
  it('keeps answer candidates whole so the next round can read them', () => {
    const answers = [{ playerId: 'p1', text: 'Why is the sky blue?' }, { playerId: 'p2', text: 'Do fish sleep?' }];
    const r = tallyBracket([{ voterId: 's1', choice: 'p2' }], answers, [['p1', 'p2']], []);
    expect(r.winners).toEqual([answers[1]]);
    expect(r.winnerText).toBe('Do fish sleep?');
    expect(r.bracketList).toBe('Do fish sleep? beat Why is the sky blue?, 1 to 0.');
  });
  it('speaks the activity language', () => {
    const r = tallyBracket([{ voterId: 's1', choice: 'A' }], ['A', 'B'], [['A', 'B']], [], 'es');
    expect(r.bracketList).toBe('A venció a B, 1 a 0.');
  });
});

describe('rankedResultsList', () => {
  it('numbers every candidate by votes, most first', () => {
    const answers = [{ playerId: 'p1', text: 'One' }, { playerId: 'p2', text: 'Two' }, { playerId: 'p3', text: 'Three' }];
    expect(rankedResultsList({ p1: 1, p2: 4, p3: 0 }, answers)).toBe('1. Two (4)\n2. One (1)\n3. Three (0)');
  });
});

describe('validator: a bracket chain', () => {
  it('accepts round two reading round one\'s winners', () => {
    const config = {
      name: 'Book bracket', description: 'test',
      phases: {
        lobby: { type: 'lobby', next: 'r1' },
        r1: { type: 'vote', mode: 'head-to-head', bracket: true, candidates: ['Holes', 'Hatchet', 'Wonder', 'Matilda'], next: 'r1-show' },
        'r1-show': { type: 'reveal', template: 'Round one:\n\n{{r1.bracketList}}', next: 'r2' },
        r2: { type: 'vote', mode: 'head-to-head', bracket: true, candidates: 'r1.winners', next: 'champ' },
        champ: { type: 'reveal', template: '{{r2.bracketList}}\n\nThe champion: **{{r2.winnerText}}**', next: 'end' },
        end: { type: 'end', message: 'Bye' }
      }
    };
    const r = validate(config, 'bracket-test', { returnResults: true });
    expect(r.errors).toEqual([]);
    expect(r.warnings.map(w => w.message || w).join(' ')).not.toMatch(/winners/);
  });
});
