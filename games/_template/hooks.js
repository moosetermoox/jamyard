/**
 * Example hooks file for a game.
 *
 * Hooks are named exports — pure functions called by name from config.
 * Each hook receives a context object:
 *
 * @param {Object} context
 * @param {any}      context.input      - Data from the config's "input" field
 * @param {Player[]} context.players    - All players in the game
 * @param {Player[]} context.remaining  - Non-eliminated players
 * @param {Player[]} context.eliminated - Eliminated players
 * @param {Object}   context.phases     - All phase outputs so far
 *
 * Hooks must:
 * - Be pure functions (same input → same output)
 * - Only transform data (no AI calls, no emitting events)
 * - Return a value (the engine stores the result)
 */

/**
 * Example: pick a random item from an array.
 */
export function pickRandom(context) {
  const items = context.input;
  if (!Array.isArray(items) || items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}
