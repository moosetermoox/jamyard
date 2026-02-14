/**
 * Eliminate players whose answers were grouped together by AI.
 *
 * The AI may return groups containing playerIds OR response text.
 * This hook handles both cases by building a text-to-playerId lookup
 * from the collect phase responses.
 *
 * @param {Object} context
 * @param {Array} context.input - AI result: array of arrays (grouped by similarity)
 * @param {Array} context.players - All players
 * @param {Array} context.remaining - Non-eliminated players
 * @param {Array} context.eliminated - Already eliminated players
 * @param {Object} context.phases - All phase outputs so far
 * @returns {string[]} Array of playerIds to eliminate
 */
export function eliminateDuplicates(context) {
  const groups = context.input;
  if (!Array.isArray(groups)) return [];

  // Build lookups: known playerIds + response text to playerId
  const knownIds = new Set(context.players.map(p => p.id));
  const textToId = {};
  for (const phaseData of Object.values(context.phases)) {
    if (phaseData && Array.isArray(phaseData.responses)) {
      for (const r of phaseData.responses) {
        if (r.playerId && r.text) {
          textToId[r.text] = r.playerId;
          textToId[r.text.toLowerCase()] = r.playerId;
        }
      }
    }
  }

  const toEliminate = new Set();

  for (const group of groups) {
    if (!Array.isArray(group) || group.length <= 1) continue;

    // Resolve each item to a playerId, deduplicating within the group
    const resolvedSet = new Set();
    for (const item of group) {
      if (knownIds.has(item)) {
        resolvedSet.add(item);
      } else if (textToId[item]) {
        resolvedSet.add(textToId[item]);
      } else if (typeof item === 'string' && textToId[item.toLowerCase()]) {
        resolvedSet.add(textToId[item.toLowerCase()]);
      }
    }

    // Only eliminate if 2+ unique players in the group
    if (resolvedSet.size > 1) {
      for (const id of resolvedSet) {
        toEliminate.add(id);
      }
    }
  }

  return [...toEliminate];
}
