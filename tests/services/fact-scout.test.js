/**
 * The fact scout's pipeline (services/fact-scout.js): Wikipedia through an
 * injected fetch, the model through the AI service. In mock mode two
 * rounds come from the first page's own sentences and no model is asked;
 * in real mode the three passes run and only a round whose quoted
 * sentence is in the page survives.
 */
import { describe, it, expect } from 'vitest';
import { AIService } from '../../services/ai-service.js';
import { scoutFacts, searchPages, fetchBody } from '../../services/fact-scout.js';

const PAGE_TEXT = 'The penguin is a bird. In 2004, two male chinstrap penguins named Roy and Silo in Central Park Zoo took turns trying to hatch a rock, for which a keeper substituted an egg. A group of penguins in the water is sometimes called a raft.';

function fakeFetch(calls = []) {
  return async (url) => {
    calls.push(url);
    const u = new URL(url);
    const body = u.searchParams.get('list') === 'search'
      ? { query: { search: [{ title: 'Penguin', snippet: 'a <b>bird</b>' }, { title: 'List of penguins', snippet: 'x' }, { title: 'Pittsburgh Penguins', snippet: 'hockey' }] } }
      : { query: { pages: [{ title: u.searchParams.get('titles'), extract: PAGE_TEXT }] } };
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => body };
  };
}

describe('pages through Wikipedia', () => {
  it('searches three ways, skips list pages, and reads a body', async () => {
    const calls = [];
    const hits = await searchPages('penguins', 4, fakeFetch(calls));
    expect(hits.map((h) => h.title)).toEqual(['Penguin', 'Pittsburgh Penguins']);
    expect(hits[0].snippet).toBe('a bird');
    expect(calls.filter((c) => c.includes('list=search'))).toHaveLength(3);
    const page = await fetchBody('Penguin', fakeFetch());
    expect(page.title).toBe('Penguin');
    expect(page.url).toBe('https://en.wikipedia.org/wiki/Penguin');
    expect(page.text).toContain('hatch a rock');
  });

  it('waits out a 429 and then gives up with a plain error', async () => {
    let n = 0;
    const limited = async () => { n++; return { ok: false, status: 500, headers: { get: () => null } }; };
    await expect(searchPages('x', 2, limited)).rejects.toThrow('Wikipedia answered 500');
    expect(n).toBe(1);
  });
});

describe('scoutFacts', () => {
  it('refuses a topic too short to read', async () => {
    await expect(scoutFacts({ topic: 'a', aiService: new AIService(), fetchImpl: fakeFetch() })).rejects.toThrow('couple of characters');
  });

  it('in mock mode reads two pages and builds marked rounds from their sentences, no model asked', async () => {
    const ai = new AIService();
    let asked = false;
    ai._callClaude = async () => { asked = true; return { content: [] }; };
    const out = await scoutFacts({ topic: 'penguins', aiService: ai, fetchImpl: fakeFetch() });
    expect(asked).toBe(false);
    expect(out.topic).toBe('penguins');
    expect(out.pages.map((p) => p.title)).toEqual(['Penguin', 'Pittsburgh Penguins']);
    expect(out.rounds.length).toBeGreaterThan(0);
    expect(out.rounds[0].question).toContain('(Mock)');
    expect(out.rounds[0].question).toContain('___');
    expect(out.rounds[0].source.title).toBe('Penguin');
    expect(out.rounds[0].source.url).toBe('https://en.wikipedia.org/wiki/Penguin');
    expect(PAGE_TEXT).toContain(out.rounds[0].source.quote);
  });

  it('in real mode picks pages, extracts, filters, checks the quote, and runs the lineup', async () => {
    const ai = new AIService({ mode: 'real' });
    const prompts = [];
    ai._callClaude = async (params) => {
      const prompt = params.messages[0].content;
      prompts.push({ model: params.model, prompt });
      let text;
      if (prompt.startsWith('A teacher typed the topic')) text = '[1]';
      else if (prompt.startsWith('You are scouting rounds')) {
        text = JSON.stringify([
          { question: 'In 2004 two male chinstrap penguins at Central Park Zoo took turns trying to hatch a ___.', truth: 'rock', kind: 'object', houseLie: 'golf ball', lies: ['snowball', 'egg-shaped stone', 'tennis ball'], source: 'Penguin', quote: 'In 2004, two male chinstrap penguins named Roy and Silo in Central Park Zoo took turns trying to hatch a rock', checkable: 5, ridiculous: 5, picturable: 5, wide: 5, bold: false },
          { question: 'A made-up claim the page never says: penguins vote for a ___.', truth: 'mayor', kind: 'job', houseLie: 'king', lies: ['judge', 'chief', 'captain'], source: 'Penguin', quote: 'Penguins hold an election every spring.', checkable: 4, ridiculous: 5, picturable: 4, wide: 4, bold: false },
          { question: 'A group in the water is a ___.', truth: 'raft', kind: 'nickname', houseLie: 'flock', lies: ['pod', 'colony', 'squadron'], source: 'Penguin', quote: 'A group of penguins in the water is sometimes called a raft.', checkable: 2, ridiculous: 4, picturable: 4, wide: 5, bold: false }
        ]);
      } else if (prompt.startsWith('For each fill-in-the-blank')) text = '[{"n":1,"pick":"A","sure":2}]';
      else text = '[]';
      return { content: [{ type: 'text', text }] };
    };
    const out = await scoutFacts({ topic: 'penguins', aiService: ai, fetchImpl: fakeFetch(), pages: 1 });
    expect(prompts.map((p) => p.model)).toEqual(['claude-haiku-4-5-20251001', 'claude-sonnet-5-5', 'claude-haiku-4-5-20251001']);
    expect(prompts[1].prompt).toContain('HIT: "Augustus prohibited');
    expect(out.pages).toEqual([{ title: 'Penguin', url: 'https://en.wikipedia.org/wiki/Penguin' }]);
    // the invented one (quote not in the page) and the bare one (checkable 2) are gone
    expect(out.rounds).toHaveLength(1);
    expect(out.rounds[0].truth).toBe('rock');
    expect(out.rounds[0].source.quote).toContain('Roy and Silo');
    expect(out.rounds[0].scores.lineup).toBeGreaterThanOrEqual(1);
    expect(out.dropped).toBe(2);
  });
});
