/**
 * Who guessed right, in one line (2026-10-02: a reviewer's Guess Who
 * round showed "It was Maya" and never who had picked her). A pick-one
 * step with a right answer, or a guess-who round (the author is the
 * answer), stores `rightLine` at close: "Guessed right: Jordan, Sam" or
 * "Nobody guessed right." The reveal after it shows {{guess.rightLine}}.
 */
import { translate } from '../i18n/index.js';

const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();

/**
 * @param {string} lang the room's language
 * @param {Array<{name?: string, choice?: string, text?: string}>} responses the step's picks
 * @param {string} right the right answer (a choice, or the author's name)
 * @returns {string} '' when there is no right answer or nobody picked
 */
export function guessedRightLine(lang, responses, right) {
  const want = norm(right);
  const list = Array.isArray(responses) ? responses : [];
  if (!want || list.length === 0) return '';
  const names = list
    .filter(r => r && norm(r.choice != null ? r.choice : r.text) === want && r.name)
    .map(r => r.name);
  if (names.length === 0) return translate(lang, 'Nobody guessed right.');
  return translate(lang, 'Guessed right: {names}').replace('{names}', names.join(', '));
}
