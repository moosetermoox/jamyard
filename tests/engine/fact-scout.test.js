/**
 * The fact scout's pure part (engine/fact-scout.js, 2026-09-27): rounds
 * for Trivia Bluff found in the bodies of plain articles, never on a
 * fun-facts list. These guard the rules the owner set over five rounds of
 * rating (a person's name, a place, a number, or a rite is never the
 * truth; a bold claim is dropped, not flagged; one round per sentence;
 * the answer never shows in the sentence; not funny or not checkable is
 * out), the lineup scoring, the ranking, and the shape the panel takes.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  bodyOf, wikiUrl, pickPagesPrompt, pickedTitles, extractPrompt, answerShows, filterCandidates,
  quoteFound, lineupsFor, lineupPrompt, lineupScore, applyLineup, rank, score, toRounds, extractArray, SKIP_TITLE
} from '../../engine/fact-scout.js';

const good = (over = {}) => ({
  question: 'In 1885 the German writer Heinrich Böhnke-Reich warned against using old ___ as coffee filters.',
  truth: 'wallpaper', kind: 'object', houseLie: 'newspaper', lies: ['cotton rags', 'handkerchiefs', 'burlap'],
  source: 'Coffee filter', quote: 'In 1885, Heinrich Böhnke-Reich warned of using old wall paper as coffee filters.',
  checkable: 5, ridiculous: 5, picturable: 5, wide: 4, bold: false, ...over
});

describe('pages', () => {
  it('skips lists, glossaries, films, and trivia pages by title', () => {
    for (const t of ['List of penguins', 'Glossary of cheese', 'Penguins (film)', 'Ohio trivia', 'Outline of coffee']) expect(SKIP_TITLE.test(t), t).toBe(true);
    for (const t of ['Penguin', 'Emperor penguin', 'History of coffee']) expect(SKIP_TITLE.test(t), t).toBe(false);
  });

  it('cuts the sections that never hold a surprise and caps the length', () => {
    const text = 'Lead paragraph here, long enough to read as a paragraph and not as a heading.\nHistory\nSomething odd happened here, in a sentence long enough to read as a paragraph.\nSee also\nOther pages you could read about this topic are listed here in full sentences.\nReferences\n1. a book, in a line long enough to read as a paragraph and not a heading';
    const body = bodyOf(text);
    expect(body).toContain('Something odd happened');
    expect(body).not.toContain('Other pages');
    expect(body).not.toContain('1. a book');
    expect(bodyOf('x'.repeat(10000)).length).toBe(6500);
  });

  it('the pick prompt names the homonym and near-thing traps, and picks come back as titles in order', () => {
    const hits = [{ title: 'Crow', snippet: 'a bird' }, { title: 'Crow people', snippet: 'a nation' }, { title: 'Corvus', snippet: 'genus' }];
    const prompt = pickPagesPrompt('crows', hits, 2);
    expect(prompt).toContain('drop the Crow people');
    expect(prompt).toContain('1. Crow: a bird');
    expect(pickedTitles(hits, [3, 1, 2], 2)).toEqual(['Corvus', 'Crow']);
    expect(pickedTitles(hits, ['1', 1, 9], 5)).toEqual(['Crow']);
    expect(wikiUrl('Crow people')).toBe('https://en.wikipedia.org/wiki/Crow_people');
  });
});

describe('the extract prompt', () => {
  it('carries every rule the owner set and the taste examples', async () => {
    const taste = JSON.parse(await readFile(new URL('../../engine/fact-scout-taste.json', import.meta.url), 'utf8'));
    expect(taste.hits.length).toBeGreaterThanOrEqual(39);
    expect(taste.misses.length).toBeGreaterThanOrEqual(25);
    const prompt = extractPrompt([{ title: 'Penguin', text: 'A group of penguins in the water is a raft.' }], { taste });
    for (const rule of [
      'drawn ONLY from what the sources state',
      'Never a list-completion blank',
      "NEVER a person's name",
      'A brand name or a model name',
      'One round per source sentence',
      'Nothing religious at all',
      'The gross rule',
      'alcohol or drunkenness',
      'the STRANGEST element',
      'Never leave a phrase that describes the truth',
      'carries the context a reader needs to check it',
      'checkable (does the sentence itself name the place, the time, and the party',
      'ridiculous (would a room of teenagers laugh out loud'
    ]) expect(prompt, rule).toContain(rule);
    expect(prompt).toContain('HIT: "Augustus prohibited serving legionaries from ___');
    expect(prompt).toContain('MISS: "An octopus has ___ hearts."');
    expect(prompt).toContain('=== SOURCE 1: Penguin ===');
  });
});

describe('the filters', () => {
  it('keeps a good round and drops each bad kind with its reason', () => {
    // every candidate quotes its own sentence, so the one-per-sentence rule stays out of this test
    const raw = [
      good(),
      good({ truth: 'Stamata Revithi', kind: 'person', quote: 'q1' }),
      good({ truth: '1776', kind: 'number', quote: 'q2' }),
      good({ truth: "The Martyr's Finger", kind: 'religious', quote: 'q3' }),
      good({ truth: 'faked his own death', kind: 'action', bold: true, quote: 'q4' }),
      good({ truth: 'buckeye', question: 'The Buckeye State is named for its ___ trees.', quote: 'q5' }),
      good({ truth: 'papers', ridiculous: 2, quote: 'He burned his papers.' }),
      good({ truth: 'slaves', checkable: 1, quote: 'the only weapon allowed for all, even slaves' }),
      good({ truth: 'no blank', question: 'No blank here.', quote: 'x' })
    ];
    const { kept, dropped } = filterCandidates(raw, 'coffee');
    expect(kept).toHaveLength(1);
    expect(kept[0].truth).toBe('wallpaper');
    expect(dropped.map((d) => d.why)).toEqual([
      'a person, place, number, or rite as the truth',
      'a person, place, number, or rite as the truth',
      'a person, place, number, or rite as the truth',
      'a bold claim the teacher would have to check',
      'the answer shows in the sentence or the topic',
      'not funny enough',
      'not enough context to check',
      'no blank or no truth'
    ]);
  });

  it('one round per source sentence: the second from the same quote goes', () => {
    const { kept, dropped } = filterCandidates([good(), good({ truth: 'greyish paper', question: 'He favoured sheets of ___ as filters.' })], 'coffee');
    expect(kept).toHaveLength(1);
    expect(dropped[0].why).toBe('a second round from one sentence');
  });

  it('the answer shows: in the sentence, the topic, the source title, or as a stem', () => {
    expect(answerShows({ question: 'A ___ is a bird.', truth: 'penguin', source: 'Penguin' }, 'zoos')).toBe(true);
    expect(answerShows({ question: 'It eats ___.', truth: 'squid', source: 'African penguin' }, 'squids')).toBe(true);
    expect(answerShows({ question: 'A group in the water is a ___.', truth: 'raft', source: 'Penguin' }, 'penguins')).toBe(false);
  });

  it('a quote must be in the page text', () => {
    const pages = { Coffee: { text: 'In 1885, Heinrich Böhnke-Reich warned of using old wall paper as coffee filters.', url: 'u' } };
    expect(quoteFound(good({ source: 'Coffee' }), pages)).toBe(true);
    expect(quoteFound(good({ source: 'Coffee', quote: 'Something the page never says at all.' }), pages)).toBe(false);
    expect(quoteFound(good({ source: 'Missing' }), pages)).toBe(false);
  });
});

describe('the lineup test', () => {
  it('shuffles the truth among the lies and the prompt letters them', () => {
    const c = good();
    const lineups = lineupsFor([c], () => 0.99);
    expect(lineups[0].options).toHaveLength(5);
    expect(lineups[0].options[lineups[0].truthIndex]).toBe('wallpaper');
    const prompt = lineupPrompt([c], lineups);
    expect(prompt).toContain('(A)');
    expect(prompt).toContain('(E)');
    expect(prompt).toContain('{"n": number, "pick": "A", "sure": 1-5}');
  });

  it('a truth the judge knew scores low, one it passed over scores high', () => {
    expect(lineupScore(true, 5)).toBe(1);
    expect(lineupScore(true, 1)).toBe(5);
    expect(lineupScore(false, 1)).toBe(4);
    expect(lineupScore(false, 5)).toBe(5);
    const c = good();
    const lineups = [{ options: ['a', 'wallpaper', 'c'], truthIndex: 1 }];
    const [knew] = applyLineup([c], lineups, [{ n: 1, pick: 'B', sure: 5 }]);
    expect(knew.lineup).toBe(1);
    expect(knew.judge).toBe('picked the truth (sure 5)');
    const [missed] = applyLineup([c], lineups, [{ n: 1, pick: 'C', sure: 3 }]);
    expect(missed.lineup).toBe(5);
    expect(missed.judge).toBe('picked "c" (sure 3)');
    const [absent] = applyLineup([c], lineups, []);
    expect(absent.lineup).toBe(4);
  });

  it('ranks by ridiculous first, then the lineup, then the rest', () => {
    const a = { ...good(), ridiculous: 5, lineup: 1, picturable: 1, wide: 1 };
    const b = { ...good(), ridiculous: 3, lineup: 5, picturable: 5, wide: 5 };
    expect(score(a)).toBe(19);
    expect(score(b)).toBe(29);
    expect(rank([a, b])[0]).toBe(b);
  });
});

describe('the shape the panel takes', () => {
  it('rounds carry the fact, the decoy, and the source with its quote and link', () => {
    const c = { ...good(), source: 'Coffee filter', lineup: 4 };
    const rounds = toRounds([c], { 'Coffee filter': { url: 'https://en.wikipedia.org/wiki/Coffee_filter', text: '' } });
    expect(rounds[0]).toEqual({
      question: c.question, truth: 'wallpaper', houseLie: 'newspaper',
      source: { title: 'Coffee filter', url: 'https://en.wikipedia.org/wiki/Coffee_filter', quote: c.quote },
      scores: { ridiculous: 5, checkable: 5, lineup: 4 }
    });
  });

  it('reads an array out of a wrapped reply and gives nothing for prose', () => {
    expect(extractArray('Sure: [1, 2]')).toEqual([1, 2]);
    expect(extractArray('[{"a":1}]')).toEqual([{ a: 1 }]);
    expect(extractArray('no list here')).toEqual([]);
    expect(extractArray('{"a":1}')).toEqual([]);
  });
});
