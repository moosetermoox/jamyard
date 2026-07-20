/**
 * Tests for the R6 additions to engine/recipe-loader.js:
 *   - Compatibility check sets _broken when a recipe template doesn't
 *     compile + validate against the current PHASE_SCHEMAS.
 *   - summarizeRecipe surfaces source/broken/brokenReason for the picker.
 *
 * The full end-to-end (filesystem scan + cache busting + endpoint
 * behavior) is verified by recipes-integration.test.js and the manual
 * smoke tests against the live server.
 */

import { describe, it, expect } from 'vitest';
import { loadAllRecipes, summarizeRecipe, getRecipe } from '../../engine/recipe-loader.js';

// A minimal recipe that compiles + validates against current schemas —
// the shape a DB row's `recipe` column carries.
function validDbRecipe(id) {
  return {
    id,
    name: 'DB Recipe ' + id,
    description: 'A recipe loaded from the durable store.',
    version: '1',
    parameters: {},
    template: {
      name: 'DB Game',
      phases: {
        lobby: { type: 'lobby', next: 'ask' },
        ask: { type: 'collect', prompt: 'Say something nice.', next: 'end' },
        end: { type: 'end', message: 'Done.' }
      }
    }
  };
}

describe('loadAllRecipes with injected user recipes (the Neon-durability path)', () => {
  it('validates, marks, and caches DB-sourced recipes like files', async () => {
    const cache = await loadAllRecipes({ force: true, userRecipes: [validDbRecipe('db-test-recipe')] });
    const loaded = cache.get('db-test-recipe');
    expect(loaded).toBeTruthy();
    expect(loaded._source).toBe('user');
    expect(loaded._broken).toBeFalsy();
    expect(getRecipe('db-test-recipe')).toBe(loaded);
  });

  it('skips a DB recipe with an unrecoverable shape instead of crashing', async () => {
    const cache = await loadAllRecipes({ force: true, userRecipes: [{ id: 'junk' }] });
    expect(cache.get('junk')).toBeUndefined();
  });

  it('marks a schema-drifted DB recipe as broken but still lists it', async () => {
    const drifted = validDbRecipe('db-drifted');
    drifted.template.phases.ask.type = 'frobnicate';
    const cache = await loadAllRecipes({ force: true, userRecipes: [drifted] });
    const loaded = cache.get('db-drifted');
    expect(loaded).toBeTruthy();
    expect(loaded._broken).toBe(true);
  });

  it('DB copy wins over a same-id filesystem recipe', async () => {
    // 'class-poll' is a built-in file recipe; a user DB copy overrides it,
    // same as a recipes/user/ file always could.
    const override = validDbRecipe('class-poll');
    const cache = await loadAllRecipes({ force: true, userRecipes: [override] });
    expect(cache.get('class-poll')._source).toBe('user');
    // Clean the cache for other test files
    await loadAllRecipes({ force: true });
  });
});

describe('summarizeRecipe', () => {
  it('exposes source/broken/brokenReason', () => {
    const recipe = {
      id: 'x',
      name: 'X',
      description: 'X',
      icon: '🎯',
      tagline: 'tag',
      parameters: {},
      template: { phases: {} },
      _source: 'user',
      _broken: true,
      _brokenReason: 'phase type "frobnicate" no longer exists'
    };
    const summary = summarizeRecipe(recipe);
    expect(summary.source).toBe('user');
    expect(summary.broken).toBe(true);
    expect(summary.brokenReason).toBe('phase type "frobnicate" no longer exists');
  });

  it('defaults to non-broken when flags are absent', () => {
    const recipe = {
      id: 'x', name: 'X', description: 'X',
      parameters: {}, template: { phases: {} }
    };
    const summary = summarizeRecipe(recipe);
    expect(summary.broken).toBe(false);
    expect(summary.brokenReason).toBeNull();
    expect(summary.source).toBeNull();
  });

  it('preserves the recipe payload teachers need (parameters, name, etc.)', () => {
    const recipe = {
      id: 'r', name: 'R',
      icon: '✨',
      description: 'desc',
      tagline: 'tg',
      parameters: { q: { type: 'string' } },
      template: { phases: {} }
    };
    const s = summarizeRecipe(recipe);
    expect(s.id).toBe('r');
    expect(s.name).toBe('R');
    expect(s.icon).toBe('✨');
    expect(s.description).toBe('desc');
    expect(s.tagline).toBe('tg');
    expect(s.parameters).toEqual({ q: { type: 'string' } });
  });
});
