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

import { BLOCKED_WORDS } from './blocklist.js';

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
  const parts = extractStrings(value);
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
