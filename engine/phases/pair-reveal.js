/**
 * Pure helpers for the pair-scoped reveal (reveal phase with scope:"pair").
 * Spec: docs/connection-pack-spec.md §2.3–2.4.
 *
 * A pair-scoped reveal shows each pair ONLY its own answers, simultaneously.
 * Pairing data comes from an upstream collect with assign:"pairwise"
 * (`pairs`, `byPlayer`, `passedIds` on that phase's stored data).
 *
 * Anonymity invariant: a pass renders exactly the same neutral card as a
 * missing answer, so passing is indistinguishable from a slow answer even
 * inside the pair. Nothing pair-private is ever sent to the host screen
 * (it's projected to the class).
 *
 * Groups are iterated generically (not assumed to be exactly 2), so the
 * odd-class triple planned for Closer works without changes here.
 */

// Neutral card shown for a member with no answer to display — used for BOTH
// passes and missing answers so the two are indistinguishable.
export const LISTEN_CARD_TEXT = 'chose to listen this round';

/**
 * @typedef {Object} PairMemberView
 * @property {string} playerId
 * @property {string} name
 * @property {string|null} text   Display answer, or null → neutral card
 *
 * @typedef {Object} PairView
 * @property {string} promptText             The pair's shared prompt
 * @property {PairMemberView[]} members
 */

/**
 * Build one view per player from a pairwise collect's stored phase data.
 *
 * @param {{ pairs?: Array<{promptText?: string, playerIds?: string[]}>,
 *           byPlayer?: Object<string,string>, passedIds?: string[] }} sourceData
 * @param {Array<{id: string, name: string}>} playersList
 * @returns {Map<string, PairView>} keyed by viewer playerId
 */
export function buildPairViews(sourceData, playersList) {
  const views = new Map();
  if (!sourceData || !Array.isArray(sourceData.pairs)) return views;

  const nameOf = new Map((playersList || []).map(p => [p.id, p.name]));
  const byPlayer = sourceData.byPlayer || {};
  const passed = new Set(sourceData.passedIds || []);

  for (const pair of sourceData.pairs) {
    const ids = Array.isArray(pair.playerIds) ? pair.playerIds : [];
    const members = ids.map(id => {
      const answer = passed.has(id) ? undefined : byPlayer[id];
      const hasAnswer = answer !== undefined && answer !== null && String(answer) !== '';
      return {
        playerId: id,
        name: nameOf.get(id) || 'Your partner',
        text: hasAnswer ? String(answer) : null
      };
    });
    const view = { promptText: pair.promptText || '', members };
    for (const id of ids) views.set(id, view);
  }
  return views;
}

/**
 * Render a view's answers as a display block (one line per member).
 *
 * @param {PairView|undefined} view
 * @returns {string}
 */
export function renderPairAnswers(view) {
  if (!view || !Array.isArray(view.members)) return '';
  return view.members
    .map(m => m.text == null
      ? `${m.name} ${LISTEN_CARD_TEXT}.`
      : `${m.name}: ${m.text}`)
    .join('\n\n');
}

/**
 * Build the final content string for one viewer. If the phase has a
 * template, normal {{refs}} should already be resolved by the caller
 * (leaving {{_pair.*}} tokens literal); this swaps in the pair values
 * LAST so student-written text is never run through the resolver.
 *
 * @param {string|null} resolvedTemplate  Template after ctx.resolveTemplate, or null
 * @param {PairView|undefined} view
 * @returns {string}
 */
export function buildPairContent(resolvedTemplate, view) {
  const block = renderPairAnswers(view);
  if (!resolvedTemplate) return block;
  return resolvedTemplate
    .replace(/\{\{\s*_pair\.answers\s*\}\}/g, block)
    .replace(/\{\{\s*_pair\.prompt\s*\}\}/g, (view && view.promptText) || '');
}
