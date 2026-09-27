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
    expect(config.recipe.params.questions).toHaveLength(3);
    expect(config.recipe.params.lieTimer).toBe(45);
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

  it('the default facts chain three rounds and sum every vote round, with no AI step anywhere', async () => {
    const recipe = await loadJson('recipes/trivia-bluff.json');
    const { config: compiled, diagnostics } = compileRecipe(recipe, { lieTimer: 45 });
    expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(compiled.phases.qreveal1.next).toBe('qshow2');
    expect(compiled.phases.qreveal3.next).toBe('scoreboard');
    expect(compiled.phases.qvote2.excludeAuthored).toBe('qlies2');
    expect(compiled.phases.scoreboard.from).toEqual([
      'qvote1.scores', 'qvote2.scores', 'qvote3.scores'
    ]);
    expect(Object.values(compiled.phases).some(p => p.type === 'ai-process')).toBe(false);
  });

  it('a copy saved under version 1 with the AI live mode gets the written facts on read', async () => {
    const recipe = await loadJson('recipes/trivia-bluff.json');
    expect(recipe.version).toBe('2');
    expect(recipe.replaceOnRead).toEqual(['1']);
    const { upgradeStaleCopy } = await import('../../engine/recipe-upgrade.js');
    const copy = { name: 'Bluff (my version)', phases: { lobby: { type: 'lobby', next: 'fact1' } }, recipe: { id: 'trivia-bluff', version: '1', params: { questionSource: 'live', rounds: 4, lieTimer: 60 } } };
    expect(upgradeStaleCopy(copy, recipe, compileRecipe)).toBe('1');
    expect(copy.recipe.version).toBe('2');
    expect(copy.phases.qlies1.timer).toBe(60);
    expect(Object.values(copy.phases).some(p => p.type === 'ai-process')).toBe(false);
  });

  it('the teacher\'s own question list compiles one round per fact', async () => {
    const recipe = await loadJson('recipes/trivia-bluff.json');
    const { config: compiled, diagnostics } = compileRecipe(recipe, {
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
      questions: [{ question: 'Honey never ___.', truth: 'spoils' }]
    });
    expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(compiled.phases.qvote1.choicePool[2]).toEqual({ literal: '', optional: true });
  });

  it('the shipped stamp is three checked facts, found and rated by the owner (2026-09-27), never the AI\'s memory', async () => {
    const config = await loadJson('games/trivia-bluff/config.json');
    expect(config.recipe.params.questionSource).toBeUndefined();
    expect(config.recipe.params.questions.map(q => q.truth)).toEqual(['marrying', 'sausage flies', 'wallpaper']);
    for (const q of config.recipe.params.questions) {
      expect(q.question).toContain('___');
      expect(q.question.toLowerCase()).not.toContain(q.truth.toLowerCase());
      expect(/\d{4}|\b(Augustus|driver ant|Heinrich)\b/.test(q.question), q.question).toBe(true); // context to check it
    }
    // eight sample lies per round for Try it out, none the truth
    for (const [i, q] of config.recipe.params.questions.entries()) {
      const lies = config.sampleAnswers['qlies' + (i + 1)];
      expect(lies).toHaveLength(8);
      expect(lies.map(l => l.toLowerCase())).not.toContain(q.truth.toLowerCase());
    }
  });

  it('keeps its hand-authored card metadata', async () => {
    const config = await loadJson('games/trivia-bluff/config.json');
    expect(config.name).toBe('Trivia Bluff');
    for (const key of ['description', 'playTime', 'classSize', 'tags', 'recommendedFor']) {
      expect(config[key], key).toBeDefined();
    }
  });
});
