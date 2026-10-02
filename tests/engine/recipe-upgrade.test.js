/**
 * A saved copy whose recipe moved on for a reason that matters gets the
 * new recipe's steps on read (engine/recipe-upgrade.js, 2026-09-26): an
 * outside reviewer re-ran an Anonymous Feedback copy saved under recipe
 * version 1 and the teacher's summary ("what you could try") went up on
 * the projector, a round after version 2 had put it behind a teacher
 * review. The recipe opts in with `replaceOnRead`; the copy keeps its own
 * name, description, and settings, and the stamp's params rebuild the steps.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadAllRecipes, getRecipe } from '../../engine/recipe-loader.js';
import { compileRecipe } from '../../engine/recipe-compiler.js';
import { upgradeStaleCopy, staleVersion } from '../../engine/recipe-upgrade.js';
import { validateRecipe } from '../../engine/recipe-schema.js';

// The shape a version-1 copy had: the summary written for the teacher,
// shown to the class under a "Feedback Summary" heading with the question
// in italics
function v1Copy(params = { question: 'How is class going for you?', timer: 90 }) {
  return {
    name: 'Feedback: my unit',
    description: 'An anonymous feedback collection built with the Anonymous Feedback recipe.',
    anonymous: true,
    earlyJoke: false,
    sampleAnswers: { ask: ['More examples please', 'Slow down a little', 'Group work helps'] },
    phases: {
      lobby: { type: 'lobby', next: 'intro' },
      intro: { type: 'announce', message: 'Your responses are anonymous.', timer: 6, next: 'ask' },
      ask: { type: 'collect', prompt: params.question, timer: params.timer, from: 'all', next: 'process' },
      process: { type: 'ai-process', task: 'summarize', instruction: 'Summarize. Highlight any actionable patterns the teacher could use.', input: 'ask.responses', next: 'results' },
      results: { type: 'reveal', template: `## Feedback Summary\n\n*${params.question}*\n\n{{process.result}}`, next: 'end' },
      end: { type: 'end', message: 'Thanks.' }
    },
    recipe: { id: 'anonymous-feedback', version: '1', params }
  };
}

describe('recipe upgrade on read', () => {
  beforeAll(async () => { await loadAllRecipes(); });

  it('Anonymous Feedback names version 1 as a version to replace, and the schema accepts the flag', () => {
    const recipe = getRecipe('anonymous-feedback');
    expect(recipe.version).toBe('3');
    expect(recipe.replaceOnRead).toEqual(['1', '2']);
    expect(validateRecipe(recipe).filter((d) => d.severity === 'error')).toEqual([]);
    const bad = { ...recipe, replaceOnRead: [1] };
    expect(validateRecipe(bad).some((d) => d.field === 'replaceOnRead')).toBe(true);
  });

  it('a version-1 copy gets version 2 steps: the teacher summary behind a review, a class version without advice', () => {
    const recipe = getRecipe('anonymous-feedback');
    const copy = v1Copy();
    expect(staleVersion(copy, recipe)).toBe('1');
    expect(upgradeStaleCopy(copy, recipe, compileRecipe)).toBe('1');
    const fresh = compileRecipe(recipe, { question: 'How is class going for you?', timer: 90 }).config;
    expect(copy.phases).toEqual(fresh.phases);
    expect(copy.recipe.version).toBe('3');
    expect(copy.phases['teacher-view'].type).toBe('preview');
    expect(copy.phases['teacher-view'].showResponses).toBe(false);
    expect(copy.phases['for-class'].instruction).toContain('No advice to the teacher');
    expect(JSON.stringify(copy.phases)).not.toContain('Feedback Summary');
    expect(copy.phases.results.template).not.toContain('*How');
    // the question the teacher typed still drives the steps
    expect(copy.phases.ask.prompt).toBe('How is class going for you?');
    expect(copy.phases.ask.timer).toBe(90);
  });

  it('the copy keeps its own name, description, and settings', () => {
    const recipe = getRecipe('anonymous-feedback');
    const copy = v1Copy();
    upgradeStaleCopy(copy, recipe, compileRecipe);
    expect(copy.name).toBe('Feedback: my unit');
    expect(copy.description).toBe('An anonymous feedback collection built with the Anonymous Feedback recipe.');
    expect(copy.anonymous).toBe(true);
    expect(copy.earlyJoke).toBe(false);
    expect(copy.sampleAnswers).toEqual({ ask: ['More examples please', 'Slow down a little', 'Group work helps'] });
  });

  it('a copy on the current version, a recipe without the flag, and a version not listed are left alone', () => {
    const recipe = getRecipe('anonymous-feedback');
    const current = v1Copy();
    current.recipe.version = '3';
    const before = JSON.stringify(current);
    expect(upgradeStaleCopy(current, recipe, compileRecipe)).toBe(null);
    expect(JSON.stringify(current)).toBe(before);

    const noFlag = { ...recipe, replaceOnRead: undefined };
    const c2 = v1Copy();
    expect(upgradeStaleCopy(c2, noFlag, compileRecipe)).toBe(null);
    expect(c2.phases.results.template).toContain('Feedback Summary');

    const c3 = v1Copy();
    c3.recipe.version = '0';
    expect(upgradeStaleCopy(c3, recipe, compileRecipe)).toBe(null);
  });

  it('a stamp that no longer compiles leaves the copy as it was', () => {
    const recipe = getRecipe('anonymous-feedback');
    const copy = v1Copy({ question: 'x', timer: 90 }); // too short for the recipe
    const before = JSON.stringify(copy);
    expect(upgradeStaleCopy(copy, recipe, compileRecipe)).toBe(null);
    expect(JSON.stringify(copy)).toBe(before);
  });

  it('the server repairs saved rows through it', async () => {
    const { readFile } = await import('node:fs/promises');
    const server = await readFile(new URL('../../server.js', import.meta.url), 'utf8');
    expect(server).toContain("import { upgradeStaleCopy } from './engine/recipe-upgrade.js';");
    expect(server).toContain('const replaced = upgradeStaleCopy(config, recipe, compileRecipe);');
  });
});
