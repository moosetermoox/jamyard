/**
 * The projector's copy of a step's question. Per-student parts of a prompt
 * ("{{draft.assigned}}", a classmate's piece or a secret card) resolve to
 * "…" on the projector, and a line that held only that part drew an empty
 * quote card or a bold "…" box over the class (a reviewer, 2026-10-01:
 * the feedback and find-your-match steps). Such lines are dropped.
 *
 * Pure: text in, text out.
 */

// A line that is only the placeholder, in quotes or bold or neither
const PLACEHOLDER_LINE = /^\s*(?:\*\*)?\s*[“"'‘]?\s*…\s*[”"'’]?\s*(?:\*\*)?\s*$/;

/**
 * @param {string} text the resolved projector prompt
 * @returns {string}
 */
// A short lead in front of the placeholder ("Draw this: …", Doodle Bluff's
// secret phrase, a reviewer 2026-10-02): the lead means nothing without it
const LEAD_PLACEHOLDER_LINE = /^\s*[^…\n]{1,40}:\s*(?:\*\*)?\s*[“"'‘]?\s*…\s*[”"'’]?\s*(?:\*\*)?\s*$/;

export function withoutPlaceholderLines(text) {
  if (typeof text !== 'string' || text.indexOf('…') === -1) return text;
  const kept = text.split('\n').filter(line => !PLACEHOLDER_LINE.test(line) && !LEAD_PLACEHOLDER_LINE.test(line));
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
