/**
 * PII scrub for outbound AI payloads (COPPA/FERPA data minimization,
 * free-text half). Structured roster names never reach the API (see
 * ai-name-fill.js); this module handles what students TYPE: their own or
 * classmates' names inside answers, and obvious contact patterns.
 *
 * Design constraints (2026-07-19 review):
 *  - Arbitrary full-name detection is unreliable — we only remove KNOWN
 *    roster names, case-insensitively, on word boundaries.
 *  - Pattern redaction covers emails, phone numbers, and URLs. Street
 *    addresses and student IDs are not reliably detectable; the privacy
 *    notice discloses that student-typed text may contain identifying
 *    information.
 *  - Scrub a COPY at the outbound boundary. The classroom's own copy of
 *    a response is never mutated — the class still sees exactly what was
 *    typed (subject to the content filter + moderation).
 *  - Over-redaction is acceptable here: a scrubbed word slightly degrades
 *    AI output, never classroom display. (A student named "Rose" means
 *    "a rose by any other name" goes to the model as "someone by any
 *    other name" — acceptable.)
 *
 * This is deliberately NOT part of content-filter.js: profanity gating
 * (classroom display) and PII minimization (subprocessor payloads) are
 * different concerns with different failure modes.
 */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Phone-ish: 7+ digits with common separators, or 10-11 straight digits.
const PHONE_RE = /(?:\+?\d{1,2}[\s.-]?)?(?:\(\d{3}\)[\s.-]?|\d{3}[\s.-])\d{3}[\s.-]?\d{4}|\b\d{10,11}\b/g;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;

/**
 * Redact contact patterns. Pure; returns a new string.
 * @param {string} text
 * @returns {string}
 */
export function scrubPatterns(text) {
  return String(text == null ? '' : text)
    .replace(EMAIL_RE, '[email]')
    .replace(URL_RE, '[link]')
    .replace(PHONE_RE, '[phone]');
}

/**
 * Remove known roster names, case-insensitively, on word boundaries.
 * Multi-word names are matched whole first, then each word ≥2 chars.
 *
 * @param {string} text
 * @param {string[]} rosterNames  the room's player names
 * @returns {string}
 */
export function scrubRosterNames(text, rosterNames) {
  let out = String(text == null ? '' : text);
  if (!Array.isArray(rosterNames) || rosterNames.length === 0) return out;

  const parts = new Set();
  for (const name of rosterNames) {
    const trimmed = String(name == null ? '' : name).trim();
    if (trimmed.length >= 2) parts.add(trimmed);
    for (const word of trimmed.split(/\s+/)) {
      if (word.length >= 2) parts.add(word);
    }
  }
  // Longest first so "Mary Jo" wins over "Mary".
  const ordered = [...parts].sort((a, b) => b.length - a.length);
  for (const part of ordered) {
    const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // \b only works next to word characters — a name like "A+" needs a
    // bare edge on its non-word side or the boundary never matches.
    const lead = /^\w/.test(part) ? '\\b' : '';
    const tail = /\w$/.test(part) ? '\\b' : '';
    out = out.replace(new RegExp(`${lead}${escaped}${tail}`, 'gi'), 'someone');
  }
  return out;
}

/**
 * Full outbound scrub: roster names + contact patterns.
 * @param {string} text
 * @param {string[]} [rosterNames]
 * @returns {string}
 */
export function scrubForAI(text, rosterNames) {
  return scrubPatterns(scrubRosterNames(text, rosterNames || []));
}
