/**
 * Debug-gated logging for STUDENT CONTENT (COPPA/FERPA: server stdout ends
 * up in Render's log store, which outlives our 6-hour snapshot TTL — an
 * unretained-policy student-data store, per the 2026-07-19 review).
 *
 * Rule: student names, submission text, and AI input/output bodies never
 * reach console.log in production. Operational logs keep counts, lengths,
 * playerIds, and phase ids — enough to debug flow without storing content.
 *
 * Set DEBUG_CONTENT=1 (local dev only) to see full content while debugging.
 */

export const CONTENT_DEBUG = process.env.DEBUG_CONTENT === '1';

/** console.log that only fires when DEBUG_CONTENT=1. */
export function contentLog(...args) {
  if (CONTENT_DEBUG) console.log(...args);
}
