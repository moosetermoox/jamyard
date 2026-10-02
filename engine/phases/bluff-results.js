/**
 * The results of a bluff ballot (a pick-one over the class's fakes and the
 * truth, `foolPoints`): Doodle Bluff and its kin. A reviewer's round showed
 * only the titles someone picked and asked "Whose fake pulled the votes?"
 * when no fake had pulled any (2026-10-02). So every fake on the ballot
 * gets its row in the chart, a zero too, and the line under it says what
 * happened.
 */
import { translate } from '../i18n/index.js';

const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();

/**
 * Give every ballot entry a row in the tally, zero when nobody picked it.
 * Mutates and returns the tally.
 * @param {Record<string, number>} tally choice -> picks
 * @param {Array<string|{text?: string}>} ballot the room's shared ballot
 */
export function withZeroRows(tally, ballot) {
  for (const entry of Array.isArray(ballot) ? ballot : []) {
    const text = entry && typeof entry === 'object' ? entry.text : entry;
    if (typeof text === 'string' && text !== '' && !(text in tally)) tally[text] = 0;
  }
  return tally;
}

/**
 * @param {string} lang the room's language
 * @param {Array<{choice?: string, text?: string}>} responses the picks
 * @param {string|null} correct the truth
 * @returns {string} '' when nobody picked anything
 */
export function foolLine(lang, responses, correct) {
  const picks = (Array.isArray(responses) ? responses : []).map(r => r && (r.choice != null ? r.choice : r.text));
  if (picks.length === 0) return '';
  const fooled = picks.some(p => p != null && norm(p) !== norm(correct));
  return translate(lang, fooled
    ? 'Fake authors, own up! Whose fake pulled the votes?'
    : 'Nobody fell for a fake this time.');
}
