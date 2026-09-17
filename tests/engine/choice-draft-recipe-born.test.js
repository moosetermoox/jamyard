/**
 * Choice Draft is recipe-born (2026-09-16, owner: "students in teams pick
 * a first and second choice for one of four categories, each group
 * decides on its top choices, and then choices are assigned; we should
 * be able to do something like this for collective decision-making
 * fairly easily"): its phases must be EXACTLY what the choice-draft
 * recipe compiles from its provenance stamp, so the make page's knobs
 * (the choices, the question, who chooses, group size, how groups form)
 * rebuild what the teacher sees. To change it on purpose: edit the recipe
 * template or the stamped params, recompile, save the output.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { compileRecipe } from '../../engine/recipe-compiler.js';
import { validate } from '../../engine/game-loader.js';

const ROOT = new URL('../..', import.meta.url);
async function loadJson(rel) { return JSON.parse(await readFile(new URL(rel, ROOT), 'utf8')); }

describe('choice-draft is a faithful choice-draft compile', () => {
  it('carries the stamp, at the shipped recipe version, with the owner\'s four categories', async () => {
    const config = await loadJson('games/choice-draft/config.json');
    const recipe = await loadJson('recipes/choice-draft.json');
    expect(config.recipe.id).toBe('choice-draft');
    expect(config.recipe.version).toBe(recipe.version);
    expect(Object.keys(config.recipe.params).sort()).toEqual(['choices', 'groupCount', 'groupSize', 'groups', 'method', 'question']);
    expect(config.recipe.params.choices).toEqual(['Self and identity', 'Working with others', 'Thinking and problem solving', 'Execution and adaptation']);
    expect(config.recipe.params.groups).toBe('size');
    expect(config.featured).toBe(true);
  });

  it('phases deep-equal a fresh compile of the stamped params (no drift)', async () => {
    const config = await loadJson('games/choice-draft/config.json');
    const recipe = await loadJson('recipes/choice-draft.json');
    const { config: compiled, diagnostics } = compileRecipe(recipe, config.recipe.params);
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(config.phases).toEqual(compiled.phases);
    expect(validate(config, 'choice-draft', { returnResults: true }).errors).toEqual([]);
  });

  it('is the split → rank as groups → hand out chain, the wrap reading each student\'s own item', async () => {
    const config = await loadJson('games/choice-draft/config.json');
    const p = config.phases;
    expect(p['make-groups'].type).toBe('team-split');
    expect(p.pick).toMatchObject({ type: 'rank', teamsFrom: 'make-groups', next: 'draft' });
    expect(p.pick.candidates).toHaveLength(4);
    expect(p.draft).toMatchObject({ type: 'assign', from: 'pick', next: 'wrap' });
    expect(p.wrap.message).toContain('{{draft.mine}}');
  });

  it('every setting is a make-page knob: the choices one box each, the question a plank, who chooses three ways, the group rows behind it', async () => {
    const recipe = await loadJson('recipes/choice-draft.json');
    const p = recipe.parameters;
    expect(p.choices.setup).toEqual({ mode: 'list' });
    expect(p.choices.maxItems).toBe(8);
    expect(p.question.setup).toEqual({ mode: 'text' });
    expect(p.groups).toMatchObject({ type: 'enum', values: ['size', 'count', 'none'], default: 'size', setup: true });
    expect(Object.keys(p.groups.valueLabels)).toEqual(['size', 'count', 'none']);
    expect(Object.keys(p.groups.valueHelp)).toEqual(['size', 'count', 'none']);
    expect(p.groupSize.setup).toEqual({ showWhen: 'groups=size' });
    expect(p.groupCount.setup).toEqual({ showWhen: 'groups=count' });
    expect(p.method.setup).toEqual({ showWhen: 'groups=size|count' });
    expect(Object.keys(p.method.valueLabels)).toEqual(['random', 'choice', 'teacher']);
  });

  it('each student: no split, the intro goes straight to the rank, no groups on it, everyone gets their own item', async () => {
    const recipe = await loadJson('recipes/choice-draft.json');
    const shipped = await loadJson('games/choice-draft/config.json');
    const { config, diagnostics } = compileRecipe(recipe, { ...shipped.recipe.params, groups: 'none' });
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(config.phases['make-groups']).toBeUndefined();
    expect(config.phases.intro.next).toBe('pick');
    expect(config.phases.pick.teamsFrom).toBeUndefined();
    expect(config.phases.draft.message).toBe('Here is what everyone got.');
    expect(config.phases.wrap.message).toMatch(/^You got:/);
    expect(validate(config, 'choice-draft-solo', { returnResults: true }).errors).toEqual([]);
  });

  // 2026-09-17 (owner: "I have mostly groups of three but a couple groups
  // of four; students per group of three makes groups of two, four makes
  // too few groups"): the groups a class already has are a COUNT with no
  // spot caps, arranged by the teacher or joined by the students
  it('the groups we already have: a fixed count, no spot caps, uneven sizes welcome', async () => {
    const recipe = await loadJson('recipes/choice-draft.json');
    const shipped = await loadJson('games/choice-draft/config.json');
    for (const method of ['teacher', 'choice']) {
      const { config, diagnostics } = compileRecipe(recipe, { ...shipped.recipe.params, groups: 'count', groupCount: 7, method });
      expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(config.phases['make-groups']).toEqual({ type: 'team-split', method, teamCount: 7, capacity: 'open', next: 'pick' });
      expect(config.phases.pick.teamsFrom).toBe('make-groups');
      expect(validate(config, 'choice-draft-count', { returnResults: true }).errors).toEqual([]);
    }
  });

  it('a teacher\'s own choices and question land in the rank step', async () => {
    const recipe = await loadJson('recipes/choice-draft.json');
    const shipped = await loadJson('games/choice-draft/config.json');
    const { config } = compileRecipe(recipe, {
      ...shipped.recipe.params,
      choices: ['Chapter 1', 'Chapter 2', 'Chapter 3'],
      question: 'Which chapter will your group present?'
    });
    expect(config.phases.pick.candidates).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3']);
    expect(config.phases.pick.prompt).toMatch(/^Which chapter will your group present\?/);
  });
});
