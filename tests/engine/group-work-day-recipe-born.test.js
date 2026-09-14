/**
 * Group Work Day is recipe-born (2026-09-13, owner: "the Make It Yours
 * for group work day needs a lot of help, it's not functional as is"):
 * its phases must be EXACTLY what the group-work-day recipe compiles
 * from its provenance stamp, so the make page's knobs (students per
 * group, how groups form, the jobs, how jobs are given, the tasks)
 * rebuild what the teacher sees. To change it on purpose: edit the
 * recipe template or the stamped params, recompile, save the output.
 *
 * Tasks are plain lines; a line that starts with a job and a colon
 * ("Recorder: write it down") is that job's task, tagged by the engine
 * at game time (engine/phases/checklist-state.js).
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { compileRecipe } from '../../engine/recipe-compiler.js';
import { validate } from '../../engine/game-loader.js';
import { normalizeChecklistItemsWithRoles } from '../../engine/phases/checklist-state.js';

const ROOT = new URL('../..', import.meta.url);
async function loadJson(rel) { return JSON.parse(await readFile(new URL(rel, ROOT), 'utf8')); }

describe('group-work-day is a faithful group-work-day compile', () => {
  it('carries the stamp, at the shipped recipe version', async () => {
    const config = await loadJson('games/group-work-day/config.json');
    const recipe = await loadJson('recipes/group-work-day.json');
    expect(config.recipe.id).toBe('group-work-day');
    expect(config.recipe.version).toBe(recipe.version);
    expect(Object.keys(config.recipe.params).sort()).toEqual(['groupSize', 'method', 'roleMethod', 'roles', 'tasks']);
  });

  it('phases deep-equal a fresh compile of the stamped params (no drift)', async () => {
    const config = await loadJson('games/group-work-day/config.json');
    const recipe = await loadJson('recipes/group-work-day.json');
    const { config: compiled, diagnostics } = compileRecipe(recipe, config.recipe.params);
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(config.phases).toEqual(compiled.phases);
    expect(validate(config, 'group-work-day', { returnResults: true }).errors).toEqual([]);
  });

  it('every setting the owner asked for is a make-page knob, the enums with a line per answer', async () => {
    const recipe = await loadJson('recipes/group-work-day.json');
    const p = recipe.parameters;
    expect(p.groupSize.setup).toBe(true);
    expect(p.method.setup).toBe(true);
    expect(Object.keys(p.method.valueHelp)).toEqual(['random', 'choice', 'teacher']);
    expect(p.roles.setup).toEqual({ mode: 'lines' });
    expect(p.roleMethod.setup).toBe(true);
    expect(Object.keys(p.roleMethod.valueHelp)).toEqual(['choice', 'random']);
    expect(p.tasks.setup).toEqual({ mode: 'lines' });
    expect(p.tasks.default).toHaveLength(8);
  });

  it('a teacher\'s own jobs and tasks land on the split, the roles step, and the checklist', async () => {
    const recipe = await loadJson('recipes/group-work-day.json');
    const { config } = compileRecipe(recipe, {
      groupSize: 4, method: 'choice', roles: ['Captain', 'Scribe'], roleMethod: 'random',
      tasks: ['Read the lab sheet', 'Scribe: write the hypothesis', 'Clean up']
    });
    expect(config.phases['make-groups']).toMatchObject({ type: 'team-split', method: 'choice', groupSize: 4 });
    expect(config.phases['pick-roles']).toMatchObject({ roles: ['Captain', 'Scribe'], method: 'random' });
    expect(config.phases.worktime.items).toEqual(['Read the lab sheet', 'Scribe: write the hypothesis', 'Clean up']);
    expect(validate(config, 'gwd-custom', { returnResults: true }).errors).toEqual([]);
  });
});

describe('a task that starts with a job and a colon is that job\'s task', () => {
  it('tags by prefix against the known jobs, case-insensitively, and leaves other colons alone', () => {
    const out = normalizeChecklistItemsWithRoles([
      'Introduce yourselves',
      'Recorder: write the three things down',
      'recorder: a second one, lower case',
      'Final check: everyone spoke twice',
      { text: 'Timekeeper: already an object', role: 'Timekeeper' }
    ], ['Facilitator', 'Recorder', 'Timekeeper']);
    expect(out.texts).toEqual([
      'Introduce yourselves',
      'Recorder: write the three things down',
      'recorder: a second one, lower case',
      'Final check: everyone spoke twice',
      'Timekeeper: already an object'
    ]);
    expect(out.roles).toEqual([null, 'Recorder', 'Recorder', null, 'Timekeeper']);
  });

  it('without a jobs list nothing is tagged (a plain checklist stays plain)', () => {
    const out = normalizeChecklistItemsWithRoles(['Recorder: write it down']);
    expect(out.roles).toEqual([null]);
  });
});
