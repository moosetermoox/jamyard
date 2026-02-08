/**
 * Eliminate players whose answers were grouped together by AI
 * @param {Object} context
 * @param {Array} context.input - AI result: array of arrays of playerIds (grouped by similarity)
 * @param {Array} context.players - All players
 * @param {Array} context.remaining - Non-eliminated players
 * @param {Array} context.eliminated - Already eliminated players
 * @param {Object} context.phases - All phase outputs so far
 * @returns {string[]} Array of playerIds to eliminate
 */
export function eliminateDuplicates(context) {
  const groups = context.input;
  const toEliminate = [];

  for (const group of groups) {
    if (group.length > 1) {
      // All players in a matching group are eliminated
      toEliminate.push(...group);
    }
  }

  return toEliminate;
}
