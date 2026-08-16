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
import { validate } from '../../engine/game-loader.js';

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

  it('prepared mode compiles the question list instead of live AI rounds', async () => {
    const recipe = await loadJson('recipes/trivia-bluff.json');
    const { config: compiled, diagnostics } = compileRecipe(recipe, {
      questionSource: 'prepared',
      questions: [
        { question: 'The mayor of Rabbit Hash, Kentucky is a ___.', truth: 'dog', houseLie: 'chicken' },
        { question: 'A group of flamingos is called a ___.', truth: 'flamboyance', houseLie: '' }
      ],
      lieTimer: 60
    });
    expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);

    // No live phases at all: no ai-process, nothing referencing fact results.
    expect(compiled.phases.fact1).toBeUndefined();
    expect(compiled.phases.vote1).toBeUndefined();
    expect(Object.values(compiled.phases).some(p => p.type === 'ai-process')).toBe(false);

    // The prepared chain: intro → qshow1 → qlies1 → qvote1 → qreveal1 → qshow2 …
    expect(compiled.phases.intro.next).toBe('qshow1');
    expect(compiled.phases.qshow1.message).toContain('The mayor of Rabbit Hash');
    expect(compiled.phases.qlies1.timer).toBe(60);
    expect(compiled.phases.qvote1.correctAnswer).toBe('dog');
    expect(compiled.phases.qvote1.choicePool).toEqual([
      { from: 'qlies1.responses', field: 'text' },
      { literal: 'dog' },
      { literal: 'chicken', optional: true }
    ]);
    expect(compiled.phases.qreveal1.next).toBe('qshow2');
    expect(compiled.phases.qreveal2.next).toBe('scoreboard');
    expect(compiled.phases.scoreboard.from).toEqual(['qvote1.scores', 'qvote2.scores']);

    // A fact without a decoy compiles to an empty optional literal, which
    // the vote phase skips at runtime.
    expect(compiled.phases.qvote2.choicePool[2]).toEqual({ literal: '', optional: true });

    // The compiled config passes full game validation.
    const result = validate(compiled, 'trivia-bluff-prepared-test', { returnResults: true });
    expect(result.errors).toEqual([]);
  });

  it('a Create-form item that omits the optional decoy still compiles', async () => {
    const recipe = await loadJson('recipes/trivia-bluff.json');
    const { config: compiled, diagnostics } = compileRecipe(recipe, {
      questionSource: 'prepared',
      questions: [{ question: 'Honey never ___.', truth: 'spoils' }]
    });
    expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(compiled.phases.qvote1.choicePool[2]).toEqual({ literal: '', optional: true });
  });

  it('the shipped stamp is live mode with an empty prepared list', async () => {
    const config = await loadJson('games/trivia-bluff/config.json');
    expect(config.recipe.params.questionSource).toBe('live');
    expect(config.recipe.params.questions).toEqual([]);
  });

  it('keeps its hand-authored card metadata', async () => {
    const config = await loadJson('games/trivia-bluff/config.json');
    expect(config.name).toBe('Trivia Bluff');
    for (const key of ['description', 'playTime', 'classSize', 'tags', 'recommendedFor']) {
      expect(config[key], key).toBeDefined();
    }
  });
});
