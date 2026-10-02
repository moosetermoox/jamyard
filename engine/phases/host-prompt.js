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

// A heading line that introduced the dropped part ("The version you
// received:" over Idea Chain's quote, a reviewer 2026-10-02): with the
// part gone it heads nothing, so it goes too
const LEAD_IN_LINE = /^\s*[^…\n]{1,60}:\s*$/;

export function withoutPlaceholderLines(text) {
  if (typeof text !== 'string' || text.indexOf('…') === -1) return text;
  const kept = [];
  for (const line of text.split('\n')) {
    if (PLACEHOLDER_LINE.test(line) || LEAD_PLACEHOLDER_LINE.test(line)) {
      if (PLACEHOLDER_LINE.test(line)) {
        // Drop the lead-in above it (blank lines between them too)
        let i = kept.length - 1;
        while (i >= 0 && kept[i].trim() === '') i--;
        if (i >= 0 && LEAD_IN_LINE.test(kept[i])) kept.length = i;
      }
      continue;
    }
    kept.push(line);
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
