/**
 * Validator rules for the hand-out-choices chain (2026-09-16): a rank
 * step may rank as groups from a real team source, and an assign step
 * must read a rank step.
 */

import { describe, it, expect } from 'vitest';
import { validate } from '../../engine/game-loader.js';
import { PHASE_SCHEMAS } from '../../engine/phase-schemas.js';

const CATS = ['Self and identity', 'Working with others', 'Thinking and problem solving', 'Execution and adaptation'];

const base = (overrides = {}) => ({
  name: 'Choice Draft Test',
  phases: {
    lobby: { type: 'lobby', next: 'split' },
    split: { type: 'team-split', method: 'random', groupSize: 3, next: 'pick' },
    pick: { type: 'rank', prompt: 'Which area does your group want? First choice at the top.', candidates: CATS, teamsFrom: 'split', timer: 120, next: 'draft' },
    draft: { type: 'assign', from: 'pick', message: 'Here is who got what.', next: 'end' },
    end: { type: 'end' },
    ...overrides
  }
});

describe('assign + rank-as-groups validation', () => {
  it('assign is a registered compute step', () => {
    expect(PHASE_SCHEMAS.assign.role).toBe('compute');
    expect(PHASE_SCHEMAS.assign.fields.from.required).toBe(true);
    expect(PHASE_SCHEMAS.rank.fields.teamsFrom.optional).toBe(true);
  });

  it('accepts the split → rank as groups → assign chain', () => {
    expect(() => validate(base(), 'draft-ok')).not.toThrow();
  });

  it('accepts a per-student draft (rank without groups) and a spots-per-item cap', () => {
    const cfg = base({
      lobby: { type: 'lobby', next: 'pick' },
      pick: { type: 'rank', prompt: 'Which topic do you want?', candidates: CATS, next: 'draft' },
      draft: { type: 'assign', from: 'pick', perChoice: 6, next: 'end' }
    });
    delete cfg.phases.split;
    expect(() => validate(cfg, 'draft-solo')).not.toThrow();
  });

  it('rejects rank teamsFrom pointing nowhere or at a non-team step', () => {
    expect(() => validate(base({
      pick: { type: 'rank', prompt: 'Pick', candidates: CATS, teamsFrom: 'ghost', next: 'draft' }
    }), 'rank-ghost')).toThrow(/doesn't exist/);
    expect(() => validate(base({
      pick: { type: 'rank', prompt: 'Pick', candidates: CATS, teamsFrom: 'end', next: 'draft' }
    }), 'rank-wrong')).toThrow(/Split into Teams/);
  });

  it('rejects assign without a rank step behind it', () => {
    expect(() => validate(base({
      draft: { type: 'assign', from: 'split', next: 'end' }
    }), 'assign-wrong')).toThrow(/Rank a list/);
    expect(() => validate(base({
      draft: { type: 'assign', from: 'nope', next: 'end' }
    }), 'assign-ghost')).toThrow(/doesn't exist/);
  });

  it('rejects a perChoice that is not a whole number of 1 or more', () => {
    expect(() => validate(base({
      draft: { type: 'assign', from: 'pick', perChoice: 0, next: 'end' }
    }), 'assign-zero')).toThrow(/perChoice|Spots/);
  });
});
