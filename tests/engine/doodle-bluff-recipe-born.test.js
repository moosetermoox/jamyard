/**
 * Doodle Bluff is recipe-born (since 2026-09-06): its phases must be
 * EXACTLY what the doodle-bluff recipe compiles from its own provenance
 * stamp, so the yard's Make-it-yours knobs (who writes the phrases) rebuild
 * the same activity the teacher saw. To change it on purpose: edit the
 * recipe or the stamped params, recompile, save the output.
 *
 * The recipe carries two shapes of the same game: students write the
 * phrases (rotated, writer AND drawer sit their round out) or the teacher
 * brings the list (dealt, only the drawer sits out).
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { compileRecipe } from '../../engine/recipe-compiler.js';
import { validate } from '../../engine/game-loader.js';

const ROOT = new URL('../..', import.meta.url);
const loadJson = async (rel) => JSON.parse(await readFile(new URL(rel, ROOT), 'utf8'));

describe('doodle-bluff is a faithful doodle-bluff compile', () => {
  it('carries a stamp at the shipped recipe version, students mode', async () => {
    const config = await loadJson('games/doodle-bluff/config.json');
    const recipe = await loadJson('recipes/doodle-bluff.json');
    expect(config.recipe.id).toBe('doodle-bluff');
    expect(config.recipe.version).toBe(recipe.version);
    expect(config.recipe.params.phraseSource).toBe('students');
  });

  it('phases deep-equal a fresh compile of the stamped params (no drift)', async () => {
    const config = await loadJson('games/doodle-bluff/config.json');
    const recipe = await loadJson('recipes/doodle-bluff.json');
    const { config: compiled, diagnostics } = compileRecipe(recipe, config.recipe.params);
    expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(config.phases).toEqual(compiled.phases);
  });
});

describe('the two phrase sources', () => {
  it('students: phrases are collected and rotated, the writer is named in the reveal', async () => {
    const recipe = await loadJson('recipes/doodle-bluff.json');
    const { config } = compileRecipe(recipe, { phraseSource: 'students' });
    expect(config.phases.phrases.type).toBe('collect');
    expect(config.phases.draw.rotateFrom).toBe('phrases');
    expect(config.phases.draw.dealItems).toBeUndefined();
    expect(config.phases.rounds.subPhases['reveal-truth'].message).toContain('{{_current.assignedFromName}}');
    expect(validate(config, 'db-students', { returnResults: true }).errors).toEqual([]);
  });

  it('teacher: the list is dealt, no phrases step, only the drawer is named', async () => {
    const recipe = await loadJson('recipes/doodle-bluff.json');
    const { config } = compileRecipe(recipe, { phraseSource: 'teacher' });
    expect(config.phases.phrases).toBeUndefined();
    expect(config.phases.intro.next).toBe('draw');
    expect(config.phases.draw.rotateFrom).toBeUndefined();
    expect(config.phases.draw.dealItems.length).toBeGreaterThan(10);
    expect(config.phases.draw.prompt).toContain('{{draw.assigned}}');
    expect(config.phases.rounds.subPhases['reveal-truth'].message).not.toContain('assignedFromName');
    expect(validate(config, 'db-teacher', { returnResults: true }).errors).toEqual([]);
  });

  it('ai: the AI writes one phrase per student, rotated like the students\' own, nobody but the drawer named', async () => {
    const recipe = await loadJson('recipes/doodle-bluff.json');
    const { config } = compileRecipe(recipe, { phraseSource: 'ai', aiTopic: 'the water cycle' });
    expect(config.phases.phrases).toBeUndefined();
    expect(config.phases.intro.next).toBe('ai-phrases');
    expect(config.phases['ai-phrases'].type).toBe('ai-process');
    expect(config.phases['ai-phrases'].perPlayer).toBe(true);
    expect(config.phases['ai-phrases'].instruction).toContain('the water cycle');
    expect(config.phases.draw.rotateFrom).toBe('ai-phrases');
    expect(config.phases.draw.prompt).toContain('{{ai-phrases.assigned}}');
    expect(config.phases.rounds.subPhases['reveal-truth'].message).not.toContain('assignedFromName');
    expect(validate(config, 'db-ai', { returnResults: true }).errors).toEqual([]);
  });

  it('the phrase list and the AI topic are Make-it-yours knobs that hide behind the source knob', async () => {
    const recipe = await loadJson('recipes/doodle-bluff.json');
    expect(recipe.parameters.phraseSource.values).toEqual(['students', 'teacher', 'ai']);
    expect(recipe.parameters.phrases.setup).toEqual({ mode: 'lines', showWhen: 'phraseSource=teacher' });
    expect(recipe.parameters.aiTopic.setup).toEqual({ mode: 'text', showWhen: 'phraseSource=ai' });
  });

  it('a teacher list of their own replaces the default', async () => {
    const recipe = await loadJson('recipes/doodle-bluff.json');
    const { config } = compileRecipe(recipe, { phraseSource: 'teacher', phrases: ['mitosis', 'the water cycle', 'photosynthesis'] });
    expect(config.phases.draw.dealItems).toEqual(['mitosis', 'the water cycle', 'photosynthesis']);
  });
});
