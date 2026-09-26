/**
 * Estimation Station is recipe-born: its phases must be EXACTLY what the
 * estimation-station recipe compiles from its own provenance stamp. If this
 * drifts (a hand edit to the config, a template change to the recipe),
 * the library's Customize knobs would silently rebuild something
 * different from what the teacher sees — keep them in lockstep.
 *
 * To change Estimation Station on purpose: edit the recipe template or the
 * stamped params, recompile, and save the compiled output.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { compileRecipe } from '../../engine/recipe-compiler.js';

const ROOT = new URL('../..', import.meta.url);

async function loadJson(rel) {
  return JSON.parse(await readFile(new URL(rel, ROOT), 'utf8'));
}

describe('estimation-station is a faithful estimation-station compile', () => {
  it('carries a estimation-station provenance stamp', async () => {
    const config = await loadJson('games/estimation-station/config.json');
    expect(config.recipe).toBeDefined();
    expect(config.recipe.id).toBe('estimation-station');
    expect(config.recipe.params.questions).toHaveLength(3);
  });

  it('stamp version matches the shipped recipe version', async () => {
    const config = await loadJson('games/estimation-station/config.json');
    const recipe = await loadJson('recipes/estimation-station.json');
    expect(config.recipe.version).toBe(recipe.version || '1');
  });

  it('phases deep-equal a fresh compile of the stamped params (no drift)', async () => {
    const config = await loadJson('games/estimation-station/config.json');
    const recipe = await loadJson('recipes/estimation-station.json');
    const { config: compiled, diagnostics } = compileRecipe(recipe, config.recipe.params);
    const errors = diagnostics.filter(d => d.severity === 'error');
    expect(errors).toEqual([]);
    expect(config.phases).toEqual(compiled.phases);
  });

  it('keeps its hand-authored card metadata', async () => {
    const config = await loadJson('games/estimation-station/config.json');
    expect(config.name).toBe('Estimation Station');
    expect(config.featured).toBe(false); // built for the yard, then left it the same night (owner 2026-09-25)
    for (const key of ['description', 'playTime', 'classSize', 'tags', 'recommendedFor', 'keywords']) {
      expect(config[key], key).toBeDefined();
    }
  });
});
