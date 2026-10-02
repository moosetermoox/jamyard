/**
 * Some activities are about real names: a guess-who round asks the class
 * WHO wrote an answer, from a roster of classmates (a For Each with
 * candidateSource "players"). With names hidden the roster is made-up
 * play names nobody can place, and the game means nothing (a reviewer's
 * Guess Who: Rose, Bud, Thorn ran anonymous, 2026-10-02).
 *
 * So such an activity always runs with names shown: the room's engine
 * drops `anonymous` for it (engine/game-engine.js), the validator says so
 * (ANON_GUESS_WHO), and the make page offers no Hidden chip for it
 * (screens/make/make.js mirrors this rule).
 */

/**
 * @param {object} config an activity
 * @returns {boolean} true when a step asks the class to guess who wrote something
 */
export function guessesAuthors(config) {
  const phases = config && config.phases;
  if (!phases || typeof phases !== 'object') return false;
  return Object.values(phases).some(p => p && p.type === 'foreach' && p.candidateSource === 'players');
}
