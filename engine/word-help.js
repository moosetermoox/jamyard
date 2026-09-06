/**
 * word-help.js — rationed help: a per-student token budget, and the word
 * translation lookup that spends it.
 *
 * A Spanish teacher asked for it (2026-09-06): students tap a word they do
 * not know and see it in English, but only a limited number of times, so
 * the help is a budget they manage rather than a crutch. Two systems, one
 * meeting point:
 *
 *   - THE LEDGER: `spent[playerId]` against `tokens`. Server-authoritative;
 *     the client shows a count it is told, never one it keeps. Keyed by
 *     player id so the reconnect id-migration walker carries it. Generic
 *     on purpose: any later kind of rationed help (a hint, an example) can
 *     draw on the same purse.
 *   - THE LOOKUP: `normalizeWord` decides what counts as one word, the log
 *     counts which words the class tapped (the teacher's real signal), and
 *     the cache makes the second student who taps "escuela" cost no AI call.
 *
 * Config: top-level `wordHelp: { tokens: N, to: "en" }`. The source
 * language is the activity's own resolved language (engine/i18n); `to`
 * defaults to English.
 *
 * Every word here is teacher-authored text a student tapped, never something
 * a student typed, but it is still untrusted for rendering: textContent only.
 * Nothing in this state reaches the projector.
 */
import { LANGUAGE_CODES } from './i18n/index.js';

export const WORD_HELP_MAX_TOKENS = 20;
export const WORD_MAX_LENGTH = 40;

// Letters (any script, with combining marks), and inner apostrophes or
// hyphens: "l'école", "bien-être". Nothing else is a word to translate.
const WORD_RE = /^[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*$/u;
const EDGE_PUNCT_RE = /^[^\p{L}\p{M}]+|[^\p{L}\p{M}]+$/gu;

/**
 * @param {unknown} raw  what the student tapped
 * @returns {{word: string, key: string} | null}  as typed + a lowercase key
 */
export function normalizeWord(raw) {
  if (typeof raw !== 'string') return null;
  const word = raw.trim().replace(EDGE_PUNCT_RE, '');
  if (!word || word.length > WORD_MAX_LENGTH || !WORD_RE.test(word)) return null;
  return { word, key: word.toLocaleLowerCase() };
}

export function createWordHelpState(config, language) {
  if (!config || !config.wordHelp || typeof config.wordHelp !== 'object') return null;
  return {
    tokens: config.wordHelp.tokens,
    from: language || 'en',
    to: config.wordHelp.to || 'en',
    spent: {},   // playerId -> spends so far
    cache: {},   // word key -> translation
    looked: {}   // word key -> { word, count }
  };
}

export function remaining(state, playerId) {
  const spent = state.spent[playerId] || 0;
  return Math.max(0, state.tokens - spent);
}

/** @returns {{ok: boolean, left: number}} */
export function spend(state, playerId) {
  const left = remaining(state, playerId);
  if (left <= 0) return { ok: false, left: 0 };
  state.spent[playerId] = (state.spent[playerId] || 0) + 1;
  return { ok: true, left: left - 1 };
}

/** A lookup that failed gives the token back. @returns the new remaining */
export function refund(state, playerId) {
  if ((state.spent[playerId] || 0) > 0) state.spent[playerId] -= 1;
  return remaining(state, playerId);
}

export function recordLookup(state, normalized) {
  if (!normalized) return;
  const entry = state.looked[normalized.key] || { word: normalized.word, count: 0 };
  entry.count += 1;
  state.looked[normalized.key] = entry;
}

/** Most-tapped first; ties alphabetical. The teacher's view and the report. */
export function summarize(state) {
  if (!state) return [];
  return Object.values(state.looked)
    .map((e) => ({ word: e.word, count: e.count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

export function cachedTranslation(state, key) {
  return Object.prototype.hasOwnProperty.call(state.cache, key) ? state.cache[key] : undefined;
}

export function cacheTranslation(state, key, translation) {
  state.cache[key] = translation;
}

/** What the student screen is told: the budget, their own count, the pair. */
export function publicSettings(state, playerId) {
  return { tokens: state.tokens, left: remaining(state, playerId), from: state.from, to: state.to };
}

/**
 * Config validation, shared by the loader (server) and mirrored by the
 * editor (client): a whole number of tokens from 1 to the cap, and a
 * target language the fixed labels can speak.
 * @returns {string[]} error messages
 */
export function validateWordHelp(config, gameId) {
  const errors = [];
  const wh = config ? config.wordHelp : undefined;
  if (wh === undefined) return errors;
  if (!wh || typeof wh !== 'object' || Array.isArray(wh)) {
    errors.push(`Game "${gameId}": "wordHelp" must be an object like { "tokens": 3, "to": "en" }`);
    return errors;
  }
  if (!Number.isInteger(wh.tokens) || wh.tokens < 1 || wh.tokens > WORD_HELP_MAX_TOKENS) {
    errors.push(`Game "${gameId}": "wordHelp.tokens" must be a whole number from 1 to ${WORD_HELP_MAX_TOKENS}`);
  }
  if (wh.to !== undefined && !(typeof wh.to === 'string' && LANGUAGE_CODES.includes(wh.to))) {
    errors.push(`Game "${gameId}": "wordHelp.to" must be one of: ${LANGUAGE_CODES.join(', ')}`);
  }
  return errors;
}
