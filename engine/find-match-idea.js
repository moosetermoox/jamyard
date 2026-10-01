/**
 * Does a typed Create-page idea read as find your match? (2026-10-01,
 * the mechanics inventory's Part 3.) Students handed half of a pair who
 * walk the room to find the classmate holding the other half is a
 * findmatch brick: the cards are dealt and the names checked on the
 * screens. The matcher model kept calling it offScreen (it is told that
 * moving around the room is), which drops the plan button and dead-ends
 * the teacher, most often for an idea written in Spanish. The prompt
 * names the exception; this reader is the backstop, the same way
 * engine/idea-settings.js reads "no names" so the AI never has to.
 *
 * It only ever CLEARS a wrong offScreen; it never picks an activity.
 * Pure: text in, boolean out.
 */

const fold = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const PATTERNS = [
  // English
  /\bfind (your|their|his|her|a|the) (match|partner|pair|other half)\b/,
  /\bother half\b/,
  /\bmatching cards?\b/,
  /\bcards? (that )?(goes?|match(es)?) with (yours|theirs|it)\b/,
  /\bfind (the|a) (person|classmate|student)s? (whose|with the) (card|half|match)/,
  // Spanish
  /\b(encuentra|encontrar|busca|buscar|buscan|encuentran)\w* (a )?(tu|su|sus) (pareja|companer[oa]s?)\b/,
  /\botra mitad\b/,
  // French
  /\b(trouve|trouver|cherche|chercher)\w* (ton|son|sa|ta|leur) (partenaire|binome|paire)\b/,
  /\bautre moitie\b/,
  // German
  /\bfinde\w* (deinen|deine|seinen|seine|ihren|ihre) (partner|partnerin|gegenstuck)\b/,
  /\bandere halfte\b/,
  // Portuguese
  /\b(encontre|encontrar|procure|procurar)\w* (o |a )?(seu|sua) (par|parceir[oa]|dupla)\b/,
  /\boutra metade\b/,
  // Italian
  /\b(trova|trovare|cerca|cercare)\w* (il |la )?(tuo|tua|suo|sua) (coppia|compagn[oa]|partner)\b/,
  /\baltra meta\b/
];

export function readsAsFindYourMatch(text) {
  const t = fold(text);
  if (!t) return false;
  return PATTERNS.some(re => re.test(t));
}
