// Content filter + input validation for student submissions.
//
// First line of defense (SAFETY-DESIGN.md, Risk 1 & 5): runs server-side in the
// submit-response handler so bad content never reaches the AI or the projector.
// All functions are pure and synchronous so they're cheap to call on every
// submission and trivial to unit-test.
//
// Matching philosophy: word-boundary regex on a normalized copy of the text.
// Boundaries avoid the "Scunthorpe problem" (a slur fragment inside an innocent
// word) while normalization defeats the common classroom evasions — leet-speak,
// repeated letters, and punctuation between letters.

import { BLOCKED_WORDS, NAME_INSULTS } from './blocklist.js';

export const DEFAULT_MIN_LENGTH = 2;
export const DEFAULT_MAX_LENGTH = 280;

// Leet-speak → letters. Applied before matching so "sh1t" / "$h!t" are caught.
function deLeet(text) {
  return text
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/0/g, 'o')
    .replace(/[4@]/g, 'a')
    .replace(/[$5]/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b');
}

// Collapse any run of a repeated character to a single one. Applied to both the
// text and the blocklist word so they line up regardless of letter-stretching
// ("shiiiit" → "shit", and the pattern "shit" → "shit").
function collapseRepeats(s) {
  return s.replace(/(.)\1+/g, '$1');
}

// Produce normalized variants of the text to test against the blocklist:
//   1. leet-decoded, lowercased, repeated chars collapsed ("shiiiit" → "shit")
//   2. the same with common separator chars removed ("s.h.i.t" → "shit")
// Word-boundary matching is run against both.
function normalizedVariants(text) {
  const base = collapseRepeats(deLeet(String(text).toLowerCase()));
  const stripped = base.replace(/[.\-_*+]/g, '');
  return [base, stripped];
}

// Escape a blocklist word for safe use inside a RegExp.
function escapeRe(word) {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Scan text for blocked words.
 * @param {string} text
 * @returns {{ blocked: boolean, category?: string, word?: string }}
 */
export function filterContent(text) {
  if (!text || typeof text !== 'string') return { blocked: false };
  const variants = normalizedVariants(text);
  for (const { word, category } of BLOCKED_WORDS) {
    // Collapse the pattern the same way the text was collapsed so letter
    // stretching on either side still lines up.
    const pattern = escapeRe(collapseRepeats(word));
    const re = new RegExp('\\b' + pattern + '\\b', 'i');
    if (variants.some(v => re.test(v))) {
      return { blocked: true, category, word };
    }
  }
  return { blocked: false };
}

/**
 * Validate a single text response for length and obvious low-effort spam.
 * @param {string} text
 * @param {{ prompt?: string, minLength?: number, maxLength?: number }} [opts]
 * @returns {{ valid: boolean, reason?: string, message?: string }}
 */
export function validateResponse(text, opts = {}) {
  const minLength = opts.minLength ?? DEFAULT_MIN_LENGTH;
  const maxLength = opts.maxLength ?? DEFAULT_MAX_LENGTH;
  const trimmed = String(text == null ? '' : text).trim();

  if (trimmed.length < minLength) {
    return { valid: false, reason: 'too_short', message: 'Please write a bit more.' };
  }
  if (trimmed.length > maxLength) {
    return { valid: false, reason: 'too_long', message: `Please keep it under ${maxLength} characters.` };
  }
  // Keyboard mashing: a run of 5+ identical chars ("aaaaa", "!!!!!").
  if (/(.)\1{4,}/.test(trimmed)) {
    return { valid: false, reason: 'low_effort', message: 'Please enter a real response.' };
  }
  // Copying the prompt back as the answer.
  if (opts.prompt) {
    const head = String(opts.prompt).toLowerCase().trim().slice(0, 20);
    if (head.length >= 8 && trimmed.toLowerCase().includes(head)) {
      return { valid: false, reason: 'prompt_copy', message: 'Please answer in your own words.' };
    }
  }
  return { valid: true };
}

// A field marked `emojiOnly: true` (Emoji Movies' clues) takes emoji and
// spaces, never letters or numbers (2026-09-29: nothing stopped a student
// typing the title as the clue). Keycaps (1️⃣), flags, skin tones, and
// joined families count as emoji; a bare digit does not.
export const EMOJI_ONLY_RE = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[0-9#*]️?⃣|‍|️|\s)+$/u;
export const EMOJI_ONLY_MESSAGE = 'Emojis only in that box, no letters or numbers.';

export function isEmojiOnly(text) {
  const s = String(text == null ? '' : text).trim();
  return s.length > 0 && EMOJI_ONLY_RE.test(s);
}

// The key of the first emoji-only field whose value is not emoji, or null.
function emojiOnlyProblem(value, fields) {
  if (!value || typeof value !== 'object' || !Array.isArray(fields)) return null;
  for (const f of fields) {
    if (!f || typeof f !== 'object' || f.emojiOnly !== true || !f.key) continue;
    const v = value[f.key];
    if (typeof v === 'string' && v.trim() && !isEmojiOnly(v)) return f.key;
  }
  return null;
}

// Pull every user-authored string out of a submission value, which is either a
// plain string (single / choice mode) or an object of field → value
// (multi-field collect).
function extractStrings(value) {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') {
    return Object.values(value).filter(v => typeof v === 'string');
  }
  return [];
}

/**
 * Gate one submission: validate length/effort and screen for blocked content
 * across every text part. Returns the first problem found, or { ok: true }.
 *
 * @param {string|object} value  the `response` payload from submit-response
 * @param {{ prompt?: string, minLength?: number, maxLength?: number, skipContentFilter?: boolean }} [opts]
 * @returns {{ ok: boolean, reason?: string, message?: string, category?: string }}
 */
export function checkSubmission(value, opts = {}) {
  const emojiField = emojiOnlyProblem(value, opts.fields);
  if (emojiField) return { ok: false, reason: 'not_emoji', message: EMOJI_ONLY_MESSAGE };
  const allParts = extractStrings(value);
  // A multi-field answer keeps what is there: when the clock ran out on a
  // student with one box still empty, the whole answer was refused as too
  // short and vanished with no round and no message (a reviewer,
  // 2026-09-29). Empty boxes are skipped as long as one box has words; a
  // plain string is checked as typed.
  const multi = !!value && typeof value === 'object';
  const parts = multi ? allParts.filter(p => String(p).trim().length > 0) : allParts;
  if (parts.length === 0) {
    return { ok: false, reason: 'empty', message: 'Please write a response.' };
  }
  for (const part of parts) {
    const v = validateResponse(part, opts);
    if (!v.valid) return { ok: false, reason: v.reason, message: v.message };
  }
  if (!opts.skipContentFilter) {
    for (const part of parts) {
      const f = filterContent(part);
      if (f.blocked) {
        return {
          ok: false,
          reason: 'inappropriate_content',
          category: f.category,
          message: 'That response isn’t allowed. Please try again.'
        };
      }
    }
  }
  return { ok: true };
}

// A name is short, so a blocked word hides inside it without a boundary:
// "shithead" went up on the projector and every classmate's screen (a
// reviewer, 2026-09-27), while the answer filter never saw it. Names get
// the word-boundary check AND a compound check: a blocked word glued to a
// common tail ("head", "face", "hole"...) or a common head ("big",
// "little", "dumb"...). Plain substrings would refuse Dickson, Cummings,
// Spicer, and Mississippi, so the compounds are the middle ground.
export const NAME_COMPOUND_TAILS = ['head', 'face', 'hole', 'bag', 'wad', 'breath', 'brain', 'lord', 'stick', 'licker', 'boy', 'girl', 'man', 'lips', 'ass'];
// Grammar tails ("shitty", "fuckers") only on profanity: a slur plus "er"
// or "y" is Spicer or spicy, a surname and a word.
export const NAME_GRAMMAR_TAILS = ['er', 'ers', 'ing', 'y', 's'];
export const NAME_COMPOUND_HEADS = ['big', 'little', 'lil', 'dumb', 'old', 'mr', 'mrs', 'ms', 'sir', 'dr', 'the', 'captain', 'king', 'queen', 'lord', 'bull', 'horse', 'dog', 'bat'];

/**
 * Screen a student's display name. Same normalization as the answers.
 * @param {string} name
 * @returns {{ blocked: boolean, category?: string, word?: string }}
 */
export function filterName(name) {
  const plain = filterContent(name);
  if (plain.blocked) return plain;
  if (!name || typeof name !== 'string') return { blocked: false };
  // A name is short, so the spaces come out too: "S h i t" went up on the
  // projector as S H I T, the capitals and the letter spacing closing the
  // gaps (a reviewer, 2026-09-29). Answers keep their spaces.
  const squashed = name.replace(/\s+/g, '');
  if (squashed !== name) {
    const closed = filterContent(squashed);
    if (closed.blocked) return closed;
  }
  const variants = normalizedVariants(name).concat(squashed !== name ? normalizedVariants(squashed) : []);
  const heads = NAME_COMPOUND_HEADS.map(escapeRe).join('|');
  for (const { word, category } of BLOCKED_WORDS) {
    const pattern = escapeRe(collapseRepeats(word));
    const tails = (category === 'slur' ? NAME_COMPOUND_TAILS : NAME_COMPOUND_TAILS.concat(NAME_GRAMMAR_TAILS)).map(escapeRe).join('|');
    const compound = new RegExp('\\b(?:(?:' + heads + ')' + pattern + '(?:' + tails + ')?|' + pattern + '(?:' + tails + '))\\b', 'i');
    if (variants.some(v => compound.test(v))) {
      return { blocked: true, category, word };
    }
  }
  // Insults as names: bare ("Stupid"), with a head ("Mr Idiot"), or a tail
  // ("Loser Face", "Dummys"). Answers never go through this list.
  const anyTail = NAME_COMPOUND_TAILS.concat(NAME_GRAMMAR_TAILS).map(escapeRe).join('|');
  for (const word of NAME_INSULTS) {
    const pattern = escapeRe(collapseRepeats(word));
    const insult = new RegExp('\\b(?:(?:' + heads + ')\\s?)?' + pattern + '(?:\\s?(?:' + anyTail + '))?\\b', 'i');
    if (variants.some(v => insult.test(v))) {
      return { blocked: true, category: 'insult', word };
    }
  }
  return { blocked: false };
}

// The line a student sees when their name is refused. Names nothing back
// (never the word), says what to do. A row in every language table.
export const NAME_REFUSED_MESSAGE = 'That name cannot go on the big screen. Use your first name.';
