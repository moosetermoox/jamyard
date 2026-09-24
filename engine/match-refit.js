/**
 * Match refit: when the recipe matcher points a Create-page idea at a
 * ready-made activity that is itself built from a recipe, the idea should
 * land on that recipe with the teacher's own content filled in, never on
 * the built-in's defaults.
 *
 * Born 2026-09-23 from a reviewer's try: "a five-minute anonymous history
 * poll about causes of the American Revolution" with four choices came
 * back as "Good news: this already exists" pointing at the Live Poll
 * built-in, and Make it yours opened the default question about feelings
 * toward today's lesson. The Live Poll built-in IS the live-poll recipe
 * with its default question; the recipe would have carried the question
 * and the four choices. So: a pick of a recipe-born built-in is a pick of
 * its recipe, and the route refits the idea to it (a forced match, the
 * AI's only job is the parameters).
 *
 * Pure: takes the matcher's pick and the loaded games, returns the recipe
 * id to refit to, or null when the built-in is hand-made (nothing to fill).
 */

/**
 * @param {string} gameId the id the matcher pointed at
 * @param {Array<{id: string, config?: object}>} loadedGames the built-ins
 *   as loaded, each with its config (a recipe-born one carries a
 *   `recipe: {id, version, params}` stamp)
 * @returns {string|null} the recipe id to refit to
 */
export function refitRecipeIdFor(gameId, loadedGames) {
  if (typeof gameId !== 'string' || !Array.isArray(loadedGames)) return null;
  const game = loadedGames.find(g => g && g.id === gameId);
  const stamp = game && game.config && game.config.recipe;
  if (!stamp || typeof stamp !== 'object' || typeof stamp.id !== 'string' || !stamp.id) return null;
  return stamp.id;
}
