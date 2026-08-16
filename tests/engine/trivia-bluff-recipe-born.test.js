/**
 * Trivia Bluff is recipe-born: its phases must be EXACTLY what the
 * trivia-bluff recipe compiles from its own provenance stamp (rounds=3,
 * the shipped shape; owner's call 2026-08-16). If this drifts, the library's
 * Customize knobs (round count, lie timer) would silently rebuild
 * something different from what the teacher sees.
 *
 * To change Trivia Bluff on purpose: edit the recipe template or the
 * stamped params, recompile, and save the compiled output.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { compileRecipe } from '../../engine/recipe-compiler.js';

const ROOT = new URL('../..', import.meta.url);

async function loadJson(rel) {
  return JSON.parse(await readFile(new URL(rel, ROOT), 'utf8'));
}

describe('trivia-bluff is a faithful trivia-bluff-recipe compile', () => {
  it('carries a trivia-bluff provenance stamp', async () => {
    const config = await loadJson('games/trivia-bluff/config.json');
    expect(config.recipe).toBeDefined();
    expect(config.recipe.id).toBe('trivia-bluff');
    expect(config.recipe.params.rounds).toBe(3);
  });

  it('stamp version matches the shipped recipe version', async () => {
    const config = await loadJson('games/trivia-bluff/config.json');
    const recipe = await loadJson('recipes/trivia-bluff.json');
    expect(config.recipe.version).toBe(recipe.version || '1');
  });

  it('phases deep-equal a fresh compile of the stamped params (no drift)', async () => {
    const config = await loadJson('games/trivia-bluff/config.json');
    const recipe = await loadJson('recipes/trivia-bluff.json');
    const { config: compiled, diagnostics } = compileRecipe(recipe, config.recipe.params);
    const errors = diagnostics.filter(d => d.severity === 'error');
    expect(errors).toEqual([]);
    expect(config.phases).toEqual(compiled.phases);
  });

  it('a multi-round compile chains rounds and sums every vote round', async () => {
    const recipe = await loadJson('recipes/trivia-bluff.json');
    const { config: compiled, diagnostics } = compileRecipe(recipe, { rounds: 3, lieTimer: 45 });
    expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(compiled.phases.reveal1.next).toBe('fact2');
    expect(compiled.phases.reveal3.next).toBe('scoreboard');
    expect(compiled.phases.vote2.excludeAuthored).toBe('lies2');
    expect(compiled.phases.scoreboard.from).toEqual([
      'vote1.scores', 'vote2.scores', 'vote3.scores'
    ]);
  });

  it('keeps its hand-authored card metadata', async () => {
    const config = await loadJson('games/trivia-bluff/config.json');
    expect(config.name).toBe('Trivia Bluff');
    for (const key of ['description', 'playTime', 'classSize', 'tags', 'recommendedFor']) {
      expect(config[key], key).toBeDefined();
    }
  });
});
