/**
 * A relay's finished text: the lines students wrote, in turn order.
 * A turn that timed out or was skipped stays "(skipped)" on the live
 * screens, but never in the text a later step shows: a reviewer's pitch
 * read "(skipped) (skipped) (skipped) (skipped)" on the projector
 * (2026-09-28). No lines at all reads as one plain sentence.
 */
import { translate } from '../i18n/index.js';

export const SKIPPED_TEXT = '(skipped)';
export const NOBODY_WROTE = 'Nobody added a line this time.';

export function relayFullText(entries, lang) {
  const lines = (Array.isArray(entries) ? entries : [])
    .filter(e => e && !e.skipped && typeof e.text === 'string' && e.text.trim() !== '' && e.text !== SKIPPED_TEXT)
    .map(e => e.text.trim());
  return lines.length ? lines.join(' ') : translate(lang, NOBODY_WROTE);
}
