/**
 * Validator rules for the team-roles phase and the checklist's rolesFrom:
 * groups must come from a real team source, roles must be a real list,
 * and role-tagged checklist items pass the item check.
 */

import { describe, it, expect } from 'vitest';
import { validate } from '../../engine/game-loader.js';

const base = (overrides = {}) => ({
  name: 'Roles Test',
  phases: {
    lobby: { type: 'lobby', next: 'split' },
    split: { type: 'team-split', method: 'random', groupSize: 3, next: 'roles' },
    roles: { type: 'team-roles', teamsFrom: 'split', roles: ['Facilitator', 'Recorder'], method: 'choice', next: 'work' },
    work: { type: 'checklist', items: ['Plan', { text: 'Write notes', role: 'Recorder' }], teamsFrom: 'split', rolesFrom: 'roles', next: 'end' },
    end: { type: 'end' },
    ...overrides
  }
});

describe('team-roles validation', () => {
  it('accepts the split → roles → role-tagged checklist chain', () => {
    expect(() => validate(base(), 'roles-ok')).not.toThrow();
  });

  it('rejects teamsFrom pointing nowhere', () => {
    const cfg = base({
      roles: { type: 'team-roles', teamsFrom: 'ghost', roles: ['A', 'B'], next: 'work' }
    });
    expect(() => validate(cfg, 'roles-ghost')).toThrow(/doesn't exist/);
  });

  it('rejects teamsFrom pointing at a non-team step', () => {
    const cfg = base({
      split: { type: 'announce', message: 'hi', next: 'roles' },
      roles: { type: 'team-roles', teamsFrom: 'split', roles: ['A', 'B'], next: 'work' },
      work: { type: 'checklist', items: ['Plan'], rolesFrom: 'roles', next: 'end' }
    });
    expect(() => validate(cfg, 'roles-wrong-src')).toThrow(/Split into Teams/);
  });

  it('accepts a pairwise collect as the group source', () => {
    const cfg = base({
      split: { type: 'collect', prompt: 'x', assign: 'pairwise', oddHandling: 'triple', next: 'roles' },
      work: { type: 'checklist', items: ['Plan'], teamsFrom: 'split', rolesFrom: 'roles', next: 'end' }
    });
    expect(() => validate(cfg, 'roles-pairwise')).not.toThrow();
  });

  it('an empty role list saves fine with a skip warning (the editor way to say "no roles")', () => {
    const cfg = base({
      roles: { type: 'team-roles', teamsFrom: 'split', roles: [], next: 'work' }
    });
    const result = validate(cfg, 'roles-empty', { returnResults: true });
    expect(result.errors).toEqual([]);
    expect(result.warnings.some(w => /skipped at game time/.test(w))).toBe(true);
  });

  it('rejects checklist rolesFrom pointing at a non-roles step', () => {
    const cfg = base({
      work: { type: 'checklist', items: ['Plan'], teamsFrom: 'split', rolesFrom: 'split', next: 'end' }
    });
    expect(() => validate(cfg, 'rolesfrom-wrong')).toThrow(/Assign Roles/);
  });

  it('role-tagged object items still satisfy the at-least-one-item rule', () => {
    const cfg = base({
      work: { type: 'checklist', items: [{ text: 'Only tagged', role: 'Recorder' }], teamsFrom: 'split', rolesFrom: 'roles', next: 'end' }
    });
    expect(() => validate(cfg, 'roles-tagged-only')).not.toThrow();
  });
});
