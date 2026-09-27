/**
 * Fact scout, the part that talks to the world (2026-09-27): Wikipedia's
 * API for the pages and the AI service for the three model passes. The
 * prompts, filters, and scoring are engine/fact-scout.js; the taste file
 * is engine/fact-scout-taste.json.
 *
 * scoutFacts({ topic, aiService }) resolves to
 *   { topic, pages: [{title, url}], rounds: [{question, truth, houseLie,
 *     source: {title, url, quote}, scores}], dropped: n }
 *
 * Mock mode (no API key) builds two rounds from the first page's own
 * sentences so the route and the panel can be exercised without a model;
 * they are marked as mock in the question so nobody mistakes them.
 *
 * Wikipedia is asked one request at a time with a pause between, and a
 * 429 waits out its Retry-After: a burst of page fetches gets limited.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  PAGES_DEFAULT, WANT_DEFAULT, SKIP_TITLE, searchQueries, bodyOf, wikiUrl,
  pickPagesPrompt, pickedTitles, extractPrompt, filterCandidates, quoteFound,
  lineupsFor, lineupPrompt, applyLineup, rank, toRounds, extractArray
} from '../engine/fact-scout.js';
import { MODELS } from './ai-service.js';

const UA = 'JamyardFactScout/1.0 (classroom trivia; https://jamyard.org)';
const TASTE_PATH = fileURLToPath(new URL('../engine/fact-scout-taste.json', import.meta.url));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let tasteCache = null;
export async function loadTaste(extraPath) {
  if (!tasteCache) {
    try { tasteCache = JSON.parse(await readFile(TASTE_PATH, 'utf8')); } catch { tasteCache = { hits: [], misses: [] }; }
  }
  if (!extraPath) return tasteCache;
  const extra = JSON.parse(await readFile(extraPath, 'utf8'));
  return { hits: [...(tasteCache.hits || []), ...(extra.hits || [])], misses: [...(tasteCache.misses || []), ...(extra.misses || [])] };
}

export async function wiki(params, fetchImpl = fetch) {
  const url = 'https://en.wikipedia.org/w/api.php?' + new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA } });
    if (res.ok) { await sleep(400); return res.json(); }
    if (res.status !== 429 || attempt === 6) throw new Error(`Wikipedia answered ${res.status}`);
    const after = Number(res.headers && res.headers.get ? res.headers.get('retry-after') : 0) || 6;
    await sleep((after + 1) * 1000 * attempt);
  }
  return null;
}

export async function searchPages(topic, n, fetchImpl) {
  const seen = new Set();
  const hits = [];
  for (const q of searchQueries(topic)) {
    const data = await wiki({ action: 'query', list: 'search', srsearch: q, srlimit: String(n), srnamespace: '0' }, fetchImpl);
    for (const hit of (data && data.query && data.query.search) || []) {
      if (seen.has(hit.title) || SKIP_TITLE.test(hit.title)) continue;
      seen.add(hit.title);
      hits.push({ title: hit.title, snippet: String(hit.snippet || '').replace(/<[^>]+>/g, '') });
    }
  }
  return hits;
}

export async function fetchBody(title, fetchImpl) {
  const data = await wiki({ action: 'query', prop: 'extracts', explaintext: '1', exsectionformat: 'plain', titles: title, redirects: '1' }, fetchImpl);
  const page = data && data.query && data.query.pages && data.query.pages[0];
  if (!page || !page.extract) return null;
  return { title: page.title, url: wikiUrl(page.title), text: bodyOf(page.extract) };
}

// One model call: the reply's text, through the AI service's budget gate
// and per-model policy
async function askModel(aiService, model, prompt, { system, maxTokens, timeout } = {}) {
  const message = await aiService._callClaude({
    model,
    max_tokens: maxTokens || 4000,
    system: system || 'You answer with exactly the JSON asked for, nothing else.',
    messages: [{ role: 'user', content: prompt }]
  }, { timeout: timeout || 180000 });
  return (message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

function mockRounds(topic, pages) {
  const page = pages[0];
  const sentences = page ? page.text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 40 && s.length < 220).slice(0, 2) : [];
  return sentences.map((s, i) => ({
    question: `(Mock) A round about ${topic} number ${i + 1}, from "${page.title}": the blank is ___.`,
    truth: `mock truth ${i + 1}`,
    houseLie: `mock decoy ${i + 1}`,
    source: { title: page.title, url: page.url, quote: s },
    scores: { ridiculous: 3, checkable: 3, lineup: 3 }
  }));
}

/**
 * @param {Object} opts
 * @param {string} opts.topic
 * @param {Object} opts.aiService   the AIService (mode mock or real)
 * @param {number} [opts.pages]     articles to read
 * @param {number} [opts.want]      rounds to ask the model for
 * @param {string} [opts.tastePath] an extra ratings file folded into the prompt
 * @param {Function} [opts.fetchImpl]  fetch, for tests
 * @param {Function} [opts.log]     progress lines
 */
export async function scoutFacts({ topic, aiService, pages: pageCount = PAGES_DEFAULT, want = WANT_DEFAULT, tastePath, fetchImpl = fetch, log = () => {} } = {}) {
  const clean = String(topic || '').trim().slice(0, 120);
  if (clean.length < 2) throw Object.assign(new Error('Give a topic of at least a couple of characters.'), { statusCode: 400 });
  const taste = await loadTaste(tastePath);
  const hits = await searchPages(clean, pageCount * 2, fetchImpl);
  if (!hits.length) throw Object.assign(new Error(`Nothing to read about "${clean}".`), { statusCode: 404 });

  const mock = aiService.mode === 'mock';
  let titles;
  if (mock) {
    titles = hits.slice(0, Math.min(2, pageCount)).map((h) => h.title);
  } else {
    const picks = extractArray(await askModel(aiService, MODELS.haiku, pickPagesPrompt(clean, hits, pageCount), { maxTokens: 300 }));
    titles = pickedTitles(hits, picks, pageCount);
  }
  const pages = [];
  for (const title of titles) { const page = await fetchBody(title, fetchImpl); if (page) pages.push(page); }
  log(`Read ${pages.length} article(s): ${pages.map((p) => p.title).join(' | ')}`);
  if (!pages.length) throw Object.assign(new Error(`Nothing to read about "${clean}".`), { statusCode: 404 });
  const pagesByTitle = Object.fromEntries(pages.map((p) => [p.title, p]));
  const pageList = pages.map((p) => ({ title: p.title, url: p.url }));

  if (mock) return { topic: clean, pages: pageList, rounds: mockRounds(clean, pages), dropped: 0 };

  const text = await askModel(aiService, MODELS.sonnet, extractPrompt(pages, { want, taste }), {
    system: 'You extract material for a classroom game from the sources you are given. You never invent, never embellish, and never use a fact the sources do not state.',
    maxTokens: 12000
  });
  const raw = extractArray(text);
  if (!raw.length) log(`The model returned no rounds. Its reply began: ${String(text).slice(0, 200).replace(/\s+/g, ' ')}`);
  const { kept, dropped } = filterCandidates(raw, clean);
  // A round whose quoted sentence is not in the page is not a round
  const grounded = kept.filter((c) => quoteFound(c, pagesByTitle));
  const unfound = kept.length - grounded.length;
  log(`${raw.length} candidate(s); ${dropped.length} dropped by the rules; ${unfound} whose quote was not in the article`);

  let judged = [];
  if (grounded.length) {
    const lineups = lineupsFor(grounded);
    const picks = extractArray(await askModel(aiService, MODELS.haiku, lineupPrompt(grounded, lineups), { maxTokens: 2000 }));
    judged = rank(applyLineup(grounded, lineups, picks));
  }
  return { topic: clean, pages: pageList, rounds: toRounds(judged, pagesByTitle), dropped: dropped.length + unfound, judged };
}
