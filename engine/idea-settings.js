/**
 * Idea settings: the top-level teacher settings a Create-page idea names
 * in plain words, read deterministically (never by the AI) and applied to
 * the matched recipe's config, so what the teacher asked for survives the
 * trip to the make page.
 *
 * Born 2026-09-23 from a reviewer's try: "a five-minute anonymous history
 * poll" came back with student names set to Shown, because no recipe has an
 * anonymity parameter and the route never read the word. Same rule as
 * parseRequestedMinutes (engine/duration-estimate.js): the idea text is
 * the teacher's, so a plain regex is the honest reader.
 *
 * Exports:
 *   - parseAnonymity(text)       true (names hidden), false (names shown,
 *                                 said outright), or null (nothing said)
 *   - applyIdeaSettings(config, text)  writes the settings the idea names
 *                                 onto the config; returns what changed,
 *                                 {} when nothing did
 */

// "not anonymous", "non-anonymous", "with names", "show names": the teacher
// said names stay. Checked first so "not anonymous" never reads as hidden.
const NAMES_SHOWN_RE = /\b(not|non|never)[\s-]*anonymous(ly)?\b|\bwith (their |the |student |students' )?names\b|\bshow(ing|s)? (their |the |student |students' )?names\b|\bnames (are |stay |remain )?(shown|visible)\b/;

// "anonymous", "anonymously", "no names", "without names", "names hidden",
// "hide names": the teacher wants the room's names off.
const NAMES_HIDDEN_RE = /\banonymous(ly)?\b|\bno names\b|\bwithout (their |the |student |students' |any )?names\b|\bnames? (hidden|off|removed|withheld)\b|\bhide (their |the |student |students' )?names\b|\bnameless\b/;

/**
 * @param {string} text the idea as the teacher typed it
 * @returns {boolean|null}
 */
export function parseAnonymity(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const lower = text.toLowerCase();
  if (NAMES_SHOWN_RE.test(lower)) return false;
  if (NAMES_HIDDEN_RE.test(lower)) return true;
  return null;
}

/**
 * Apply every setting the idea names to a compiled config. Only writes
 * what the idea said; a config's own value stands when the idea is silent.
 * @param {object} config a compiled activity config (mutated)
 * @param {string} text the idea
 * @returns {{anonymous?: boolean}} the settings written
 */
export function applyIdeaSettings(config, text) {
  const applied = {};
  if (!config || typeof config !== 'object') return applied;
  const anonymous = parseAnonymity(text);
  if (anonymous !== null) {
    config.anonymous = anonymous;
    applied.anonymous = anonymous;
  }
  return applied;
}
