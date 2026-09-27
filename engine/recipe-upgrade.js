/**
 * A saved copy whose recipe moved on for a reason that matters gets the
 * new recipe's phases ON READ (2026-09-26, an outside reviewer re-ran an
 * Anonymous Feedback copy saved under recipe version 1: the summary,
 * written for the teacher with "what you could try", went up on the
 * projector; version 2 keeps that summary behind a teacher review and
 * writes a class version without advice).
 *
 * A recipe opts in with `replaceOnRead: ["1"]`, the stamped versions
 * whose phases must be replaced. The copy's own words stay: its name,
 * description, and every top-level teacher setting; the recipe stamp's
 * params (the question, the timer) rebuild the steps. Anything a teacher
 * typed straight into a step of an old copy is lost, which is the trade
 * the opt-in makes; a recipe bumps its version without the flag when
 * the old phases are still fine to run.
 *
 * Pure: returns the version replaced, or null when nothing changed.
 */

// The copy's own, never taken from the fresh compile
const KEEP = new Set(['name', 'description', 'anonymous', 'language', 'wordHelp', 'earlyJoke', 'sampleAnswers', 'featured', 'id']);

export function staleVersion(config, recipe) {
  const stamp = config && config.recipe;
  if (!stamp || typeof stamp !== 'object' || !recipe || !Array.isArray(recipe.replaceOnRead)) return null;
  const v = stamp.version == null ? '1' : String(stamp.version);
  const current = String(recipe.version || '1');
  if (v === current) return null;
  return recipe.replaceOnRead.map(String).includes(v) ? v : null;
}

/**
 * @param {Object} config   The saved copy (mutated).
 * @param {Object} recipe   The recipe named by its stamp.
 * @param {Function} compile  (recipe, params) => { config, diagnostics }
 * @returns {string|null} the stamped version that was replaced, or null
 */
export function upgradeStaleCopy(config, recipe, compile) {
  const stale = staleVersion(config, recipe);
  if (!stale) return null;
  const { config: compiled } = compile(recipe, (config.recipe && config.recipe.params) || {});
  if (!compiled || typeof compiled !== 'object' || !compiled.phases) return null;
  for (const key of Object.keys(compiled)) {
    if (KEEP.has(key) && config[key] !== undefined) continue;
    config[key] = compiled[key];
  }
  return stale;
}
