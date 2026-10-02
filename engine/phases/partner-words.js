/**
 * "Go sit next to your partner" read to a group of three (review
 * eighteen, Snowball: an odd class makes one trio). A merge step's
 * instruction is the teacher's own words, so there is no label table to
 * pick from; for a group of three or more the English partner phrases
 * become group phrases. Other languages keep their words as written.
 */
const SIT_NEXT = /\b(go )?sit next to your (new )?partner\b/gi;
const YOUR_PARTNER = /\b(your) (new )?partner('s)?\b/gi;

function keepCase(sample, word) {
  return sample[0] === sample[0].toUpperCase() ? word[0].toUpperCase() + word.slice(1) : word;
}

// A sentence that sends the student to a partner, or asks them to combine
// answers they do not have
const PARTNER_SENTENCE = /[^.!?\n]*\b(?:partner|partners|sit next to|together|combine|merge|your answers)\b[^.!?\n]*[.!?]?[ \t]*/gi;

/**
 * A student alone in a merge (a class of one, or the only one left): the
 * partner sentences go and a solo line leads (a reviewer's lone student
 * in Snowball was told "go sit next to your partner", 2026-10-02).
 * @param {string} text   the merge instruction, already resolved
 * @param {string} soloLine the lead line in the room's language
 * @param {string} [lang]
 */
export function soloMergeWords(text, soloLine, lang = 'en') {
  const rest = typeof text === 'string' && lang === 'en'
    ? text.replace(PARTNER_SENTENCE, '').replace(/\n{3,}/g, '\n\n').trim()
    : '';
  return rest ? soloLine + '\n\n' + rest : soloLine;
}

export function fitPartnerWords(text, memberCount) {
  if (typeof text !== 'string' || !(memberCount >= 3)) return text;
  return text
    .replace(SIT_NEXT, (m, go, fresh) => keepCase(m, (go ? 'go ' : '') + 'sit with your ' + (fresh || '') + 'group'))
    .replace(YOUR_PARTNER, (m, your, fresh, poss) => keepCase(m, 'your ' + (fresh || '') + 'group' + (poss || '')));
}
