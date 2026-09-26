/**
 * early-joke.js — the early-bird joke: the first N students to join a
 * room each see a random dad joke, a small reward for logging in fast
 * (owner's ask, 2026-09-12).
 *
 * Config: top-level `earlyJoke: { first: 10 }`. Absent means off.
 *
 * The server owns who got what: `dealt[playerId] = jokeIndex`, keyed by
 * player id so the reconnect id-migration walker carries it, and stored
 * as an index so a refresh shows the SAME joke instead of a fresh roll.
 * The count is joins, in order; the eleventh student gets nothing. No
 * two students in one room get the same joke while the list lasts.
 *
 * The list is engine/dad-jokes.json, built from
 * docs/500-all-ages-dad-jokes.md by scripts/build-dad-jokes.js (numbers
 * off, multi-line jokes folded, em dashes out). English only. Nothing
 * here reaches the projector, and the text is rendered with textContent.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const DAD_JOKES = Object.freeze(require('./dad-jokes.json'));

export const EARLY_JOKE_MAX_FIRST = 100;
// What the Make it yours checkbox turns on (the editor's select offers more).
export const EARLY_JOKE_DEFAULT_FIRST = 10;

const NUMBERED_LINE = /^(\d+)\.\s+(.*)$/;
// Built from the code point so no em dash sits in this file's source
// (tests/style/no-em-dash.test.js reads regex literals too).
const EM_DASH_RE = new RegExp('\\s*' + String.fromCharCode(0x2014) + '\\s*', 'g');

/**
 * Parse the markdown list: a numbered line starts a joke, following
 * unnumbered non-blank lines continue it (until the next number).
 * @param {string} markdown
 * @returns {string[]}
 */
export function parseJokeList(markdown) {
  const jokes = [];
  let current = null;
  for (const rawLine of String(markdown).split(/\r?\n/)) {
    const line = rawLine.trim();
    const m = NUMBERED_LINE.exec(line);
    if (m) {
      if (current) jokes.push(current);
      current = [m[2]];
    } else if (current && line) {
      current.push(line);
    }
  }
  if (current) jokes.push(current);
  return jokes.map(lines => lines
    .map(l => l.replace(EM_DASH_RE, ', ').replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean)
    .join('\n'));
}

// How long the student screen holds the punchline back (owner's ask).
export const EARLY_JOKE_PUNCHLINE_MS = 5000;

const CLOSERS = '["”’\')]*';
// A question mark ends the setup ("Why did X? Because Y."); the joke's
// own line breaks do too (a punchline on its own line); failing both, the
// last sentence or ellipsis break. One breath = no pause.
const QUESTION_RE = new RegExp('^(.*?\\?' + CLOSERS + ')\\s+(\\S[\\s\\S]*)$');
const LAST_BREAK_RE = new RegExp('^([\\s\\S]*(?:[.!…]|\\.\\.\\.)' + CLOSERS + ')\\s+(\\S[^\\n]*)$');

/**
 * Split a joke into the part told first and the punchline held back.
 * @param {string} text
 * @returns {{setup: string, punchline: string | null, pauseMs: number}}
 */
export function splitJoke(text) {
  const joke = String(text).trim();
  const done = (setup, punchline) => ({ setup: setup.trim(), punchline: punchline ? punchline.trim() : null, pauseMs: EARLY_JOKE_PUNCHLINE_MS });
  const nl = joke.lastIndexOf('\n');
  if (nl > 0) return done(joke.slice(0, nl), joke.slice(nl + 1));
  const q = QUESTION_RE.exec(joke);
  if (q) return done(q[1], q[2]);
  const b = LAST_BREAK_RE.exec(joke);
  if (b) return done(b[1], b[2]);
  // One-liners turn on a comma or a dash ("I used to be a banker, but I
  // lost interest."). Rightmost break first, skipping any that would cut
  // inside a quotation, with a few words on each side.
  const breaks = [];
  const BREAK_RE = /,\s+|\s+[–-]\s+/g;
  let m;
  while ((m = BREAK_RE.exec(joke))) breaks.push({ at: m.index, len: m[0].length });
  for (let i = breaks.length - 1; i >= 0; i--) {
    const setup = joke.slice(0, breaks[i].at);
    const punchline = joke.slice(breaks[i].at + breaks[i].len);
    if (!quotesBalanced(setup)) continue;
    if (wordCount(setup) < 2 || wordCount(punchline) < 2) continue;
    return done(setup, punchline);
  }
  return done(joke, null);
}

function wordCount(s) {
  return s.split(/\s+/).filter(Boolean).length;
}

// Straight quotes pair by count; curly ones open and close.
function quotesBalanced(s) {
  const straight = (s.match(/"/g) || []).length;
  const open = (s.match(/[“‘]/g) || []).length;
  const close = (s.match(/[”]/g) || []).length + (s.match(/(^|\s)’|’(\s|$)/g) || []).length;
  return straight % 2 === 0 && open === close;
}

/**
 * ON BY DEFAULT (owner's call, 2026-09-12): an activity with no
 * `earlyJoke` field deals the default count; `earlyJoke: false` turns it
 * off; `{ first: N }` sets the count. `true` reads as the default.
 */
export function isEarlyJokeOn(config) {
  return !!config && config.earlyJoke !== false;
}

export function earlyJokeFirst(config) {
  if (!isEarlyJokeOn(config)) return 0;
  const ej = config.earlyJoke;
  return ej && typeof ej === 'object' && Number.isInteger(ej.first) ? ej.first : EARLY_JOKE_DEFAULT_FIRST;
}

export function createEarlyJokeState(config) {
  if (!isEarlyJokeOn(config)) return null;
  return { first: earlyJokeFirst(config), dealt: {} };
}

/**
 * The joke a player already holds, or null.
 */
export function jokeFor(state, playerId, jokes = DAD_JOKES) {
  if (!state || !state.dealt) return null;
  const index = state.dealt[playerId];
  return Number.isInteger(index) && jokes[index] !== undefined ? jokes[index] : null;
}

/**
 * Is this join an early bird's? Only while the room waits in its lobby,
 * or in a rolling room (it has no lobby, the doorway IS the first step).
 * A student who arrives after the teacher started a together room is
 * late, not early: their first screen is a step's instruction, and a
 * joke above it pushed the instruction down (an outside reviewer's third
 * Convention run, 2026-09-26).
 * @param {{ phaseType?: string|null, rolling?: boolean }} at
 */
export function isEarlyBirdJoin({ phaseType, rolling } = {}) {
  return !!rolling || !phaseType || phaseType === 'lobby';
}

/**
 * Deal a joke to a NEW joiner if there is still one to give. A player who
 * already holds one gets it back; past the first N, null.
 */
export function dealJoke(state, playerId, jokes = DAD_JOKES) {
  if (!state || !state.dealt || !jokes.length) return null;
  const held = jokeFor(state, playerId, jokes);
  if (held !== null) return held;
  if (Object.keys(state.dealt).length >= state.first) return null;
  const used = new Set(Object.values(state.dealt));
  let pool = [];
  for (let i = 0; i < jokes.length; i++) if (!used.has(i)) pool.push(i);
  if (pool.length === 0) pool = jokes.map((_, i) => i);
  const index = pool[Math.floor(Math.random() * pool.length)];
  state.dealt[playerId] = index;
  return jokes[index];
}

/**
 * Config validation, shared by the loader (server) and mirrored by the
 * editor (client): an object with a whole-number `first` from 1 to the cap.
 * @returns {string[]} error messages
 */
export function validateEarlyJoke(config, gameId) {
  const errors = [];
  const ej = config ? config.earlyJoke : undefined;
  if (ej === undefined || ej === false || ej === true) return errors;
  if (!ej || typeof ej !== 'object' || Array.isArray(ej)) {
    errors.push(`Game "${gameId}": "earlyJoke" must be false (off) or an object like { "first": 10 }`);
    return errors;
  }
  if (!Number.isInteger(ej.first) || ej.first < 1 || ej.first > EARLY_JOKE_MAX_FIRST) {
    errors.push(`Game "${gameId}": "earlyJoke.first" must be a whole number from 1 to ${EARLY_JOKE_MAX_FIRST}`);
  }
  return errors;
}
