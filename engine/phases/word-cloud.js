/**
 * Reveal styles over a list of answers (2026-09-30, the mechanics
 * inventory part three): a sized word cloud, every answer up at once as
 * cards, one answer (or one student) picked at random. Each is a template
 * suffix the engine renders to TEXT with a line shape the projector and
 * the student screen draw (screens/shared/chart-render.js), the same way
 * a bar chart travels:
 *   .cloud   -> "word ×12" per line, most common first
 *   .cards   -> "◆ the answer" per line
 *   .random  -> one item's words
 * Pure; the engine's resolver calls these.
 */

// The words that carry no meaning in a cloud, in the six languages the
// activities run in. Short on purpose: a cloud of a class's one-word
// answers rarely needs more than the articles and the glue.
export const STOPWORDS = new Set([
  // en
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them', 'their', 'his', 'her', 'not', 'no', 'so', 'if', 'than', 'then', 'very', 'just', 'about', 'into', 'up', 'out', 'do', 'does', 'did', 'have', 'has', 'had', 'can', 'will', 'would', 'should', 'could', 'there', 'what', 'which', 'who', 'how', 'when', 'where', 'why', 'also', 'more', 'most', 'some', 'any', 'all', 'because', 'like', 'get', 'got', 'one', 'thing', 'things', 'really',
  // es
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'pero', 'de', 'del', 'al', 'en', 'con', 'por', 'para', 'es', 'son', 'era', 'fue', 'ser', 'estar', 'esto', 'eso', 'esta', 'este', 'mi', 'tu', 'su', 'sus', 'nos', 'que', 'qué', 'como', 'cómo', 'más', 'muy', 'también', 'porque', 'si', 'sí', 'lo', 'le', 'se', 'ya', 'hay',
  // fr
  'le', 'les', 'des', 'du', 'et', 'ou', 'mais', 'dans', 'sur', 'pour', 'avec', 'par', 'est', 'sont', 'était', 'être', 'ce', 'cet', 'cette', 'ces', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'nous', 'vous', 'ils', 'elles', 'je', 'tu', 'il', 'elle', 'on', 'ne', 'pas', 'plus', 'très', 'aussi', 'parce', 'qui', 'quoi', 'où', 'quand', 'comment', 'au', 'aux',
  // de
  'der', 'die', 'das', 'ein', 'eine', 'einen', 'einem', 'einer', 'und', 'oder', 'aber', 'von', 'zu', 'im', 'am', 'auf', 'für', 'mit', 'ist', 'sind', 'war', 'waren', 'sein', 'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'mein', 'dein', 'nicht', 'kein', 'sehr', 'auch', 'weil', 'dass', 'wie', 'was', 'wer', 'wo', 'wann', 'warum', 'den', 'dem', 'des',
  // pt
  'os', 'as', 'um', 'uma', 'e', 'ou', 'mas', 'do', 'da', 'dos', 'das', 'no', 'na', 'nos', 'nas', 'em', 'com', 'para', 'por', 'é', 'são', 'foi', 'ser', 'isso', 'isto', 'meu', 'minha', 'seu', 'sua', 'não', 'muito', 'também', 'porque', 'o', 'ao',
  // it
  'il', 'lo', 'gli', 'le', 'uno', 'una', 'e', 'ed', 'o', 'ma', 'di', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra', 'è', 'sono', 'era', 'essere', 'questo', 'questa', 'quello', 'mio', 'tuo', 'suo', 'non', 'molto', 'anche', 'perché', 'che', 'chi', 'come', 'dove', 'quando', 'del', 'della', 'dei', 'delle', 'al', 'alla', 'nel', 'nella'
]);

export const CLOUD_MAX_WORDS = 40;
export const CLOUD_MARK = ' ×';
export const CARD_MARK = '◆ ';

/** The words of one item: a string, or a response with text. */
export function textOf(item) {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') {
    const t = item.text || item.name || item.response || item.item || item.choice;
    return typeof t === 'string' ? t : '';
  }
  return item == null ? '' : String(item);
}

/** The list inside a value: an array, or an object holding one. */
export function listOf(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    for (const k of ['responses', 'merged', 'result', 'standings', 'candidates']) {
      if (Array.isArray(value[k])) return value[k];
    }
  }
  return [];
}

/**
 * Word counts over a list of answers: lowercased, punctuation off, one
 * count per word per answer, stopwords and one-letter words dropped.
 * @param {any[]} items
 * @param {{ max?: number }} [opts]
 * @returns {Array<{word: string, count: number}>} most common first, ties by first appearance
 */
export function wordCounts(items, opts = {}) {
  const max = Number.isInteger(opts.max) && opts.max > 0 ? opts.max : CLOUD_MAX_WORDS;
  const counts = new Map();
  for (const item of items || []) {
    const text = textOf(item).toLowerCase();
    const seen = new Set();
    for (const raw of text.split(/[^\p{L}\p{N}'’-]+/u)) {
      const w = raw.replace(/^['’-]+|['’-]+$/g, '');
      if (w.length < 2 || STOPWORDS.has(w) || seen.has(w)) continue;
      seen.add(w);
      counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  return [...counts.entries()].map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, max);
}

/** "word ×12" per line, the shape the screens draw as a sized cloud. */
export function formatCloud(items) {
  return wordCounts(items).map(({ word, count }) => word + CLOUD_MARK + count).join('\n');
}

/** "◆ answer" per line, the shape the screens lay out as cards. */
export function formatCards(items) {
  return listOf(items).map(textOf).map(t => t.trim()).filter(Boolean).map(t => CARD_MARK + t).join('\n');
}

/** One item's words, at random (rng = () => [0, 1)). */
export function pickRandom(items, rng) {
  const list = listOf(items).map(textOf).map(t => t.trim()).filter(Boolean);
  if (list.length === 0) return '';
  const r = typeof rng === 'function' ? rng() : Math.random();
  return list[Math.min(list.length - 1, Math.floor(r * list.length))];
}
