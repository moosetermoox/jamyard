/**
 * Exquisite Corpse is recipe-born: its phases must be EXACTLY what the
 * exquisite-corpse recipe compiles from its own provenance stamp. If
 * this drifts (a hand edit to the config, a template change to the
 * recipe), the library's Customize knobs would silently rebuild
 * something different from what the teacher sees — keep them in
 * lockstep.
 *
 * To change Exquisite Corpse on purpose: edit the recipe template or
 * the stamped params, recompile, and save the compiled output.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { compileRecipe } from '../../engine/recipe-compiler.js';

const ROOT = new URL('../..', import.meta.url);

async function loadJson(rel) {
  return JSON.parse(await readFile(new URL(rel, ROOT), 'utf8'));
}

describe('exquisite-corpse is a faithful recipe compile', () => {
  it('carries an exquisite-corpse provenance stamp', async () => {
    const config = await loadJson('games/exquisite-corpse/config.json');
    expect(config.recipe).toBeDefined();
    expect(config.recipe.id).toBe('exquisite-corpse');
  });

  it('stamp version matches the shipped recipe version', async () => {
    const config = await loadJson('games/exquisite-corpse/config.json');
    const recipe = await loadJson('recipes/exquisite-corpse.json');
    expect(config.recipe.version).toBe(recipe.version || '1');
  });

  it('phases deep-equal a fresh compile of the stamped params (no drift)', async () => {
    const config = await loadJson('games/exquisite-corpse/config.json');
    const recipe = await loadJson('recipes/exquisite-corpse.json');
    const { config: compiled, diagnostics } = compileRecipe(recipe, config.recipe.params);
    const errors = diagnostics.filter(d => d.severity === 'error');
    expect(errors).toEqual([]);
    expect(config.phases).toEqual(compiled.phases);
  });

  it('the fold is real: no word prompt ever shows the assigned item', async () => {
    const config = await loadJson('games/exquisite-corpse/config.json');
    for (const [id, phase] of Object.entries(config.phases)) {
      if (phase.type !== 'collect') continue;
      expect(phase.prompt, id).not.toMatch(/\.assigned/);
      expect(phase.prefillFromAssigned, id).toBeUndefined();
      expect(phase.appendOnly, id).toBeUndefined();
    }
  });

  it('the chain reveal assembles the classic six-slot sentence', async () => {
    const config = await loadJson('games/exquisite-corpse/config.json');
    const poem = config.phases.poem;
    expect(poem.scope).toBe('own');
    expect(poem.chainFrom).toEqual(['word-1', 'word-2', 'word-3', 'word-4', 'word-5', 'word-6']);
    expect(poem.chainDisplay).toBe('template');
    expect(poem.chainTemplate).toMatch(/\{1\}.*\{6\}/);
    // Payoff beat is host-paced, never timed.
    expect(poem.timer).toBeUndefined();
  });

  it('keeps its hand-authored card metadata', async () => {
    const config = await loadJson('games/exquisite-corpse/config.json');
    expect(config.name).toBe('Exquisite Corpse');
    for (const key of ['description', 'playTime', 'classSize', 'tags', 'recommendedFor', 'keywords']) {
      expect(config[key], key).toBeDefined();
    }
  });
});
