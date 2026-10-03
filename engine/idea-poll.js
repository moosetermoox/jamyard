/**
 * A poll the idea asked for that the match does not have (2026-10-03, the
 * owner's re-check: "a poll and then a reason" matched Discussion Starter,
 * an open answer with an AI summary, and the card said nothing was
 * missing). The matcher is asked for a `missing` list, but it answered []
 * here; this reads the idea itself, the way engine/idea-settings.js reads
 * "anonymous", so the card offers Plan it step by step whenever the idea
 * names a poll and the steps have no step with choices.
 *
 * asksForPoll: a poll word in any of the six languages, or a "which do you
 * prefer, A, B or C" list of options after a choosing verb.
 * hasChoiceStep: a collect-choice or a vote anywhere in the config
 * (top level or inside a For Each).
 */

const POLL_WORDS = /\b(?:polls?|survey|quick vote|vote on|straw poll|encuestas?|sondeos?|votaci[oó]n|sondages?|umfragen?|abstimmung|sondaggi(?:o)?|enquetes?|vota[cç][aã]o)\b/i;

// "prefer(s) ... A, B or C": a choosing verb, then within one clause a
// comma list closed by "or" in the idea's language
const CHOOSING_VERB = '(?:prefer(?:s|ir)?|prefieres?|prefieren|prefiera|choose|pick|elige|elijan|escoge|escojan|choisis|choisissez|pr[eé]f[eè]res?|w[aä]hlt?|bevorzug(?:st|t)|preferisci|preferite|prefere[ms]?|escolhe[m]?)';
const OPTION_LIST = new RegExp(CHOOSING_VERB + '[^.?!\\n]{0,60}?\\b[\\p{L}\\p{N}]+(?:\\s*,\\s*[\\p{L}\\p{N}]+)+\\s+(?:or|o|u|ou|oder)\\s+[\\p{L}\\p{N}]+', 'iu');

export function asksForPoll(description) {
  const text = String(description || '');
  if (!text.trim()) return false;
  return POLL_WORDS.test(text) || OPTION_LIST.test(text);
}

const CHOICE_TYPES = new Set(['collect-choice', 'vote']);

export function hasChoiceStep(config) {
  const phases = (config && config.phases) || {};
  for (const phase of Object.values(phases)) {
    if (!phase || typeof phase !== 'object') continue;
    if (CHOICE_TYPES.has(phase.type)) return true;
    const subs = phase.subPhases && typeof phase.subPhases === 'object' ? Object.values(phase.subPhases) : [];
    if (subs.some(s => s && CHOICE_TYPES.has(s.type))) return true;
  }
  return false;
}

export const POLL_MISSING = 'a poll with answer choices';

/**
 * The `missing` list with the poll added when the idea asks for one and
 * the config has no step with choices; the matcher's own list is kept,
 * and nothing is added when it already names the poll.
 * @param {string} description
 * @param {object} config
 * @param {string[]} [missing]
 * @returns {string[]}
 */
export function withPollMissing(description, config, missing) {
  const list = Array.isArray(missing) ? missing.filter(m => typeof m === 'string' && m.trim()) : [];
  if (!asksForPoll(description) || hasChoiceStep(config)) return list;
  if (list.some(m => /\b(poll|choices?|options?|encuesta|sondeo|sondage|umfrage|sondaggio|enquete)\b/i.test(m))) return list;
  return [...list, POLL_MISSING];
}
