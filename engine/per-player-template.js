/**
 * Per-recipient template resolution: `{{X.assigned}}` (what a classmate
 * handed this student) and `{{X.mine}}` (what this student wrote earlier)
 * are the only tokens whose value depends on WHO is reading. Everything
 * else goes through the engine's own resolver.
 *
 * When there is nothing behind a per-recipient token (the source step
 * closed with nobody answering, so no rotation was dealt; or the student
 * skipped the source step themselves) the prompt must still read as a
 * sentence. It used to reach the student with the raw token in it
 * ("look through the eyes of: {{viewpoints.assigned}}", outside review
 * 2026-09-12). Now it reads a plain line in the activity's language.
 * Other unresolved refs are left as written, as before: those are the
 * teacher's to notice in the designer, not a per-student gap.
 */

import { translate } from './i18n/index.js';

export const MISSING_ASSIGNED = 'No answer came in yet. Pick your own.';
export const MISSING_MINE = 'You did not answer that one.';

/**
 * @param {string} template
 * @param {object} engine  a GameEngine (phaseData, resolve, language)
 * @param {string} playerId
 * @returns {string}
 */
export function resolvePerPlayerTemplate(template, engine, playerId) {
  if (!template) return '';
  const lang = engine.language || 'en';
  return template
    .replace(/\{\{\s*([a-zA-Z0-9_-]+)\.assigned\s*\}\}/g, (match, phaseId) => {
      const data = engine.phaseData[phaseId];
      if (data && data.assigned && data.assigned[playerId] !== undefined) {
        return String(data.assigned[playerId]);
      }
      return translate(lang, MISSING_ASSIGNED);
    })
    .replace(/\{\{\s*([a-zA-Z0-9_-]+)\.mine\s*\}\}/g, (match, phaseId) => {
      const data = engine.phaseData[phaseId];
      if (data && data.byPlayer && data.byPlayer[playerId] !== undefined) {
        return String(data.byPlayer[playerId]);
      }
      return translate(lang, MISSING_MINE);
    })
    .replace(/\{\{([^}]+)\}\}/g, (match, ref) => {
      if (/\.(mine|assigned)\s*$/.test(ref)) return match;
      const value = engine.resolve(ref.trim());
      return value !== undefined ? String(value) : match;
    });
}
