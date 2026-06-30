/**
 * hooks-loader — dynamically imports a game's optional `hooks.js`.
 *
 * Most games are pure config. A few (e.g. Corn Story's custom elimination)
 * need imperative logic the phase types can't express, so they ship a
 * `games/<id>/hooks.js` exporting named functions the engine calls by name.
 * `loadHooks(gameId)` returns those exports, or `{}` if the game has none.
 *
 * Security note: this runs arbitrary game-supplied JavaScript in-process. Fine
 * while games are author-trusted (single teacher); revisit sandboxing before
 * untrusted/shared game configs ship (see docs strategic-gaps).
 */
import { access } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GAMES_DIR = join(__dirname, '..', 'games');

export async function loadHooks(gameId) {
  const hooksPath = join(GAMES_DIR, gameId, 'hooks.js');

  try {
    await access(hooksPath);
  } catch {
    return {};
  }

  try {
    const hooksUrl = pathToFileURL(hooksPath).href;
    const module = await import(hooksUrl);

    const hooks = {};
    for (const [name, value] of Object.entries(module)) {
      if (typeof value === 'function') {
        hooks[name] = value;
      }
    }
    return hooks;
  } catch (error) {
    console.warn(`[hooks-loader] Failed to load hooks for "${gameId}": ${error.message}`);
    return {};
  }
}
