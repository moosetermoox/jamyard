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
