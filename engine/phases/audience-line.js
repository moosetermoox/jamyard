/**
 * The audience line a collect handler sends to the student screen:
 * engine/audience.js decides WHO will see the answer from the graph, this
 * turns that into translated text (plus the names note in anonymous
 * rooms, and the waiting-screen hint when a classmate gets it next).
 */

import { audienceFor, labelForGroup, NAMES_HIDDEN_LABEL } from '../audience.js';
import { translate } from '../i18n/index.js';

/**
 * @param {object} config
 * @param {string} phaseId
 * @param {string} lang    the activity's resolved language code
 * @param {{playerCount?: number}} [opts] students in the room now: a
 *   pairing that does not split them evenly leaves a triple, and the line
 *   says so ("One or two classmates") instead of promising one reader
 * @returns {{audience: string|null, nextHint: string|null}}
 */
export function audienceLine(config, phaseId, lang, opts = {}) {
  const a = audienceFor(config, phaseId);
  if (!a) return { audience: null, nextHint: null };
  let text = translate(lang, labelForGroup(a, opts.playerCount));
  if (a.namesHidden) text += ' ' + translate(lang, NAMES_HIDDEN_LABEL);
  return {
    audience: text,
    nextHint: a.nextHint ? translate(lang, a.nextHint) : null
  };
}
