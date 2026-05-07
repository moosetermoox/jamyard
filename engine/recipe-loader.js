/**
 * Recipe loader — scans recipes/ on disk, parses + validates each
 * file, exposes them via getRecipe()/listRecipes().
 *
 * Loading strategy:
 *   - Scan recipes/ at server startup (loadAllRecipes()).
 *   - Built-in recipes live at recipes/*.json — committed to the repo.
 *   - User-saved recipes live at recipes/user/*.json — created by R5,
 *     not present until then. Loaded too once R5 ships.
 *   - Broken recipes log a warning at startup; they don't crash the
 *     server. The recipe just won't appear in the picker.
 *
 * Reload semantics: recipes are loaded once at startup. If you edit
 * a recipe file while the server is running, restart the server.
 * (Hot-reload is YAGNI for v1; can be added later if recipe authoring
 * becomes a frequent loop.)
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { validateRecipe } from './recipe-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = join(__dirname, '..', 'recipes');
const USER_RECIPES_DIR = join(RECIPES_DIR, 'user');

// In-memory cache: { id → recipe }
let recipeCache = null;

// =======================================================================
// Public API
// =======================================================================

/**
 * Scan the recipes directory and load every valid recipe into memory.
 * Call once at server startup; subsequent calls are cached.
 *
 * @param {{ force?: boolean }} [opts]  Pass { force: true } to bust the cache (tests).
 * @returns {Promise<Map<string, import('./recipe-schema.js').Recipe>>}
 */
export async function loadAllRecipes(opts = {}) {
  if (recipeCache && !opts.force) return recipeCache;

  const cache = new Map();
  const builtIn = await loadDirectory(RECIPES_DIR, { source: 'built-in' });
  const userOwn = await loadDirectory(USER_RECIPES_DIR, { source: 'user' });

  for (const recipe of builtIn) cache.set(recipe.id, recipe);
  // User recipes can override built-ins by id (intentional — lets a
  // teacher tweak a built-in by saving over it).
  for (const recipe of userOwn) cache.set(recipe.id, recipe);

  recipeCache = cache;
  return cache;
}

/**
 * Look up one recipe by id.
 *
 * @param {string} id
 * @returns {import('./recipe-schema.js').Recipe | null}
 */
export function getRecipe(id) {
  if (!recipeCache) return null;
  return recipeCache.get(id) || null;
}

/**
 * Return all loaded recipes as an array. Order: built-in alphabetical,
 * then user alphabetical. (User-overrides keep their alphabetical
 * position from the built-in list.)
 *
 * @returns {import('./recipe-schema.js').Recipe[]}
 */
export function listRecipes() {
  if (!recipeCache) return [];
  return [...recipeCache.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Build a teacher-facing summary of a recipe (the bits the picker UI
 * needs — without the template, which can be large).
 *
 * @param {import('./recipe-schema.js').Recipe} recipe
 */
export function summarizeRecipe(recipe) {
  return {
    id: recipe.id,
    name: recipe.name,
    icon: recipe.icon || null,
    description: recipe.description,
    tagline: recipe.tagline || null,
    parameters: recipe.parameters
  };
}

// =======================================================================
// Directory scanning
// =======================================================================

async function loadDirectory(dir, ctx) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return []; // directory doesn't exist — fine
    console.warn(`[recipe-loader] Could not read ${dir}: ${err.message}`);
    return [];
  }

  const recipes = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const filePath = join(dir, entry);

    let isFile;
    try {
      isFile = (await stat(filePath)).isFile();
    } catch {
      continue;
    }
    if (!isFile) continue;

    const recipe = await loadRecipeFile(filePath, ctx);
    if (recipe) recipes.push(recipe);
  }
  return recipes;
}

async function loadRecipeFile(filePath, ctx) {
  let raw;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (err) {
    console.warn(`[recipe-loader] Could not read ${filePath}: ${err.message}`);
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(`[recipe-loader] ${filePath} is not valid JSON: ${err.message}`);
    return null;
  }

  const diags = validateRecipe(parsed);
  const errors = diags.filter(d => d.severity === 'error');
  if (errors.length > 0) {
    console.warn(
      `[recipe-loader] ${filePath} is invalid; skipping. Errors:\n  ` +
        errors.map(d => `${d.path || ''} ${d.message}`).join('\n  ')
    );
    return null;
  }

  parsed._source = ctx.source; // 'built-in' | 'user' — useful for the editor later
  return parsed;
}
