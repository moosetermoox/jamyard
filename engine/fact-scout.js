/**
 * Fact scout, the pure part (2026-09-27): rounds for Trivia Bluff found
 * where facts sit unlabeled. Anything already called a "fun fact" has
 * been mined; a fact in the BODY of a plain encyclopedia article on a
 * topic has not. The model may only use what the articles say and quotes
 * the sentence every round rests on, so the never-invent-facts rule
 * holds and the teacher can open the page.
 *
 * Three passes, each a prompt here and a model call in
 * services/fact-scout.js:
 *   1. pick pages: keep the search results ABOUT the topic itself
 *   2. extract: rounds quoted from the article text, scored, with lies
 *   3. lineup test: a second model that never saw the sources gets each
 *      truth among lies and picks; a truth it knew scores low
 *
 * The owner's taste (engine/fact-scout-taste.json, hits and misses marked
 * over five rounds of ten topics) rides in the extract prompt as examples.
 * Everything here is data in, data out; the tests drive it without a
 * network or a model.
 */

export const PAGES_DEFAULT = 10;
export const WANT_DEFAULT = 20;
export const MIN_RIDICULOUS = 3;
export const MIN_CHECKABLE = 3;
export const CHARS_PER_PAGE = 6500;

// Plain articles only: never a list, a glossary, an outline, or a trivia page
export const SKIP_TITLE = /^(List of|Lists of|Glossary of|Outline of|Timeline of|Index of|Category:|Portal:)|\btrivia\b|\(film\)|\(TV series\)|\(video game\)|\(song\)|\(album\)|\(band\)/i;

// Article sections that never hold a surprise
const CUT_SECTIONS = /^(See also|References|External links|Further reading|Notes|Bibliography|Sources|Gallery|Citations|Cast|Plot|Characters|Episodes|Discography|Filmography)$/i;

// A truth of one of these kinds is never a round: nobody can write a lie
// against a name, a place, a number, or a rite
const BANNED_KINDS = new Set(['person', 'place', 'number', 'religious']);

export function searchQueries(topic) {
  return [topic, `${topic} history`, `${topic} origin name tradition`];
}

/** The article body cut to the sections worth reading and a length cap. */
export function bodyOf(extract, cap = CHARS_PER_PAGE) {
  return String(extract || '')
    .split(/\n(?=[A-Z][^\n]{0,60}\n)/)
    .filter((chunk) => !CUT_SECTIONS.test(chunk.split('\n')[0].trim()))
    .join('\n')
    .slice(0, cap);
}

export function wikiUrl(title) {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(String(title).replace(/ /g, '_'))}`;
}

// ── 1. Pick pages ──
export function pickPagesPrompt(topic, hits, n) {
  const list = hits.map((h, i) => `${i + 1}. ${h.title}: ${h.snippet || ''}`).join('\n');
  return `A teacher typed the topic "${topic}". Below are Wikipedia search results. Keep the pages that are ABOUT that topic or a real part of it (the thing itself, its kinds, its history, its places, its traditions). Drop anything that only shares the name (a sports team, a film, a TV show, a book, a band, a game, an election, a company named after it, a fictional character), anything where the word means something else (for "crows" drop the Crow people; for "pencils" drop a comics penciller; for "the Eiffel Tower" drop other towers and other engineers), any person's biography, any profession or job named after the topic, and anything that is merely something the topic HAS or is NEAR (for "the Statue of Liberty", drop "Torch" and "Ellis Island"; for "castles", drop "Moat" and a page on one town). When in doubt, drop it: fewer pages about the thing itself beat more pages around it. Return ONLY a JSON array of the numbers to keep, best first, at most ${n}.\n\n${list}`;
}

/** The titles the pick reply keeps, in its order, capped at n. */
export function pickedTitles(hits, picks, n) {
  const out = [];
  for (const k of Array.isArray(picks) ? picks : []) {
    const hit = hits[Number(k) - 1];
    if (hit && !out.includes(hit.title)) out.push(hit.title);
    if (out.length >= n) break;
  }
  return out;
}

// ── 2. Extract ──
function tasteBlock(taste) {
  if (!taste) return '';
  const hits = (taste.hits || []).map((h) => `- HIT: "${h.question}" (truth: ${h.truth})${h.why ? ` because ${h.why}` : ''}`).join('\n');
  const misses = (taste.misses || []).map((m) => `- MISS: "${m.question}" (truth: ${m.truth})${m.why ? ` because ${m.why}` : ''}`).join('\n');
  if (!hits && !misses) return '';
  return `\n\nThe person choosing has rated earlier candidates. Match the taste of the hits and avoid what made the misses fail:\n${hits}\n${misses}`;
}

export function extractPrompt(pages, { want = WANT_DEFAULT, taste = null } = {}) {
  const sources = pages.map((p, i) => `=== SOURCE ${i + 1}: ${p.title} ===\n${p.text}`).join('\n\n');
  return `You are scouting rounds for a classroom bluffing game (Fibbage style). Each round is a sentence with a blank; students write believable lies, then everyone votes on which option is the truth. The best rounds make the room laugh when the truth is revealed.

Read the sources below and propose up to ${want} rounds drawn ONLY from what the sources state. Never add a fact from memory, never sharpen a claim beyond what the source says, never combine two sources into one claim. Every candidate quotes the one sentence it came from, word for word. Fewer is fine: four rounds that make people laugh beat twenty that are merely true.

The one thing that matters: the reveal gets a laugh. Look for a specific incident, an odd tradition, a strange nickname, an official decision that sounds absurd, an animal or object doing something it should not, a name that sounds made up. Skip the biology, the dates, the definitions, and the structure of things, however true.

What makes a great round:
- The setup sounds serious and the truth sounds like a lie. The truth is the LEAST believable option once it sits beside good lies, yet it is true as stated.
- Never a list-completion blank ("known for its blubber, oil, meat, and ___"): the truth must carry the sentence alone, not close a list.
- The truth is a thing you can picture: a creature, an object, a material, a job, a food, a purpose, a name. One to three words.
- The truth is NEVER a number, a year, a date, an age, a count, a measurement, or a place name.
- The truth is NEVER a person's name (real or fictional, first name or full name, a nickname for a person). Nobody can write a lie against a name, and the round hangs on one real person. A named animal, object, ship, or building is fine.
- A nickname or a name is a round only when it DESCRIBES the thing ("the applecore" for a squat tower, "government cheddar", "steam chocolate"). A brand name or a model name ("the Rover", "the Facile") is not: nobody can write a lie against a catalogue.
- One round per source sentence. Never cut two blanks from the same sentence.
- Never a claim about a real person's crime, death, spying, or private life: the teacher will not check it, so leave it out.
- The truth does not appear in the sentence, in the topic, or in the source title, and nothing in the sentence lets anyone work it out ("the Buckeye State is named after its ___ trees" is not a round).
- The blank is a wide category (an animal, a food, an object, a job), so thirty students can each write a lie in ten seconds.
- The blank comes at or near the end, so the reveal lands like a punchline.
- Never leave a phrase that describes the truth ("called zebras because of their striped outfits" hands over the answer: cut the reason, keep the name).
- Put the blank on the STRANGEST element of the sentence, the thing that gets the laugh. "A giant electric baked potato whose eyes ___ constantly" (winked) has the blank on the wrong word: the potato is the joke, so the round is "a giant electric trade mark in the shape of a ___ whose eyes winked constantly" (baked potato). Ask which word the room would laugh at, and blank that one.
- Exactly one correct answer; a well-read person would accept no other word in the blank.
- Real things only: never a plot, a character, a cast member, or anything from a work of fiction.
- Classroom-appropriate for ages 10 to 18: nothing about violence, sex, drugs, alcohol or drunkenness (not even an animal's), or politics, nothing that mocks a person.
- Nothing religious at all, however odd or charming the name: no rites, relics, saints, martyrs, prayers, gods, temples used as temples, beliefs, or church customs. A funny name for a religious practice is still a religious practice.
- The gross rule: nothing about waste, dung, fossilised droppings, vomit, blood, corpses, body parts, parasites, eating carrion, or disease; and no word or name with a double meaning students will jump on.
- The round carries the context a reader needs to check it: the place, the era or year, and the named party the source names ("In 1885 the German writer Heinrich Böhnke-Reich warned against..."). "Only weapon allowed for all, even ___" with no people, place, or time is not a round. A reader should be able to find the fact from the sentence alone.
- Fresh: prefer details from the middle of an article (naming, incidents, traditions, legal status, diet, mascots, origins, odd jobs, odd businesses) over the famous headline facts about the topic.

Score each candidate 1 to 5 on four things: checkable (does the sentence itself name the place, the time, and the party, so a reader could look it up; 1 = a bare claim), ridiculous (would a room of teenagers laugh out loud when the truth is read; 5 = they would, 1 = a nod at most; be hard on yourself, a fact being surprising to a scientist is a 2), picturable (can everyone see the truth in their head), wide (how easy it is to write lies for the category). Then write three more wrong answers of the same kind as the truth, as good as a clever student would write.

Return ONLY a JSON array, no preamble, of objects with these fields:
  question (the sentence with ___ for the blank), truth, kind (one of: creature, object, material, food, job, action, purpose, nickname, named-thing, person, place, number, religious, other), houseLie (one believable wrong answer of the same kind), lies (three more, an array), source (the source title), quote (the exact sentence from the source the fact rests on), checkable, ridiculous, picturable, wide, bold (true when the claim is about a real person, a crime, a spy, a death, or anything a historian would want a second source for; the teacher will be told to check one), note (one short line: why it works, or the doubt you have)

Order the array best first.${tasteBlock(taste)}

${sources}`;
}

/** The truth shows in the sentence, the topic, or the source title. */
export function answerShows(candidate, topic) {
  const truth = String(candidate.truth || '').toLowerCase().trim();
  if (!truth) return true;
  const hay = [candidate.question, topic, candidate.source].join(' ').toLowerCase();
  if (hay.includes(truth)) return true;
  const stem = truth.replace(/s$/, '');
  return stem.length >= 4 && hay.includes(stem);
}

/**
 * The hard filters over the model's list: a banned kind, a bold claim, a
 * second round from one sentence, a truth that shows, a flat or bare
 * round. Returns the kept rounds and why each other one went.
 */
export function filterCandidates(raw, topic, { minRidiculous = MIN_RIDICULOUS, minCheckable = MIN_CHECKABLE } = {}) {
  const kept = [];
  const dropped = [];
  const quotesSeen = new Set();
  for (const c of Array.isArray(raw) ? raw : []) {
    if (!c || typeof c !== 'object') continue;
    const truth = String(c.truth || '').trim();
    const question = String(c.question || '').trim();
    if (!truth || !question || !question.includes('___')) { dropped.push({ ...c, why: 'no blank or no truth' }); continue; }
    if (BANNED_KINDS.has(String(c.kind || '').toLowerCase()) || /^\d/.test(truth)) { dropped.push({ ...c, why: 'a person, place, number, or rite as the truth' }); continue; }
    if (c.bold === true) { dropped.push({ ...c, why: 'a bold claim the teacher would have to check' }); continue; }
    const qkey = String(c.quote || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
    if (qkey && quotesSeen.has(qkey)) { dropped.push({ ...c, why: 'a second round from one sentence' }); continue; }
    if (qkey) quotesSeen.add(qkey);
    if (answerShows(c, topic)) { dropped.push({ ...c, why: 'the answer shows in the sentence or the topic' }); continue; }
    if ((Number(c.ridiculous) || 0) < minRidiculous) { dropped.push({ ...c, why: 'not funny enough' }); continue; }
    if ((Number(c.checkable) || 0) < minCheckable) { dropped.push({ ...c, why: 'not enough context to check' }); continue; }
    kept.push(c);
  }
  return { kept, dropped };
}

/** True when the quoted sentence really is in the page text. */
export function quoteFound(candidate, pagesByTitle) {
  const page = pagesByTitle[candidate.source];
  const q = String(candidate.quote || '').trim();
  return !!(page && q && page.text.includes(q.slice(0, 60)));
}

// ── 3. Lineup test ──
export function shuffleWith(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function lineupsFor(candidates, rand = Math.random) {
  return candidates.map((c) => {
    const options = shuffleWith([c.truth, c.houseLie, ...(Array.isArray(c.lies) ? c.lies : [])].filter(Boolean).slice(0, 5), rand);
    return { options, truthIndex: options.indexOf(c.truth) };
  });
}

export function lineupPrompt(candidates, lineups) {
  const list = candidates.map((c, i) => `${i + 1}. ${c.question}\n   options: ${lineups[i].options.map((o, k) => `(${String.fromCharCode(65 + k)}) ${o}`).join('  ')}`).join('\n');
  return `For each fill-in-the-blank sentence below, exactly one option is true. Pick the one you believe is true and say how sure you are, 1 (a coin flip) to 5 (you know it). Answer from your own knowledge and judgment; do not hedge. Return ONLY a JSON array with one object per sentence: {"n": number, "pick": "A", "sure": 1-5}.\n\n${list}`;
}

/** A truth the judge passed over scores high; a truth it knew scores low. */
export function lineupScore(guessed, sure) {
  const s = Math.max(1, Math.min(5, Number(sure) || 1));
  const score = guessed ? 6 - s : 3 + Math.round(s / 2);
  return Math.max(1, Math.min(5, score));
}

export function applyLineup(candidates, lineups, picks) {
  return candidates.map((c, i) => {
    const p = (Array.isArray(picks) ? picks : []).find((x) => Number(x.n) === i + 1) || {};
    const pickIndex = typeof p.pick === 'string' ? p.pick.trim().toUpperCase().charCodeAt(0) - 65 : -1;
    const guessed = pickIndex === lineups[i].truthIndex;
    const sure = Math.max(1, Math.min(5, Number(p.sure) || 1));
    return {
      ...c,
      lineup: lineupScore(guessed, sure),
      judge: guessed ? `picked the truth (sure ${sure})` : `picked "${lineups[i].options[pickIndex] || '?'}" (sure ${sure})`
    };
  });
}

export function score(c) {
  return (Number(c.ridiculous) || 0) * 3 + (Number(c.lineup) || 0) * 2 + (Number(c.picturable) || 0) + (Number(c.wide) || 0);
}

export function rank(candidates) {
  return candidates.slice().sort((a, b) => score(b) - score(a));
}

/** The shape the Trivia Bluff panel and recipe take, source attached. */
export function toRounds(candidates, pagesByTitle) {
  return candidates.map((c) => ({
    question: String(c.question).trim(),
    truth: String(c.truth).trim(),
    houseLie: String(c.houseLie || '').trim(),
    source: {
      title: String(c.source || ''),
      url: pagesByTitle[c.source] ? pagesByTitle[c.source].url : wikiUrl(c.source || ''),
      quote: String(c.quote || '').trim()
    },
    scores: { ridiculous: Number(c.ridiculous) || 0, checkable: Number(c.checkable) || 0, lineup: Number(c.lineup) || 0 }
  }));
}

/** JSON out of a reply that may wrap it in prose. */
export function extractArray(text) {
  try { const v = JSON.parse(text); if (Array.isArray(v)) return v; } catch { /* wrapped */ }
  const m = String(text).match(/\[[\s\S]*\]/);
  if (!m) return [];
  try { const v = JSON.parse(m[0]); return Array.isArray(v) ? v : []; } catch { return []; }
}
