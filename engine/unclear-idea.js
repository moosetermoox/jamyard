/**
 * unclear-idea.js — is a Create-page idea readable at all?
 *
 * A reviewer typed keyboard mash into the idea box (2026-10-02) and got
 * "This one needs a trick we don't have yet": the matcher found no recipe,
 * the plan builder refused, and the card blamed a missing feature. Nothing
 * was missing; the words were not words. This check runs before any AI
 * call, so mash costs nothing and gets the plain line instead.
 *
 * Deliberately cautious: it only calls an idea unclear when most of its
 * words look like no language at all (no vowel, a long consonant run, one
 * letter repeated, a key row typed in order). A short real idea in any
 * Latin-script language passes, and a script without Latin letters passes
 * untouched (the checks below only look at Latin letters).
 *
 * Pure: no I/O.
 */

export const UNCLEAR_LINE = "We couldn't tell what you want to make. Try describing the activity in a sentence, like \"a quick poll on the causes of the Civil War\".";

const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890'];
const VOWELS = /[aeiouyàáâãäåæèéêëìíîïòóôõöøùúûüýÿœ]/i;
const LATIN = /^[a-zà-ÿœæß]+$/i;

/**
 * One word that looks typed by a palm, not a person.
 * @param {string} word  lower case
 */
function mashed(word) {
  if (word.length < 3) return false;
  if (/(.)\1{3,}/.test(word)) return true; // aaaa
  if (!LATIN.test(word)) return false; // another script, a number: not ours to judge
  if (!VOWELS.test(word)) return word.length >= 4; // "jfkdl", but "hmm" and "tv" pass
  if (/[bcdfghjklmnpqrstvwxz]{6,}/.test(word)) return true; // "asdfghjkl"
  for (const row of KEY_ROWS) {
    for (let i = 0; i + 4 <= row.length; i++) {
      if (word.includes(row.slice(i, i + 4))) return true; // "qwer", "sdfg"
    }
  }
  return false;
}

/**
 * @param {string} text  the idea as typed
 * @returns {boolean} true when the idea reads as no words at all
 */
export function looksUnclear(text) {
  const raw = String(text || '').trim();
  if (!raw) return true;
  // No letters in any script: digits and punctuation only
  if (!/\p{L}/u.test(raw)) return true;
  const words = raw.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0) return true;
  const judged = words.filter(w => w.length >= 3);
  if (judged.length === 0) return false;
  const bad = judged.filter(mashed).length;
  // Most of the words are mash, or a single long word that is
  return bad / judged.length > 0.5;
}
