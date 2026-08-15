/**
 * Speed Quiz is recipe-born: its phases must be EXACTLY what the
 * quiz-show recipe compiles from its own provenance stamp. If this
 * drifts (a hand edit to the config, a template change to the recipe),
 * the library's Customize knobs would silently rebuild something
 * different from what the teacher sees — keep them in lockstep.
 *
 * To change Speed Quiz on purpose: edit the recipe template or the
 * stamped params, recompile, and save the compiled output.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { compileRecipe } from '../../engine/recipe-compiler.js';

const ROOT = new URL('../..', import.meta.url);

async function loadJson(rel) {
  return JSON.parse(await readFile(new URL(rel, ROOT), 'utf8'));
}

describe('speed-quiz is a faithful quiz-show compile', () => {
  it('carries a quiz-show provenance stamp', async () => {
    const config = await loadJson('games/speed-quiz/config.json');
    expect(config.recipe).toBeDefined();
    expect(config.recipe.id).toBe('quiz-show');
    expect(config.recipe.params.questions).toHaveLength(5);
  });

  it('stamp version matches the shipped recipe version', async () => {
    const config = await loadJson('games/speed-quiz/config.json');
    const recipe = await loadJson('recipes/quiz-show.json');
    expect(config.recipe.version).toBe(recipe.version || '1');
  });

  it('phases deep-equal a fresh compile of the stamped params (no drift)', async () => {
    const config = await loadJson('games/speed-quiz/config.json');
    const recipe = await loadJson('recipes/quiz-show.json');
    const { config: compiled, diagnostics } = compileRecipe(recipe, config.recipe.params);
    const errors = diagnostics.filter(d => d.severity === 'error');
    expect(errors).toEqual([]);
    expect(config.phases).toEqual(compiled.phases);
  });

  it('keeps its hand-authored card metadata', async () => {
    const config = await loadJson('games/speed-quiz/config.json');
    expect(config.name).toBe('Speed Quiz');
    expect(config.featured).toBe(true);
    for (const key of ['description', 'playTime', 'classSize', 'tags', 'recommendedFor', 'keywords']) {
      expect(config[key], key).toBeDefined();
    }
  });
});
