/**
 * The roles brick (storyboard probe, 2026-09-20): "groups of four, each
 * member gets a job, then a shared to-do list" compiled to teams > rank
 * byGroup > assign, a BROKEN lookalike that validated clean: a hand-out
 * gives one item per GROUP, so every group got one Facilitator while the
 * announce promised a job per member. The engine has team-roles (a job
 * per member, random or by choice) and checklist (a shared list, role-
 * tagged items). The brick compiles both from the AI's words:
 *   { brick: 'roles', roles: [...], method?: 'random'|'choice',
 *     tasks?: string[], text?: the checklist instruction }
 */

import { describe, it, expect } from 'vitest';
import '../../screens/shared/step-suggestions.js';
import { validate } from '../../engine/game-loader.js';
import { STORYBOARD_BRICKS, validateSuggestions } from '../../engine/suggest-validate.js';
import { AIService } from '../../services/ai-service.js';

const S = globalThis.StepSuggestions;

function hostable(config, label) {
  const result = validate(
    { name: 'Roles test', description: 'roles brick test', phases: config.phases },
    'roles-test', { returnResults: true }
  );
  const errors = result.errors.map(e => (typeof e === 'string' ? e : e.message));
  expect(errors, `${label} should be hostable as-is`).toEqual([]);
}

function ordered(config) {
  const out = [];
  let id = 'lobby';
  const seen = new Set();
  while (id && config.phases[id] && !seen.has(id)) {
    seen.add(id);
    out.push([id, config.phases[id]]);
    id = config.phases[id].next;
  }
  return out;
}

const JOBS = ['Facilitator', 'Recorder', 'Timekeeper', 'Reporter'];

describe('roles brick', () => {
  it('after a teams step: a job per member, then a shared checklist tagged by job; hostable as-is', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'Lab Day', description: 'jobs and a list',
      steps: [
        { brick: 'announce', text: 'Groups of four, a job each, then the lab list.' },
        { brick: 'teams', groupSize: 4 },
        { brick: 'roles', roles: JOBS, method: 'choice', text: 'Work through the lab together.', tasks: ['Set up the station', 'Recorder: write down each reading', 'Timekeeper: call the halfway mark', 'Clean up'] },
        { brick: 'end', text: 'Bye' }
      ]
    });
    expect(problems).toEqual([]);
    hostable(config, 'lab day');
    const steps = ordered(config);
    expect(steps.map(([, p]) => p.type)).toEqual(['lobby', 'announce', 'team-split', 'team-roles', 'checklist', 'end']);
    const [teamsId] = steps[2];
    const [rolesId, roles] = steps[3];
    expect(roles.teamsFrom).toBe(teamsId);
    expect(roles.roles).toEqual(JOBS);
    expect(roles.method).toBe('choice');
    const [, list] = steps[4];
    expect(list.teamsFrom).toBe(teamsId);
    expect(list.rolesFrom).toBe(rolesId);
    expect(list.items).toEqual(['Set up the station', 'Recorder: write down each reading', 'Timekeeper: call the halfway mark', 'Clean up']);
    expect(list.prompt).toBe('Work through the lab together.');
  });

  it('with no tasks it is the roles step alone, random by default', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'X', description: 'y',
      steps: [{ brick: 'teams', teamCount: 3 }, { brick: 'roles', roles: ['Reader', 'Writer'] }, { brick: 'end', text: 'Bye' }]
    });
    expect(problems).toEqual([]);
    hostable(config, 'roles alone');
    const types = ordered(config).map(([, p]) => p.type);
    expect(types).toEqual(['lobby', 'team-split', 'team-roles', 'end']);
    expect(ordered(config)[2][1].method).toBe('random');
  });

  it('a pairs step counts as the groups', () => {
    const { config, problems } = S.compileStoryboard({
      name: 'X', description: 'y',
      steps: [
        { brick: 'pairs', text: 'Interview your partner about their weekend.' },
        { brick: 'roles', roles: ['Interviewer', 'Note taker'] },
        { brick: 'end', text: 'Bye' }
      ]
    });
    expect(problems).toEqual([]);
    hostable(config, 'pairs then roles');
    const steps = ordered(config);
    const rolesStep = steps.find(([, p]) => p.type === 'team-roles')[1];
    expect(config.phases[rolesStep.teamsFrom].assign).toBe('pairwise');
  });

  it('needs groups before it and two to eight roles', () => {
    const noTeams = S.compileStoryboard({
      name: 'X', description: 'y',
      steps: [{ brick: 'roles', roles: JOBS }, { brick: 'end', text: 'Bye' }]
    });
    expect(noTeams.problems.join(' ')).toMatch(/teams step/);
    expect(Object.values(noTeams.config.phases).some(p => p.type === 'team-roles')).toBe(false);

    const one = S.compileStoryboard({
      name: 'X', description: 'y',
      steps: [{ brick: 'teams', groupSize: 3 }, { brick: 'roles', roles: ['Only'] }, { brick: 'end', text: 'Bye' }]
    });
    expect(one.problems.join(' ')).toMatch(/roles/);

    const many = S.compileStoryboard({
      name: 'X', description: 'y',
      steps: [{ brick: 'teams', groupSize: 3 }, { brick: 'roles', roles: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] }, { brick: 'end', text: 'Bye' }]
    });
    expect(many.problems.join(' ')).toMatch(/8/);
    hostable(many.config, 'capped roles');
    expect(ordered(many.config)[2][1].roles).toHaveLength(8);
  });
});

describe('roles brick through the concierge', () => {
  it('is a known brick and its fields ride through trimmed', () => {
    expect(STORYBOARD_BRICKS).toContain('roles');
    const { suggestions } = validateSuggestions([{
      kind: 'storyboard',
      storyboard: { name: 'R', description: 'r', steps: [
        { brick: 'teams', groupSize: 4 },
        { brick: 'roles', roles: [...JOBS, 5], method: 'choice', tasks: ['a', 7, 'b'], text: 'Go.' },
        { brick: 'end', text: 'Bye' }
      ] }
    }], { gameIds: [], recipes: {} });
    const step = suggestions[0].storyboard.steps[1];
    expect(step.roles).toEqual(JOBS);
    expect(step.method).toBe('choice');
    expect(step.tasks).toEqual(['a', 'b']);
    expect(step.text).toBe('Go.');
  });
});

describe('the storyboard prompt knows the roles brick', () => {
  it('describes roles and forbids rank + assign for member jobs', async () => {
    const service = new AIService({ mode: 'real' });
    let prompt = '';
    service._callClaude = async (params) => {
      prompt = params.messages[0].content;
      return { content: [{ type: 'text', text: JSON.stringify({ name: 'X', description: 'y', steps: [{ brick: 'end', text: 'Bye' }] }) }] };
    };
    await service.generateStoryboard('groups with jobs');
    expect(prompt).toContain('- roles:');
    expect(prompt).toMatch(/never rank .*assign/i);
  });
});
